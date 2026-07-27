"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id")
    .eq("id", user.id)
    .single();

  if (!perfil) throw new Error("Perfil no encontrado");

  const isAdmin =
    perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Sin permisos");

  return { supabase, userId: user.id };
}

export async function recalcularMatches(cicloAño: number): Promise<{
  ok: boolean;
  counts?: Record<string, number>;
  error?: string;
}> {
  try {
    const { supabase } = await getAdminUser();

    const { data, error } = await supabase.rpc("recalcular_sucesion_matches", {
      p_ciclo: cicloAño,
    });

    if (error) throw error;

    revalidatePath("/sucesion");
    return { ok: true, counts: data as Record<string, number> };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}

export async function validarMatch(matchId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { error } = await supabase
      .from("sucesion_matches")
      .update({
        validado_ch: true,
        validado_por: userId,
        fecha_validacion: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (error) throw error;

    revalidatePath("/sucesion");
    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}

export async function descartarMatch(matchId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { error } = await supabase
      .from("sucesion_matches")
      .update({
        descartado: true,
        descartado_por: userId,
        fecha_descarte: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (error) throw error;

    revalidatePath("/sucesion");
    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}

export async function reactivarMatch(matchId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await getAdminUser();

    const { error } = await supabase
      .from("sucesion_matches")
      .update({
        descartado: false,
        descartado_por: null,
        fecha_descarte: null,
      })
      .eq("id", matchId);

    if (error) throw error;

    revalidatePath("/sucesion");
    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}
