import { SupabaseClient } from "@supabase/supabase-js";

function calcularPercentil(
  valor: number,
  uniquesSortedDesc: number[]
): number {
  const total = uniquesSortedDesc.length;
  if (total === 1) return 99;
  const posicion = uniquesSortedDesc.indexOf(valor) + 1; // 1-based
  return Math.round(((total - posicion) / (total - 1)) * 99 * 10) / 10;
}

export async function calcularPercentilCompetencias(
  supabase: SupabaseClient,
  cicloAño: number
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];

  // 1. Get avg(calificacion_general) per colaborador for this cycle
  const { data: comentarios, error: errComentarios } = await supabase
    .from("competencias_360_comentarios")
    .select("colaborador_id, calificacion_general")
    .eq("ciclo_año", cicloAño);

  if (errComentarios) return { inserted: 0, errors: [errComentarios.message] };
  if (!comentarios?.length) return { inserted: 0, errors: [] };

  // Group by colaborador_id — avg(calificacion_general) ignoring nulls
  const byColab = new Map<string, number[]>();
  for (const row of comentarios) {
    if (row.calificacion_general == null) continue;
    if (!byColab.has(row.colaborador_id)) byColab.set(row.colaborador_id, []);
    byColab.get(row.colaborador_id)!.push(Number(row.calificacion_general));
  }

  if (!byColab.size) return { inserted: 0, errors: [] };

  // 2. Get segmento_organizacional for each colaborador
  const colabIds = Array.from(byColab.keys());
  const { data: colabs, error: errColabs } = await supabase
    .from("colaboradores")
    .select("id, segmento_organizacional")
    .in("id", colabIds);

  if (errColabs) return { inserted: 0, errors: [errColabs.message] };

  const segmentoMap = new Map<string, string | null>();
  for (const c of colabs ?? []) segmentoMap.set(c.id, c.segmento_organizacional ?? null);

  // 3. Build per-colaborador summary: { id, promedio, segmento, numEvaluadores }
  type Entry = { id: string; promedio: number; segmento: string | null; numEvaluadores: number };
  const entries: Entry[] = [];
  for (const [id, scores] of Array.from(byColab.entries())) {
    const promedio = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100;
    entries.push({ id, promedio, segmento: segmentoMap.get(id) ?? null, numEvaluadores: scores.length });
  }

  // 4. Company-wide percentiles
  const uniquesEmpresa = Array.from(new Set(entries.map((e) => e.promedio))).sort((a, b) => b - a);

  // 5. Percentiles by segmento
  const segmentos = new Map<string, number[]>();
  for (const e of entries) {
    if (!e.segmento) continue;
    if (!segmentos.has(e.segmento)) segmentos.set(e.segmento, []);
    segmentos.get(e.segmento)!.push(e.promedio);
  }
  const uniquesBySegmento = new Map<string, number[]>();
  for (const [seg, promedios] of Array.from(segmentos.entries())) {
    uniquesBySegmento.set(seg, Array.from(new Set(promedios)).sort((a, b) => b - a));
  }

  // 6. Build upsert payload
  const payload = entries.map((e) => {
    const percentilEmpresa = calcularPercentil(e.promedio, uniquesEmpresa);
    const segUniques = e.segmento ? uniquesBySegmento.get(e.segmento) : undefined;
    const percentilSegmento = segUniques ? calcularPercentil(e.promedio, segUniques) : null;
    return {
      colaborador_id:     e.id,
      ciclo_año:          cicloAño,
      promedio_general:   e.promedio,
      segmento:           e.segmento,
      percentil_empresa:  percentilEmpresa,
      percentil_segmento: percentilSegmento,
      num_evaluadores:    e.numEvaluadores,
      fecha_calculo:      new Date().toISOString(),
    };
  });

  // 7. Upsert (overwrite if recalculating)
  const { error: errUpsert } = await supabase
    .from("competencias_360_percentiles")
    .upsert(payload, { onConflict: "colaborador_id,ciclo_año" });

  if (errUpsert) errors.push(errUpsert.message);

  return { inserted: errUpsert ? 0 : payload.length, errors };
}
