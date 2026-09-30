"use server";
import { createClient } from "@/lib/supabase/server";

export async function validateMatch(colaboradorId: string, puestoCatalogoId: string, cicloAno: number) {
  const supabase = await createClient();
  await supabase
    .from("sucesion_matches")
    .update({ validado_ch: true, descartado: false })
    .eq("colaborador_id", colaboradorId)
    .eq("puesto_catalogo_id", puestoCatalogoId)
    .eq("ciclo_año", cicloAno);
}

export async function discardMatch(colaboradorId: string, puestoCatalogoId: string, cicloAno: number) {
  const supabase = await createClient();
  await supabase
    .from("sucesion_matches")
    .update({ descartado: true, validado_ch: false })
    .eq("colaborador_id", colaboradorId)
    .eq("puesto_catalogo_id", puestoCatalogoId)
    .eq("ciclo_año", cicloAno);
}
