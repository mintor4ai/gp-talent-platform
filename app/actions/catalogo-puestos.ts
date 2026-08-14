"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" as const, supabase: null };
  const { data: perfil } = await supabase.from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return { error: "Sin permiso" as const, supabase: null };
  return { error: null, supabase };
}

export async function togglePuestoCritico(id: string, es_critico: boolean) {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr };
  const { error } = await supabase
    .from("catalogo_puestos")
    .update({ es_critico, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}

export async function togglePuestoActivo(id: string, activo: boolean) {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr };
  const { error } = await supabase
    .from("catalogo_puestos")
    .update({ activo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}

export type PuestoEditFields = {
  nombre: string;
  clave: string | null;
  organización: string | null;
  departamento: string | null;
  area: string | null;
  segmento_organizacional: string | null;
  tipo_vacante: string | null;
  es_critico: boolean;
};

export async function editarPuesto(
  id: string,
  fields: PuestoEditFields
): Promise<{ error: string | null }> {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr ?? "Sin permiso" };

  if (!fields.nombre.trim()) return { error: "El nombre es obligatorio." };

  const { error } = await supabase
    .from("catalogo_puestos")
    .update({
      nombre:                  fields.nombre.trim().toUpperCase(),
      clave:                   fields.clave?.trim() || null,
      "organización":          fields.organización,
      departamento:            fields.departamento?.trim() || null,
      area:                    fields.area?.trim() || null,
      segmento_organizacional: fields.segmento_organizacional || null,
      tipo_vacante:            fields.tipo_vacante || null,
      es_critico:              fields.es_critico,
      updated_at:              new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}

export async function aprobarPuesto(
  id: string,
  fields: PuestoEditFields
): Promise<{ error: string | null }> {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr ?? "Sin permiso" };

  if (!fields.nombre.trim()) return { error: "El nombre es obligatorio." };
  if (!fields.clave?.trim()) return { error: "La clave es obligatoria para aprobar el puesto." };

  const { error } = await supabase
    .from("catalogo_puestos")
    .update({
      nombre:                  fields.nombre.trim().toUpperCase(),
      clave:                   fields.clave.trim().toUpperCase(),
      "organización":          fields.organización,
      departamento:            fields.departamento?.trim() || null,
      area:                    fields.area?.trim() || null,
      segmento_organizacional: fields.segmento_organizacional || null,
      tipo_vacante:            fields.tipo_vacante || null,
      es_critico:              fields.es_critico,
      propuesto:               false,
      activo:                  true,
      updated_at:              new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}

// ── Inference ─────────────────────────────────────────────────────────────────

export type InferenciaRow = {
  id: string;
  clave: string | null;
  nombre: string;
  departamento_actual: string | null;
  area_actual: string | null;
  organización_actual: string | null;
  departamento_inferido: string | null;
  area_inferida: string | null;
  organización_inferida: string | null;
  n_colaboradores: number;
  tipo: "nuevo" | "cambio"; // "nuevo" = blank filled, "cambio" = existing value differs
};

function modeOf(vals: (string | null)[]): string | null {
  const freq = new Map<string, number>();
  for (const v of vals) {
    if (v) freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let max = 0, result: string | null = null;
  for (const [v, count] of freq) {
    if (count > max) { max = count; result = v; }
  }
  return result;
}

export async function inferirDepartamentosPreview(): Promise<{
  rows: InferenciaRow[];
  sin_colaboradores: number;
  error?: string;
}> {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { rows: [], sin_colaboradores: 0, error: authErr ?? "Sin permiso" };

  type ColabRaw = { puesto_catalogo_id: string; departamento: string | null; area: string | null; organización: string | null };
  const { data: collabsRaw } = await supabase
    .from("colaboradores")
    .select("puesto_catalogo_id, departamento, area, organización")
    .not("puesto_catalogo_id", "is", null)
    .eq("activo", true);

  const grouped = new Map<string, ColabRaw[]>();
  for (const c of ((collabsRaw ?? []) as unknown as ColabRaw[])) {
    const arr = grouped.get(c.puesto_catalogo_id) ?? [];
    arr.push(c);
    grouped.set(c.puesto_catalogo_id, arr);
  }

  type PuestoRaw = { id: string; clave: string | null; nombre: string; departamento: string | null; area: string | null; organización: string | null };
  const { data: puestosRaw } = await supabase
    .from("catalogo_puestos")
    .select("id, clave, nombre, departamento, area, organización")
    .eq("propuesto", false)
    .eq("activo", true);

  const rows: InferenciaRow[] = [];
  let sin_colaboradores = 0;

  for (const p of ((puestosRaw ?? []) as unknown as PuestoRaw[])) {
    const colabs = grouped.get(p.id) ?? [];

    if (colabs.length === 0) {
      if (!p.departamento) sin_colaboradores++;
      continue;
    }

    const deptInf = modeOf(colabs.map((c) => c.departamento));
    const areaInf = modeOf(colabs.map((c) => c.area));
    const orgInf  = modeOf(colabs.map((c) => c.organización));

    const nada_inferido = !deptInf && !areaInf && !orgInf;
    if (nada_inferido) continue;

    const difiere =
      (deptInf && deptInf !== p.departamento) ||
      (areaInf && areaInf !== p.area) ||
      (orgInf  && orgInf  !== p.organización);

    if (!difiere) continue;

    rows.push({
      id: p.id,
      clave: p.clave,
      nombre: p.nombre,
      departamento_actual:  p.departamento,
      area_actual:          p.area,
      organización_actual:  p.organización,
      departamento_inferido: deptInf,
      area_inferida:         areaInf,
      organización_inferida: orgInf,
      n_colaboradores: colabs.length,
      tipo: !p.departamento && !p.area ? "nuevo" : "cambio",
    });
  }

  // Sort: "nuevo" first, then "cambio"
  rows.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "nuevo" ? -1 : 1));

  return { rows, sin_colaboradores };
}

export async function aplicarInferenciaDepartamentos(
  updates: Array<{ id: string; departamento: string | null; area: string | null; organización: string | null }>
): Promise<{ updated: number; error?: string }> {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { updated: 0, error: authErr ?? "Sin permiso" };

  let updated = 0;
  for (const u of updates) {
    const payload: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (u.departamento !== null) payload.departamento = u.departamento;
    if (u.area !== null) payload.area = u.area;
    if (u.organización !== null) payload["organización"] = u.organización;
    const { error } = await supabase.from("catalogo_puestos").update(payload).eq("id", u.id);
    if (!error) updated++;
  }

  revalidatePath("/configuracion/catalogo-puestos");
  return { updated };
}
