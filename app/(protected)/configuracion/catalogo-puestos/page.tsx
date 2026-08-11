import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CatalogoPuestosClient from "./CatalogoPuestosClient";

export type PuestoCatalogo = {
  id: string;
  id_externo: number | null;
  clave: string | null;
  nombre: string;
  organización: string | null;
  segmento_organizacional: string | null;
  tipo_vacante: string | null;
  area: string | null;
  departamento: string | null;
  razon_social: string | null;
  es_critico: boolean;
  activo: boolean;
  propuesto: boolean;
  titulares_count: number;
  sucesion_count: number;
};

export default async function CatalogoPuestosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  // Fetch catalog with holder and succession counts
  const { data: rawPuestos } = await supabase
    .from("catalogo_puestos")
    .select("*")
    .order("organización" as "nombre", { ascending: true })
    .order("nombre", { ascending: true });

  // Count titulares (active colaboradores linked to each puesto)
  const { data: titularesRaw } = await supabase
    .from("colaboradores")
    .select("puesto_catalogo_id")
    .not("puesto_catalogo_id", "is", null)
    .eq("activo", true);

  const titularesCount = new Map<string, number>();
  for (const r of titularesRaw ?? []) {
    if (r.puesto_catalogo_id) {
      titularesCount.set(r.puesto_catalogo_id, (titularesCount.get(r.puesto_catalogo_id) ?? 0) + 1);
    }
  }

  // Count succession plans per puesto
  const { data: sucesionRaw } = await supabase
    .from("plan_sucesion")
    .select("puesto_catalogo_id")
    .not("puesto_catalogo_id", "is", null);

  const sucesionCount = new Map<string, number>();
  for (const r of sucesionRaw ?? []) {
    if (r.puesto_catalogo_id) {
      sucesionCount.set(r.puesto_catalogo_id, (sucesionCount.get(r.puesto_catalogo_id) ?? 0) + 1);
    }
  }

  const puestos: PuestoCatalogo[] = (rawPuestos ?? []).map((p) => ({
    ...p,
    titulares_count: titularesCount.get(p.id) ?? 0,
    sucesion_count:  sucesionCount.get(p.id) ?? 0,
  }));

  // Distinct filter values
  const uens     = Array.from(new Set(puestos.map((p) => p.organización).filter(Boolean))).sort() as string[];
  const segmentos = Array.from(new Set(puestos.map((p) => p.segmento_organizacional).filter(Boolean))).sort() as string[];
  const tipos    = Array.from(new Set(puestos.map((p) => p.tipo_vacante).filter(Boolean))).sort() as string[];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de Puestos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {puestos.length} puestos · {puestos.filter((p) => p.es_critico).length} críticos · {puestos.filter((p) => p.activo).length} activos · {puestos.filter((p) => p.propuesto).length} propuestos
          </p>
        </div>
        <a
          href="/importar"
          className="text-sm border border-[#1a3a5c] text-[#1a3a5c] px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Importar puestos →
        </a>
      </div>

      <CatalogoPuestosClient puestos={puestos} uens={uens} segmentos={segmentos} tipos={tipos} />
    </div>
  );
}
