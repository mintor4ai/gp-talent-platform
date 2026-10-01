"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol, id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  if (perfil.rol !== "capital_humano" && perfil.rol !== "superadmin") throw new Error("Sin permisos");
  return { supabase, userId: user.id };
}

export async function upsertPlanSucesionManual(params: {
  titularId: string;
  sucesId: string;
  sucesNombre: string;
  cicloAño: number;
  readiness: string;
  tiempoEstimado: string;
  notas: string | null;
  validarInmediatamente: boolean;
  planId?: string; // when provided → direct edit by ID (no duplicate check)
}): Promise<{ ok: boolean; created: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    // Resolve titular's puesto_catalogo_id
    const { data: titularColab } = await supabase
      .from("colaboradores")
      .select("puesto_catalogo_id")
      .eq("id", params.titularId)
      .single();
    const puestoCatalogoId = (titularColab as any)?.puesto_catalogo_id as string | null ?? null;

    const now = new Date().toISOString();
    const payload = {
      id_empleado:        params.titularId,
      sucesor_id:         params.sucesId,
      sucesor_nombre:     params.sucesNombre,
      ciclo_año:          params.cicloAño,
      readiness:          params.readiness,
      tiempo_estimado:    params.tiempoEstimado,
      notas:              params.notas || null,
      fuente:             "capital_humano",
      puesto_catalogo_id: puestoCatalogoId,
      estado:             params.validarInmediatamente ? "aprobado" : "borrador",
      informar_sucesor:   false,
      requiere_v2:        false,
    };

    let created: boolean;

    if (params.planId) {
      // Direct edit by ID — skip duplicate check
      const { error } = await supabase
        .from("plan_sucesion").update(payload).eq("id", params.planId);
      if (error) throw error;
      created = false;
    } else {
      // Create or upsert: anti-duplicate by titular+sucesor+ciclo
      const { data: existing } = await supabase
        .from("plan_sucesion")
        .select("id")
        .eq("id_empleado", params.titularId)
        .eq("sucesor_id", params.sucesId)
        .eq("ciclo_año", params.cicloAño)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("plan_sucesion").update(payload).eq("id", (existing as any).id);
        if (error) throw error;
        created = false;
      } else {
        const { error } = await supabase
          .from("plan_sucesion").insert(payload);
        if (error) throw error;
        created = true;
      }
    }

    // Always upsert a sucesion_match of tipo "propuesta" so it appears in MatchingView
    if (puestoCatalogoId) {
      const { data: existingMatch } = await supabase
        .from("sucesion_matches")
        .select("id")
        .eq("ciclo_año", params.cicloAño)
        .eq("colaborador_id", params.sucesId)
        .eq("puesto_catalogo_id", puestoCatalogoId)
        .maybeSingle();

      const [{ data: titularRows }, { data: catalogRow }] = await Promise.all([
        supabase.from("colaboradores").select("id")
          .eq("puesto_catalogo_id", puestoCatalogoId).eq("activo", true),
        supabase.from("catalogo_puestos").select("es_critico")
          .eq("id", puestoCatalogoId).single(),
      ]);

      if (existingMatch) {
        await supabase.from("sucesion_matches").update({
          tipo_match:       "propuesta",
          readiness:        params.readiness,
          descartado:       false,
          fecha_descarte:   null,
          ...(params.validarInmediatamente ? {
            validado_ch:      true,
            validado_por:     userId,
            fecha_validacion: now,
          } : {}),
        }).eq("id", (existingMatch as any).id);
      } else {
        await supabase.from("sucesion_matches").insert({
          ciclo_año:          params.cicloAño,
          colaborador_id:     params.sucesId,
          puesto_catalogo_id: puestoCatalogoId,
          tipo_match:         "manual",
          readiness:          params.readiness,
          es_puesto_critico:  (catalogRow as any)?.es_critico ?? false,
          titular_ids:        (titularRows ?? []).map((r: any) => r.id),
          ...(params.validarInmediatamente ? {
            validado_ch:      true,
            validado_por:     userId,
            fecha_validacion: now,
          } : {
            validado_ch: false,
          }),
        });
      }

      // Auto-discard the gap_critico match for this puesto+ciclo (it's no longer a gap)
      await supabase.from("sucesion_matches")
        .update({ descartado: true, descartado_por: userId, fecha_descarte: now })
        .eq("ciclo_año", params.cicloAño)
        .eq("puesto_catalogo_id", puestoCatalogoId)
        .eq("tipo_match", "gap_critico")
        .eq("descartado", false);
    }

    revalidatePath("/sucesion");
    return { ok: true, created };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
    return { ok: false, created: false, error: msg };
  }
}

export async function descartarPlanSucesion(
  planId: string,
  motivo: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();
    const now = new Date().toISOString();

    // Fetch the plan row to get ciclo_año, sucesor_id, and puesto_catalogo_id
    const { data: plan, error: fetchErr } = await supabase
      .from("plan_sucesion")
      .select("id, ciclo_año, sucesor_id, puesto_catalogo_id, notas")
      .eq("id", planId)
      .single();
    if (fetchErr || !plan) throw fetchErr ?? new Error("Plan no encontrado");

    const notasActualizadas = [
      (plan as any).notas,
      motivo ? `[Descartado ${now.slice(0, 10)}] ${motivo}` : `[Descartado ${now.slice(0, 10)}]`,
    ].filter(Boolean).join("\n\n");

    // Mark plan_sucesion as descartado
    const { error: updErr } = await supabase
      .from("plan_sucesion")
      .update({ estado: "descartado", notas: notasActualizadas })
      .eq("id", planId);
    if (updErr) throw updErr;

    // Also discard the associated sucesion_match if it exists
    const p = plan as any;
    if (p.sucesor_id && p.puesto_catalogo_id) {
      await supabase.from("sucesion_matches")
        .update({ descartado: true, descartado_por: userId, fecha_descarte: now })
        .eq("ciclo_año", p.ciclo_año)
        .eq("colaborador_id", p.sucesor_id)
        .eq("puesto_catalogo_id", p.puesto_catalogo_id)
        .eq("descartado", false);
    }

    revalidatePath("/sucesion");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}

export async function reactivarPlanSucesion(
  planId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await getAdminUser();

    const { error } = await supabase
      .from("plan_sucesion")
      .update({ estado: "borrador" })
      .eq("id", planId)
      .eq("estado", "descartado");
    if (error) throw error;

    revalidatePath("/sucesion");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
    return { ok: false, error: msg };
  }
}
