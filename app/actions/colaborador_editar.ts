"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ColaboradorEditPayload = {
  nombre_completo: string;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  organización: string | null;
  segmento_organizacional: string | null;
  jefe_inmediato_nombre: string | null;
  entidad: string | null;
  fecha_antiguedad: string | null;
  fecha_ingreso_puesto: string | null;
  nivel_academico: string | null;
  resumen_formacion_profesional: string | null;
  resumen_exp_interno: string | null;
  resumen_exp_externo: string | null;
};

export async function actualizarColaborador(
  colaboradorId: string,
  payload: ColaboradorEditPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { data: perfil } = await supabase
      .from("usuarios_app")
      .select("rol")
      .eq("id", user.id)
      .single();

    if (!perfil || !["capital_humano", "superadmin"].includes(perfil.rol)) {
      throw new Error("Sin permisos para editar colaboradores");
    }

    const { error } = await supabase
      .from("colaboradores")
      .update({
        nombre_completo:               payload.nombre_completo.trim(),
        puesto:                        payload.puesto?.trim() || null,
        nivel:                         payload.nivel?.trim() || null,
        area:                          payload.area?.trim() || null,
        organización:                  payload.organización?.trim() || null,
        segmento_organizacional:       payload.segmento_organizacional?.trim() || null,
        jefe_inmediato_nombre:         payload.jefe_inmediato_nombre?.trim() || null,
        entidad:                       payload.entidad?.trim() || null,
        fecha_antiguedad:              payload.fecha_antiguedad || null,
        fecha_ingreso_puesto:          payload.fecha_ingreso_puesto || null,
        nivel_academico:               payload.nivel_academico?.trim() || null,
        resumen_formacion_profesional: payload.resumen_formacion_profesional?.trim() || null,
        resumen_exp_interno:           payload.resumen_exp_interno?.trim() || null,
        resumen_exp_externo:           payload.resumen_exp_externo?.trim() || null,
      })
      .eq("id", colaboradorId);

    if (error) throw error;

    revalidatePath(`/colaboradores/${colaboradorId}`);
    revalidatePath("/colaboradores");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : (err as any)?.message ?? String(err) };
  }
}
