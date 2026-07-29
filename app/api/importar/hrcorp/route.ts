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

  const { data: existingRaw } = await supabase.from("colaboradores").select("id_empleado");
  const existingIds = new Set((existingRaw ?? []).map((r) => String(r.id_empleado).trim()));

  const results: HrCorpPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    // "Id" in HrCorp is the employee number (numeric but stored as text)
    const id_raw = col(row, "Id");
    const id_empleado = id_raw != null ? String(id_raw).trim() : null;

    // Prefer "Nombre completo"; fallback to concatenating parts
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
        esNuevo: true,
        error: !id_empleado ? "Falta columna Id" : "Falta nombre",
      });
      continue;
    }

    const estatusVal = str(col(row, "Estatus", "Estatus empleado"));
    const activo =
      estatusVal == null ? true
        : !["inactivo", "baja", "no", "0", "false"].includes(estatusVal.toLowerCase());

    results.push({
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
      // CURP and RFC are never read — security constraint
      esNuevo: !existingIds.has(id_empleado),
    });
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      nuevos: results.filter((r) => r.esNuevo && !r.error).length,
      actualizaciones: results.filter((r) => !r.esNuevo && !r.error).length,
      errores: results.filter((r) => !!r.error).length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const validos = results.filter((r) => !r.error && r.id_empleado && r.nombre_completo);
  const errors: string[] = [];
  let upserted = 0;

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

  return NextResponse.json({
    ok: true,
    total: results.length,
    upserted,
    jefeLinked,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 20),
  });
}
