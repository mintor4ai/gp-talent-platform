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

export type PuestoPreviewRow = {
  fila: number;
  clave: string;
  id_externo: number | null;
  nombre: string;
  organización: string | null;
  segmento_organizacional: string | null;
  tipo_vacante: string | null;
  area: string | null;
  departamento: string | null;
  razon_social: string | null;
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
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // Load existing claves
  const { data: existingRaw } = await supabase
    .from("catalogo_puestos").select("clave");
  const existingClaves = new Set((existingRaw ?? []).map((r) => String(r.clave).trim()));

  const results: PuestoPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const clave   = str(col(row, "clave", "codigo", "code", "key"));
    const nombre  = str(col(row, "nombre", "name", "puesto", "posicion"));

    if (!clave) {
      results.push({
        fila, clave: "", id_externo: null, nombre: nombre ?? "",
        organización: null, segmento_organizacional: null, tipo_vacante: null,
        area: null, departamento: null, razon_social: null, esNuevo: true,
        error: "Falta clave",
      });
      continue;
    }
    if (!nombre) {
      results.push({
        fila, clave, id_externo: null, nombre: "",
        organización: null, segmento_organizacional: null, tipo_vacante: null,
        area: null, departamento: null, razon_social: null, esNuevo: true,
        error: "Falta nombre",
      });
      continue;
    }

    results.push({
      fila,
      clave,
      id_externo:              num(col(row, "identificador", "id_externo", "id")),
      nombre:                  nombre.toUpperCase(),
      organización:            str(col(row, "organización", "organizacion", "uen", "org")),
      segmento_organizacional: str(col(row, "segmentoorganizacional", "segmento_organizacional", "segmento", "nivel")),
      tipo_vacante:            str(col(row, "tipovacante", "tipo_vacante", "tipo")),
      area:                    str(col(row, "area", "área")),
      departamento:            str(col(row, "departamento", "depto")),
      razon_social:            str(col(row, "razonsocial", "razon_social", "empresa")),
      esNuevo:                 !existingClaves.has(clave),
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
  const validos = results.filter((r) => !r.error && r.clave && r.nombre);
  const errors: string[] = [];
  let upserted = 0;

  for (const r of validos) {
    const { error } = await supabase.from("catalogo_puestos").upsert(
      {
        clave:                   r.clave,
        id_externo:              r.id_externo,
        nombre:                  r.nombre,
        organización:            r.organización,
        segmento_organizacional: r.segmento_organizacional,
        tipo_vacante:            r.tipo_vacante,
        area:                    r.area,
        departamento:            r.departamento,
        razon_social:            r.razon_social,
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
    total: results.length,
    upserted,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 10),
  });
}
