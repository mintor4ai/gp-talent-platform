"use server";

import { createClient } from "@/lib/supabase/server";

// ─── Shared types ────────────────────────────────────────────────────────────

export type FuenteCandidato = "sucesion" | "plano" | "picd";

export type Candidato = {
  colaboradorId: string;
  nombre: string;
  puestoActual: string;
  puestoCatalogoId: string | null;
  puestoActualEsCritico: boolean;
  fuentes: FuenteCandidato[];
  readiness: string | null;          // readiness del candidato PARA el puesto objetivo
  tieneSucesor: boolean;             // cobertura de su puesto actual
  readinessMejorSucesor: string | null;
};

export type PuestoOption = {
  id: string;
  nombre: string;
  org: string;
  esCritico: boolean;
  ocupanteNombre: string | null;
  ocupanteId: string | null;
};

export type EscenarioResumen = {
  id: string;
  nombre: string;
  created_at: string;
  puestoObjetivoNombre: string;
  nivelCount: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function readinessLabel(r: string | null): string {
  if (!r) return "No definido";
  if (r === "listo_ahora") return "Listo Ahora";
  if (r === "uno_dos_anios") return "1-2 años";
  if (r === "tres_mas_anios") return "3+ años";
  return r;
}

export function calcRiesgo(
  esCritico: boolean,
  tieneSucesor: boolean,
  readinessMejorSucesor: string | null
): "verde" | "amarillo" | "rojo" {
  if (!esCritico) return "verde";
  if (!tieneSucesor) return "rojo";
  if (readinessMejorSucesor === "listo_ahora") return "verde";
  return "amarillo";
}

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

  // First occupant per position (arbitrary — for display)
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

  // Map: colaboradorId → partial Candidato
  const map = new Map<string, { fuentes: FuenteCandidato[]; readiness: string | null }>();

  // ── Source 1: Sucesión validada ──
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

  // ── Source 2: Plano de Carrera ──
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

  // ── Source 3: PICD aspiration ──
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

  // ── Enrich: colaborador info ──
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

  // ── Enrich: criticality of their current positions ──
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

    // Succession coverage for each position
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

  // ── Build final list ──
  const result: Candidato[] = [];

  for (const [colabId, partial] of map.entries()) {
    const colab = colabById.get(colabId);
    if (!colab) continue; // no longer active or not found

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
