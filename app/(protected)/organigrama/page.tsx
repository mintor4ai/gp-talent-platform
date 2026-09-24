import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import OrganigramaClient from "./OrganigramaClient";
import { getDisabledOrgs } from "@/lib/disabled-uens";

export default async function OrganigramaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const disabledOrgs = await getDisabledOrgs();

  let orgQuery = supabase
    .from("colaboradores")
    .select("*")
    .eq("activo", true)
    .neq("tipo_plantilla", "PRACTICANTES")
    .order("nombre_completo");

  if (disabledOrgs.length > 0) {
    orgQuery = orgQuery.not("organización", "in", `("${disabledOrgs.join('","')}")`);
  }

  const { data: raw } = await orgQuery;

  const colaboradores = (raw ?? []) as unknown as Array<Record<string, unknown>>;

  const uens = [
    ...new Set(
      colaboradores
        .map((c) => c["organización"] as string)
        .filter(Boolean)
    ),
  ].sort();

  return <OrganigramaClient colaboradores={colaboradores} uens={uens} />;
}
