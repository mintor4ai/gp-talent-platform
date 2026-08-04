import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── constants ─────────────────────────────────────────────────────────────────

// Education level → score (80–120)
const ESCOLARIDAD_SCORE: Record<string, number> = {
  "Primaria":          80,
  "Secundaria":        80,
  "(No Especificado)": 80,
  "Preparatoria":      85,
  "Carrera Técnica":   90,
  "Profesional":      100,
  "Especialidad":     105,
  "Maestría":         110,
  "Doctorado":        120,
};

// Segment → nivel_num (fallback if trigger not yet applied)
const SEGMENTO_NIVEL: Record<string, number> = {
  "A DIRECTOR":             1,
  "B SUBDIRECTOR":          2,
  "C GERENTE":              3,
  "D SUBGERENTE":           4,
  "E SUPERINTENDENTE":      5,
  "F JEFE DE DEPTO":        6,
  "G JEFE DE OBRA":         7,
  "H COORDINADOR DE DEPTO": 8,
  "I ADMINISTRADOR":        9,
  "J RESIDENTE":           10,
  "K ANALISTA":            11,
  "L ASISTENTE":           12,
  "M AUXILIAR":            13,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function yearsUntil(dateStr: string | null, refDate: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = refDate.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25)));
}

function clampFila(v: number, max: number): number {
  return Math.min(v, max);
}

function lookupMatrix(
  table: Map<number, Map<number, number>>,
  fila: number,
  nivel: number,
  maxFila: number
): number | null {
  const row = clampFila(fila, maxFila);
  return table.get(row)?.get(nivel) ?? null;
}

function determineZona(
  total: number,
  zonas: Array<{ zona: string; umbral_inferior: number; umbral_superior: number }>
): string | null {
  for (const z of zonas) {
    if (total >= z.umbral_inferior && total <= z.umbral_superior) return z.zona;
  }
  return null;
}

// ── types ─────────────────────────────────────────────────────────────────────

