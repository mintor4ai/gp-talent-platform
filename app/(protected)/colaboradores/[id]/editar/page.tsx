import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import ColaboradorEditForm from "./ColaboradorEditForm";

export default async function ColaboradorEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: colaboradorId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");
  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  const { data: colab } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", colaboradorId)
    .single();

  if (!colab) notFound();

  // Lists for autocomplete selects
  const { data: allColabs } = await supabase
    .from("colaboradores")
    .select("nombre_completo, puesto, nivel, organización, area, segmento_organizacional, entidad, nivel_academico")
    .eq("activo", true);

  type AnyColab = Record<string, string | null>;
  const arr = (allColabs ?? []) as unknown as AnyColab[];

  function uniq(vals: (string | null)[]): string[] {
    return Array.from(new Set(vals.filter(Boolean) as string[])).sort();
  }

  const uens       = uniq(arr.map((c) => c["organización"]));
  const areas      = uniq(arr.map((c) => c["area"]));
  const segmentos  = uniq(arr.map((c) => c["segmento_organizacional"]));
  const entidades  = uniq(arr.map((c) => c["entidad"]));
  const jefes      = uniq(arr.map((c) => c["nombre_completo"]));
  const niveles    = uniq(arr.map((c) => c["nivel"]));
  const nivelesAcad = uniq(arr.map((c) => c["nivel_academico"]));

  const c = colab as any;

  return (
    <ColaboradorEditForm
      colaboradorId={colaboradorId}
      inicial={{
        nombre_completo:               c.nombre_completo ?? "",
        puesto:                        c.puesto ?? "",
        nivel:                         c.nivel ?? "",
        area:                          c.area ?? "",
        organización:                  c.organización ?? "",
        segmento_organizacional:       c.segmento_organizacional ?? "",
        jefe_inmediato_nombre:         c.jefe_inmediato_nombre ?? "",
        entidad:                       c.entidad ?? "",
        fecha_antiguedad:              c.fecha_antiguedad ?? "",
        fecha_ingreso_puesto:          c.fecha_ingreso_puesto ?? "",
        nivel_academico:               c.nivel_academico ?? "",
        resumen_formacion_profesional: c.resumen_formacion_profesional ?? "",
        resumen_exp_interno:           c.resumen_exp_interno ?? "",
        resumen_exp_externo:           c.resumen_exp_externo ?? "",
      }}
      opciones={{ uens, areas, segmentos, entidades, jefes, niveles, nivelesAcad }}
    />
  );
}
