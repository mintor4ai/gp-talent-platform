import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// ── helpers ────────────────────────────────────────────────────────────────────

function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  for (const a of aliases) {
    const key = Object.keys(row).find(
      (k) => k.trim().toLowerCase().replace(/[_\s]/g, "") === a.toLowerCase().replace(/[_\s]/g, "")
    );
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

function bool(v: unknown): boolean {
  if (v == null || v === "") return true; // default activo=true
  const s = String(v).trim().toUpperCase();
  return s !== "NO" && s !== "0" && s !== "FALSE" && s !== "INACTIVO" && s !== "BAJA";
}

/** Parse date from Excel serial, JS Date, or string (dd/mm/yyyy, yyyy-mm-dd) */
function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date (days since 1900-01-01, with leap year bug)
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const dmY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, "0")}-${dmY[1].padStart(2, "0")}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export type ColabPreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_completo: string;
  organización: string | null;
  puesto: string | null;
  nivel: string | null;
  nivel_num: number | null;
  area: string | null;
  departamento: string | null;
  entidad: string | null;
  centro_trabajo: string | null;
  razon_social: string | null;
  jefe_inmediato_nombre: string | null;
  unidad_costo: string | null;
  tipo_plantilla: string | null;
  segmento_organizacional: string | null;
  fecha_antiguedad: string | null;
  fecha_ingreso_posicion: string | null;
  fecha_ingreso_grupo: string | null;
  correo: string | null;
  sexo: string | null;
  edad: number | null;
  nivel_academico: string | null;
  dispuesto_cambiar_residencia: boolean;
  activo: boolean;
  esNuevo: boolean;
  puesto_catalogo_id: string | null;
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

  // Parse Excel with date detection enabled
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // Load existing id_empleado set for new vs update detection
  const { data: existingRaw } = await supabase
    .from("colaboradores").select("id_empleado");
  const existingIds = new Set((existingRaw ?? []).map((r) => String(r.id_empleado).trim()));

  // Load catalogo_puestos for matching (by clave and by nombre+organización)
  // Use select("*") to avoid Supabase TS parser issue with accented column names
  const { data: catalogoRaw } = await supabase
    .from("catalogo_puestos")
    .select("*")
    .eq("activo", true);

  type CatalogRow = { id: string; clave: string; nombre: string; [key: string]: unknown };
  const catalogoByClave     = new Map<string, string>(); // clave.upper → id
  const catalogoByNombreOrg = new Map<string, string>(); // nombre.upper|org.upper → id
  const catalogoByNombre    = new Map<string, string[]>(); // nombre.upper → [ids] (for unique fallback)
  for (const raw of catalogoRaw ?? []) {
    const c = raw as unknown as CatalogRow;
    const org = String(c["organización"] ?? "").trim();
    if (c.clave) catalogoByClave.set(c.clave.trim().toUpperCase(), c.id);
    const key = `${(c.nombre ?? "").trim().toUpperCase()}|${org.toUpperCase()}`;
    catalogoByNombreOrg.set(key, c.id);
    const n = (c.nombre ?? "").trim().toUpperCase();
    if (!catalogoByNombre.has(n)) catalogoByNombre.set(n, []);
    catalogoByNombre.get(n)!.push(c.id);
  }

  const results: ColabPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const id_empleado = str(col(row, "no_empleado", "id_empleado", "no empleado", "numero", "clave", "empleado_id"));
    const nombre_completo = str(col(row, "nombre_completo", "nombre", "colaborador", "empleado"));

    if (!id_empleado || !nombre_completo) {
      results.push({
        fila, id_empleado: id_empleado ?? "", nombre_completo: nombre_completo ?? "",
        organización: null, puesto: null, nivel: null, nivel_num: null,
        area: null, departamento: null, entidad: null, centro_trabajo: null,
        razon_social: null, jefe_inmediato_nombre: null, unidad_costo: null,
        tipo_plantilla: null, segmento_organizacional: null,
        fecha_antiguedad: null, fecha_ingreso_posicion: null, fecha_ingreso_grupo: null,
        correo: null, sexo: null, edad: null, nivel_academico: null,
        dispuesto_cambiar_residencia: false, activo: true, esNuevo: true,
        puesto_catalogo_id: null,
        error: !id_empleado ? "Falta no_empleado" : "Falta nombre_completo",
      });
      continue;
    }

    const organización_val = str(col(row, "organización", "organizacion", "uen", "unidad"));
    const puesto_val       = str(col(row, "puesto", "cargo", "posicion_nombre"));
    const clave_val        = str(col(row, "clave", "clave_puesto", "codigo_puesto", "q_code"));

    // Match against catalog: clave > nombre+org > nombre-only (unique)
    let puesto_catalogo_id: string | null = null;
    if (clave_val) {
      puesto_catalogo_id = catalogoByClave.get(clave_val.trim().toUpperCase()) ?? null;
    }
    if (!puesto_catalogo_id && puesto_val) {
      const nomOrg = `${puesto_val.trim().toUpperCase()}|${(organización_val ?? "").trim().toUpperCase()}`;
      puesto_catalogo_id = catalogoByNombreOrg.get(nomOrg) ?? null;
    }
    if (!puesto_catalogo_id && puesto_val) {
      const candidates = catalogoByNombre.get(puesto_val.trim().toUpperCase()) ?? [];
      if (candidates.length === 1) puesto_catalogo_id = candidates[0];
    }

    results.push({
      fila,
      id_empleado,
      nombre_completo: nombre_completo.toUpperCase(),
      organización:            organización_val,
      puesto:                  puesto_val,
      nivel:                   str(col(row, "nivel", "nivel_puesto")),
      nivel_num:               num(col(row, "nivel_num", "nivel_numero", "num_nivel")),
      area:                    str(col(row, "area", "área")),
      departamento:            str(col(row, "departamento", "depto")),
      entidad:                 str(col(row, "entidad")),
      centro_trabajo:          str(col(row, "centro_trabajo", "centro")),
      razon_social:            str(col(row, "razon_social", "razon social", "empresa")),
      jefe_inmediato_nombre:   str(col(row, "jefe_inmediato_nombre", "jefe", "jefe_directo", "nombre_jefe")),
      unidad_costo:            str(col(row, "unidad_costo", "cc", "centro_costo")),
      tipo_plantilla:          str(col(row, "tipo_plantilla", "plantilla", "tipo")),
      segmento_organizacional: str(col(row, "segmento_organizacional", "segmento")),
      fecha_antiguedad:        parseDate(col(row, "fecha_antiguedad", "antiguedad", "fecha_ingreso")),
      fecha_ingreso_posicion:  parseDate(col(row, "fecha_ingreso_posicion", "ingreso_posicion")),
      fecha_ingreso_grupo:     parseDate(col(row, "fecha_ingreso_grupo", "ingreso_grupo")),
      correo:                  str(col(row, "correo", "email", "correo_electronico")),
      sexo:                    str(col(row, "sexo", "genero", "género")),
      edad:                    num(col(row, "edad")),
      nivel_academico:         str(col(row, "nivel_academico", "escolaridad", "educacion")),
      dispuesto_cambiar_residencia: !!col(row, "dispuesto_cambiar_residencia", "cambio_residencia"),
      activo:                  bool(col(row, "activo", "estatus", "status")),
      esNuevo:                 !existingIds.has(id_empleado),
      puesto_catalogo_id,
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

  // Pass 1: upsert all employees (without jefe_inmediato_id)
  for (const r of validos) {
    const { error } = await supabase.from("colaboradores").upsert(
      {
        id_empleado:              r.id_empleado,
        nombre_completo:          r.nombre_completo,
        organización:             r.organización,
        puesto:                   r.puesto,
        nivel:                    r.nivel,
        nivel_num:                r.nivel_num,
        area:                     r.area,
        departamento:             r.departamento,
        entidad:                  r.entidad,
        centro_trabajo:           r.centro_trabajo,
        razon_social:             r.razon_social,
        jefe_inmediato_nombre:    r.jefe_inmediato_nombre,
        unidad_costo:             r.unidad_costo,
        tipo_plantilla:           r.tipo_plantilla,
        segmento_organizacional:  r.segmento_organizacional,
        fecha_antiguedad:         r.fecha_antiguedad,
        fecha_ingreso_posicion:   r.fecha_ingreso_posicion,
        fecha_ingreso_grupo:      r.fecha_ingreso_grupo,
        correo:                   r.correo,
        sexo:                     r.sexo,
        edad:                     r.edad,
        nivel_academico:          r.nivel_academico,
        dispuesto_cambiar_residencia: r.dispuesto_cambiar_residencia,
        activo:                   r.activo,
        estatus_empleado:         r.activo ? 1 : 0,
        puesto_catalogo_id:       r.puesto_catalogo_id,
      },
      { onConflict: "id_empleado" }
    );
    if (error) errors.push(`${r.nombre_completo}: ${error.message}`);
    else upserted++;
  }

  // Pass 2: resolve jefe_inmediato_id by matching nombre in newly imported set
  const { data: allColabs } = await supabase
    .from("colaboradores").select("id, nombre_completo");
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
    catalogoLinked: validos.filter((r) => r.puesto_catalogo_id !== null).length,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 10),
  });
}
