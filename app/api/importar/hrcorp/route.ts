import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// ── column lookup (normalizes accents + spaces) ────────────────────────────────
function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip accents
      .replace(/[_\s]/g, "");                              // strip spaces/underscores

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

/** Parse integer — handles "58 años", "29 años 6 meses", or plain numbers */
function numFromText(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : Math.floor(v);
  const s = String(v).trim();
  const m = s.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Parse date from Excel serial, JS Date, or string (dd/mm/yyyy, yyyy-mm-dd).
 *  Returns null for empty cells (common for Fecha Baja of active employees). */
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

// ── Diff helpers ───────────────────────────────────────────────────────────────

/** Fields tracked for history, in order of importance. [db_key, label] */
const TRACKED_FIELDS: [string, string][] = [
  ["nombre_completo",            "Nombre"],
  ["activo",                     "Estatus"],
  ["puesto",                     "Puesto"],
  ["area",                       "Área"],
  ["organización",               "Organización"],
  ["departamento",               "Departamento"],
  ["segmento_organizacional",    "Segmento"],
  ["posicion",                   "Posición"],
  ["jefe_inmediato_nombre",      "Jefe"],
  ["correo",                     "Correo"],
  ["razon_social",               "Razón Social"],
  ["horario",                    "Horario"],
  ["tipo_plantilla",             "Tipo Plantilla"],
  ["entidad",                    "Entidad"],
  ["centro_trabajo",             "Centro Trabajo"],
  ["sexo",                       "Sexo"],
  ["fecha_nacimiento",           "F. Nacimiento"],
  ["fecha_antiguedad",           "F. Antigüedad"],
  ["fecha_ingreso_razon_social", "F. Ingreso RS"],
  ["fecha_baja",                 "F. Baja"],
  ["correo_jefe",                "Correo Jefe"],
];

/** Normalize any value to a comparable string (null for empty). */
function normVal(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "activo" : "baja";
  return String(v).trim() || null;
}

type CampoDetalle = { campo: string; anterior: string | null; nuevo: string | null };

type DiffResult = {
  campos: string[];
  cambiosDetalle: CampoDetalle[];
  anterior: Record<string, unknown>;
  nuevo: Record<string, unknown>;
};

function computeDiff(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): DiffResult {
  const campos: string[] = [];
  const cambiosDetalle: CampoDetalle[] = [];
  const anterior: Record<string, unknown> = {};
  const nuevo: Record<string, unknown> = {};

  for (const [field, label] of TRACKED_FIELDS) {
    const oldVal = normVal(existing[field]);
    const newVal = normVal(incoming[field]);
    if (oldVal !== newVal) {
      campos.push(field);
      cambiosDetalle.push({ campo: label, anterior: oldVal, nuevo: newVal });
      anterior[field] = existing[field] ?? null;
      nuevo[field] = incoming[field] ?? null;
    }
  }
  return { campos, cambiosDetalle, anterior, nuevo };
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type HrCorpPreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_completo: string;
  activo: boolean;
  sexo: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  fecha_antiguedad: string | null;
  fecha_ingreso_razon_social: string | null;
  fecha_baja: string | null;
  razon_social: string | null;
  organización: string | null;
  posicion: string | null;
  puesto: string | null;
  area: string | null;
  departamento: string | null;
  entidad: string | null;
  centro_trabajo: string | null;
  horario: string | null;
  tipo_plantilla: string | null;
  segmento_organizacional: string | null;
  jefe_inmediato_nombre: string | null;
  correo_jefe: string | null;
  correo: string | null;
  esNuevo: boolean;
  cambios: string[];
  cambiosDetalle: { campo: string; anterior: string | null; nuevo: string | null }[];
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

  // Fetch all existing collaborators with tracked fields for diff comparison.
  // Use select("*") to safely include the accented column `organización`.
  // Use range(0, 9999) to bypass Supabase's default 1000-row page limit.
  const { data: existingRaw } = await supabase
    .from("colaboradores")
    .select("*")
    .range(0, 9999);

  // Map id_empleado → {_uuid, ...fields} for O(1) lookup
  const existingMap = new Map<string, Record<string, unknown> & { _uuid: string }>();
  for (const r of existingRaw ?? []) {
    const rec = r as unknown as Record<string, unknown>;
    const empId = String(rec["id_empleado"] ?? "").trim();
    if (empId) existingMap.set(empId, { ...rec, _uuid: rec["id"] as string });
  }

  const results: HrCorpPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const id_raw = col(row, "Id");
    const id_empleado = id_raw != null ? String(id_raw).trim() : null;

    const nombre_parts = [
      str(col(row, "Nombre")),
      str(col(row, "Apellido Paterno", "ApellidoPaterno")),
      str(col(row, "Apellido Materno", "ApellidoMaterno")),
    ].filter(Boolean).join(" ");
    const nombre_completo =
      str(col(row, "Nombre completo", "NombreCompleto")) ??
      (nombre_parts || null);

    if (!id_empleado || !nombre_completo) {
      results.push({
        fila,
        id_empleado: id_empleado ?? "",
        nombre_completo: nombre_completo ?? "",
        activo: true,
        sexo: null, fecha_nacimiento: null, edad: null,
        fecha_antiguedad: null, fecha_ingreso_razon_social: null, fecha_baja: null,
        razon_social: null, organización: null, posicion: null, puesto: null,
        area: null, departamento: null, entidad: null, centro_trabajo: null,
        horario: null, tipo_plantilla: null, segmento_organizacional: null,
        jefe_inmediato_nombre: null, correo_jefe: null, correo: null,
        esNuevo: true, cambios: [], cambiosDetalle: [],
        error: !id_empleado ? "Falta columna Id" : "Falta nombre",
      });
      continue;
    }

    const estatusVal = str(col(row, "Estatus", "Estatus empleado"));
    const activo =
      estatusVal == null ? true
        : !["inactivo", "baja", "no", "0", "false"].includes(estatusVal.toLowerCase());

    const parsed: HrCorpPreviewRow = {
      fila,
      id_empleado,
      nombre_completo: nombre_completo.trim().toUpperCase(),
      activo,
      sexo:                        str(col(row, "Sexo", "Genero", "Género")),
      fecha_nacimiento:            parseDate(col(row, "Fecha Nacimiento", "FechaNacimiento")),
      edad:                        numFromText(col(row, "Edad")),
      fecha_antiguedad:            parseDate(col(row, "Fecha Antiguedad", "FechaAntiguedad")),
      fecha_ingreso_razon_social:  parseDate(col(row, "Fecha Ingreso Razon Social", "FechaIngresoRazonSocial")),
      fecha_baja:                  parseDate(col(row, "Fecha Baja", "FechaBaja")),
      razon_social:                str(col(row, "Razon Social", "RazonSocial", "Empresa")),
      organización:                str(col(row, "Unidad Organizacional", "UnidadOrganizacional", "Organizacion")),
      posicion:                    str(col(row, "Posicion", "Posición")),
      puesto:                      str(col(row, "Puesto", "Cargo")),
      area:                        str(col(row, "Area", "Área")),
      departamento:                str(col(row, "Departamento", "Depto")),
      entidad:                     str(col(row, "Entidad")),
      centro_trabajo:              str(col(row, "Centro Trabajo", "CentroTrabajo")),
      horario:                     str(col(row, "Horario")),
      tipo_plantilla:              str(col(row, "Tipo Nomina", "TipoNomina", "Tipo Nómina")),
      segmento_organizacional:     str(col(row, "Segmento Organizacional", "SegmentoOrganizacional", "Segmento")),
      jefe_inmediato_nombre:       str(col(row, "Nombre Jefe", "NombreJefe", "Jefe")),
      correo_jefe:                 str(col(row, "Correo Electronico Jefe", "CorreoElectronicoJefe", "Correo Jefe")),
      correo:                      str(col(row, "Correo Electronico", "CorreoElectronico", "Email", "Correo")),
      esNuevo: !existingMap.has(id_empleado),
      cambios: [],
      cambiosDetalle: [],
    };

    // Compute diff for existing records
    if (!parsed.esNuevo) {
      const existing = existingMap.get(id_empleado)!;
      const { campos, cambiosDetalle } = computeDiff(parsed as unknown as Record<string, unknown>, existing);
      parsed.cambios = campos;
      parsed.cambiosDetalle = cambiosDetalle;
    }

    results.push(parsed);
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      nuevos:          results.filter((r) => r.esNuevo && !r.error).length,
      actualizaciones: results.filter((r) => !r.esNuevo && !r.error).length,
      conCambios:      results.filter((r) => !r.esNuevo && !r.error && r.cambios.length > 0).length,
      sinCambios:      results.filter((r) => !r.esNuevo && !r.error && r.cambios.length === 0).length,
      errores:         results.filter((r) => !!r.error).length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const validos = results.filter((r) => !r.error && r.id_empleado && r.nombre_completo);
  const errors: string[] = [];
  let upserted = 0;

  // Collect history records for changed collaborators (before upsert)
  type HistorialRecord = {
    colaborador_id: string;
    importado_por: string;
    campos_modificados: string[];
    datos_anteriores: Record<string, unknown>;
    datos_nuevos: Record<string, unknown>;
  };
  const historialPending: HistorialRecord[] = [];

  for (const r of validos) {
    if (!r.esNuevo && existingMap.has(r.id_empleado)) {
      const existing = existingMap.get(r.id_empleado)!;
      const { campos, anterior, nuevo } = computeDiff(
        r as unknown as Record<string, unknown>,
        existing,
      );
      if (campos.length > 0) {
        historialPending.push({
          colaborador_id: existing._uuid,
          importado_por: user.id,
          campos_modificados: campos,
          datos_anteriores: anterior,
          datos_nuevos: nuevo,
        });
      }
    }
  }

  // Pass 1: upsert all collaborators (without jefe_inmediato_id link)
  for (const r of validos) {
    const { error } = await supabase.from("colaboradores").upsert(
      {
        id_empleado:                r.id_empleado,
        nombre_completo:            r.nombre_completo,
        activo:                     r.activo,
        estatus_empleado:           r.activo ? 1 : 0,
        sexo:                       r.sexo,
        fecha_nacimiento:           r.fecha_nacimiento,
        edad:                       r.edad,
        fecha_antiguedad:           r.fecha_antiguedad,
        fecha_ingreso_razon_social: r.fecha_ingreso_razon_social,
        fecha_baja:                 r.fecha_baja,
        razon_social:               r.razon_social,
        organización:               r.organización,
        posicion:                   r.posicion,
        puesto:                     r.puesto,
        area:                       r.area,
        departamento:               r.departamento,
        entidad:                    r.entidad,
        centro_trabajo:             r.centro_trabajo,
        horario:                    r.horario,
        tipo_plantilla:             r.tipo_plantilla,
        segmento_organizacional:    r.segmento_organizacional,
        jefe_inmediato_nombre:      r.jefe_inmediato_nombre,
        correo_jefe:                r.correo_jefe,
        correo:                     r.correo,
      },
      { onConflict: "id_empleado" }
    );
    if (error) errors.push(`Fila ${r.fila} (${r.nombre_completo}): ${error.message}`);
    else upserted++;
  }

  // Pass 2: resolve jefe_inmediato_id by name match
  const { data: allColabs } = await supabase
    .from("colaboradores").select("id, nombre_completo, id_empleado");
  const byNombre = new Map<string, string>();
  for (const c of allColabs ?? []) {
    byNombre.set((c.nombre_completo ?? "").trim().toUpperCase(), c.id);
  }

  let jefeLinked = 0;
  for (const r of validos) {
    if (!r.jefe_inmediato_nombre) continue;
    const jefeId = byNombre.get(r.jefe_inmediato_nombre.trim().toUpperCase());
    if (!jefeId) continue;
    await supabase.from("colaboradores")
      .update({ jefe_inmediato_id: jefeId })
      .eq("id_empleado", r.id_empleado);
    jefeLinked++;
  }

  // Pass 3: insert history records (fire-and-forget — don't fail the import)
  let historialInserted = 0;
  if (historialPending.length > 0) {
    const { error: histErr } = await supabase
      .from("colaboradores_historial")
      .insert(historialPending);
    if (!histErr) historialInserted = historialPending.length;
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    upserted,
    jefeLinked,
    conCambios: historialInserted,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 20),
  });
}
