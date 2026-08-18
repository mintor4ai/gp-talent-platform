import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[_\s]/g, "");
  for (const a of aliases) {
    const target = normalize(a);
    const key = Object.keys(row).find((k) => normalize(k) === target);
    if (key !== undefined && row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export type ExpExternaPreviewRow = {
  fila: number;
  id_registro: string;
  id_empleado: string;
  nombre_empleado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  nombre_empresa: string | null;
  pais: string | null;
  ciudad: string | null;
  giro: string | null;
  area: string | null;
  departamento: string | null;
  responsabilidades: string | null;
  num_empleados_supervisados: number | null;
  esNuevo: boolean;
  error?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("archivo") as File | null;
  const modo = (formData.get("modo") as string) || "preview";

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // colaboradores lookup: num_empleado → uuid
  const { data: colabsRaw } = await supabase.from("colaboradores").select("id, id_empleado");
  const colabByEmpId = new Map<string, string>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), c.id);
  }

  // existing id_registro set for deduplication
  const { data: existingRaw } = await supabase
    .from("experiencia_externa").select("id_registro");
  const existingIds = new Set((existingRaw ?? []).map((r) => r.id_registro));

  const results: ExpExternaPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const id_raw       = col(row, "Num Empleado", "NumEmpleado", "No Empleado", "ID");
    const id_empleado  = id_raw != null ? String(id_raw).trim() : null;
    const nombre_empleado = str(col(row, "Empleado", "Nombre", "Nombre Completo")) ?? "";

    const id_reg_raw = col(row, "Id Registro", "IdRegistro", "ID Registro");
    const id_registro = id_reg_raw != null ? String(id_reg_raw).trim() : null;

    if (!id_empleado) {
      results.push({ fila, id_registro: "", id_empleado: "", nombre_empleado, fecha_inicio: null, fecha_fin: null, nombre_empresa: null, pais: null, ciudad: null, giro: null, area: null, departamento: null, responsabilidades: null, num_empleados_supervisados: null, esNuevo: true, error: "Falta Num Empleado" });
      continue;
    }
    if (!id_registro) {
      results.push({ fila, id_registro: "", id_empleado, nombre_empleado, fecha_inicio: null, fecha_fin: null, nombre_empresa: null, pais: null, ciudad: null, giro: null, area: null, departamento: null, responsabilidades: null, num_empleados_supervisados: null, esNuevo: true, error: "Falta Id Registro" });
      continue;
    }

    const colaborador_id = colabByEmpId.get(id_empleado);
    if (!colaborador_id) {
      results.push({ fila, id_registro, id_empleado, nombre_empleado, fecha_inicio: null, fecha_fin: null, nombre_empresa: str(col(row, "Nombre Empresa", "NombreEmpresa", "Empresa")), pais: null, ciudad: null, giro: null, area: null, departamento: null, responsabilidades: null, num_empleados_supervisados: null, esNuevo: true, error: `Colaborador no encontrado (${id_empleado})` });
      continue;
    }

    const esNuevo = !existingIds.has(id_registro);

    results.push({
      fila,
      id_registro,
      id_empleado,
      nombre_empleado,
      fecha_inicio:               parseDate(col(row, "Fecha Inicio", "FechaInicio")),
      fecha_fin:                  parseDate(col(row, "Fecha Fin", "FechaFin")),
      nombre_empresa:             str(col(row, "Nombre Empresa", "NombreEmpresa", "Empresa")),
      pais:                       str(col(row, "Pais", "País", "Pais")),
      ciudad:                     str(col(row, "Ciudad")),
      giro:                       str(col(row, "Giro")),
      area:                       str(col(row, "Area", "Área")),
      departamento:               str(col(row, "Departamento")),
      responsabilidades:          str(col(row, "Responsabilidades")),
      num_empleados_supervisados: num(col(row, "Num Empleados Supervisados", "NumEmpleadosSupervisados", "Empleados Supervisados")),
      esNuevo,
    });
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      nuevos: results.filter((r) => !r.error && r.esNuevo).length,
      existentes: results.filter((r) => !r.error && !r.esNuevo).length,
      errores: results.filter((r) => !!r.error).length,
    });
  }

  // ── IMPORT (only new) ─────────────────────────────────────────────────────
  const toInsert = results.filter((r) => !r.error && r.esNuevo);
  const errors: string[] = [];
  let inserted = 0;

  for (const r of toInsert) {
    const colaborador_id = colabByEmpId.get(r.id_empleado)!;
    const { error } = await supabase.from("experiencia_externa").insert({
      id_registro:                r.id_registro,
      colaborador_id,
      id_empleado:                r.id_empleado,
      fecha_inicio:               r.fecha_inicio,
      fecha_fin:                  r.fecha_fin,
      nombre_empresa:             r.nombre_empresa,
      pais:                       r.pais,
      ciudad:                     r.ciudad,
      giro:                       r.giro,
      area:                       r.area,
      departamento:               r.departamento,
      responsabilidades:          r.responsabilidades,
      num_empleados_supervisados: r.num_empleados_supervisados,
    });
    if (error) errors.push(`Fila ${r.fila} (${r.nombre_empleado}): ${error.message}`);
    else inserted++;
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    inserted,
    skipped: results.filter((r) => !r.error && !r.esNuevo).length,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 20),
  });
}
