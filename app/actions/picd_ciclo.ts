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

export async function getCicloEstado(id_empleado: string, ciclo_año: number) {
  const { supabase } = await requireAuth();
  const { data } = await supabase
    .from("picd_ciclos_estado")
    .select("*")
    .eq("id_empleado", id_empleado)
    .eq("ciclo_año", ciclo_año)
    .single();
  return data ?? null;
}

export async function cerrarCicloPicd(id_empleado: string, ciclo_año: number) {
  const { supabase, perfil, userId } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin && perfil.id_empleado !== id_empleado) throw new Error("Sin permisos");

  const now = new Date().toISOString();
  const { error } = await supabase.from("picd_ciclos_estado").upsert(
    {
      id_empleado,
      ciclo_año,
      estado: "enviado_revision",
      cerrado_at: now,
      cerrado_por: userId,
      updated_at: now,
    },
    { onConflict: "id_empleado,ciclo_año" }
  );
  if (error) throw new Error(error.message);

  // Notificar al jefe inmediato
  const { data: colab } = await supabase
    .from("colaboradores")
    .select("nombre_completo, jefe_inmediato_id")
    .eq("id", id_empleado).single();

  if (colab?.jefe_inmediato_id) {
    await notificarEmpleado({
      id_empleado: colab.jefe_inmediato_id,
      tipo: "accion",
      titulo: `PICD ${ciclo_año} listo para revisión`,
      cuerpo: `${colab.nombre_completo} cerró su ciclo y requiere tu aprobación.`,
      url: `/carpeta/${id_empleado}`,
    });
  }

  revalidatePath(`/carpeta/${id_empleado}`);
}

export async function aprobarCicloPicd(id_empleado: string, ciclo_año: number) {
  const { supabase, perfil, userId } = await requireAuth();
  const isJefe  = perfil.rol === "jefe";
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isJefe && !isAdmin) throw new Error("Sin permisos");

  const now = new Date().toISOString();
  const { error } = await supabase.from("picd_ciclos_estado")
    .update({
      estado: "aprobado",
      decision_at: now,
      decision_por: userId,
      decision_nombre: (perfil as any).nombre ?? null,
      comentario_jefe: null,
      updated_at: now,
    })
    .eq("id_empleado", id_empleado)
    .eq("ciclo_año", ciclo_año);
  if (error) throw new Error(error.message);

  // Notificar al colaborador
  await notificarEmpleado({
    id_empleado,
    tipo: "informativo",
    titulo: `Tu PICD ${ciclo_año} fue aprobado`,
    cuerpo: `${(perfil as any).nombre ?? "Tu jefe"} aprobó tu ciclo de desarrollo.`,
    url: `/carpeta/${id_empleado}`,
  });

  revalidatePath(`/carpeta/${id_empleado}`);
  revalidatePath("/equipo");
}

export async function rechazarCicloPicd(
  id_empleado: string,
  ciclo_año: number,
  comentario: string
) {
  const { supabase, perfil, userId } = await requireAuth();
  const isJefe  = perfil.rol === "jefe";
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isJefe && !isAdmin) throw new Error("Sin permisos");

  const now = new Date().toISOString();
  const { error } = await supabase.from("picd_ciclos_estado")
    .update({
      estado: "abierto",
      decision_at: now,
      decision_por: userId,
      decision_nombre: (perfil as any).nombre ?? null,
      comentario_jefe: comentario.trim() || null,
      updated_at: now,
    })
    .eq("id_empleado", id_empleado)
    .eq("ciclo_año", ciclo_año);
  if (error) throw new Error(error.message);

  // Notificar al colaborador
  await notificarEmpleado({
    id_empleado,
    tipo: "accion",
    titulo: `Tu PICD ${ciclo_año} requiere ajustes`,
    cuerpo: comentario.trim() || `${(perfil as any).nombre ?? "Tu jefe"} solicitó cambios en tu ciclo.`,
    url: `/carpeta/${id_empleado}`,
  });

  revalidatePath(`/carpeta/${id_empleado}`);
  revalidatePath("/equipo");
}

export async function reabrirCicloPicd(id_empleado: string, ciclo_año: number) {
  const { supabase, perfil, userId } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Solo administradores pueden reabrir ciclos");

  const now = new Date().toISOString();
  const { error } = await supabase.from("picd_ciclos_estado")
    .update({
      estado: "abierto",
      reabierto_at: now,
      reabierto_por: userId,
      reabierto_nombre: (perfil as any).nombre ?? null,
      updated_at: now,
    })
    .eq("id_empleado", id_empleado)
    .eq("ciclo_año", ciclo_año);
  if (error) throw new Error(error.message);

  // Notificar al colaborador
  await notificarEmpleado({
    id_empleado,
    tipo: "sistema",
    titulo: `Tu ciclo PICD ${ciclo_año} fue reabierto`,
    cuerpo: "El administrador habilitó nuevamente la edición de tu ciclo.",
    url: `/carpeta/${id_empleado}`,
  });

  revalidatePath(`/carpeta/${id_empleado}`);
  revalidatePath("/colaboradores");
}

export async function reabrirCiclosMultiples(
  pares: { id_empleado: string; ciclo_año: number }[]
) {
  await Promise.all(pares.map((p) => reabrirCicloPicd(p.id_empleado, p.ciclo_año)));
}

export async function activarCiclosPicd(id_empleados: string[], ciclo_año: number) {
  const { supabase, perfil } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Sin permisos");

  const now = new Date().toISOString();
  for (const id_empleado of id_empleados) {
    // Solo inserta si no existe ya un registro para ese ciclo (no sobreescribe estados activos)
    await supabase.from("picd_ciclos_estado").upsert(
      { id_empleado, ciclo_año, estado: "abierto", updated_at: now },
      { onConflict: "id_empleado,ciclo_año", ignoreDuplicates: true }
    );
    await notificarEmpleado({
      id_empleado,
      tipo: "informativo",
      titulo: `Tu ciclo PICD ${ciclo_año} está disponible`,
      cuerpo: "Ya puedes documentar tu Plan Individual de Capacitación y Desarrollo.",
      url: `/picd/${id_empleado}`,
    });
  }

  revalidatePath("/colaboradores");
}

export async function enviarRecordatorioEntrevista(id_empleados: string[], ciclo_año: number) {
  const { supabase, perfil } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Sin permisos");

  for (const id_empleado of id_empleados) {
    await notificarEmpleado({
      id_empleado,
      tipo: "accion",
      titulo: `Pendiente: documenta tu entrevista de desarrollo ${ciclo_año}`,
      cuerpo: "Registra los acuerdos de tu entrevista de desarrollo antes de cerrar el ciclo.",
      url: `/carpeta/${id_empleado}`,
    });
  }
}

export async function getCicloEstadoAdmin(ciclo_año: number) {
  const { supabase, perfil } = await requireAuth();
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Sin permisos");

  const { data } = await supabase
    .from("picd_ciclos_estado")
    .select(`
      id, id_empleado, ciclo_año, estado,
      cerrado_at, decision_at, decision_nombre, comentario_jefe,
      reabierto_at, reabierto_nombre
    `)
    .eq("ciclo_año", ciclo_año)
    .order("estado")
    .order("cerrado_at", { ascending: false });

  return data ?? [];
}
