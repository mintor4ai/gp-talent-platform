import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import PlanCarreraList from "./PlanCarreraList";

export default async function PlanCarreraIndexPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";

  if (!isAdmin) {
    const { data: propio } = await supabase
      .from("usuarios_app")
      .select("id_empleado")
      .eq("id", user.id)
      .single();
    if (propio?.id_empleado) redirect(`/plan-carrera/${propio.id_empleado}`);
    redirect("/dashboard");
  }

  const { data: planesRaw } = await supabase
    .from("plan_carrera")
    .select("*")
    .order("created_at", { ascending: false });

  const planes = (planesRaw ?? []) as unknown as Array<Record<string, unknown>>;

  if (!planes.length) {
    return <PlanCarreraList planes={[]} />;
  }

  const colaboradorIds = planes.map((p) => p["colaborador_id"] as string);
  const planIds = planes.map((p) => p["id"] as string);

  const [colabsRes, objetivosRes, notasRes] = await Promise.all([
    supabase.from("colaboradores").select("id, nombre_completo, puesto, area, organización").in("id", colaboradorIds),
    supabase.from("plan_carrera_objetivos")
      .select("plan_id, puesto_catalogo_id, prioridad, catalogo_puestos(nombre, organización)")
      .in("plan_id", planIds)
      .eq("activo", true)
      .order("prioridad"),
    supabase.from("plan_carrera_notas")
      .select("plan_id, tipo")
      .in("plan_id", planIds),
  ]);

  const colabs = (colabsRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const colabById = new Map(colabs.map((c) => [c["id"] as string, c]));

  const objetivos = (objetivosRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const primaryObjByPlan = new Map<string, Record<string, unknown>>();
  const objCountByPlan = new Map<string, number>();
  for (const o of objetivos) {
    const pid = o["plan_id"] as string;
    if (!primaryObjByPlan.has(pid)) primaryObjByPlan.set(pid, o);
    objCountByPlan.set(pid, (objCountByPlan.get(pid) ?? 0) + 1);
  }

  const notas = (notasRes.data ?? []) as unknown as Array<{ plan_id: string; tipo: string }>;
  const notaCountByPlan = new Map<string, number>();
  for (const n of notas) {
    if (n.tipo === "sesion") {
      notaCountByPlan.set(n.plan_id, (notaCountByPlan.get(n.plan_id) ?? 0) + 1);
    }
  }

  const enriched = planes.map((p) => {
    const planId = p["id"] as string;
    const colab = colabById.get(p["colaborador_id"] as string);
    const primaryObj = primaryObjByPlan.get(planId);
    const catPuesto = primaryObj?.["catalogo_puestos"] as Record<string, unknown> | undefined;

    return {
      id: planId,
      colaborador_id: p["colaborador_id"] as string,
      estado: p["estado"] as string,
      ciclo_año: p["ciclo_año"] as number,
      created_at: p["created_at"] as string,
      colaborador_nombre: (colab?.["nombre_completo"] as string) ?? "",
      colaborador_puesto: (colab?.["puesto"] as string) ?? "",
      colaborador_org: (colab?.["organización"] as string) ?? "",
      objetivo_principal: catPuesto ? (catPuesto["nombre"] as string) : null,
      objetivo_org: catPuesto ? ((catPuesto["organización"] as string) ?? null) : null,
      objetivos_count: objCountByPlan.get(planId) ?? 0,
      sesiones_count: notaCountByPlan.get(planId) ?? 0,
    };
  });

  return <PlanCarreraList planes={enriched} />;
}
