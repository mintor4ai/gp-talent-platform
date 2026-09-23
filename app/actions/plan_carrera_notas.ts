"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type PlanCarreraNota = {
  id: string;
  plan_id: string;
  tipo: "creacion" | "sesion";
  autor_id: string | null;
  autor_nombre: string | null;
  fortalezas: string | null;
  areas_desarrollo: string | null;
  logros_experiencias: string | null;
  experiencias_requeridas: string | null;
  observaciones: string | null;
  editado_en: string | null;
  editado_por_id: string | null;
  editado_por_nombre: string | null;
  created_at: string;
};

async function getAuthorizedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, nombre")
    .eq("id", user.id)
    .single();
  if (!perfil) throw new Error("Perfil no encontrado");

  // CH, superadmin, or jefe (jefe access is enforced by RLS; we allow non-admin users here)
  return { supabase, userId: user.id, userName: (perfil as any).nombre ?? null };
}

export async function getNotasByPlan(
  planId: string
): Promise<{ ok: boolean; data?: PlanCarreraNota[]; error?: string }> {
  try {
    const { supabase } = await getAuthorizedUser();
    const { data, error } = await supabase
      .from("plan_carrera_notas")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { ok: true, data: (data ?? []) as PlanCarreraNota[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function crearNotaInicial(params: {
  planId: string;
  colaboradorNombre: string;
  puestoObjetivo: string;
}): Promise<{ ok: boolean; data?: PlanCarreraNota; error?: string }> {
  try {
    const { supabase, userId, userName } = await getAuthorizedUser();

    const observaciones = `Expediente creado al validar match de sucesión.\nColaborador: ${params.colaboradorNombre}\nPuesto objetivo: ${params.puestoObjetivo}`;

    const { data, error } = await supabase
      .from("plan_carrera_notas")
      .insert({
        plan_id: params.planId,
        tipo: "creacion",
        autor_id: userId,
        autor_nombre: userName,
        observaciones,
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath(`/plan-carrera`);
    return { ok: true, data: data as PlanCarreraNota };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function agregarNota(params: {
  planId: string;
  fortalezas?: string | null;
  areas_desarrollo?: string | null;
  logros_experiencias?: string | null;
  experiencias_requeridas?: string | null;
  observaciones?: string | null;
}): Promise<{ ok: boolean; data?: PlanCarreraNota; error?: string }> {
  try {
    const { supabase, userId, userName } = await getAuthorizedUser();

    const { data, error } = await supabase
      .from("plan_carrera_notas")
      .insert({
        plan_id: params.planId,
        tipo: "sesion",
        autor_id: userId,
        autor_nombre: userName,
        fortalezas:              params.fortalezas?.trim() || null,
        areas_desarrollo:        params.areas_desarrollo?.trim() || null,
        logros_experiencias:     params.logros_experiencias?.trim() || null,
        experiencias_requeridas: params.experiencias_requeridas?.trim() || null,
        observaciones:           params.observaciones?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath(`/plan-carrera`);
    return { ok: true, data: data as PlanCarreraNota };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function editarNota(
  notaId: string,
  params: {
    fortalezas?: string | null;
    areas_desarrollo?: string | null;
    logros_experiencias?: string | null;
    experiencias_requeridas?: string | null;
    observaciones?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId, userName } = await getAuthorizedUser();

    const { error } = await supabase
      .from("plan_carrera_notas")
      .update({
        fortalezas:              params.fortalezas?.trim() ?? null,
        areas_desarrollo:        params.areas_desarrollo?.trim() ?? null,
        logros_experiencias:     params.logros_experiencias?.trim() ?? null,
        experiencias_requeridas: params.experiencias_requeridas?.trim() ?? null,
        observaciones:           params.observaciones?.trim() ?? null,
        editado_en:              new Date().toISOString(),
        editado_por_id:          userId,
        editado_por_nombre:      userName,
      })
      .eq("id", notaId);

    if (error) throw error;
    revalidatePath(`/plan-carrera`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
