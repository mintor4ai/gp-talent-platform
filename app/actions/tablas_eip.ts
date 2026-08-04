"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type MatrixCell = { fila: number; nivel_num: number; score: number };

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase.from("usuarios_app").select("rol").eq("id", user.id).single();
  return perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
}

export async function saveTablasExp(
  cicloAño: number,
  cells: MatrixCell[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: "Sin permisos" };

  const payload = cells.map((c) => ({
    ciclo_año: cicloAño,
    años: c.fila,
    nivel_num: c.nivel_num,
    score: c.score,
  }));

  await supabase.from("eip_tabla_experiencia").delete().eq("ciclo_año", cicloAño);
  const { error } = await supabase.from("eip_tabla_experiencia").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/configuracion");
  return {};
}

export async function saveTablaMov(
  cicloAño: number,
  cells: MatrixCell[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: "Sin permisos" };

  const payload = cells.map((c) => ({
    ciclo_año: cicloAño,
    movilidad_floor: c.fila,
    nivel_num: c.nivel_num,
    score: c.score,
  }));

  await supabase.from("eip_tabla_movilidad").delete().eq("ciclo_año", cicloAño);
  const { error } = await supabase.from("eip_tabla_movilidad").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/configuracion");
  return {};
}

export async function copyTablasExpFromCycle(
  sourceCiclo: number,
  targetCiclo: number
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: "Sin permisos" };

  const { data } = await supabase
    .from("eip_tabla_experiencia")
    .select("años, nivel_num, score")
    .eq("ciclo_año", sourceCiclo);

  if (!data?.length) return { error: `No hay datos para ciclo ${sourceCiclo}` };

  await supabase.from("eip_tabla_experiencia").delete().eq("ciclo_año", targetCiclo);
  const payload = (data as unknown as Array<{ años: number; nivel_num: number; score: number }>).map(
    (r) => ({ ciclo_año: targetCiclo, años: r.años, nivel_num: r.nivel_num, score: r.score })
  );
  const { error } = await supabase.from("eip_tabla_experiencia").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/configuracion");
  return { count: payload.length };
}

export async function copyTablaMovFromCycle(
  sourceCiclo: number,
  targetCiclo: number
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient();
  if (!(await isAdmin(supabase))) return { error: "Sin permisos" };

  const { data } = await supabase
    .from("eip_tabla_movilidad")
    .select("movilidad_floor, nivel_num, score")
    .eq("ciclo_año", sourceCiclo);

  if (!data?.length) return { error: `No hay datos para ciclo ${sourceCiclo}` };

  await supabase.from("eip_tabla_movilidad").delete().eq("ciclo_año", targetCiclo);
  const payload = (data as unknown as Array<{ movilidad_floor: number; nivel_num: number; score: number }>).map(
    (r) => ({ ciclo_año: targetCiclo, movilidad_floor: r.movilidad_floor, nivel_num: r.nivel_num, score: r.score })
  );
  const { error } = await supabase.from("eip_tabla_movilidad").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/configuracion");
  return { count: payload.length };
}
