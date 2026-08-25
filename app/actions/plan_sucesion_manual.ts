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

    // Anti-duplicate check
    const { data: existing } = await supabase
      .from("plan_sucesion")
      .select("id")
      .eq("id_empleado", params.titularId)
      .eq("sucesor_id", params.sucesId)
      .eq("ciclo_año", params.cicloAño)
      .maybeSingle();

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

    // Upsert sucesion_match when CH validates immediately
    if (params.validarInmediatamente && puestoCatalogoId) {
      const { data: existingMatch } = await supabase
        .from("sucesion_matches")
        .select("id")
        .eq("ciclo_año", params.cicloAño)
        .eq("colaborador_id", params.sucesId)
        .eq("puesto_catalogo_id", puestoCatalogoId)
        .maybeSingle();

      if (existingMatch) {
        await supabase.from("sucesion_matches").update({
          validado_ch:      true,
          validado_por:     userId,
          fecha_validacion: now,
          readiness:        params.readiness,
          descartado:       false,
          fecha_descarte:   null,
        }).eq("id", (existingMatch as any).id);
      } else {
        const [{ data: titularRows }, { data: catalogRow }] = await Promise.all([
          supabase.from("colaboradores").select("id")
            .eq("puesto_catalogo_id", puestoCatalogoId).eq("activo", true),
          supabase.from("catalogo_puestos").select("es_critico")
            .eq("id", puestoCatalogoId).single(),
        ]);
        await supabase.from("sucesion_matches").insert({
          ciclo_año:          params.cicloAño,
          colaborador_id:     params.sucesId,
          puesto_catalogo_id: puestoCatalogoId,
          tipo_match:         "sucesion",
          readiness:          params.readiness,
          es_puesto_critico:  (catalogRow as any)?.es_critico ?? false,
          validado_ch:        true,
          validado_por:       userId,
          fecha_validacion:   now,
          titular_ids:        (titularRows ?? []).map((r: any) => r.id),
        });
      }
    }

    revalidatePath("/sucesion");
    return { ok: true, created };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
    return { ok: false, created: false, error: msg };
  }
}
