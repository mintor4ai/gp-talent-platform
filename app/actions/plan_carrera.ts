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

export async function actualizarEstadoAccion(
  accionId: string,
  estado: PlanCarreraAccion["estado"]
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
        updated_by: userId,
      })
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

export async function generarSugerenciasIA(params: {
  planId: string;
  objetivoId?: string | null;
  dimension: PlanCarreraAccion["dimension"];
  puestoObjetivo: string;
  snapshot: Record<string, unknown>;
  brecha?: string | null;
}): Promise<{ ok: boolean; sugerencias?: IASugerencia[]; error?: string }> {
  try {
    const { supabase, userId } = await getAdminUser();

    // Get active prompt + API config
    const [promptRes, apiRes] = await Promise.all([
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
    ]);

    if (!promptRes.data) throw new Error("Prompt plano_carrera_sugerencias no configurado");

    const DIMENSION_LABELS: Record<string, string> = {
      tecnica:    "Competencias Técnicas",
      liderazgo:  "Liderazgo y Gestión",
      visibilidad:"Visibilidad Ejecutiva",
      operativa:  "Experiencia Operativa",
    };

    const prompt = promptRes.data.contenido
      .replace("{{dimension}}", DIMENSION_LABELS[params.dimension] ?? params.dimension)
      .replace("{{puesto_objetivo}}", params.puestoObjetivo)
      .replace("{{snapshot}}", JSON.stringify(params.snapshot))
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
