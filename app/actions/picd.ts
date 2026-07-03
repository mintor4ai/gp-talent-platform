"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertPicd(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const id_empleado = formData.get("id_empleado") as string;
  const ciclo_año = parseInt(formData.get("ciclo_año") as string, 10);

  const payload = {
    id_empleado,
    ciclo_año,
    puesto_futuro_opcion1: formData.get("puesto_futuro_opcion1") as string || null,
    puesto_futuro_opcion2: formData.get("puesto_futuro_opcion2") as string || null,
    areas_oportunidad: formData.get("areas_oportunidad") as string || null,
    compromisos: formData.get("compromisos") as string || null,
    origen_dato: "editor_digital",
    updated_at: new Date().toISOString(),
  };

  const existingId = formData.get("picd_id") as string | null;

  if (existingId) {
    await supabase.from("picd").update(payload).eq("id", existingId);
  } else {
    await supabase.from("picd").insert({ ...payload, estado: "borrador" });
  }

  revalidatePath(`/picd/${id_empleado}`);
}

export async function updateAccionProgress(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const accion_id = formData.get("accion_id") as string;
  const id_empleado = formData.get("id_empleado") as string;

  const etapa1Raw = formData.get("porcentaje_etapa1") as string;
  const etapa2Raw = formData.get("porcentaje_etapa2") as string;

  await supabase
    .from("picd_acciones")
    .update({
      porcentaje_etapa1: etapa1Raw ? parseFloat(etapa1Raw) : null,
      porcentaje_etapa2: etapa2Raw ? parseFloat(etapa2Raw) : null,
      objetivo_logrado: formData.get("objetivo_logrado") as string || null,
    })
    .eq("id", accion_id);

  revalidatePath(`/picd/${id_empleado}`);
}

export async function submitPicd(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const picd_id = formData.get("picd_id") as string;
  const id_empleado = formData.get("id_empleado") as string;

  await supabase
    .from("picd")
    .update({ estado: "enviado", updated_at: new Date().toISOString() })
    .eq("id", picd_id);

  revalidatePath(`/picd/${id_empleado}`);
}
