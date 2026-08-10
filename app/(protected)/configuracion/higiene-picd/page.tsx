import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerDiscrepanciasPicd } from "@/app/actions/higiene_picd";
import HigienePicdClient from "./HigienePicdClient";

export default async function HigienePicdPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rol = perfil?.rol;
  if (rol !== "superadmin" && rol !== "capital_humano") redirect("/dashboard");

  const discrepancias = await obtenerDiscrepanciasPicd();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Revisión de datos PICD</h1>
        <p className="text-sm text-gray-500 mt-1">
          Registros donde el texto escrito en el formulario no coincide con el nombre del puesto en catálogo.
          Solo lectura — las correcciones se hacen directamente en el expediente del colaborador.
        </p>
      </div>

      <HigienePicdClient discrepancias={discrepancias} />
    </div>
  );
}
