"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getNotificaciones() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notificaciones")
    .select("id, tipo, titulo, cuerpo, url, leida, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function marcarLeida(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function marcarTodasLeidas() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("user_id", user.id)
    .eq("leida", false);
}

/** Crea una notificación — llamar desde otras server actions con el supabase del mismo contexto */
export async function crearNotificacion(params: {
  user_id: string;
  tipo: "accion" | "informativo" | "sistema";
  titulo: string;
  cuerpo?: string;
  url?: string;
}) {
  const supabase = await createClient();
  await supabase.from("notificaciones").insert({
    user_id:  params.user_id,
    tipo:     params.tipo,
    titulo:   params.titulo,
    cuerpo:   params.cuerpo ?? null,
    url:      params.url ?? null,
  });
}
