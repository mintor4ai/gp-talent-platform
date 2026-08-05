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

// DB constraint: fuente CHECK (fuente = ANY (ARRAY['auto', 'manual_ch', 'persona_clave']))
const FUENTE_AUTO    = "auto"          as const;
const FUENTE_MANUAL  = "manual_ch"     as const;
const FUENTE_PC      = "persona_clave" as const;

export async function sincronizarTalentoClave(
  cicloAño: number
): Promise<{ ok: boolean; added: number; removed: number; error?: string }> {
  try {
    const { supabase } = await getAdminUser();

    // EIP candidates (Desarrollo + Sobresaliente)
    const { data: eips, error: eipErr } = await supabase
      .from("evaluacion_integral_personal")
      .select("id_empleado, zona_evaluacion")
      .eq("ciclo_año", cicloAño)
      .in("zona_evaluacion", ["Desarrollo", "Sobresaliente"]);
    if (eipErr) throw eipErr;

    const eipMap = new Map((eips ?? []).map((e) => [e.id_empleado, e.zona_evaluacion]));

    // Persona Clave candidates (persona_clave = 1 in desempeño)
    const { data: pcRows } = await supabase
      .from("evaluacion_desempeno_anual")
      .select("id_empleado")
      .eq("ciclo_año", cicloAño)
      .eq("persona_clave", 1);

    const pcSet = new Set((pcRows ?? []).map((r: any) => r.id_empleado as string));

    // All qualifying IDs (union)
    const allQualifyingIds = new Set([...Array.from(eipMap.keys()), ...Array.from(pcSet)]);

    const { data: current, error: curErr } = await supabase
      .from("talento_clave")
      .select("id, colaborador_id, es_talento_clave, fuente, zona_eip")
      .eq("ciclo_año", cicloAño);
    if (curErr) throw curErr;

    const currentMap = new Map((current ?? []).map((r) => [r.colaborador_id, r]));

    let added = 0;
    let removed = 0;

    // Add / update qualifying people
    for (const empId of Array.from(allQualifyingIds)) {
      // persona_clave takes priority over auto
      const fuente = pcSet.has(empId) ? FUENTE_PC : FUENTE_AUTO;
      const zonaEip = eipMap.get(empId) ?? null;
      const existing = currentMap.get(empId);

      if (!existing) {
        const { error } = await supabase.from("talento_clave").insert({
          colaborador_id: empId,
          ciclo_año: cicloAño,
          es_talento_clave: true,
          fuente,
          zona_eip: zonaEip,
        });
        if (!error) added++;
      } else if (existing.fuente === FUENTE_MANUAL) {
        // CH override — never touch (covers both promotions and explicit removals)
        continue;
      } else if (!existing.es_talento_clave || existing.fuente !== fuente) {
        // Re-activate or upgrade fuente (e.g. auto → persona_clave)
        await supabase
          .from("talento_clave")
          .update({
            es_talento_clave: true,
            fuente,
            zona_eip: zonaEip,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (!existing.es_talento_clave) added++;
      }
    }

    // Remove auto / persona_clave records that no longer qualify (never touch manual_ch)
    for (const rec of current ?? []) {
      if (
        rec.es_talento_clave &&
        rec.fuente !== FUENTE_MANUAL &&
        !allQualifyingIds.has(rec.colaborador_id)
      ) {
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
