"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type UmbralRow = {
  id: string;
  ciclo_año: number;
  organización: string | null;
  segmento_organizacional: string | null;
  meses_amarillo: number;
  meses_rojo: number;
  activo: boolean;
  created_at: string;
};

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

export async function getUmbrales(cicloAño: number): Promise<{ ok: boolean; data?: UmbralRow[]; error?: string }> {
  try {
    const { supabase } = await getAdminUser();
    const { data, error } = await supabase
      .from("movilidad_umbrales")
      .select("*")
      .eq("ciclo_año", cicloAño)
      .eq("activo", true)
      .order("organización", { ascending: true, nullsFirst: true })
      .order("segmento_organizacional", { ascending: true, nullsFirst: true });
    if (error) throw error;
    return { ok: true, data: (data ?? []) as UmbralRow[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : (err as any)?.message ?? String(err) };
  }
}

export async function crearUmbral(payload: {
  ciclo_año: number;
  organización: string | null;
  segmento_organizacional: string | null;
  meses_amarillo: number;
  meses_rojo: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();
    const { error } = await supabase.from("movilidad_umbrales").insert({
      ...payload,
      creado_por: userId,
    });
    if (error) throw error;
    revalidatePath("/movilidad");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : (err as any)?.message ?? String(err) };
  }
}

export async function actualizarUmbral(
  id: string,
  payload: { meses_amarillo: number; meses_rojo: number }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await getAdminUser();
    const { error } = await supabase
      .from("movilidad_umbrales")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/movilidad");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : (err as any)?.message ?? String(err) };
  }
}

export async function eliminarUmbral(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await getAdminUser();
    const { error } = await supabase
      .from("movilidad_umbrales")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    revalidatePath("/movilidad");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : (err as any)?.message ?? String(err) };
  }
}
