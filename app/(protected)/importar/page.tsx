import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ImportadorClient from "./ImportadorClient";

export default async function ImportarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  return <ImportadorClient />;
}
