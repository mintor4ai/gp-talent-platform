"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireSuperadmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" as const, supabase: null, user: null };
  const { data: perfil } = await supabase.from("usuarios_app").select("rol").eq("id", user.id).single();
  if (perfil?.rol !== "superadmin") return { error: "Sin permiso" as const, supabase: null, user: null };
  return { error: null, supabase, user };
}

// ── Coach group access ──────────────────────────────────────────────────────

export async function guardarReglaGrupo(nivel: string, valor: string, habilitado: boolean) {
  const { error: authErr, supabase, user } = await requireSuperadmin();
  if (authErr || !supabase || !user) return { error: authErr };

  const { error } = await supabase
    .from("configuracion_coach_acceso")
    .upsert(
      { nivel, valor: valor.trim(), habilitado, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: "nivel,valor" }
    );

  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function aplicarReglaGrupo(nivel: string, valor: string, habilitado: boolean) {
  const { error: authErr, supabase } = await requireSuperadmin();
  if (authErr || !supabase) return { error: authErr };

  // Find colaboradores matching the group value
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id")
    .ilike(nivel, valor.trim());

  if (!colabs?.length) return { ok: true, afectados: 0 };

  const ids = colabs.map((c: { id: string }) => c.id);

  const { error, count } = await supabase
    .from("usuarios_app")
    .update({ coach_habilitado: habilitado })
    .in("id_empleado", ids);

  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true, afectados: count ?? ids.length };
}

export async function toggleCoachIndividual(userId: string, habilitado: boolean) {
  const { error: authErr, supabase } = await requireSuperadmin();
  if (authErr || !supabase) return { error: authErr };

  const { error } = await supabase
    .from("usuarios_app")
    .update({ coach_habilitado: habilitado })
    .eq("id", userId);

  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── Prompts ─────────────────────────────────────────────────────────────────

export async function guardarPrompt(tipo: string, contenido: string) {
  const { error: authErr, supabase, user } = await requireSuperadmin();
  if (authErr || !supabase || !user) return { error: authErr };

  const { data: versions } = await supabase
    .from("configuracion_prompts")
    .select("version")
    .eq("tipo", tipo)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = ((versions as Array<{ version: number }> | null)?.[0]?.version ?? 0) + 1;

  await supabase.from("configuracion_prompts").update({ activo: false }).eq("tipo", tipo);

  const { error } = await supabase.from("configuracion_prompts").insert({
    tipo,
    contenido,
    version: nextVersion,
    activo: true,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true, version: nextVersion };
}

export async function activarVersionPrompt(id: string, tipo: string) {
  const { error: authErr, supabase } = await requireSuperadmin();
  if (authErr || !supabase) return { error: authErr };

  await supabase.from("configuracion_prompts").update({ activo: false }).eq("tipo", tipo);
  const { error } = await supabase.from("configuracion_prompts").update({ activo: true }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}

// ── API config ───────────────────────────────────────────────────────────────

export async function actualizarConfigApi(modelo: string, maxTokens: number) {
  const { error: authErr, supabase, user } = await requireSuperadmin();
  if (authErr || !supabase || !user) return { error: authErr };

  const { error } = await supabase
    .from("configuracion_api")
    .update({ modelo, max_tokens: maxTokens, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("activo", true);

  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { ok: true };
}
