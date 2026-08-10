import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import { getPuestosParaSelector, listarEscenarios } from "@/app/actions/rutas_talento";
import RutasTalentoClient from "./RutasTalentoClient";

export default async function RutasTalentoPage() {
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

  const [puestos, escenarios] = await Promise.all([
    getPuestosParaSelector(),
    listarEscenarios(),
  ]);

  return <RutasTalentoClient puestos={puestos} escenariosPrevios={escenarios} />;
}
