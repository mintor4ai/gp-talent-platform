"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" as const, supabase: null };
  const { data: perfil } = await supabase.from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return { error: "Sin permiso" as const, supabase: null };
  return { error: null, supabase };
}

export async function togglePuestoCritico(id: string, es_critico: boolean) {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr };

  const { error } = await supabase
    .from("catalogo_puestos")
    .update({ es_critico, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}

export async function togglePuestoActivo(id: string, activo: boolean) {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr };

  const { error } = await supabase
    .from("catalogo_puestos")
    .update({ activo, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}
