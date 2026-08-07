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
  if (!isAdmin) redirect("/dashboard");

  // Fetch all plans with joined data
  const { data: planesRaw } = await supabase
    .from("plan_carrera")
    .select("*")
    .order("created_at", { ascending: false });

  const planes = (planesRaw ?? []) as unknown as Array<Record<string, unknown>>;

  if (!planes.length) {
    return <PlanCarreraList planes={[]} />;
  }

  // Enrich: colaborador info
  const colaboradorIds = planes.map((p) => p["colaborador_id"] as string);
  const { data: colabsRaw } = await supabase
    .from("colaboradores")
    .select("*")
    .in("id", colaboradorIds);
  const colabs = (colabsRaw ?? []) as unknown as Array<Record<string, unknown>>;
  const colabById = new Map(colabs.map((c) => [c["id"] as string, c]));

  // Enrich: primary objectives (prioridad=1, activo=true)
  const planIds = planes.map((p) => p["id"] as string);
  const { data: objetivosRaw } = await supabase
    .from("plan_carrera_objetivos")
    .select("*, catalogo_puestos(nombre, organización)")
    .in("plan_id", planIds)
    .eq("activo", true)
    .order("prioridad");
  const objetivos = (objetivosRaw ?? []) as unknown as Array<Record<string, unknown>>;

  // Primary objective per plan (lowest prioridad)
  const primaryObjByPlan = new Map<string, Record<string, unknown>>();
  for (const o of objetivos) {
    const pid = o["plan_id"] as string;
    if (!primaryObjByPlan.has(pid)) primaryObjByPlan.set(pid, o);
  }

  // Count all objectives per plan
  const objCountByPlan = new Map<string, number>();
  for (const o of objetivos) {
    const pid = o["plan_id"] as string;
    objCountByPlan.set(pid, (objCountByPlan.get(pid) ?? 0) + 1);
  }

  // Enrich: action progress per plan
  const { data: accionesRaw } = await supabase
    .from("plan_carrera_acciones")
    .select("plan_id, estado")
    .in("plan_id", planIds);
  const acciones = (accionesRaw ?? []) as unknown as Array<{ plan_id: string; estado: string }>;

  const accionesByPlan = new Map<string, { total: number; completadas: number }>();
  for (const a of acciones) {
    if (a.estado === "cancelado") continue;
    const cur = accionesByPlan.get(a.plan_id) ?? { total: 0, completadas: 0 };
    cur.total++;
    if (a.estado === "completado") cur.completadas++;
    accionesByPlan.set(a.plan_id, cur);
  }

  // Last revision per plan
  const { data: revisionesRaw } = await supabase
    .from("plan_carrera_revisiones")
    .select("plan_id, ciclo_año, estado, fecha_revision")
    .in("plan_id", planIds)
    .order("ciclo_año", { ascending: false });
  const revisiones = (revisionesRaw ?? []) as unknown as Array<Record<string, unknown>>;
  const lastRevByPlan = new Map<string, Record<string, unknown>>();
  for (const r of revisiones) {
    const pid = r["plan_id"] as string;
    if (!lastRevByPlan.has(pid)) lastRevByPlan.set(pid, r);
  }

  // Build enriched list
  const enriched = planes.map((p) => {
    const planId = p["id"] as string;
    const colab = colabById.get(p["colaborador_id"] as string);
    const primaryObj = primaryObjByPlan.get(planId);
    const catPuesto = primaryObj?.["catalogo_puestos"] as Record<string, unknown> | undefined;
    const acc = accionesByPlan.get(planId) ?? { total: 0, completadas: 0 };
    const progress = acc.total > 0 ? Math.round((acc.completadas / acc.total) * 100) : 0;
    const lastRev = lastRevByPlan.get(planId);

    return {
      id: planId,
      colaborador_id: p["colaborador_id"] as string,
      estado: p["estado"] as string,
      ciclo_año: p["ciclo_año"] as number,
      created_at: p["created_at"] as string,
      colaborador_nombre: (colab?.["nombre_completo"] as string) ?? "",
      colaborador_puesto: (colab?.["puesto"] as string) ?? "",
      colaborador_area: (colab?.["area"] as string) ?? "",
      colaborador_org: (colab?.["organización"] as string) ?? "",
      objetivo_principal: catPuesto ? (catPuesto["nombre"] as string) : null,
      objetivo_org: catPuesto ? ((catPuesto["organización"] as string) ?? null) : null,
      objetivos_count: objCountByPlan.get(planId) ?? 0,
      progress,
      acciones_total: acc.total,
      acciones_completadas: acc.completadas,
      ultima_revision_ciclo: lastRev ? (lastRev["ciclo_año"] as number) : null,
      ultima_revision_estado: lastRev ? (lastRev["estado"] as string) : null,
    };
  });

  return <PlanCarreraList planes={enriched} />;
}
