"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertZonaBands(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!perfil || !["capital_humano", "superadmin"].includes(perfil.rol)) {
    throw new Error("Sin permisos");
  }

  const cicloAño = Number(formData.get("ciclo_año"));
  const zonas = ["Inicio", "Revisión", "Estabilidad", "Desarrollo", "Sobresaliente"];

  const rows = zonas.map((zona) => ({
    ciclo_año: cicloAño,
    zona,
    umbral_inferior: Number(formData.get(`umbral_inferior_${zona}`)),
    umbral_superior: Number(formData.get(`umbral_superior_${zona}`)),
    updated_at: new Date().toISOString(),
  }));

  await supabase
    .from("config_zonas_eip")
    .upsert(rows, { onConflict: "ciclo_año,zona" });

  revalidatePath("/evaluaciones");
  revalidatePath("/configuracion");
}

export async function saveZonaBandsArray(
  cicloAño: number,
  bands: { zona: string; umbral_inferior: number; umbral_superior: number }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil || !["capital_humano", "superadmin"].includes(perfil.rol))
    throw new Error("Sin permisos");

  const rows = bands.map((b) => ({
    ciclo_año: cicloAño,
    zona: b.zona,
    umbral_inferior: b.umbral_inferior,
    umbral_superior: b.umbral_superior,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("config_zonas_eip")
    .upsert(rows, { onConflict: "ciclo_año,zona" });
  if (error) throw new Error(error.message);

  revalidatePath("/evaluaciones");
  revalidatePath("/configuracion");
}

export async function copyZonaBandsFromCycle(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!perfil || !["capital_humano", "superadmin"].includes(perfil.rol)) {
    throw new Error("Sin permisos");
  }

  const targetCiclo = Number(formData.get("target_ciclo"));
  const sourceCiclo = Number(formData.get("source_ciclo"));

  const { data: source } = await supabase
    .from("config_zonas_eip")
    .select("zona, umbral_inferior, umbral_superior")
    .eq("ciclo_año", sourceCiclo);

  if (!source || source.length === 0) throw new Error("No hay configuración en el ciclo origen");

  const rows = source.map((r) => ({
    ciclo_año: targetCiclo,
    zona: r.zona,
    umbral_inferior: r.umbral_inferior,
    umbral_superior: r.umbral_superior,
    updated_at: new Date().toISOString(),
  }));

  await supabase
    .from("config_zonas_eip")
    .upsert(rows, { onConflict: "ciclo_año,zona" });

  revalidatePath("/evaluaciones");
  revalidatePath("/configuracion");
}
