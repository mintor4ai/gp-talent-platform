import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  obtenerDiscrepanciasPicd,
  obtenerSinVinculoPicd,
  obtenerOrgOptions,
} from "@/app/actions/higiene_picd";
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

  const [discrepancias, sinVinculo, orgOptions] = await Promise.all([
    obtenerDiscrepanciasPicd(),
    obtenerSinVinculoPicd(),
    obtenerOrgOptions(),
  ]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Revisión de datos PICD</h1>
        <p className="text-sm text-gray-500 mt-1">
          Detecta inconsistencias y aspiraciones sin catálogo vinculado para apoyar decisiones sobre nuevos puestos y áreas.
        </p>
      </div>

      <HigienePicdClient
        discrepancias={discrepancias}
        sinVinculo={sinVinculo}
        orgOptions={orgOptions}
      />
    </div>
  );
}
