"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertEntrevista(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();
  if (!perfil) throw new Error("Sin perfil");

  const id_empleado = formData.get("id_empleado") as string;
  const ciclo_ano = Number(formData.get("ciclo_ano"));
  const notas = formData.get("notas") as string;

  // Colaborador can only update their own; admin can update any
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin && perfil.id_empleado !== id_empleado) throw new Error("Sin permisos");

  await supabase
    .from("picd_entrevistas")
    .upsert(
      { id_empleado, ciclo_ano, notas, estado: "pendiente_revision", updated_at: new Date().toISOString() },
      { onConflict: "id_empleado,ciclo_ano" }
    );

  revalidatePath(`/carpeta/${id_empleado}`);
}

export async function addComentario(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();
  if (!perfil) throw new Error("Sin perfil");

  const id_entrevista = formData.get("id_entrevista") as string;
  const texto = (formData.get("texto") as string)?.trim();
  if (!texto) return;

  // Get author name from colaboradores
  let autor_nombre = "Usuario";
  if (perfil.id_empleado) {
    const { data: colab } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();
    if (colab) autor_nombre = colab.nombre_completo;
  }

  await supabase.from("picd_comentarios").insert({
    id_entrevista,
    autor_id: user.id,
    autor_rol: perfil.rol,
    autor_nombre,
    texto,
  });

  // If jefe is commenting, mark as en_revision
  if (perfil.rol === "jefe") {
    await supabase
      .from("picd_entrevistas")
      .update({ estado: "en_revision", updated_at: new Date().toISOString() })
      .eq("id", id_entrevista);
  }

  const id_empleado = formData.get("id_empleado") as string;
  revalidatePath(`/carpeta/${id_empleado}`);
}

export async function updateEstadoEntrevista(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();
  if (!perfil) throw new Error("Sin perfil");

  const id_entrevista = formData.get("id_entrevista") as string;
  const estado = formData.get("estado") as string;
  const id_empleado = formData.get("id_empleado") as string;

  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  const isJefe = perfil.rol === "jefe";
  if (!isAdmin && !isJefe) throw new Error("Sin permisos");

  await supabase
    .from("picd_entrevistas")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", id_entrevista);

  revalidatePath(`/carpeta/${id_empleado}`);
  revalidatePath("/equipo");
}
