import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

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

type ExistingRecord = {
  clave: string;
  id_externo: number | null;
  nombre: string | null;
  organización: string | null;
  segmento_organizacional: string | null;
  razon_social: string | null;
  horario: string | null;
  tipo_trabajador: string | null;
  periodo_pago: string | null;
  tabla_prestaciones: string | null;
};

export type PuestoPreviewRow = {
  fila: number;
  clave: string;
  id_externo: number | null;
  nombre: string;
  organización: string | null;
  segmento_organizacional: string | null;
  razon_social: string | null;
  horario: string | null;
  tipo_trabajador: string | null;
  periodo_pago: string | null;
  tabla_prestaciones: string | null;
  esNuevo: boolean;
  hayCambios: boolean;
  cambios: string[];
  error?: string;
};

function detectCambios(parsed: PuestoPreviewRow, existing: ExistingRecord): string[] {
  const diffs: string[] = [];
  if (parsed.nombre && parsed.nombre !== existing.nombre) diffs.push(`Nombre: "${existing.nombre}" → "${parsed.nombre}"`);
  if (parsed.organización !== null && parsed.organización !== existing.organización) diffs.push(`Organización: "${existing.organización}" → "${parsed.organización}"`);
  if (parsed.segmento_organizacional !== null && parsed.segmento_organizacional !== existing.segmento_organizacional) diffs.push(`Segmento: "${existing.segmento_organizacional}" → "${parsed.segmento_organizacional}"`);
  if (parsed.razon_social !== null && parsed.razon_social !== existing.razon_social) diffs.push(`Razón Social: "${existing.razon_social}" → "${parsed.razon_social}"`);
  if (parsed.horario !== null && parsed.horario !== existing.horario) diffs.push(`Horario: "${existing.horario}" → "${parsed.horario}"`);
  if (parsed.tipo_trabajador !== null && parsed.tipo_trabajador !== existing.tipo_trabajador) diffs.push(`Tipo Trabajador: "${existing.tipo_trabajador}" → "${parsed.tipo_trabajador}"`);
  if (parsed.periodo_pago !== null && parsed.periodo_pago !== existing.periodo_pago) diffs.push(`Período Pago: "${existing.periodo_pago}" → "${parsed.periodo_pago}"`);
  if (parsed.tabla_prestaciones !== null && parsed.tabla_prestaciones !== existing.tabla_prestaciones) diffs.push(`Prestaciones: "${existing.tabla_prestaciones}" → "${parsed.tabla_prestaciones}"`);
  return diffs;
}

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
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // Load existing records with all comparable fields
  const { data: existingRaw } = await supabase
    .from("catalogo_puestos")
    .select("clave, id_externo, nombre, organización, segmento_organizacional, razon_social, horario, tipo_trabajador, periodo_pago, tabla_prestaciones");
  const existingMap = new Map<string, ExistingRecord>(
    ((existingRaw ?? []) as unknown as ExistingRecord[]).map((r) => [r.clave, r])
  );

  const results: PuestoPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const clave  = str(col(row, "clave", "codigo", "code", "key"));
    const nombre = str(col(row, "nombre", "name", "puesto", "posicion"));

    if (!clave) {
      results.push({
        fila, clave: "", id_externo: null, nombre: nombre ?? "",
        organización: null, segmento_organizacional: null, razon_social: null,
        horario: null, tipo_trabajador: null, periodo_pago: null, tabla_prestaciones: null,
        esNuevo: true, hayCambios: false, cambios: [],
        error: "Falta clave",
      });
      continue;
    }
    if (!nombre) {
      results.push({
        fila, clave, id_externo: null, nombre: "",
        organización: null, segmento_organizacional: null, razon_social: null,
        horario: null, tipo_trabajador: null, periodo_pago: null, tabla_prestaciones: null,
        esNuevo: true, hayCambios: false, cambios: [],
        error: "Falta nombre",
      });
      continue;
    }

    const parsed: PuestoPreviewRow = {
      fila,
      clave,
      id_externo:              num(col(row, "identificador", "id_externo", "id")),
      nombre:                  nombre.toUpperCase(),
      // "Organización" or "UNIDAD ORGANIZACIONAL" — same value in HRCorp, use either
      organización:            str(col(row, "organización", "organizacion", "unidadorganizacional", "uen", "org")),
      segmento_organizacional: str(col(row, "segmentoorganizacional", "segmento_organizacional", "segmento", "nivel")),
      razon_social:            str(col(row, "razonsocial", "razon_social", "empresa")),
      horario:                 str(col(row, "horario")),
      tipo_trabajador:         str(col(row, "tipotrabajador", "tipo_trabajador", "tipodeempleado")),
      periodo_pago:            str(col(row, "periodopago", "periodo_pago", "periododepago", "frecuenciapago")),
      tabla_prestaciones:      str(col(row, "tablaprestaciones", "tabla_prestaciones", "prestaciones")),
      esNuevo: !existingMap.has(clave),
      hayCambios: false,
      cambios: [],
    };

    if (!parsed.esNuevo) {
      parsed.cambios = detectCambios(parsed, existingMap.get(clave)!);
      parsed.hayCambios = parsed.cambios.length > 0;
    }

    results.push(parsed);
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      nuevos:          results.filter((r) => r.esNuevo && !r.error).length,
      con_cambios:     results.filter((r) => !r.esNuevo && r.hayCambios && !r.error).length,
      sin_cambios:     results.filter((r) => !r.esNuevo && !r.hayCambios && !r.error).length,
      errores:         results.filter((r) => !!r.error).length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  // Only write rows that are new or have actual field changes
  const validos = results.filter((r) => !r.error && r.clave && r.nombre && (r.esNuevo || r.hayCambios));
  const errors: string[] = [];
  let upserted = 0;
  let sinCambios = results.filter((r) => !r.error && !r.esNuevo && !r.hayCambios).length;

  for (const r of validos) {
    const { error } = await supabase.from("catalogo_puestos").upsert(
      {
        clave:                   r.clave,
        id_externo:              r.id_externo,
        nombre:                  r.nombre,
        organización:            r.organización,
        segmento_organizacional: r.segmento_organizacional,
        razon_social:            r.razon_social,
        horario:                 r.horario,
        tipo_trabajador:         r.tipo_trabajador,
        periodo_pago:            r.periodo_pago,
        tabla_prestaciones:      r.tabla_prestaciones,
        activo:                  true,
        updated_at:              new Date().toISOString(),
      },
      { onConflict: "clave" }
    );
    if (error) errors.push(`${r.clave} – ${r.nombre}: ${error.message}`);
    else upserted++;
  }

  return NextResponse.json({
    ok: true,
    total:      results.length,
    upserted,
    sin_cambios: sinCambios,
    errores:    results.filter((r) => !!r.error).length,
    errors:     errors.slice(0, 10),
  });
}