export type EipPreviewRow = {
  id_empleado: string;
  nombre: string | null;
  segmento: string | null;
  nivel_num: number | null;
  años_experiencia: number | null;
  años_en_puesto: number | null;
  ev_años: number | null;
  ev_mov: number | null;
  ev_exp: number | null;
  ev_form_acad: number | null;
  ev_comp: number | null;
  ev_eal: number | null;
  ev_picd: number | null;
  tuvo_eal: boolean;
  entrego_picd: boolean;
  calif_ponderada: number | null;
  evaluacion_potencial_total: number | null;
  zona: string | null;
  error?: string;
};

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { ciclo_año, modo } = await req.json() as { ciclo_año: number; modo: "preview" | "calcular" };
  if (!ciclo_año || ciclo_año < 2020 || ciclo_año > 2035)
    return NextResponse.json({ error: "Ciclo inválido" }, { status: 400 });

  // ── Load reference date from periodos ─────────────────────────────────────
  const { data: periodo } = await supabase
    .from("periodos").select("fecha_fin").eq("ciclo_año", ciclo_año).maybeSingle();
  // Use end-of-period date or Dec 31 of the previous year as seniority reference
  const refDateStr = periodo?.fecha_fin ?? `${ciclo_año - 1}-12-31`;
  const refDate = new Date(refDateStr);

  // ── Load lookup tables into memory ────────────────────────────────────────
  const [tablaExpRes, tablaMovRes] = await Promise.all([
    supabase.from("eip_tabla_experiencia").select("años, nivel_num, score").eq("ciclo_año", ciclo_año),
    supabase.from("eip_tabla_movilidad").select("movilidad_floor, nivel_num, score").eq("ciclo_año", ciclo_año),
  ]);

  if (!tablaExpRes.data?.length || !tablaMovRes.data?.length) {
    return NextResponse.json({ error: `No hay tablas de experiencia/movilidad para el ciclo ${ciclo_año}` }, { status: 400 });
  }

  // Map: fila → nivel_num → score
  const tablaExp = new Map<number, Map<number, number>>();
  for (const r of (tablaExpRes.data as unknown as Array<{ años: number; nivel_num: number; score: number }>)) {
    if (!tablaExp.has(r.años)) tablaExp.set(r.años, new Map());
    tablaExp.get(r.años)!.set(r.nivel_num, r.score);
  }

  const tablaMov = new Map<number, Map<number, number>>();
  for (const r of (tablaMovRes.data as Array<{ movilidad_floor: number; nivel_num: number; score: number }>)) {
    if (!tablaMov.has(r.movilidad_floor)) tablaMov.set(r.movilidad_floor, new Map());
    tablaMov.get(r.movilidad_floor)!.set(r.nivel_num, r.score);
  }

  // ── Load ponderaciones ────────────────────────────────────────────────────
  const { data: ponderacionesRaw } = await supabase
    .from("eip_ponderaciones")
    .select("calif_ponderada, w_exp, w_form_acad, w_cursos, w_comp, w_eal, w_picd")
    .eq("ciclo_año", ciclo_año);

  type PondRow = { calif_ponderada: number; w_exp: number; w_form_acad: number; w_cursos: number; w_comp: number; w_eal: number; w_picd: number };
  const ponderacionesMap = new Map<number, PondRow>();
  for (const r of (ponderacionesRaw ?? []) as unknown as PondRow[]) {
    ponderacionesMap.set(r.calif_ponderada, r);
  }

  if (!ponderacionesMap.size) {
    return NextResponse.json({ error: `No hay ponderaciones configuradas para el ciclo ${ciclo_año}` }, { status: 400 });
  }

  // ── Load zonas for zone determination ─────────────────────────────────────
  const { data: zonasRaw } = await supabase
    .from("config_zonas_eip")
    .select("zona, umbral_inferior, umbral_superior")
    .eq("ciclo_año", ciclo_año);
  const zonas = (zonasRaw ?? []) as Array<{ zona: string; umbral_inferior: number; umbral_superior: number }>;

  // ── Load all active colaboradores with nivel ──────────────────────────────
  const { data: colabsRaw } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, segmento_organizacional, nivel_num, fecha_antiguedad, fecha_ingreso_posicion")
    .eq("activo", true)
    .not("nivel_num", "is", null);

  type ColabRow = {
    id: string;
    nombre_completo: string | null;
    segmento_organizacional: string | null;
    nivel_num: number | null;
    fecha_antiguedad: string | null;
    fecha_ingreso_posicion: string | null;
  };
  const colabs = (colabsRaw ?? []) as unknown as ColabRow[];
  const colabIds = colabs.map((c) => c.id);

  if (!colabIds.length) {
    return NextResponse.json({ error: "No hay colaboradores activos con nivel asignado" }, { status: 400 });
  }

  // ── Load ev_comp from existing EIP records ────────────────────────────────
  // Avoid .in(colabIds) with large arrays — query all rows for the cycle instead
  const colabIdSet = new Set(colabIds);
  const { data: evCompRaw } = await supabase
    .from("evaluacion_integral_personal")
    .select("id_empleado, ev_comp")
    .eq("ciclo_año", ciclo_año);
  const evCompMap = new Map<string, number | null>();
  for (const r of (evCompRaw ?? []) as Array<{ id_empleado: string; ev_comp: number | null }>) {
    if (colabIdSet.has(r.id_empleado))
      evCompMap.set(r.id_empleado, r.ev_comp != null ? Number(r.ev_comp) : null);
  }

  // ── Load EAL (evaluacion_eal for this cycle) ──────────────────────────────
  const { data: ealRaw } = await supabase
    .from("evaluacion_anual_liderazgo")
    .select("id_lider_evaluado, evaluacion_eal")
    .eq("ciclo_año", ciclo_año);
  const ealMap = new Map<string, number>();
  for (const r of (ealRaw ?? []) as Array<{ id_lider_evaluado: string; evaluacion_eal: number }>) {
    if (r.evaluacion_eal != null && colabIdSet.has(r.id_lider_evaluado))
      ealMap.set(r.id_lider_evaluado, Number(r.evaluacion_eal));
  }

  // ── Load PICD for this cycle ──────────────────────────────────────────────
  const { data: picdRaw } = await supabase
    .from("picd")
    .select("id_empleado, entrego_picd, porcentaje_cumplimiento")
    .eq("ciclo_año", ciclo_año);
  type PicdRow = { id_empleado: string; entrego_picd: boolean | null; porcentaje_cumplimiento: number | null };
  const picdMap = new Map<string, PicdRow>();
  for (const r of (picdRaw ?? []) as unknown as PicdRow[]) {
    if (colabIdSet.has(r.id_empleado)) picdMap.set(r.id_empleado, r);
  }

  // ── Load highest education level per person ───────────────────────────────
  const { data: estudiosRaw } = await supabase
    .from("formacion_academica")
    .select("colaborador_id, nivel_estudio");

  const ESCOLARIDAD_ORDER: Record<string, number> = {
    "(No Especificado)": 0,
    "Primaria": 1, "Secundaria": 2, "Preparatoria": 3,
    "Carrera Técnica": 4, "Profesional": 5,
    "Especialidad": 6, "Maestría": 7, "Doctorado": 8,
  };
  const estudiosMap = new Map<string, string>(); // colaborador_id → highest nivel_estudio
  for (const r of (estudiosRaw ?? []) as Array<{ colaborador_id: string; nivel_estudio: string | null }>) {
    if (!r.nivel_estudio) continue;
    const prev = estudiosMap.get(r.colaborador_id);
    if (!prev || (ESCOLARIDAD_ORDER[r.nivel_estudio] ?? -1) > (ESCOLARIDAD_ORDER[prev] ?? -1)) {
      estudiosMap.set(r.colaborador_id, r.nivel_estudio);
    }
  }

  // ── Calculate EIP per collaborator ────────────────────────────────────────
  const previewRows: EipPreviewRow[] = [];

  for (const colab of colabs) {
    const nivelNum = colab.nivel_num ?? SEGMENTO_NIVEL[colab.segmento_organizacional ?? ""] ?? null;
    if (!nivelNum) {
      previewRows.push({
        id_empleado: colab.id, nombre: colab.nombre_completo,
        segmento: colab.segmento_organizacional, nivel_num: null,
        años_experiencia: null, años_en_puesto: null,
        ev_años: null, ev_mov: null, ev_exp: null,
        ev_form_acad: null, ev_comp: null, ev_eal: null, ev_picd: null,
        tuvo_eal: false, entrego_picd: false,
        calif_ponderada: null, evaluacion_potencial_total: null, zona: null,
        error: "Sin nivel asignado",
      });
      continue;
    }

    // Years of seniority
    const añosExp = yearsUntil(colab.fecha_antiguedad, refDate);
    const añosPuesto = yearsUntil(colab.fecha_ingreso_posicion ?? colab.fecha_antiguedad, refDate);

    // Lookup exp table (clamp max at 34 / 20)
    const evAños = añosExp != null ? lookupMatrix(tablaExp, añosExp, nivelNum, 34) : null;
    const evMov  = añosPuesto != null ? lookupMatrix(tablaMov, añosPuesto, nivelNum, 20) : null;
    const evExp  = evAños != null && evMov != null
      ? Math.round((evAños * evMov / 100) * 100) / 100
      : null;

    // ev_form_acad
    const escolaridad = estudiosMap.get(colab.id) ?? null;
    const evFormAcad  = escolaridad ? (ESCOLARIDAD_SCORE[escolaridad] ?? 80) : 80;

    // ev_comp (already calculated, from EIP record)
    const evComp = evCompMap.get(colab.id) ?? null;

    // ev_eal
    const evEalRaw = ealMap.get(colab.id) ?? null;
    const tuvoEal  = evEalRaw != null;
    const evEal    = evEalRaw;

    // ev_picd
    const picdRecord    = picdMap.get(colab.id);
    const entregoPicd   = picdRecord?.entrego_picd === true;
    const cumplimiento  = picdRecord?.porcentaje_cumplimiento != null ? Number(picdRecord.porcentaje_cumplimiento) : null;
    const evPicd        = entregoPicd && cumplimiento != null
      ? Math.round((80 + (cumplimiento / 100) * 40) * 100) / 100
      : 80;

    // calif_ponderada
    const califPonderada =
      !tuvoEal && !entregoPicd ? 1 :
       tuvoEal &&  entregoPicd ? 2 :
      !tuvoEal &&  entregoPicd ? 3 : 4;

    // Weighted total
    const pond = ponderacionesMap.get(califPonderada);
    let total: number | null = null;
    if (pond && evExp != null && evComp != null) {
      total = Math.round((
        Number(pond.w_exp)       * evExp      +
        Number(pond.w_form_acad) * evFormAcad +
        Number(pond.w_cursos)    * 80         + // ev_cursos placeholder (w=0 for 2026)
        Number(pond.w_comp)      * evComp     +
        Number(pond.w_eal)       * (evEal ?? 80) +
        Number(pond.w_picd)      * evPicd
      ) * 100) / 100;
    }

    const zona = total != null ? determineZona(total, zonas) : null;

    previewRows.push({
      id_empleado: colab.id,
      nombre: colab.nombre_completo,
      segmento: colab.segmento_organizacional,
      nivel_num: nivelNum,
      años_experiencia: añosExp,
      años_en_puesto: añosPuesto,
      ev_años: evAños,
      ev_mov: evMov,
      ev_exp: evExp,
      ev_form_acad: evFormAcad,
      ev_comp: evComp,
      ev_eal: evEal,
      ev_picd: entregoPicd ? evPicd : null,
      tuvo_eal: tuvoEal,
      entrego_picd: entregoPicd,
      calif_ponderada: califPonderada,
      evaluacion_potencial_total: total,
      zona,
    });
  }

  if (modo === "preview") {
    const withTotal = previewRows.filter((r) => r.evaluacion_potencial_total != null);
    return NextResponse.json({
      rows: previewRows,
      total: previewRows.length,
      con_total: withTotal.length,
      sin_comp: previewRows.filter((r) => r.ev_comp == null).length,
      sin_exp: previewRows.filter((r) => r.ev_exp == null).length,
      con_eal: previewRows.filter((r) => r.tuvo_eal).length,
      con_picd: previewRows.filter((r) => r.entrego_picd).length,
      ref_date: refDateStr,
    });
  }

  // ── UPSERT ────────────────────────────────────────────────────────────────
  const errors: string[] = [];
  let upserted = 0;

  const BATCH = 50;
  const toUpsert = previewRows.filter((r) => r.evaluacion_potencial_total != null);

  for (let i = 0; i < toUpsert.length; i += BATCH) {
    const batch = toUpsert.slice(i, i + BATCH).map((r) => ({
      id_empleado:               r.id_empleado,
      ciclo_año,
      años_experiencia:          r.años_experiencia,
      años_en_puesto:            r.años_en_puesto,
      ev_años:                   r.ev_años,
      ev_mov:                    r.ev_mov,
      ev_exp:                    r.ev_exp,
      ev_form_acad:              r.ev_form_acad,
      ev_comp:                   r.ev_comp,
      ev_eal:                    r.ev_eal,
      ev_picd:                   r.ev_picd,
      tuvo_eal:                  r.tuvo_eal,
      entrego_picd:              r.entrego_picd,
      calif_ponderada:           r.calif_ponderada,
      evaluacion_potencial_total: r.evaluacion_potencial_total,
      zona_evaluacion:           r.zona,
      segmento_organizacional:   r.segmento,
      escolaridad_texto:         estudiosMap.get(r.id_empleado) ?? null,
    }));

    const { error } = await supabase
      .from("evaluacion_integral_personal")
      .upsert(batch, { onConflict: "id_empleado,ciclo_año" });

    if (error) errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
    else upserted += batch.length;
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skipped: previewRows.length - toUpsert.length,
    errors: errors.slice(0, 20),
    ref_date: refDateStr,
  });
}
