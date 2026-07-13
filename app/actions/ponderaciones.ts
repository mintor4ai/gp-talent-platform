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

export type PonderacionInput = {
  calif_ponderada: number;
  w_exp: number;
  w_form_acad: number;
  w_cursos: number;
  w_comp: number;
  w_eal: number;
  w_picd: number;
};

export async function savePonderaciones(
  cicloAño: number,
  rows: PonderacionInput[]
): Promise<{ error?: string }> {
  try {
    const supabase = await requireSuperadmin();

    // Validate each row sums to 1.0 (allow ±0.001 float tolerance)
    for (const row of rows) {
      const sum = row.w_exp + row.w_form_acad + row.w_cursos + row.w_comp + row.w_eal + row.w_picd;
      if (Math.abs(sum - 1) > 0.001) {
        return { error: `La fila ${row.calif_ponderada} suma ${(sum * 100).toFixed(1)}% (debe ser 100%)` };
      }
    }

    const { error } = await supabase
      .from("eip_ponderaciones")
      .upsert(
        rows.map((r) => ({ ciclo_año: cicloAño, ...r })),
        { onConflict: "ciclo_año,calif_ponderada" }
      );

    if (error) return { error: error.message };

    revalidatePath("/configuracion");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
