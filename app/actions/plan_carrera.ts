"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";

// ── Types ──────────────────────────────────────────────────────────────────

export type PlanCarreraObjetivo = {
  id: string;
  plan_id: string;
  puesto_catalogo_id: string;
  match_id: string | null;
  prioridad: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
  puesto_nombre?: string | null;
  puesto_org?: string | null;
};

export type PlanCarreraAccion = {
  id: string;
  plan_id: string;
  objetivo_id: string | null;
  dimension: "tecnica" | "liderazgo" | "visibilidad" | "operativa";
  titulo: string;
  descripcion: string | null;
  tipo: "capacitacion" | "proyecto" | "mentoria" | "rotacion" | "visibilidad";
  estado: "pendiente" | "en_progreso" | "completado" | "cancelado";
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  fecha_completado: string | null;
  origen: "manual" | "ia";
  calificacion: number | null;
  comentario_resultado: string | null;
  created_at: string;
};

export type PlanCarreraRevision = {
  id: string;
  ciclo_año: number;
  estado: "pendiente" | "en_proceso" | "completada";
  fecha_revision: string | null;
  notas_ch: string | null;
  notas_jefe: string | null;
  notas_colaborador: string | null;
};

export type PlanCarreraFull = {
  id: string;
  colaborador_id: string;
  ciclo_año: number;
  estado: "activo" | "pausado" | "cerrado";
  snapshot_json: Record<string, unknown>;
  notas_internas: string | null;
  created_at: string;
  objetivos: PlanCarreraObjetivo[];
  acciones: PlanCarreraAccion[];
  revisiones: PlanCarreraRevision[];
};

