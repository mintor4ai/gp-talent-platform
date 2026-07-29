"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil || !["capital_humano", "superadmin"].includes(perfil.rol))
    throw new Error("Sin permisos");
  return { supabase, userId: user.id };
}

// DB constraint: fuente CHECK (fuente = ANY (ARRAY['auto', 'manual_ch']))
const FUENTE_AUTO   = "auto"    as const;
const FUENTE_MANUAL = "manual_ch" as const;

export async function sincronizarTalentoClave(
  cicloAño: number
): Promise<{ ok: boolean; added: number; removed: number; error?: string }> {
  try {
    const { supabase } = await getAdminUser();

    const { data: eips, error: eipErr } = await supabase
      .from("evaluacion_integral_personal")
      .select("id_empleado, zona_evaluacion")
      .eq("ciclo_año", cicloAño)
      .in("zona_evaluacion", ["Desarrollo", "Sobresaliente"]);
    if (eipErr) throw eipErr;

    const qualifyingIds = new Set((eips ?? []).map((e) => e.id_empleado));

    const { data: current, error: curErr } = await supabase
      .from("talento_clave")
      .select("id, colaborador_id, es_talento_clave, fuente")
      .eq("ciclo_año", cicloAño);
    if (curErr) throw curErr;

    const currentMap = new Map((current ?? []).map((r) => [r.colaborador_id, r]));

    let added = 0;
    let removed = 0;

    for (const emp of eips ?? []) {
      const existing = currentMap.get(emp.id_empleado);
      if (!existing) {
        const { error } = await supabase.from("talento_clave").insert({
          colaborador_id: emp.id_empleado,
          ciclo_año: cicloAño,
          es_talento_clave: true,
          fuente: FUENTE_AUTO,
          zona_eip: emp.zona_evaluacion,
        });
        if (!error) added++;
      } else if (!existing.es_talento_clave && existing.fuente === FUENTE_AUTO) {
        await supabase
          .from("talento_clave")
          .update({ es_talento_clave: true, zona_eip: emp.zona_evaluacion, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        added++;
      }
    }

    // Remove auto-tagged collaborators that no longer qualify (never touch manual_ch)
    for (const rec of current ?? []) {
      if (rec.es_talento_clave && rec.fuente === FUENTE_AUTO && !qualifyingIds.has(rec.colaborador_id)) {
        await supabase
          .from("talento_clave")
          .update({ es_talento_clave: false, updated_at: new Date().toISOString() })
          .eq("id", rec.id);
        removed++;
      }
    }

    revalidatePath("/talento-clave");
    return { ok: true, added, removed };
  } catch (err) {
    return { ok: false, added: 0, removed: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function promoverTalentoClave(
  colaboradorId: string,
  cicloAño: number,
  justificacion: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { data: existing } = await supabase
      .from("talento_clave")
      .select("id, es_talento_clave, zona_eip")
      .eq("colaborador_id", colaboradorId)
      .eq("ciclo_año", cicloAño)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("talento_clave")
        .update({ es_talento_clave: true, fuente: FUENTE_MANUAL, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("talento_clave").insert({
        colaborador_id: colaboradorId,
        ciclo_año: cicloAño,
        es_talento_clave: true,
        fuente: FUENTE_MANUAL,
        zona_eip: null,
      });
      if (error) throw error;
    }

    await supabase.from("talento_clave_log").insert({
      colaborador_id: colaboradorId,
      ciclo_año: cicloAño,
      accion: "promover",
      justificacion,
      zona_eip: existing?.zona_eip ?? null,
      es_talento_clave_anterior: existing?.es_talento_clave ?? false,
      creado_por: userId,
    });

    revalidatePath("/talento-clave");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function removerTalentoClave(
  colaboradorId: string,
  cicloAño: number,
  justificacion: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { data: existing } = await supabase
      .from("talento_clave")
      .select("id, es_talento_clave, zona_eip")
      .eq("colaborador_id", colaboradorId)
      .eq("ciclo_año", cicloAño)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("talento_clave")
        .update({ es_talento_clave: false, fuente: FUENTE_MANUAL, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      // Person auto-qualified via EIP but has no explicit TC record yet —
      // insert a manual override so the removal persists past a re-sync.
      const { data: eipRow } = await supabase
        .from("evaluacion_integral_personal")
        .select("zona_evaluacion")
        .eq("id_empleado", colaboradorId)
        .eq("ciclo_año", cicloAño)
        .single();
      const { error } = await supabase.from("talento_clave").insert({
        colaborador_id: colaboradorId,
        ciclo_año: cicloAño,
        es_talento_clave: false,
        fuente: FUENTE_MANUAL,
        zona_eip: (eipRow as any)?.zona_evaluacion ?? null,
      });
      if (error) throw error;
    }

    await supabase.from("talento_clave_log").insert({
      colaborador_id: colaboradorId,
      ciclo_año: cicloAño,
      accion: "remover",
      justificacion,
      zona_eip: existing?.zona_eip ?? null,
      es_talento_clave_anterior: existing?.es_talento_clave ?? true,
      creado_por: userId,
    });

    revalidatePath("/talento-clave");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
