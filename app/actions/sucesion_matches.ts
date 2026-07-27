"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Tipos públicos ─────────────────────────────────────────────────────────
export type ColaboradorMatchProfile = {
  nombre_completo: string | null;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  edad: number | null;
  antiguedad: number | null;
  eip: { ciclo_año: number; total: number | null; zona: string | null } | null;
  desempeno: { ciclo_año: number; calificacion: number | null } | null;
};

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

export async function updateMatchReadiness(
  matchId: string,
  readiness: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await getAdminUser();
    const { error } = await supabase
      .from("sucesion_matches")
      .update({ readiness })
      .eq("id", matchId);
    if (error) throw error;
    revalidatePath("/sucesion");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}

export async function getColaboradorMatchProfile(
  colaboradorId: string
): Promise<{ ok: boolean; data?: ColaboradorMatchProfile; error?: string }> {
  try {
    const { supabase } = await getAdminUser();

    const [{ data: colab }, { data: eipRow }, { data: desRow }] = await Promise.all([
      supabase
        .from("colaboradores")
        .select("nombre_completo, puesto, nivel, area, edad, fecha_antiguedad")
        .eq("id", colaboradorId)
        .single(),
      supabase
        .from("evaluacion_integral_personal")
        .select("ciclo_año, evaluacion_potencial_total, zona_evaluacion, años_experiencia")
        .eq("id_empleado", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("evaluacion_desempeno_anual")
        .select("ciclo_año, resultado_logra")
        .eq("id_empleado", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!colab) throw new Error("Colaborador no encontrado");

    const msYear = 1000 * 60 * 60 * 24 * 365.25;
    const antiguedad = (colab as any).fecha_antiguedad
      ? Math.floor((Date.now() - new Date((colab as any).fecha_antiguedad).getTime()) / msYear)
      : null;

    return {
      ok: true,
      data: {
        nombre_completo: (colab as any).nombre_completo ?? null,
        puesto: (colab as any).puesto ?? null,
        nivel: (colab as any).nivel ?? null,
        area: (colab as any).area ?? null,
        edad: (colab as any).edad ?? null,
        antiguedad,
        eip: eipRow
          ? {
              ciclo_año: (eipRow as any).ciclo_año,
              total: (eipRow as any).evaluacion_potencial_total ?? null,
              zona: (eipRow as any).zona_evaluacion ?? null,
            }
          : null,
        desempeno: desRow
          ? {
              ciclo_año: (desRow as any).ciclo_año,
              calificacion: (desRow as any).resultado_logra ?? null,
            }
          : null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
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
