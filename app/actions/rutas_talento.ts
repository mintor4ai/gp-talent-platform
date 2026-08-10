"use server";

import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import type {
  FuenteCandidato,
  Candidato,
  PuestoOption,
  EscenarioResumen,
} from "./rutas_talento_utils";

// ─── Get positions for selector ──────────────────────────────────────────────

export async function getPuestosParaSelector(): Promise<PuestoOption[]> {
  const supabase = await createClient();

  const { data: puestosRaw } = await supabase
    .from("catalogo_puestos")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  const puestos = (puestosRaw ?? []) as unknown as Array<Record<string, unknown>>;
  if (!puestos.length) return [];

  const puestoIds = puestos.map((p) => p["id"] as string);

  const { data: colabsRaw } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto_catalogo_id")
    .in("puesto_catalogo_id", puestoIds)
    .eq("activo", true);

  const colabs = (colabsRaw ?? []) as unknown as Array<{
    id: string;
    nombre_completo: string;
    puesto_catalogo_id: string;
  }>;

  const ocupanteByPuesto = new Map<string, { id: string; nombre: string }>();
  for (const c of colabs) {
    if (!ocupanteByPuesto.has(c.puesto_catalogo_id)) {
      ocupanteByPuesto.set(c.puesto_catalogo_id, { id: c.id, nombre: c.nombre_completo });
    }
  }

  return puestos.map((p) => {
    const pid = p["id"] as string;
    const ocu = ocupanteByPuesto.get(pid);
    return {
      id: pid,
      nombre: (p["nombre"] as string) ?? "",
      org: (p["organización"] as string) ?? "",
      esCritico: (p["es_critico"] as boolean) ?? false,
      ocupanteNombre: ocu?.nombre ?? null,
      ocupanteId: ocu?.id ?? null,
    };
  });
}

// ─── Get candidates for a position ───────────────────────────────────────────

