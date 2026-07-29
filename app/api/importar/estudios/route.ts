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
  // year-only: "2010" → "2010-01-01"
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}

export type EstudiosPreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_empleado: string;
  nivel_estudio: string | null;
  nombre_carrera: string | null;
  institucion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  cedula: string | null;
  estado_cedula: string | null;
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

  // Load existing colaboradores for id_empleado → UUID mapping
  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado");
  const colabByEmpId = new Map<string, string>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), c.id);
  }

  // Track existing formacion_academica rows per colaborador_id for esNuevo flag
  const { data: existingRaw } = await supabase
    .from("formacion_academica").select("colaborador_id");
  const existingColabIds = new Set((existingRaw ?? []).map((r) => r.colaborador_id));

  const results: EstudiosPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const id_raw = col(row, "Num Empleado", "NumEmpleado", "No Empleado", "Id", "ID", "Empleado ID");
    const id_empleado = id_raw != null ? String(id_raw).trim() : null;
    const nombre_empleado = str(col(row, "Empleado", "Nombre", "Nombre Completo", "NombreCompleto")) ?? "";

    if (!id_empleado) {
      results.push({
        fila, id_empleado: "", nombre_empleado,
        nivel_estudio: null, nombre_carrera: null, institucion: null,
        fecha_inicio: null, fecha_fin: null, cedula: null, estado_cedula: null,
        esNuevo: true,
        error: "Falta Num Empleado",
      });
      continue;
    }

    const colaborador_id = colabByEmpId.get(id_empleado);
    if (!colaborador_id) {
      results.push({
        fila, id_empleado, nombre_empleado,
        nivel_estudio:  str(col(row, "Nivel Estudio", "NivelEstudio", "Nivel", "Escolaridad")),
        nombre_carrera: str(col(row, "Carrera", "Nombre Carrera", "NombreCarrera", "Especialidad")),
        institucion:    str(col(row, "Institucion", "Institución", "Universidad", "Escuela")),
        fecha_inicio:   parseDate(col(row, "Fecha Inicio", "FechaInicio", "Inicio")),
        fecha_fin:      parseDate(col(row, "Fecha Fin", "FechaFin", "Fecha Egreso", "FechaEgreso", "Egreso")),
        cedula:         str(col(row, "Cedula", "Cédula", "Cedula Profesional", "CedulaProfesional")),
        estado_cedula:  str(col(row, "Estado Cedula", "EstadoCedula", "Estatus Cedula")),
        esNuevo: true,
        error: `No encontrado en BD (${id_empleado})`,
      });
      continue;
    }

    results.push({
      fila,
      id_empleado,
      nombre_empleado,
      nivel_estudio:  str(col(row, "Nivel Estudio", "NivelEstudio", "Nivel", "Escolaridad")),
      nombre_carrera: str(col(row, "Carrera", "Nombre Carrera", "NombreCarrera", "Especialidad")),
      institucion:    str(col(row, "Institucion", "Institución", "Universidad", "Escuela")),
      fecha_inicio:   parseDate(col(row, "Fecha Inicio", "FechaInicio", "Inicio")),
      fecha_fin:      parseDate(col(row, "Fecha Fin", "FechaFin", "Fecha Egreso", "FechaEgreso", "Egreso")),
      cedula:         str(col(row, "Cedula", "Cédula", "Cedula Profesional", "CedulaProfesional")),
      estado_cedula:  str(col(row, "Estado Cedula", "EstadoCedula", "Estatus Cedula")),
      esNuevo: !existingColabIds.has(colaborador_id),
    });
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      validos: results.filter((r) => !r.error).length,
      errores: results.filter((r) => !!r.error).length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const validos = results.filter((r) => !r.error);
  const errors: string[] = [];
  let inserted = 0;

  for (const r of validos) {
    const colaborador_id = colabByEmpId.get(r.id_empleado)!;
    const { error } = await supabase.from("formacion_academica").insert({
      colaborador_id,
      id_empleado:    r.id_empleado,
      nivel_estudio:  r.nivel_estudio,
      nombre_carrera: r.nombre_carrera,
      institucion:    r.institucion,
      fecha_inicio:   r.fecha_inicio,
      fecha_fin:      r.fecha_fin,
      cedula:         r.cedula,
      estado_cedula:  r.estado_cedula,
      origen_dato:    "ReporteEstudios",
    });
    if (error) errors.push(`Fila ${r.fila} (${r.nombre_empleado}): ${error.message}`);
    else inserted++;
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    inserted,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 20),
  });
}
