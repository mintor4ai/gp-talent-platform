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

export type CursosPreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_empleado: string;
  id_registro_source: string | null;
  nombre_curso: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  tipo_curso: string | null;
  institucion: string | null;
  horas_efectivas: number | null;
  documento: string | null;
  evaluacion_final: number | null;
  estado_completitud: string | null;
  isDuplicate: boolean;
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
  const importarDuplicados = formData.get("importar_duplicados") === "true";

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado");
  const colabByEmpId = new Map<string, string>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), c.id);
  }

  // Track id_registro_source already in DB to detect file-level duplicates
  const { data: existingCursosRaw } = await supabase
    .from("cursos_formacion").select("id_registro_source");
  const existingRegistros = new Set(
    (existingCursosRaw ?? []).map((r) => r.id_registro_source).filter(Boolean)
  );

  const results: CursosPreviewRow[] = [];
  // Track id_registro within this file to detect in-file duplicates
  const seenRegistros = new Map<string, number>(); // id_registro → first fila

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const id_raw = col(row, "Num Empleado", "NumEmpleado", "No Empleado", "Empleado ID");
    const id_empleado = id_raw != null ? String(id_raw).trim() : null;
    const nombre_empleado = str(col(row, "Empleado", "Nombre", "Nombre Completo")) ?? "";

    if (!id_empleado) {
      results.push({
        fila, id_empleado: "", nombre_empleado,
        id_registro_source: null, nombre_curso: null,
        fecha_inicio: null, fecha_fin: null, tipo_curso: null, institucion: null,
        horas_efectivas: null, documento: null, evaluacion_final: null, estado_completitud: null,
        isDuplicate: false,
        error: "Falta Num Empleado",
      });
      continue;
    }

    const colaborador_id = colabByEmpId.get(id_empleado);
    if (!colaborador_id) {
      results.push({
        fila, id_empleado, nombre_empleado,
        id_registro_source: null, nombre_curso: null,
        fecha_inicio: null, fecha_fin: null, tipo_curso: null, institucion: null,
        horas_efectivas: null, documento: null, evaluacion_final: null, estado_completitud: null,
        isDuplicate: false,
        error: `No encontrado en BD (${id_empleado})`,
      });
      continue;
    }

    const id_registro_source = str(col(row, "Id Registro", "IdRegistro", "ID Registro", "Registro"));

    // Duplicate detection: already in DB or already seen in this file
    let isDuplicate = false;
    if (id_registro_source) {
      if (existingRegistros.has(id_registro_source)) {
        isDuplicate = true;
      } else if (seenRegistros.has(id_registro_source)) {
        isDuplicate = true;
      } else {
        seenRegistros.set(id_registro_source, fila);
      }
    }

    // Map the optional "ID" column (completion status)
    const idCol = str(col(row, "ID"));
    const estado_completitud =
      idCol && ["Aprobado", "No aplica", "Reprobado"].includes(idCol) ? idCol : null;

    results.push({
      fila,
      id_empleado,
      nombre_empleado,
      id_registro_source,
      nombre_curso:       str(col(row, "Curso", "Nombre Curso", "NombreCurso")),
      fecha_inicio:       parseDate(col(row, "Fecha Inicio", "FechaInicio")),
      fecha_fin:          parseDate(col(row, "Fecha Fin", "FechaFin")),
      tipo_curso:         str(col(row, "Tipo Curso", "TipoCurso", "Tipo")),
      institucion:        str(col(row, "Institucion", "Institución")),
      horas_efectivas:    num(col(row, "Horas Efectivas", "HorasEfectivas", "Horas")),
      documento:          str(col(row, "Documento")),
      evaluacion_final:   num(col(row, "Evaluacion Final", "EvaluacionFinal", "Evaluación Final")),
      estado_completitud,
      isDuplicate,
    });
  }

  const duplicateCount = results.filter((r) => !r.error && r.isDuplicate).length;

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      validos: results.filter((r) => !r.error && !r.isDuplicate).length,
      duplicados: duplicateCount,
      errores: results.filter((r) => !!r.error).length,
      hasDuplicates: duplicateCount > 0,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const toInsert = results.filter((r) => !r.error && (!r.isDuplicate || importarDuplicados));
  const errors: string[] = [];
  let inserted = 0;

  for (const r of toInsert) {
    const colaborador_id = colabByEmpId.get(r.id_empleado)!;
    const { error } = await supabase.from("cursos_formacion").insert({
      colaborador_id,
      id_empleado:        r.id_empleado,
      id_registro_source: r.id_registro_source,
      nombre_curso:       r.nombre_curso,
      fecha_inicio:       r.fecha_inicio,
      fecha_fin:          r.fecha_fin,
      tipo_curso:         r.tipo_curso,
      institucion:        r.institucion,
      horas_efectivas:    r.horas_efectivas,
      documento:          r.documento,
      evaluacion_final:   r.evaluacion_final,
      estado_completitud: r.estado_completitud,
      origen_dato:        "ReporteCursos",
    });
    if (error) errors.push(`Fila ${r.fila} (${r.nombre_empleado}): ${error.message}`);
    else inserted++;
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    inserted,
    duplicadosOmitidos: importarDuplicados ? 0 : duplicateCount,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 20),
  });
}
