"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notificarEmpleado } from "./notificaciones";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol, id_empleado, nombre").eq("id", user.id).single();
  if (!perfil) throw new Error("Sin perfil");
  return { supabase, perfil, userId: user.id };
}

export async function upsertSucesor(params: {
  id?: string;
  id_empleado: string;
  ciclo_año: number;
  sucesor_nombre: string;
  sucesor_id: string | null;
  readiness: string;
  brechas: string;
  acciones_desarrollo: string;
  fecha_objetivo: string | null;
  notas: string;
}) {
  const { supabase, perfil } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin && perfil.id_empleado !== params.id_empleado) throw new Error("Sin permisos");

  if (params.id) {
    const { data: existing } = await supabase
      .from("plan_sucesion").select("estado").eq("id", params.id).single();
    if (existing && existing.estado !== "borrador")
      throw new Error("No se puede editar un plan ya enviado a validación");
  }

  const row = {
    id_empleado:         params.id_empleado,
    ciclo_año:           params.ciclo_año,
    sucesor_nombre:      params.sucesor_nombre.trim(),
    sucesor_id:          params.sucesor_id || null,
    tiempo_estimado:     params.readiness,
    readiness:           params.readiness,
    brechas:             params.brechas.trim() || null,
    acciones_desarrollo: params.acciones_desarrollo.trim() || null,
    fecha_objetivo:      params.fecha_objetivo || null,
    notas:               params.notas.trim() || null,
    estado:              "borrador",
    updated_at:          new Date().toISOString(),
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

  const { data: existing } = await supabase
    .from("plan_sucesion").select("estado").eq("id", id).single();
  if (existing && existing.estado !== "borrador")
    throw new Error("Solo se pueden eliminar borradores");

  const { error } = await supabase.from("plan_sucesion").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/carpeta/${id_empleado}`);
}

export async function submitSucesion(id: string, id_empleado: string) {
  const { supabase, perfil } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin && perfil.id_empleado !== id_empleado) throw new Error("Sin permisos");

  const { data: plan } = await supabase
    .from("plan_sucesion")
    .select("id_empleado, sucesor_id, estado, brechas, acciones_desarrollo")
    .eq("id", id).single();
  if (!plan || plan.estado !== "borrador") throw new Error("Solo se pueden enviar borradores");
  if (!plan.brechas || !plan.acciones_desarrollo)
    throw new Error("Completa brechas y acciones de desarrollo antes de enviar");

  let requiere_v2 = false;
  if (plan.sucesor_id) {
    const [{ data: titular }, { data: sucesor }] = await Promise.all([
      supabase.from("colaboradores").select("organización, area").eq("id", plan.id_empleado).single(),
      supabase.from("colaboradores").select("organización, area").eq("id", plan.sucesor_id).single(),
    ]);
    if (titular && sucesor) {
      requiere_v2 =
        (titular as any).organización !== (sucesor as any).organización ||
        (titular as any).area !== (sucesor as any).area;
    }
  }

  const { error } = await supabase.from("plan_sucesion")
    .update({ estado: "pendiente_v1", requiere_v2, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Notificar a jefes/admins que hay un plan pendiente de validación
  const { data: colab } = await supabase
    .from("colaboradores")
    .select("nombre_completo, jefe_inmediato_id")
    .eq("id", id_empleado).single();
  if (colab?.jefe_inmediato_id) {
    await notificarEmpleado({
      id_empleado: colab.jefe_inmediato_id,
      tipo: "accion",
      titulo: "Plan de sucesión pendiente de validación",
      cuerpo: `${colab.nombre_completo} envió un plan de sucesión para tu revisión.`,
      url: `/sucesion`,
    });
  }

  revalidatePath(`/carpeta/${id_empleado}`);
  revalidatePath("/sucesion");
}

export async function validarSucesionV1(params: {
  id: string;
  id_empleado: string;
  aprobado: boolean;
  comentario: string;
  informar_sucesor: boolean;
}) {
  const { supabase, perfil, userId } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  const isJefe  = perfil.rol === "jefe";
  if (!isAdmin && !isJefe) throw new Error("Sin permisos para validar");

  const { data: plan } = await supabase
    .from("plan_sucesion").select("estado, requiere_v2").eq("id", params.id).single();
  if (!plan || plan.estado !== "pendiente_v1")
    throw new Error("El plan no está pendiente de validación V1");

  let nuevoEstado: string;
  if (!params.aprobado)        nuevoEstado = "rechazado";
  else if (plan.requiere_v2)   nuevoEstado = "pendiente_v2";
  else                         nuevoEstado = "aprobado";

  const { error } = await supabase.from("plan_sucesion").update({
    estado:             nuevoEstado,
    informar_sucesor:   params.aprobado ? params.informar_sucesor : false,
    validado_v1_por:    userId,
    validado_v1_at:     new Date().toISOString(),
    validado_v1_nombre: (perfil as any).nombre ?? null,
    comentario_v1:      params.comentario.trim() || null,
    updated_at:         new Date().toISOString(),
  }).eq("id", params.id);
  if (error) throw new Error(error.message);

  // Notificar al empleado dueño del plan
  {
    const estadoLabel = nuevoEstado === "rechazado" ? "rechazado" : nuevoEstado === "pendiente_v2" ? "en validación V2" : "aprobado";
    await notificarEmpleado({
      id_empleado: params.id_empleado,
      tipo: nuevoEstado === "rechazado" ? "accion" : "informativo",
      titulo: `Tu plan de sucesión fue ${estadoLabel}`,
      cuerpo: params.comentario.trim() || undefined,
      url: `/carpeta/${params.id_empleado}`,
    });
  }

  revalidatePath(`/carpeta/${params.id_empleado}`);
  revalidatePath("/sucesion");
}

export async function validarSucesionV2(params: {
  id: string;
  id_empleado: string;
  aprobado: boolean;
  comentario: string;
}) {
  const { supabase, perfil, userId } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Sin permisos para validación V2");

  const { data: plan } = await supabase
    .from("plan_sucesion").select("estado").eq("id", params.id).single();
  if (!plan || plan.estado !== "pendiente_v2")
    throw new Error("El plan no está pendiente de validación V2");

  const { error } = await supabase.from("plan_sucesion").update({
    estado:             params.aprobado ? "aprobado" : "rechazado",
    validado_v2_por:    userId,
    validado_v2_at:     new Date().toISOString(),
    validado_v2_nombre: (perfil as any).nombre ?? null,
    comentario_v2:      params.comentario.trim() || null,
    updated_at:         new Date().toISOString(),
  }).eq("id", params.id);
  if (error) throw new Error(error.message);

  // Notificar al empleado dueño del plan
  await notificarEmpleado({
    id_empleado: params.id_empleado,
    tipo: params.aprobado ? "informativo" : "accion",
    titulo: `Tu plan de sucesión fue ${params.aprobado ? "aprobado" : "rechazado"}`,
    cuerpo: params.comentario.trim() || undefined,
    url: `/carpeta/${params.id_empleado}`,
  });

  revalidatePath(`/carpeta/${params.id_empleado}`);
  revalidatePath("/sucesion");
}

export async function registrarAspiracion(params: {
  id: string;
  aspiracion: boolean;
}) {
  const { supabase, perfil } = await requireAuth();

  const { data: plan } = await supabase
    .from("plan_sucesion")
    .select("sucesor_id, informar_sucesor, estado, id_empleado")
    .eq("id", params.id).single();
  if (!plan || plan.sucesor_id !== perfil.id_empleado) throw new Error("Sin permisos");
  if (!plan.informar_sucesor || plan.estado !== "aprobado") throw new Error("No disponible");

  const { error } = await supabase.from("plan_sucesion").update({
    sucesor_aspiracion:    params.aspiracion,
    sucesor_aspiracion_at: new Date().toISOString(),
    updated_at:            new Date().toISOString(),
  }).eq("id", params.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/carpeta/${plan.id_empleado}`);
}