// ── Auth helper ────────────────────────────────────────────────────────────

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  if (!isAdmin) throw new Error("Sin permisos");
  return { supabase, userId: user.id };
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getPlanCarrera(
  colaboradorId: string
): Promise<{ ok: boolean; data?: PlanCarreraFull; error?: string }> {
  try {
    const { supabase } = await getAdminUser();

    const { data: plan, error } = await supabase
      .from("plan_carrera")
      .select("*")
      .eq("colaborador_id", colaboradorId)
      .maybeSingle();

    if (error) throw error;
    if (!plan) return { ok: true, data: undefined };

    const [objetivosRes, accionesRes, revisionesRes] = await Promise.all([
      supabase
        .from("plan_carrera_objetivos")
        .select("*, catalogo_puestos(nombre, organización)")
        .eq("plan_id", plan.id)
        .order("prioridad"),
      supabase
        .from("plan_carrera_acciones")
        .select("*")
        .eq("plan_id", plan.id)
        .order("created_at"),
      supabase
        .from("plan_carrera_revisiones")
        .select("*")
        .eq("plan_id", plan.id)
        .order("ciclo_año", { ascending: false }),
    ]);

    const objetivos: PlanCarreraObjetivo[] = (objetivosRes.data ?? []).map((o: any) => ({
      id: o.id,
      plan_id: o.plan_id,
      puesto_catalogo_id: o.puesto_catalogo_id,
      match_id: o.match_id,
      prioridad: o.prioridad,
      notas: o.notas,
      activo: o.activo,
      created_at: o.created_at,
      puesto_nombre: o.catalogo_puestos?.nombre ?? null,
      puesto_org: o.catalogo_puestos?.["organización"] ?? null,
    }));

    return {
      ok: true,
      data: {
        id: plan.id,
        colaborador_id: plan.colaborador_id,
        ciclo_año: plan.ciclo_año,
        estado: plan.estado,
        snapshot_json: plan.snapshot_json ?? {},
        notas_internas: plan.notas_internas,
        created_at: plan.created_at,
        objetivos,
        acciones: (accionesRes.data ?? []) as PlanCarreraAccion[],
        revisiones: (revisionesRes.data ?? []) as PlanCarreraRevision[],
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Create plan ────────────────────────────────────────────────────────────

export async function crearPlanCarrera(params: {
  colaboradorId: string;
  matchId: string;
  puestoCatalogoId: string;
  cicloAño: number;
  snapshot: Record<string, unknown>;
}): Promise<{ ok: boolean; planId?: string; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    // Check if plan already exists
    const { data: existing } = await supabase
      .from("plan_carrera")
      .select("id")
      .eq("colaborador_id", params.colaboradorId)
      .maybeSingle();

    if (existing) {
      // Plan already exists — add as alternative objective if not already present
      const res = await agregarObjetivo({
        planId: existing.id,
        puestoCatalogoId: params.puestoCatalogoId,
        matchId: params.matchId,
      });
      if (!res.ok) throw new Error(res.error);
      return { ok: true, planId: existing.id };
    }

    // Create new plan
    const { data: plan, error: planError } = await supabase
      .from("plan_carrera")
      .insert({
        colaborador_id: params.colaboradorId,
        ciclo_año: params.cicloAño,
        snapshot_json: params.snapshot,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();

    if (planError) throw planError;

    // Create primary objective (prioridad=1)
    const { error: objError } = await supabase
      .from("plan_carrera_objetivos")
      .insert({
        plan_id: plan.id,
        puesto_catalogo_id: params.puestoCatalogoId,
        match_id: params.matchId,
        prioridad: 1,
        created_by: userId,
        updated_by: userId,
      });

    if (objError) throw objError;

    revalidatePath(`/plan-carrera/${params.colaboradorId}`);
    return { ok: true, planId: plan.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Objetivos ──────────────────────────────────────────────────────────────

export async function agregarObjetivo(params: {
  planId: string;
  puestoCatalogoId: string;
  matchId?: string | null;
  notas?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    // Check if already active
    const { data: existing } = await supabase
      .from("plan_carrera_objetivos")
      .select("id")
      .eq("plan_id", params.planId)
      .eq("puesto_catalogo_id", params.puestoCatalogoId)
      .eq("activo", true)
      .maybeSingle();

    if (existing) return { ok: true }; // Already present, idempotent

    // Get next priority
    const { data: maxRow } = await supabase
      .from("plan_carrera_objetivos")
      .select("prioridad")
      .eq("plan_id", params.planId)
      .order("prioridad", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prioridad = (maxRow?.prioridad ?? 0) + 1;

    const { error } = await supabase
      .from("plan_carrera_objetivos")
      .insert({
        plan_id: params.planId,
        puesto_catalogo_id: params.puestoCatalogoId,
        match_id: params.matchId ?? null,
        prioridad,
        notas: params.notas ?? null,
        created_by: userId,
        updated_by: userId,
      });

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function actualizarPrioridadObjetivo(
  objetivoId: string,
  nuevaPrioridad: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { data: obj } = await supabase
      .from("plan_carrera_objetivos")
      .select("prioridad")
      .eq("id", objetivoId)
      .single();

    if (!obj) throw new Error("Objetivo no encontrado");

    const { error } = await supabase
      .from("plan_carrera_objetivos")
      .update({ prioridad: nuevaPrioridad, updated_by: userId })
      .eq("id", objetivoId);

    if (error) throw error;

    // Log the change
    await supabase.from("plan_carrera_objetivos_log").insert({
      objetivo_id: objetivoId,
      campo: "prioridad",
      valor_anterior: String(obj.prioridad),
      valor_nuevo: String(nuevaPrioridad),
      changed_by: userId,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function actualizarNotasObjetivo(
  objetivoId: string,
  notas: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { data: obj } = await supabase
      .from("plan_carrera_objetivos")
      .select("notas")
      .eq("id", objetivoId)
      .single();

    const { error } = await supabase
      .from("plan_carrera_objetivos")
      .update({ notas, updated_by: userId })
      .eq("id", objetivoId);

    if (error) throw error;

    await supabase.from("plan_carrera_objetivos_log").insert({
      objetivo_id: objetivoId,
      campo: "notas",
      valor_anterior: obj?.notas ?? null,
      valor_nuevo: notas,
      changed_by: userId,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function desactivarObjetivo(
  objetivoId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { error } = await supabase
      .from("plan_carrera_objetivos")
      .update({ activo: false, updated_by: userId })
      .eq("id", objetivoId);

    if (error) throw error;

    await supabase.from("plan_carrera_objetivos_log").insert({
      objetivo_id: objetivoId,
      campo: "activo",
      valor_anterior: "true",
      valor_nuevo: "false",
      changed_by: userId,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Acciones ───────────────────────────────────────────────────────────────

export async function agregarAccion(params: {
  planId: string;
  objetivoId?: string | null;
  dimension: PlanCarreraAccion["dimension"];
  titulo: string;
  descripcion?: string | null;
  tipo: PlanCarreraAccion["tipo"];
  fechaInicio?: string | null;
  fechaFinEstimada?: string | null;
  origen?: "manual" | "ia";
  iaPromptId?: string | null;
  iaRespuestaJson?: unknown;
}): Promise<{ ok: boolean; data?: PlanCarreraAccion; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { data, error } = await supabase
      .from("plan_carrera_acciones")
      .insert({
        plan_id: params.planId,
        objetivo_id: params.objetivoId ?? null,
        dimension: params.dimension,
        titulo: params.titulo,
        descripcion: params.descripcion ?? null,
        tipo: params.tipo,
        fecha_inicio: params.fechaInicio ?? null,
        fecha_fin_estimada: params.fechaFinEstimada ?? null,
        origen: params.origen ?? "manual",
        ia_prompt_id: params.iaPromptId ?? null,
        ia_respuesta_json: params.iaRespuestaJson ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data: data as PlanCarreraAccion };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function actualizarAccion(
  accionId: string,
  fields: {
    titulo?: string;
    descripcion?: string;
    tipo?: PlanCarreraAccion["tipo"];
    fecha_fin_estimada?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();
    const { error } = await supabase
      .from("plan_carrera_acciones")
      .update({ ...fields, updated_by: userId })
      .eq("id", accionId);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function actualizarEstadoAccion(
  accionId: string,
  estado: PlanCarreraAccion["estado"],
  comentarioResultado?: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    const { error } = await supabase
      .from("plan_carrera_acciones")
      .update({
        estado,
        fecha_completado: estado === "completado" ? new Date().toISOString().split("T")[0] : null,
        validado_por: estado === "completado" ? userId : null,
        fecha_validacion: estado === "completado" ? new Date().toISOString() : null,
        comentario_resultado: comentarioResultado ?? null,
        updated_by: userId,
      })
      .eq("id", accionId);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function calificarAccion(
  accionId: string,
  calificacion: number | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();
    const { error } = await supabase
      .from("plan_carrera_acciones")
      .update({ calificacion, updated_by: userId })
      .eq("id", accionId);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function eliminarAccion(
  accionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await getAdminUser();
    const { error } = await supabase
      .from("plan_carrera_acciones")
      .delete()
      .eq("id", accionId);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── IA Suggestions ─────────────────────────────────────────────────────────

type IASugerencia = {
  titulo: string;
  descripcion: string;
  tipo: PlanCarreraAccion["tipo"];
  duracion_meses: number;
};

async function buildEnrichedSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  colaboradorId: string,
  matchId: string | null,
): Promise<string> {
  const [colabRes, historialRes, formacionRes, eipRes, ealRes, picdRes, sucesionPicdRes, matchRes, comp360Res] =
    await Promise.all([
      supabase.from("colaboradores").select("*").eq("id", colaboradorId).single(),
      supabase
        .from("historial_carrera")
        .select("puesto, empresa, tipo, fecha_inicio, fecha_fin, años")
        .eq("id_empleado", colaboradorId)
        .order("fecha_inicio", { ascending: false })
        .limit(10),
      supabase
        .from("formacion_academica")
        .select("nivel_estudio, nombre_carrera, institucion, fecha_fin")
        .eq("colaborador_id", colaboradorId)
        .order("fecha_fin", { ascending: false }),
      supabase
        .from("evaluacion_integral_personal")
        .select("ciclo_año, zona_evaluacion, evaluacion_potencial_total, competencias, percentil_competencias, eal_score, percentil_eal, cumplimiento_picd, escolaridad_texto, años_experiencia, años_exp_total, num_puestos, desempeno_logra")
        .eq("id_empleado", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(2),
      supabase
        .from("evaluacion_anual_liderazgo")
        .select("ciclo_año, promedio_eal, percentil_eal, evaluacion_eal")
        .eq("id_lider_evaluado", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(2),
      supabase
        .from("picd")
        .select("ciclo_año, puesto_futuro_opcion1, puesto_futuro_opcion2, areas_oportunidad, compromisos, porcentaje_cumplimiento")
        .eq("id_empleado", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(2),
      supabase
        .from("sucesion_picd")
        .select("ciclo_año, listo_para_rol")
        .eq("sucesor_empleado_id", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(5),
      matchId
        ? supabase.from("sucesion_matches").select("readiness").eq("id", matchId).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("competencias_360_percentiles")
        .select("competencia, tipo_competencia, percentil, calificacion_promedio, ciclo_año")
        .eq("colaborador_id", colaboradorId)
        .order("ciclo_año", { ascending: false })
        .limit(20),
    ]);

  const c = colabRes.data as unknown as Record<string, unknown> | null;
  if (!c) return "Perfil no disponible";

  const today = new Date();
  const birthDate = c["fecha_nacimiento"] ? new Date(c["fecha_nacimiento"] as string) : null;
  const age = birthDate
    ? Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : (c["edad"] as number | null);
  const ingresoGrupo = c["fecha_ingreso_grupo"] ? new Date(c["fecha_ingreso_grupo"] as string) : null;
  const antiguedadGrupo = ingresoGrupo
    ? Math.round(((today.getTime() - ingresoGrupo.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10
    : null;
  const ingresoPuesto = c["fecha_ingreso_posicion"] ? new Date(c["fecha_ingreso_posicion"] as string) : null;
  const antiguedadPuesto = ingresoPuesto
    ? Math.round(((today.getTime() - ingresoPuesto.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10
    : null;

  const parts: string[] = [];

  parts.push(`## PERFIL BÁSICO
Nombre: ${c["nombre_completo"] ?? "—"}
Edad: ${age ?? "—"} años
Puesto actual: ${c["puesto"] ?? "—"}
Área: ${c["area"] ?? "—"}
UEN / Organización: ${c["organización"] ?? "—"}
Nivel: ${c["nivel"] ?? "—"}
Antigüedad en Grupo GP: ${antiguedadGrupo != null ? `${antiguedadGrupo} años` : "—"}
Antigüedad en puesto actual: ${antiguedadPuesto != null ? `${antiguedadPuesto} años` : "—"}
Disponible para cambio de residencia: ${c["dispuesto_cambiar_residencia"] ? "Sí" : "No"}`);

  const expParts: string[] = [];
  if (c["resumen_exp_interno"]) expParts.push(`Interna: ${c["resumen_exp_interno"]}`);
  if (c["resumen_exp_externo"]) expParts.push(`Externa: ${c["resumen_exp_externo"]}`);
  if (expParts.length) parts.push(`## RESUMEN DE EXPERIENCIA\n${expParts.join("\n")}`);

  const historial = (historialRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (historial.length) {
    parts.push(
      `## HISTORIAL DE CARRERA (${historial.length} posiciones)\n` +
        historial
          .map((h) => `• ${h["puesto"] ?? "—"} en ${h["empresa"] ?? "—"} (${h["tipo"] ?? "—"}) — ${h["años"] ?? "?"} años`)
          .join("\n"),
    );
  }

  const formacion = (formacionRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (formacion.length) {
    parts.push(
      `## FORMACIÓN ACADÉMICA\n` +
        formacion.map((f) => `• ${f["nivel_estudio"] ?? "—"}: ${f["nombre_carrera"] ?? "—"} — ${f["institucion"] ?? "—"}`).join("\n"),
    );
  } else {
    const resumen = [c["resumen_formacion_profesional"], c["resumen_formacion_especialidad"], c["resumen_formacion_maestria"]]
      .filter(Boolean)
      .join(" | ");
    if (resumen) parts.push(`## FORMACIÓN ACADÉMICA\n${resumen}`);
  }

  const eips = (eipRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (eips.length) {
    parts.push(
      `## EIP — EVALUACIÓN INTEGRAL PERSONAL (últimos 2 ciclos)\n` +
        eips
          .map(
            (e) =>
              `Ciclo ${e["ciclo_año"]}: Zona ${e["zona_evaluacion"] ?? "—"} | Potencial ${e["evaluacion_potencial_total"] ?? "—"} | Competencias ${e["competencias"] ?? "—"} (p${e["percentil_competencias"] ?? "—"}) | EAL score ${e["eal_score"] ?? "—"} (p${e["percentil_eal"] ?? "—"}) | Cumplimiento PICD ${e["cumplimiento_picd"] ?? "—"}% | Desempeño ${e["desempeno_logra"] ?? "—"} | Escolaridad: ${e["escolaridad_texto"] ?? "—"}`,
          )
          .join("\n"),
    );
  }

  const eals = (ealRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (eals.length) {
    parts.push(
      `## EAL — EVALUACIÓN ANUAL DE LIDERAZGO (últimos 2 ciclos)\n` +
        eals
          .map((e) => `Ciclo ${e["ciclo_año"]}: Promedio ${e["promedio_eal"] ?? "—"} | Percentil ${e["percentil_eal"] ?? "—"} | Score ponderado ${e["evaluacion_eal"] ?? "—"}`)
          .join("\n"),
    );
  }

  const picds = (picdRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (picds.length) {
    parts.push(
      `## PICD — ASPIRACIONES DECLARADAS (últimos 2 ciclos)\n` +
        picds
          .map((p) => {
            const aspira = [p["puesto_futuro_opcion1"], p["puesto_futuro_opcion2"]].filter(Boolean).join(", ");
            return `Ciclo ${p["ciclo_año"]}: Aspira a → ${aspira || "No declarado"} | Áreas de oportunidad: ${p["areas_oportunidad"] ?? "—"} | Cumplimiento compromisos: ${p["porcentaje_cumplimiento"] ?? "—"}%`;
          })
          .join("\n"),
    );
  }

  const sucesionPicd = (sucesionPicdRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (sucesionPicd.length) {
    parts.push(
      `## HISTORIAL DE PROPUESTAS COMO SUCESOR\n` +
        sucesionPicd
          .map((s) => `Ciclo ${s["ciclo_año"]}: Propuesto por su jefe (readiness declarado: ${s["listo_para_rol"] ?? "—"})`)
          .join("\n"),
    );
  }

  const matchData = matchRes.data as unknown as { readiness: string } | null;
  if (matchData?.readiness) {
    parts.push(`## READINESS VALIDADO POR CAPITAL HUMANO\n${matchData.readiness}`);
  }

  // 360 competencies (most recent cycle)
  const comp360 = (comp360Res.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (comp360.length) {
    const byCiclo = new Map<number, Array<Record<string, unknown>>>();
    for (const row of comp360) {
      const ciclo = row["ciclo_año"] as number;
      if (!byCiclo.has(ciclo)) byCiclo.set(ciclo, []);
      byCiclo.get(ciclo)!.push(row);
    }
    const latestCiclo = Math.max(...byCiclo.keys());
    const rows = byCiclo.get(latestCiclo) ?? [];
    const sorted = [...rows].sort(
      (a, b) => (a["calificacion_promedio"] as number) - (b["calificacion_promedio"] as number),
    );
    const debilidades = sorted.slice(0, 3).map((r) => `${r["competencia"]} (${Number(r["calificacion_promedio"]).toFixed(1)})`);
    const fortalezas = sorted.slice(-3).reverse().map((r) => `${r["competencia"]} (${Number(r["calificacion_promedio"]).toFixed(1)})`);
    parts.push(
      `## EVALUACIÓN 360 DE COMPETENCIAS (Ciclo ${latestCiclo})\n` +
        `Fortalezas destacadas: ${fortalezas.join(", ")}\n` +
        `Áreas de menor calificación: ${debilidades.join(", ")}`,
    );
  }

  return parts.join("\n\n");
}

export async function generarSugerenciasIA(params: {
  planId: string;
  colaboradorId: string;
  matchId?: string | null;
  objetivoId?: string | null;
  dimension: PlanCarreraAccion["dimension"];
  puestoObjetivo: string;
  brecha?: string | null;
}): Promise<{ ok: boolean; sugerencias?: IASugerencia[]; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    // Build enriched snapshot + fetch prompt/config + existing actions in parallel
    const [snapshotText, promptRes, apiRes, accionesExistentesRes] = await Promise.all([
      buildEnrichedSnapshot(supabase, params.colaboradorId, params.matchId ?? null),
      supabase
        .from("configuracion_prompts")
        .select("id, contenido")
        .eq("tipo", "plano_carrera_sugerencias")
        .eq("activo", true)
        .maybeSingle(),
      supabase
        .from("configuracion_api")
        .select("modelo, max_tokens")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plan_carrera_acciones")
        .select("titulo, tipo, dimension, estado")
        .eq("plan_id", params.planId)
        .neq("estado", "cancelado"),
    ]);

    if (!promptRes.data) throw new Error("Prompt plano_carrera_sugerencias no configurado");

    const DIMENSION_LABELS: Record<string, string> = {
      tecnica:     "Competencias Técnicas",
      liderazgo:   "Liderazgo y Gestión",
      visibilidad: "Visibilidad Ejecutiva",
      operativa:   "Experiencia Operativa",
    };

    // Build existing actions context to prevent duplicates
    const accionesExistentes = (accionesExistentesRes.data ?? []) as Array<{
      titulo: string; tipo: string; dimension: string; estado: string;
    }>;
    const accionesContext = accionesExistentes.length
      ? accionesExistentes
          .map((a) => `• [${DIMENSION_LABELS[a.dimension] ?? a.dimension}] ${a.titulo} (${a.tipo}, ${a.estado})`)
          .join("\n")
      : "Ninguna todavía";

    const prompt = promptRes.data.contenido
      .replace("{{dimension}}", DIMENSION_LABELS[params.dimension] ?? params.dimension)
      .replace("{{puesto_objetivo}}", params.puestoObjetivo)
      .replace("{{snapshot}}", snapshotText)
      .replace("{{acciones_existentes}}", accionesContext)
      .replace("{{brecha}}", params.brecha ?? "No especificada");

    const client = new Anthropic();
    const modelo = apiRes.data?.modelo ?? "claude-sonnet-4-6";
    const maxTokens = apiRes.data?.max_tokens ?? 1024;

    const response = await client.messages.create({
      model: modelo,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("La IA no devolvió JSON válido");

    const sugerencias: IASugerencia[] = JSON.parse(jsonMatch[0]);

    // Persist each suggestion as an action with IA traceability
    for (const s of sugerencias) {
      await supabase.from("plan_carrera_acciones").insert({
        plan_id: params.planId,
        objetivo_id: params.objetivoId ?? null,
        dimension: params.dimension,
        titulo: s.titulo,
        descripcion: s.descripcion,
        tipo: s.tipo,
        origen: "ia",
        ia_prompt_id: promptRes.data.id,
        ia_respuesta_json: { sugerencias, modelo, used_at: new Date().toISOString() },
        created_by: userId,
        updated_by: userId,
      });
    }

    return { ok: true, sugerencias };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Revisiones ─────────────────────────────────────────────────────────────

export async function crearRevision(
  planId: string,
  cicloAño: number,
  fechaRevision?: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();
    const { error } = await supabase
      .from("plan_carrera_revisiones")
      .upsert(
        { plan_id: planId, ciclo_año: cicloAño, fecha_revision: fechaRevision ?? null, created_by: userId },
        { onConflict: "plan_id,ciclo_año" }
      );
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function guardarNotasRevision(
  revisionId: string,
  notas: { notas_ch?: string; notas_jefe?: string; notas_colaborador?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();
    const { error } = await supabase
      .from("plan_carrera_revisiones")
      .update({
        ...notas,
        completada_por_ch: notas.notas_ch !== undefined ? userId : undefined,
        fecha_ch: notas.notas_ch !== undefined ? new Date().toISOString() : undefined,
      })
      .eq("id", revisionId);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
