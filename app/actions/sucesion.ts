"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol, id_empleado").eq("id", user.id).single();
  if (!perfil) throw new Error("Sin perfil");
  return { supabase, perfil };
}

export async function upsertSucesor(params: {
  id?: string;
  id_empleado: string;
  ciclo_año: number;
  sucesor_nombre: string;
  sucesor_id: string | null;
  tiempo_estimado: string;
  desarrollo_necesario: string;
  notas: string;
}) {
  const { supabase, perfil } = await requireAuth();

  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin && perfil.id_empleado !== params.id_empleado) throw new Error("Sin permisos");

  const row = {
    id_empleado:          params.id_empleado,
    ciclo_año:            params.ciclo_año,
    sucesor_nombre:       params.sucesor_nombre.trim(),
    sucesor_id:           params.sucesor_id || null,
    tiempo_estimado:      params.tiempo_estimado,
    desarrollo_necesario: params.desarrollo_necesario.trim(),
    notas:                params.notas.trim() || null,
    updated_at:           new Date().toISOString(),
  };

  if (params.id) {
    const { error } = await supabase.from("plan_sucesion").update(row).eq("id", params.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("plan_sucesion").insert(row);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/carpeta/${params.id_empleado}`);
}

export async function deleteSucesor(id: string, id_empleado: string) {
  const { supabase, perfil } = await requireAuth();

  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin && perfil.id_empleado !== id_empleado) throw new Error("Sin permisos");

  const { error } = await supabase.from("plan_sucesion").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/carpeta/${id_empleado}`);
}
