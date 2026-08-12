import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// ── helpers ───────────────────────────────────────────────────────────────────

function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[_\s/]/g, "");
  for (const a of aliases) {
    const target = normalize(a);
    const key = Object.keys(row).find((k) => normalize(k) === target);
    if (key !== undefined && row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const dmy = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  }
  return null;
}

function cicloFromPeriodo(idPeriodo: number): number {
  // 1 → 2026, 2 → 2027, n → n + 2025
  return idPeriodo + 2025;
}

// ── types ─────────────────────────────────────────────────────────────────────

type ActionRow = {
  idEvaluacionDet: number | null;
  accionDescripcion: string;
  tipoAccion: string;
  institucionPlataforma: string | null;
  fechaCumplimiento: string | null;
  horasCapacitacion: number | null;
  porcentaje1: number | null;
  porcentaje2: number | null;
  objetivoLogrado: string | null;
};

type Group = {
  empleadoId: string;
  nombre: string | null;
  idPeriodo: number;
  idEvaluacion: number | null;
  actions: ActionRow[];
};

export type PicdPreviewRow = {
  id_empleado_num: string;
  nombre: string | null;
  id_periodo: number;
  ciclo_año: number;
  num_acciones: number;
  porcentaje_p1: number;
  porcentaje_cumplimiento: number;
  id_evaluacion_origen: number | null;
  matched: boolean;
  activo: boolean;
  isDuplicate: boolean;
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

  const formData = await req.formData();
  const file = formData.get("archivo") as File | null;
  const modo = (formData.get("modo") as string) || "preview";

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // ── Load colaboradores ────────────────────────────────────────────────────
  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado, nombre_completo, activo");
  const colabMap = new Map<string, { uuid: string; nombre: string; activo: boolean }>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) {
      colabMap.set(String(c.id_empleado).trim(), {
        uuid: c.id,
        nombre: c.nombre_completo ?? "",
        activo: c.activo ?? false,
      });
    }
  }

  // ── Group rows by (EmpleadoId, Id Periodo) ────────────────────────────────
  type GroupKey = string; // `${empleadoId}|${idPeriodo}`
  const groups = new Map<GroupKey, Group>();

  for (const row of rows) {
    const empleadoIdRaw = col(row, "EmpleadoId", "Empleado Id", "Id Empleado", "NumEmpleado");
    const empleadoId = empleadoIdRaw != null ? String(empleadoIdRaw).trim() : null;
    if (!empleadoId) continue;

    const idPeriodoRaw = col(row, "Id Periodo", "IdPeriodo", "Periodo", "Id_Periodo");
    const idPeriodo = num(idPeriodoRaw);
    if (idPeriodo == null) continue;

    const key: GroupKey = `${empleadoId}|${idPeriodo}`;

    if (!groups.has(key)) {
      const idEvalRaw = col(row, "IdEvaluacion", "Id Evaluacion", "Id_Evaluacion", "IdEval", "EvaluacionId");
      groups.set(key, {
        empleadoId,
        nombre: str(col(row, "NombreCompleto", "Nombre Completo", "Nombre")),
        idPeriodo,
        idEvaluacion: idEvalRaw != null ? (num(idEvalRaw) ?? null) : null,
        actions: [],
      });
    }

    const g = groups.get(key)!;

    const p1 = num(col(row, "Porcentaje1", "Porcentaje 1", "% Avance 1", "Avance1", "PorcentajeEtapa1"));
    const p2 = num(col(row, "Porcentaje2", "Porcentaje 2", "% Avance 2", "Avance2", "PorcentajeEtapa2"));
    const idEvalDetRaw = col(row, "IdEvaluacionDet", "Id Evaluacion Det", "IdEvalDet", "EvaluacionDetId");

    g.actions.push({
      idEvaluacionDet: idEvalDetRaw != null ? (num(idEvalDetRaw) ?? null) : null,
      accionDescripcion: str(col(row, "AccionDeDesarrollo", "Accion De Desarrollo", "Accion", "Descripcion", "AccionDescripcion")) ?? "(sin descripción)",
      tipoAccion: str(col(row, "TipoAccion", "Tipo Accion", "Tipo")) ?? "Capacitación",
      institucionPlataforma: str(col(row, "Institucion", "Plataforma", "InstitucionPlataforma", "Institucion Plataforma")),
      fechaCumplimiento: parseDate(col(row, "FechaCumplimiento", "Fecha Cumplimiento", "FechaCierre", "Fecha Cierre")),
      horasCapacitacion: num(col(row, "HorasCapacitacion", "Horas Capacitacion", "Horas")),
      porcentaje1: p1,
      porcentaje2: p2,
      objetivoLogrado: str(col(row, "ObjetivoLogrado", "Objetivo Logrado", "Logrado")),
    });
  }

  // ── Load existing picd to detect duplicates ───────────────────────────────
  const { data: existingPicd } = await supabase
    .from("picd").select("id_empleado, ciclo_año");
  const existingSet = new Set(
    (existingPicd as unknown as Array<{ id_empleado: string; ciclo_año: number }> ?? [])
      .map((r) => `${r.id_empleado}|${r.ciclo_año}`)
  );

  // ── Build preview rows ────────────────────────────────────────────────────
  const previewRows: PicdPreviewRow[] = [];

  for (const [, g] of Array.from(groups.entries())) {
    const colab = colabMap.get(g.empleadoId);
    const cicloAño = cicloFromPeriodo(g.idPeriodo);
    const numAcciones = g.actions.length;

    // porcentaje_p1: avg of P1 per action (empty counts as 0)
    const porcentaje_p1 = numAcciones
      ? Math.round((g.actions.reduce((sum, a) => sum + (a.porcentaje1 ?? 0), 0) / numAcciones) * 100) / 100
      : 0;

    // porcentaje_cumplimiento: avg of best-available per action (P2 if set, else P1, else 0)
    const porcentaje_cumplimiento = numAcciones
      ? Math.round((g.actions.reduce((sum, a) => {
          const best = a.porcentaje2 != null ? a.porcentaje2
            : a.porcentaje1 != null ? a.porcentaje1
            : 0;
          return sum + best;
        }, 0) / numAcciones) * 100) / 100
      : 0;

    const isDuplicate = colab ? existingSet.has(`${colab.uuid}|${cicloAño}`) : false;

    previewRows.push({
      id_empleado_num: g.empleadoId,
      nombre: colab?.nombre ?? g.nombre,
      id_periodo: g.idPeriodo,
      ciclo_año: cicloAño,
      num_acciones: numAcciones,
      porcentaje_p1,
      porcentaje_cumplimiento,
      id_evaluacion_origen: g.idEvaluacion,
      matched: !!colab,
      activo: colab?.activo ?? false,
      isDuplicate,
      error: !colab
        ? `No encontrado en BD (${g.empleadoId})`
        : !colab.activo
        ? "Inactivo — se importará igualmente"
        : undefined,
    });
  }

  // Sort by ciclo_año, then nombre
  previewRows.sort((a, b) =>
    a.ciclo_año !== b.ciclo_año
      ? a.ciclo_año - b.ciclo_año
      : (a.nombre ?? "").localeCompare(b.nombre ?? "")
  );

  const matchedActive   = previewRows.filter((r) => r.matched && r.activo);
  const matchedInactive = previewRows.filter((r) => r.matched && !r.activo);
  const unmatched       = previewRows.filter((r) => !r.matched);
  const duplicados      = previewRows.filter((r) => r.isDuplicate && r.matched);

  if (modo === "preview") {
    const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]).slice(0, 20) : [];
    const sampleEmpleados = Array.from(groups.keys()).slice(0, 5).map((k) => {
      const g = groups.get(k)!;
      return { key: k, empleadoId: g.empleadoId, idPeriodo: g.idPeriodo, numAcciones: g.actions.length, inColabMap: colabMap.has(g.empleadoId) };
    });
    return NextResponse.json({
      rows: previewRows,
      total: previewRows.length,
      matched: matchedActive.length + matchedInactive.length,
      unmatched: unmatched.length,
      duplicados: duplicados.length,
      ciclos: Array.from(new Set(previewRows.map((r) => r.ciclo_año))).sort(),
      _debug: {
        raw_rows: rows.length,
        groups_formed: groups.size,
        colab_map_size: colabMap.size,
        first_row_keys: firstRowKeys,
        sample_empleados: sampleEmpleados,
      },
    });
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────
  const toImport = previewRows.filter((r) => r.matched);
  const errors: string[] = [];
  let upserted = 0;
  let accionesUpserted = 0;

  for (const r of toImport) {
    const colab = colabMap.get(r.id_empleado_num)!;
    const g = Array.from(groups.values()).find(
      (grp) => grp.empleadoId === r.id_empleado_num && cicloFromPeriodo(grp.idPeriodo) === r.ciclo_año
    )!;

    // 1. Upsert picd aggregate row
    const { error: picdErr } = await supabase.from("picd").upsert(
      {
        id_empleado:             colab.uuid,
        ciclo_año:               r.ciclo_año,
        entrego_picd:            true,
        porcentaje_p1:           r.porcentaje_p1,
        porcentaje_cumplimiento: r.porcentaje_cumplimiento,
        id_evaluacion_origen:    r.id_evaluacion_origen,
        origen_dato:             "ReportePICD",
      },
      { onConflict: "id_empleado,ciclo_año", ignoreDuplicates: false }
    );

    if (picdErr) {
      errors.push(`${r.nombre ?? r.id_empleado_num} (ciclo ${r.ciclo_año}): ${picdErr.message}`);
      continue;
    }
    upserted++;

    // 2. Upsert picd_acciones for each action that has an idEvaluacionDet
    for (const action of g.actions) {
      if (action.idEvaluacionDet == null) continue; // can't upsert without a stable key

      const { error: accErr } = await supabase.from("picd_acciones").upsert(
        {
          id_empleado:          colab.uuid,
          ciclo_año:            r.ciclo_año,
          id_evaluacion:        g.idEvaluacion,
          id_evaluacion_det:    action.idEvaluacionDet,
          tipo_accion:          action.tipoAccion,
          accion_descripcion:   action.accionDescripcion,
          institucion_plataforma: action.institucionPlataforma,
          fecha_cumplimiento:   action.fechaCumplimiento,
          horas_capacitacion:   action.horasCapacitacion,
          porcentaje_etapa1:    action.porcentaje1,
          porcentaje_etapa2:    action.porcentaje2,
          objetivo_logrado:     action.objetivoLogrado,
          origen_dato:          "ReportePICD",
        },
        { onConflict: "id_evaluacion_det", ignoreDuplicates: false }
      );

      if (accErr) errors.push(`Acción ${action.idEvaluacionDet} (${r.nombre ?? r.id_empleado_num}): ${accErr.message}`);
      else accionesUpserted++;
    }
  }

  return NextResponse.json({
    ok: true,
    upserted,
    accionesUpserted,
    skipped: unmatched.length,
    errors: errors.slice(0, 20),
  });
}
