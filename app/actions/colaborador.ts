"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type PerfilUpdate = {
  puesto?: string | null;
  nivel?: string | null;
  area?: string | null;
  jefe_inmediato_nombre?: string | null;
  segmento_organizacional?: string | null;
  nivel_academico?: string | null;
  correo?: string | null;
  tipo_plantilla?: string | null;
  unidad_costo?: string | null;
  departamento?: string | null;
};

export async function actualizarPerfilColaborador(colaboradorId: string, data: PerfilUpdate) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!perfil || (perfil.rol !== "capital_humano" && perfil.rol !== "superadmin")) {
    return { error: "Sin permisos" };
  }

  const { error } = await supabase.from("colaboradores").update(data).eq("id", colaboradorId);

  if (error) return { error: error.message };

  revalidatePath(`/carpeta/${colaboradorId}`);
  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/colaboradores");
  return { ok: true };
}
