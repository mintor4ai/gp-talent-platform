import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// ── helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null || v === "" || v === "N/A") return null;
  const n = Number(String(v).trim());
  return isNaN(n) ? null : n;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function calcEvaluacionEal(
  promedio: number,
  minActual: number,
  mediana: number
): number {
  if (promedio <= minActual) return 80;
  if (promedio >= 5) return 120;
  if (promedio <= mediana) {
    // linear: minActual → 80, mediana → 100
    return 80 + ((promedio - minActual) / (mediana - minActual)) * 20;
  }
  // linear: mediana → 100, 5 → 120
  return 100 + ((promedio - mediana) / (5 - mediana)) * 20;
}

function calcPercentil(valor: number, uniquesSortedDesc: number[]): number {
  const total = uniquesSortedDesc.length;
  if (total === 1) return 99;
  const pos = uniquesSortedDesc.indexOf(valor) + 1;
  return Math.round(((total - pos) / (total - 1)) * 99 * 10) / 10;
}

// ── types ────────────────────────────────────────────────────────────────────

export type EalPreviewRow = {
  id_empleado_num: string;
  nombre: string | null;
  matched: boolean;
  activo: boolean;
  num_evaluadores: number;
  num_preguntas: number;
  promedio_eal: number | null;
  error?: string;
};

type QuestionResponse = {
  evaluador_id: string;
  categoria: string;
  pregunta: string;
  respuesta_numerica: number | null;
  respuesta_texto: string | null;
};

