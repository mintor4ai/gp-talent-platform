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

export async function createUser(params: {
  email: string;
  password: string | null;
  rol: string;
  id_empleado: string | null;
  nombre: string | null;
  coach_habilitado: boolean;
}) {
  const supabase = await requireSuperadmin();
  const { data, error } = await supabase.rpc("fn_admin_create_user", {
    p_email: params.email,
    p_password: params.password,
    p_rol: params.rol,
    p_id_empleado: params.id_empleado,
    p_nombre: params.nombre,
    p_coach_habilitado: params.coach_habilitado,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
  return data as { user_id: string };
}

export async function updateUsuario(params: {
  user_id: string;
  rol: string;
  activo: boolean;
  coach_habilitado: boolean;
  id_empleado: string | null;
  clear_empleado: boolean;
  nombre: string | null;
}) {
  const supabase = await requireSuperadmin();
  const { error } = await supabase.rpc("fn_admin_update_usuario", {
    p_user_id: params.user_id,
    p_rol: params.rol,
    p_activo: params.activo,
    p_coach_habilitado: params.coach_habilitado,
    p_id_empleado: params.id_empleado,
    p_clear_empleado: params.clear_empleado,
    p_nombre: params.nombre,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
}

export async function resetPassword(user_id: string, password: string) {
  const supabase = await requireSuperadmin();
  const { error } = await supabase.rpc("fn_admin_reset_password", {
    p_user_id: user_id,
    p_password: password,
  });
  if (error) throw new Error(error.message);
}
