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

export type PuestoEditFields = {
  nombre: string;
  clave: string | null;
  organización: string | null;
  area: string | null;
  segmento_organizacional: string | null;
  tipo_vacante: string | null;
  es_critico: boolean;
};

export async function editarPuesto(
  id: string,
  fields: PuestoEditFields
): Promise<{ error: string | null }> {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr ?? "Sin permiso" };

  if (!fields.nombre.trim()) return { error: "El nombre es obligatorio." };

  const { error } = await supabase
    .from("catalogo_puestos")
    .update({
      nombre: fields.nombre.trim().toUpperCase(),
      clave: fields.clave?.trim() || null,
      "organización": fields.organización,
      area: fields.area?.trim() || null,
      segmento_organizacional: fields.segmento_organizacional || null,
      tipo_vacante: fields.tipo_vacante || null,
      es_critico: fields.es_critico,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}

export async function aprobarPuesto(
  id: string,
  fields: PuestoEditFields
): Promise<{ error: string | null }> {
  const { error: authErr, supabase } = await requireAdmin();
  if (authErr || !supabase) return { error: authErr ?? "Sin permiso" };

  if (!fields.nombre.trim()) return { error: "El nombre es obligatorio." };
  if (!fields.clave?.trim()) return { error: "La clave es obligatoria para aprobar el puesto." };

  const { error } = await supabase
    .from("catalogo_puestos")
    .update({
      nombre: fields.nombre.trim().toUpperCase(),
      clave: fields.clave.trim().toUpperCase(),
      "organización": fields.organización,
      area: fields.area?.trim() || null,
      segmento_organizacional: fields.segmento_organizacional || null,
      tipo_vacante: fields.tipo_vacante || null,
      es_critico: fields.es_critico,
      propuesto: false,
      activo: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/configuracion/catalogo-puestos");
  return { error: null };
}