// ── main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("archivo") as File | null;
  const cicloAño = Number(formData.get("ciclo_año"));
  const modo = (formData.get("modo") as string) || "preview";

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  if (!cicloAño || cicloAño < 2020 || cicloAño > 2035)
    return NextResponse.json({ error: "Ciclo inválido" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // Find the period sheet (first sheet that's not PROMEDIO GENERAL)
  const sheetName = wb.SheetNames.find((s) => s !== "PROMEDIO GENERAL") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  if (raw.length < 5) return NextResponse.json({ error: "El archivo no tiene el formato esperado" }, { status: 400 });

  const evaluadorRow = raw[0] as unknown[];
  const evaluadoRow  = raw[1] as unknown[];

  // ── Parse question rows ────────────────────────────────────────────────────
  // Row 3: ["Categoría","Pregunta", ...]
  // Rows 4+: question data, last non-null category row is data
  type ParsedQuestion = { categoria: string; pregunta: string; rowIdx: number };
  const questions: ParsedQuestion[] = [];

  for (let r = 4; r < raw.length; r++) {
    const rowArr = raw[r] as unknown[];
    const cat = str(rowArr[0]);
    const preg = str(rowArr[1]);
    if (!cat || !preg) continue;
    questions.push({ categoria: cat.replace(/\r\n/g, " ").trim(), pregunta: preg.replace(/\r\n/g, " ").trim(), rowIdx: r });
  }

  if (!questions.length) return NextResponse.json({ error: "No se encontraron preguntas en el archivo" }, { status: 400 });

  // ── Build evaluado → responses map ────────────────────────────────────────
  const byEvaluado = new Map<string, { nombre: string | null; responses: QuestionResponse[] }>();

  const totalCols = evaluadoRow.length;
  for (let c = 2; c < totalCols; c++) {
    const evaluador_id = str(evaluadorRow[c]);
    const evaluado_id  = str(evaluadoRow[c]);
    if (!evaluador_id || !evaluado_id) continue;

    if (!byEvaluado.has(evaluado_id)) {
      byEvaluado.set(evaluado_id, { nombre: null, responses: [] });
    }
    const entry = byEvaluado.get(evaluado_id)!;

    for (const q of questions) {
      const rowArr = raw[q.rowIdx] as unknown[];
      const cell = rowArr[c];
      const isLibre = q.categoria.toLowerCase().startsWith("libre");

      if (isLibre) {
        const texto = str(cell);
        if (texto) {
          entry.responses.push({
            evaluador_id,
            categoria: q.categoria,
            pregunta: q.pregunta,
            respuesta_numerica: null,
            respuesta_texto: texto,
          });
        }
      } else {
        // Always store numeric rows (null for N/A)
        entry.responses.push({
          evaluador_id,
          categoria: q.categoria,
          pregunta: q.pregunta,
          respuesta_numerica: num(cell),
          respuesta_texto: null,
        });
      }
    }
  }

  // ── Load colaboradores (active only for import, all for preview) ───────────
  const { data: colabsRaw } = await supabase
    .from("colaboradores")
    .select("id, id_empleado, nombre_completo, activo");

  const colabMap = new Map<string, { uuid: string; nombre: string; activo: boolean }>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) {
      colabMap.set(String(c.id_empleado).trim(), {
        uuid:   c.id,
        nombre: c.nombre_completo ?? "",
        activo: c.activo ?? false,
      });
    }
  }

  // ── Calculate PROMEDIO GENERAL per evaluado ────────────────────────────────
  const promedioMap = new Map<string, number>();
  for (const [id_num, data] of Array.from(byEvaluado.entries())) {
    // Numeric questions only (exclude Libre)
    const numericQuestions = data.responses.filter((r: QuestionResponse) => r.respuesta_texto === null);

    // Group by pregunta → per-question average (excluding null=N/A)
    const byPregunta = new Map<string, number[]>();
    for (const r of numericQuestions) {
      if (r.respuesta_numerica == null) continue;
      const key = `${r.categoria}|||${r.pregunta}`;
      if (!byPregunta.has(key)) byPregunta.set(key, []);
      byPregunta.get(key)!.push(r.respuesta_numerica);
    }

    if (!byPregunta.size) continue;

    const qAvgs = Array.from(byPregunta.values()).map(
      (scores) => scores.reduce((a, b) => a + b, 0) / scores.length
    );
    const promedio = Math.round((qAvgs.reduce((a, b) => a + b, 0) / qAvgs.length) * 100) / 100;
    promedioMap.set(id_num, promedio);
  }

  // ── Build preview rows ─────────────────────────────────────────────────────
  const previewRows: EalPreviewRow[] = [];
  for (const [id_num, data] of Array.from(byEvaluado.entries())) {
    const colab = colabMap.get(id_num);
    const evaluadores = new Set(data.responses.map((r: QuestionResponse) => r.evaluador_id));
    const numPreguntas = new Set(
      data.responses.filter((r: QuestionResponse) => r.respuesta_texto === null).map((r: QuestionResponse) => `${r.categoria}|||${r.pregunta}`)
    ).size;

    previewRows.push({
      id_empleado_num: id_num,
      nombre:          colab?.nombre ?? null,
      matched:         !!colab,
      activo:          colab?.activo ?? false,
      num_evaluadores: evaluadores.size,
      num_preguntas:   numPreguntas,
      promedio_eal:    promedioMap.get(id_num) ?? null,
      error:           !colab ? `No encontrado en BD (${id_num})` : !colab.activo ? "Colaborador inactivo — no se importará" : undefined,
    });
  }

  // ── Check existing data ────────────────────────────────────────────────────
  const { count: existingCount } = await supabase
    .from("evaluacion_anual_liderazgo")
    .select("id", { count: "exact", head: true })
    .eq("ciclo_año", cicloAño);

  const { data: lastImport } = await supabase
    .from("evaluacion_anual_liderazgo")
    .select("created_at")
    .eq("ciclo_año", cicloAño)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingData = (existingCount ?? 0) > 0
    ? { evaluados: existingCount ?? 0, ultima_importacion: lastImport?.created_at ?? null }
    : null;

  if (modo === "preview") {
    return NextResponse.json({
      rows:           previewRows,
      total:          previewRows.length,
      matched:        previewRows.filter((r) => r.matched && r.activo).length,
      unmatched:      previewRows.filter((r) => !r.matched).length,
      inactivos:      previewRows.filter((r) => r.matched && !r.activo).length,
      existing_data:  existingData,
    });
  }

  // ── IMPORT ─────────────────────────────────────────────────────────────────
  // Only active, matched colaboradores
  const activeRows = previewRows.filter((r) => r.matched && r.activo);

  // Collect promedios for active evaluados to compute evaluacion_eal + percentil
  const activePromedios: { id_num: string; uuid: string; promedio: number }[] = [];
  for (const row of activeRows) {
    const p = promedioMap.get(row.id_empleado_num);
    const colab = colabMap.get(row.id_empleado_num);
    if (p != null && colab) {
      activePromedios.push({ id_num: row.id_empleado_num, uuid: colab.uuid, promedio: p });
    }
  }

  if (!activePromedios.length) {
    return NextResponse.json({ ok: true, upserted: 0, detail_rows: 0, errors: [], message: "No hay colaboradores activos para importar" });
  }

  // Piecewise linear normalization
  const promedioValues = activePromedios.map((e) => e.promedio);
  const minActual = Math.min(...promedioValues);
  const sorted = [...promedioValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const mediana = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  // evaluacion_eal per person
  for (const entry of activePromedios) {
    const ev = calcEvaluacionEal(entry.promedio, minActual, mediana);
    (entry as typeof entry & { evaluacion_eal: number }).evaluacion_eal = Math.round(ev * 100) / 100;
  }

  // percentil_eal: based on evaluacion_eal values
  const evalEalValues = (activePromedios as (typeof activePromedios[0] & { evaluacion_eal: number })[])
    .map((e) => e.evaluacion_eal);
  const uniquesDesc = Array.from(new Set(evalEalValues)).sort((a, b) => b - a);

  const errors: string[] = [];
  let upserted = 0;
  let detailRows = 0;

  for (const entry of activePromedios as (typeof activePromedios[0] & { evaluacion_eal: number })[]) {
    const uuid = entry.uuid;
    const percentil = calcPercentil(entry.evaluacion_eal, uniquesDesc);

    // Count unique evaluadores
    const eData = byEvaluado.get(entry.id_num);
    const numEvals = eData ? new Set(eData.responses.map((r) => r.evaluador_id)).size : 0;

    // Delete existing aggregate + detail for this lider+ciclo
    await supabase.from("evaluacion_anual_liderazgo")
      .delete().eq("id_lider_evaluado", uuid).eq("ciclo_año", cicloAño);
    await supabase.from("eal_respuestas")
      .delete().eq("id_lider_evaluado", uuid).eq("ciclo_año", cicloAño);

    // Upsert aggregate
    const { error: errUpsert } = await supabase
      .from("evaluacion_anual_liderazgo")
      .insert({
        id_lider_evaluado: uuid,
        ciclo_año:         cicloAño,
        num_evaluadores:   numEvals,
        promedio_eal:      entry.promedio,
        evaluacion_eal:    entry.evaluacion_eal,
        percentil_eal:     percentil,
      });

    if (errUpsert) {
      errors.push(`EAL agregado ${entry.id_num}: ${errUpsert.message}`);
      continue;
    }
    upserted++;

    // Insert detail rows
    if (eData?.responses.length) {
      const detailPayload = eData.responses.map((r) => ({
        id_lider_evaluado:     uuid,
        id_evaluador_empleado: r.evaluador_id,
        ciclo_año:             cicloAño,
        categoria:             r.categoria,
        pregunta:              r.pregunta,
        respuesta_numerica:    r.respuesta_numerica,
        respuesta_texto:       r.respuesta_texto,
      }));

      const { error: errDetail } = await supabase.from("eal_respuestas").insert(detailPayload);
      if (errDetail) errors.push(`EAL detalle ${entry.id_num}: ${errDetail.message}`);
      else detailRows += detailPayload.length;
    }
  }

  return NextResponse.json({
    ok:          true,
    upserted,
    detail_rows: detailRows,
    mediana,
    min_actual:  minActual,
    errors:      errors.slice(0, 20),
  });
}