export async function getCandidatosParaPuesto(
  puestoId: string,
  fuentes: FuenteCandidato[]
): Promise<Candidato[]> {
  const supabase = await createClient();

  const map = new Map<string, { fuentes: FuenteCandidato[]; readiness: string | null }>();

  if (fuentes.includes("sucesion")) {
    const { data } = await supabase
      .from("sucesion_matches")
      .select("colaborador_id, readiness")
      .eq("puesto_catalogo_id", puestoId)
      .eq("validado_ch", true)
      .neq("descartado", true);

    for (const row of (data ?? []) as Array<{ colaborador_id: string; readiness: string | null }>) {
      if (!row.colaborador_id) continue;
      const ex = map.get(row.colaborador_id);
      if (ex) {
        if (!ex.fuentes.includes("sucesion")) ex.fuentes.push("sucesion");
        if (!ex.readiness && row.readiness) ex.readiness = row.readiness;
      } else {
        map.set(row.colaborador_id, { fuentes: ["sucesion"], readiness: row.readiness });
      }
    }
  }

  if (fuentes.includes("plano")) {
    const { data: objetivos } = await supabase
      .from("plan_carrera_objetivos")
      .select("plan_id")
      .eq("puesto_catalogo_id", puestoId)
      .eq("activo", true);

    if (objetivos && objetivos.length > 0) {
      const planIds = (objetivos as Array<{ plan_id: string }>).map((o) => o.plan_id);
      const { data: planes } = await supabase
        .from("plan_carrera")
        .select("colaborador_id")
        .in("id", planIds);

      for (const row of (planes ?? []) as Array<{ colaborador_id: string }>) {
        if (!row.colaborador_id) continue;
        const ex = map.get(row.colaborador_id);
        if (ex) {
          if (!ex.fuentes.includes("plano")) ex.fuentes.push("plano");
        } else {
          map.set(row.colaborador_id, { fuentes: ["plano"], readiness: null });
        }
      }
    }
  }

  if (fuentes.includes("picd")) {
    const { data } = await supabase
      .from("picd")
      .select("id_empleado")
      .or(`puesto_futuro_id1.eq.${puestoId},puesto_futuro_id2.eq.${puestoId}`);

    for (const row of (data ?? []) as Array<{ id_empleado: string | null }>) {
      if (!row.id_empleado) continue;
      const ex = map.get(row.id_empleado);
      if (ex) {
        if (!ex.fuentes.includes("picd")) ex.fuentes.push("picd");
      } else {
        map.set(row.id_empleado, { fuentes: ["picd"], readiness: null });
      }
    }
  }

  if (map.size === 0) return [];

  const ids = [...map.keys()];
  const { data: colabsRaw } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, puesto_catalogo_id")
    .in("id", ids)
    .eq("activo", true);

  const colabs = (colabsRaw ?? []) as unknown as Array<{
    id: string;
    nombre_completo: string;
    puesto: string;
    puesto_catalogo_id: string | null;
  }>;

  const colabById = new Map(colabs.map((c) => [c.id, c]));

  const positionIds = [
    ...new Set(colabs.map((c) => c.puesto_catalogo_id).filter(Boolean) as string[]),
  ];

  const criticidadMap = new Map<string, boolean>();
  const coberturaMap = new Map<string, { tieneSucesor: boolean; mejorReadiness: string | null }>();

  if (positionIds.length > 0) {
    const { data: puestosRaw } = await supabase
      .from("catalogo_puestos")
      .select("id, es_critico")
      .in("id", positionIds);

    for (const p of (puestosRaw ?? []) as Array<{ id: string; es_critico: boolean }>) {
      criticidadMap.set(p.id, p.es_critico ?? false);
    }

    const { data: sucRaw } = await supabase
      .from("sucesion_matches")
      .select("puesto_catalogo_id, readiness")
      .in("puesto_catalogo_id", positionIds)
      .eq("validado_ch", true)
      .neq("descartado", true);

    const sucByPos = new Map<string, string[]>();
    for (const s of (sucRaw ?? []) as Array<{ puesto_catalogo_id: string; readiness: string | null }>) {
      if (!sucByPos.has(s.puesto_catalogo_id)) sucByPos.set(s.puesto_catalogo_id, []);
      if (s.readiness) sucByPos.get(s.puesto_catalogo_id)!.push(s.readiness);
    }

    for (const pid of positionIds) {
      const successors = sucByPos.get(pid) ?? [];
      let mejorReadiness: string | null = null;
      if (successors.includes("listo_ahora")) mejorReadiness = "listo_ahora";
      else if (successors.includes("uno_dos_anios")) mejorReadiness = "uno_dos_anios";
      else if (successors.length > 0) mejorReadiness = successors[0];
      coberturaMap.set(pid, { tieneSucesor: successors.length > 0, mejorReadiness });
    }
  }

  const result: Candidato[] = [];

  for (const [colabId, partial] of map.entries()) {
    const colab = colabById.get(colabId);
    if (!colab) continue;

    const posId = colab.puesto_catalogo_id;
    const cobertura = posId ? coberturaMap.get(posId) : null;

    result.push({
      colaboradorId: colabId,
      nombre: colab.nombre_completo,
      puestoActual: colab.puesto,
      puestoCatalogoId: posId ?? null,
      puestoActualEsCritico: posId ? (criticidadMap.get(posId) ?? false) : false,
      fuentes: partial.fuentes,
      readiness: partial.readiness,
      tieneSucesor: cobertura?.tieneSucesor ?? false,
      readinessMejorSucesor: cobertura?.mejorReadiness ?? null,
    });
  }

  return result.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ─── Save scenario ────────────────────────────────────────────────────────────

export async function guardarEscenario(
  nombre: string,
  datos: Record<string, unknown>
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data, error } = await supabase
    .from("rutas_talento_escenarios")
    .insert({ nombre, datos, creado_por: user.id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

// ─── List scenarios ───────────────────────────────────────────────────────────

export async function listarEscenarios(): Promise<EscenarioResumen[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rutas_talento_escenarios")
    .select("id, nombre, created_at, datos")
    .order("created_at", { ascending: false })
    .limit(30);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const datos = row["datos"] as Record<string, unknown>;
    return {
      id: row["id"] as string,
      nombre: row["nombre"] as string,
      created_at: row["created_at"] as string,
      puestoObjetivoNombre: (datos["puestoObjetivoNombre"] as string) ?? "",
      nivelCount: ((datos["cadena"] as unknown[]) ?? []).length,
    };
  });
}

// ─── Load scenario ────────────────────────────────────────────────────────────

export async function cargarEscenario(id: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rutas_talento_escenarios")
    .select("datos")
    .eq("id", id)
    .single();

  if (!data) return null;
  return (data as { datos: Record<string, unknown> }).datos;
}

// ─── Delete scenario ──────────────────────────────────────────────────────────

export async function eliminarEscenario(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rutas_talento_escenarios")
    .delete()
    .eq("id", id);
  return { ok: !error };
}

// ─── AI: per-level analysis ────────────────────────────────────────────────────

export type AnalisisNivelParams = {
  puestoNombre: string;
  esCritico: boolean;
  candidatoNombre: string;
  candidatoTipo: "interno" | "externo" | "sin_candidato";
  readiness: string | null;
  puestoVacanteCritico: boolean;
  tieneSucesor: boolean;
  readinessMejorSucesor: string | null;
  riesgo: "verde" | "amarillo" | "rojo";
};

function readinessLabelLocal(r: string | null): string {
  if (!r) return "No definido";
  if (r === "listo_ahora") return "Listo Ahora";
  if (r === "uno_dos_anios") return "1-2 años";
  if (r === "tres_mas_anios") return "3+ años";
  return r;
}

export async function generarAnalisisNivelIA(
  params: AnalisisNivelParams
): Promise<{ ok: boolean; analisis?: string; error?: string }> {
  const { puestoNombre, esCritico, candidatoNombre, candidatoTipo, readiness,
    puestoVacanteCritico, tieneSucesor, readinessMejorSucesor, riesgo } = params;

  const candidatoDesc =
    candidatoTipo === "externo"
      ? "Candidato externo (reclutamiento)"
      : candidatoTipo === "sin_candidato"
      ? "Sin candidato definido — gap crítico"
      : `${candidatoNombre} (interno) · Readiness: ${readinessLabelLocal(readiness)}`;

  const coberturaDesc =
    candidatoTipo !== "interno"
      ? "No aplica (no hay posición interna que se vacíe)"
      : puestoVacanteCritico
      ? `Puesto CRÍTICO · ${tieneSucesor ? `Tiene sucesor: ${readinessLabelLocal(readinessMejorSucesor)}` : "SIN sucesor"}`
      : "Puesto no crítico";

  const prompt = `Eres un experto en Talent Management. Analiza el siguiente movimiento de talento y proporciona recomendaciones concretas y accionables.

POSICIÓN A CUBRIR: ${puestoNombre}${esCritico ? " (PUESTO CRÍTICO)" : ""}
CANDIDATO SELECCIONADO: ${candidatoDesc}
POSICIÓN QUE QUEDARÁ VACANTE: ${coberturaDesc}
NIVEL DE RIESGO CALCULADO: ${riesgo === "verde" ? "VERDE – Cobertura OK" : riesgo === "amarillo" ? "AMARILLO – Riesgo moderado" : "ROJO – Sin cobertura"}

Proporciona el análisis en este formato exacto:

**DIAGNÓSTICO**
[2-3 oraciones explicando el riesgo específico de este movimiento y sus implicaciones para la organización]

${candidatoTipo === "interno" && readiness !== "listo_ahora" ? `**ACCIONES DE DESARROLLO PARA ${candidatoNombre.toUpperCase()}**
[3-4 acciones concretas para acelerar su readiness. Incluye: mentoring con el titular actual, proyectos de mayor exposición, capacitaciones específicas del rol, o rotaciones estratégicas]
` : ""}${(candidatoTipo !== "interno" || (puestoVacanteCritico && !tieneSucesor)) ? `**ESTRATEGIA DE COBERTURA**
[2-3 acciones estratégicas para mitigar el gap. Incluye según el caso: plan de reclutamiento preventivo, identificar sucesor de emergencia temporal, redistribución de funciones críticas, o rediseño del puesto]
` : ""}**PRIORIDAD DE ACCIÓN**
[Alta / Media / Baja — con una justificación de 1 oración]

Responde en español, de forma ejecutiva y directa. Sé específico, no genérico.`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return { ok: true, analisis: text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── AI: full route report ─────────────────────────────────────────────────────

export type ReporteNivel = {
  puestoNombre: string;
  esCritico: boolean;
  candidatoNombre: string;
  candidatoTipo: "interno" | "externo" | "sin_candidato";
  readiness: string | null;
  riesgo: "verde" | "amarillo" | "rojo" | null;
};

export async function generarReporteCompletoIA(params: {
  puestoObjetivoNombre: string;
  niveles: ReporteNivel[];
}): Promise<{ ok: boolean; reporte?: string; error?: string }> {
  const { puestoObjetivoNombre, niveles } = params;

  const cadenaSummary = niveles
    .map((n, i) => {
      const tipo =
        n.candidatoTipo === "externo" ? "Externo"
        : n.candidatoTipo === "sin_candidato" ? "Sin candidato"
        : n.candidatoNombre;
      const r = n.riesgo === "verde" ? "🟢" : n.riesgo === "amarillo" ? "🟡" : n.riesgo === "rojo" ? "🔴" : "—";
      return `N${i}: ${n.puestoNombre}${n.esCritico ? " ⚠️" : ""} → ${tipo} ${r}`;
    })
    .join("\n");

  const conflictos = niveles
    .filter((n) => n.riesgo === "amarillo" || n.riesgo === "rojo" || n.candidatoTipo !== "interno")
    .map((n) => {
      if (n.candidatoTipo === "externo") return `- ${n.puestoNombre}: se cubre con candidato externo (riesgo de adaptación cultural y onboarding)`;
      if (n.candidatoTipo === "sin_candidato") return `- ${n.puestoNombre}: sin candidato definido — gap crítico`;
      return `- ${n.puestoNombre}: ${n.candidatoNombre} · Readiness ${readinessLabelLocal(n.readiness)} · ${n.esCritico ? "Puesto crítico" : "No crítico"}`;
    })
    .join("\n");

  const prompt = `Eres un experto senior en Talent Management. Genera un reporte ejecutivo completo del siguiente análisis de ruta de talento.

PUESTO OBJETIVO A CUBRIR: ${puestoObjetivoNombre}

CADENA DE MOVIMIENTOS:
${cadenaSummary}

CONFLICTOS Y RIESGOS IDENTIFICADOS:
${conflictos || "No se identificaron conflictos — ruta viable."}

Genera el reporte en este formato:

---
## REPORTE EJECUTIVO — RUTA DE TALENTO
### ${puestoObjetivoNombre}

**RESUMEN EJECUTIVO**
[4-5 oraciones. Describe la viabilidad global de la ruta, los riesgos más importantes y el impacto en la organización si se ejecuta el movimiento.]

**ANÁLISIS POR POSICIÓN**
[Para cada posición con riesgo amarillo o rojo, o con candidato externo/sin candidato, proporciona:
- Nombre del puesto
- Situación actual
- Riesgo específico
- 2-3 recomendaciones concretas]

**PRIORIDADES DE ACCIÓN** (ordenadas por urgencia)
1. [Acción más urgente — quién, qué, cuándo]
2. [Segunda prioridad]
3. [Tercera prioridad]
...

**CONCLUSIÓN**
[1-2 oraciones con la recomendación final: ¿proceder, modificar la ruta, o no ejecutar el movimiento?]
---

Responde en español, tono ejecutivo, específico y accionable. Máximo 600 palabras.`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return { ok: true, reporte: text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
