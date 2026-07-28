import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import type { UmbralRow } from "@/app/actions/movilidad";
import MovilidadView from "./MovilidadView";

export type ColabMovilidad = {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  organización: string | null;
  segmento_organizacional: string | null;
  fecha_ingreso_posicion: string | null;
};

export default async function MovilidadPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  const currentYear = new Date().getFullYear();

  const [{ data: colabsRaw }, { data: umbralesRaw }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nombre_completo, puesto, nivel, area, organización, segmento_organizacional, fecha_ingreso_posicion")
      .eq("activo", true)
      .order("nombre_completo"),
    supabase
      .from("movilidad_umbrales")
      .select("*")
      .eq("activo", true)
      .order("ciclo_año", { ascending: false }),
  ]);

  const colabs = (colabsRaw ?? []) as unknown as ColabMovilidad[];
  const umbrales = (umbralesRaw ?? []) as unknown as UmbralRow[];

  const uens = Array.from(new Set(colabs.map((c) => c.organización).filter(Boolean))).sort() as string[];
  const segmentos = Array.from(new Set(colabs.map((c) => c.segmento_organizacional).filter(Boolean))).sort() as string[];
  const ciclos = Array.from(new Set(umbrales.map((u) => u.ciclo_año))).sort((a, b) => b - a);
  if (!ciclos.includes(currentYear)) ciclos.unshift(currentYear);

  return (
    <MovilidadView
      colabs={colabs}
      umbrales={umbrales}
      uens={uens}
      segmentos={segmentos}
      ciclos={ciclos}
      currentYear={currentYear}
    />
  );
}
