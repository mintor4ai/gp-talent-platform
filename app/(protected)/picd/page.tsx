import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PicdRedirectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("id_empleado, rol")
    .eq("id", user.id)
    .single();

  // Admins go to the PICD management panel in Colaboradores
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (isAdmin) redirect("/colaboradores");

  if (!perfil?.id_empleado) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">
        Tu cuenta no está vinculada a un expediente de colaborador. Contacta a Capital Humano.
      </div>
    );
  }

  redirect(`/picd/${perfil.id_empleado}`);
}
