import { SupabaseClient } from "@supabase/supabase-js";

function mediana(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1
    ? sortedAsc[mid]
    : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function interpolate(valor: number, median: number, min: number, max: number): number {
  if (valor === median) return 100;
  if (valor > median) {
    // Linear 100–120 between median and max
    if (max === median) return 100;
    return 100 + ((valor - median) / (max - median)) * 20;
  }
  // Linear 80–100 between min and median
  if (median === min) return 100;
  return 80 + ((valor - min) / (median - min)) * 20;
}

export async function calcularEvaluacionCompetencias(
  supabase: SupabaseClient,
  cicloAño: number
): Promise<{ updated: number; created: number; errors: string[] }> {
  const errors: string[] = [];

  // 1. Get promedio_general per colaborador from the percentiles table (already computed)
  const { data: percentiles, error: errP } = await supabase
    .from("competencias_360_percentiles")
    .select("colaborador_id, promedio_general")
    .eq("ciclo_año", cicloAño);

  if (errP) return { updated: 0, created: 0, errors: [errP.message] };
  if (!percentiles?.length) return { updated: 0, created: 0, errors: [] };

  // 2. Build unique sorted-asc list of promedios
  const uniquesAsc = Array.from(
    new Set(percentiles.map((p) => Number(p.promedio_general)))
  ).sort((a, b) => a - b);

  const med = mediana(uniquesAsc);
  const min = uniquesAsc[0];
  const max = uniquesAsc[uniquesAsc.length - 1];

  // 3. Check existing EIP rows for this cycle (to distinguish update vs insert)
  const colabIds = percentiles.map((p) => p.colaborador_id);
  const { data: existing } = await supabase
    .from("evaluacion_integral_personal")
    .select("id_empleado")
    .eq("ciclo_año", cicloAño)
    .in("id_empleado", colabIds);

  const existingSet = new Set((existing ?? []).map((r) => r.id_empleado));

  // 4. Build upsert payload
  const payload = percentiles.map((p) => {
    const promedio = Number(p.promedio_general);
    const evComp = Math.round(interpolate(promedio, med, min, max) * 100) / 100;
    return {
      id_empleado: p.colaborador_id,
      ciclo_año:   cicloAño,
      ev_comp:     evComp,
    };
  });

  // 5. Upsert — creates row if missing, updates ev_comp if exists
  const BATCH = 50;
  let updated = 0;
  let created = 0;

  for (let i = 0; i < payload.length; i += BATCH) {
    const batch = payload.slice(i, i + BATCH);
    const { error } = await supabase
      .from("evaluacion_integral_personal")
      .upsert(batch, { onConflict: "id_empleado,ciclo_año" });

    if (error) {
      errors.push(`Batch ${i / BATCH + 1}: ${error.message}`);
    } else {
      for (const row of batch) {
        if (existingSet.has(row.id_empleado)) updated++;
        else created++;
      }
    }
  }

  return { updated, created, errors };
}
