import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import { getPlanCarrera } from "@/app/actions/plan_carrera";
import PlanCarreraView from "./PlanCarreraView";
import PlanCarreraViewColaborador from "./PlanCarreraViewColaborador";

export default async function PlanCarreraPage({
  params,
}: {
  params: Promise<{ colaboradorId: string }>;
}) {
  const { colaboradorId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";

  // Collaborators can only view their own plan (read-only)
  if (!isAdmin) {
    const { data: propio } = await supabase
      .from("usuarios_app")
      .select("id_empleado")
      .eq("id", user.id)
      .single();
    if (propio?.id_empleado !== colaboradorId) redirect("/dashboard");
  }

  // Load collaborator info
  const { data: colabRaw } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", colaboradorId)
    .single();
  const colab = colabRaw as unknown as Record<string, unknown> | null;

  if (!colab) redirect("/sucesion");

  // Load plan (may be null if not yet created)
  const planResult = await getPlanCarrera(colaboradorId);
  const plan = planResult.data ?? null;

  // Load catalog positions for the objective selector
  const { data: catalogoRaw } = await supabase
    .from("catalogo_puestos")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  const catalogo = ((catalogoRaw ?? []) as unknown as Record<string, unknown>[]).map((c) => ({
    id: c["id"] as string,
    nombre: c["nombre"] as string,
    org: (c["organización"] ?? "") as string,
    es_critico: c["es_critico"] as boolean,
  }));

  const colabInfo = {
    id: colab["id"] as string,
    nombre_completo: (colab["nombre_completo"] as string) ?? "",
    puesto: (colab["puesto"] as string) ?? "",
    nivel: (colab["nivel"] as string) ?? "",
    area: (colab["area"] as string) ?? "",
    organización: (colab["organización"] as string) ?? "",
  };

  if (!isAdmin) {
    return <PlanCarreraViewColaborador colab={colabInfo} plan={plan} />;
  }

  return (
    <PlanCarreraView
      colab={colabInfo}
      plan={plan}
      catalogo={catalogo}
    />
  );
}
