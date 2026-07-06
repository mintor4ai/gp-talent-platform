"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireSuperadmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (perfil?.rol !== "superadmin") throw new Error("Sin permisos");
  return supabase;
}

export async function upsertPeriodo(formData: FormData) {
  const supabase = await requireSuperadmin();

  const cicloAño  = Number(formData.get("ciclo_año"));
  const nombre    = String(formData.get("nombre")).trim();
  const fechaIni  = String(formData.get("fecha_inicio"));
  const fechaFin  = String(formData.get("fecha_fin"));
  const estado    = String(formData.get("estado")) as "planificado" | "activo" | "cerrado";
  const activo    = formData.get("activo") === "true";

  if (!cicloAño || !nombre || !fechaIni || !fechaFin) throw new Error("Datos incompletos");

  const { error } = await supabase.from("periodos").upsert(
    { ciclo_año: cicloAño, nombre, fecha_inicio: fechaIni, fecha_fin: fechaFin, estado, activo },
    { onConflict: "ciclo_año" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/configuracion");
}

export async function setPeriodoActivo(cicloAño: number) {
  const supabase = await requireSuperadmin();

  // The DB trigger handles deactivating others; just mark this one active
  const { error } = await supabase
    .from("periodos")
    .update({ activo: true, estado: "activo" })
    .eq("ciclo_año", cicloAño);
  if (error) throw new Error(error.message);

  revalidatePath("/configuracion");
}

export async function deletePeriodo(cicloAño: number) {
  const supabase = await requireSuperadmin();

  const { error } = await supabase
    .from("periodos")
    .delete()
    .eq("ciclo_año", cicloAño);
  if (error) throw new Error(error.message);

  revalidatePath("/configuracion");
}
