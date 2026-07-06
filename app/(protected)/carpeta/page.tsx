import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";

export default async function CarpetaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";

  if (isAdmin) {
    redirect("/colaboradores");
  }

  if (!perfil.id_empleado) {
    redirect("/dashboard");
  }

  redirect(`/carpeta/${perfil.id_empleado}`);
}
