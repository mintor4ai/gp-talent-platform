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

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof v === "string") {
    const dmy = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    const ymd = v.match(/^\d{4}-\d{2}-\d{2}$/);
    if (ymd) return new Date(v);
  }
  return null;
}

// ── types ─────────────────────────────────────────────────────────────────────

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
  type Group = {
    empleadoId: string;
    nombre: string | null;
    idPeriodo: number;
    idEvaluacion: number | null;
    fechaCierre: Date | null;
    porcentaje1Values: number[];
    porcentaje2Values: number[];
    numAcciones: number;
  };

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
      const idEvalRaw = col(row, "c", "IdEvaluacion", "Id Evaluacion", "IdEval");
      const fechaCierreRaw = col(row, "Fecha Cierre", "FechaCierre", "Cierre");
      groups.set(key, {
        empleadoId,
        nombre: str(col(row, "NombreCompleto", "Nombre Completo", "Nombre")),
        idPeriodo,
        idEvaluacion: idEvalRaw != null ? (num(idEvalRaw) ?? null) : null,
        fechaCierre: parseDate(fechaCierreRaw),
        porcentaje1Values: [],
        porcentaje2Values: [],
        numAcciones: 0,
      });
    }

    const g = groups.get(key)!;
    g.numAcciones++;

    const p1 = num(col(row, "Porcentaje1", "Porcentaje 1", "% Avance 1", "Avance1"));
    const p2 = num(col(row, "Porcentaje2", "Porcentaje 2", "% Avance 2", "Avance2"));

    // Empty Porcentaje1/Porcentaje2 count as 0
    g.porcentaje1Values.push(p1 ?? 0);
    g.porcentaje2Values.push(p2 ?? 0);
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

    // Derive ciclo_año: year(Fecha Cierre) + 1
    const cicloAño = g.fechaCierre
      ? g.fechaCierre.getFullYear() + 1
      : g.idPeriodo === 1 ? 2026 : g.idPeriodo === 2 ? 2027 : g.idPeriodo + 2025;

    const avg = (vals: number[]) =>
      vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;

    const porcentaje_p1 = avg(g.porcentaje1Values);
    const porcentaje_cumplimiento = avg(g.porcentaje2Values);

    const isDuplicate = colab
      ? existingSet.has(`${colab.uuid}|${cicloAño}`)
      : false;

    previewRows.push({
      id_empleado_num: g.empleadoId,
      nombre: colab?.nombre ?? g.nombre,
      id_periodo: g.idPeriodo,
      ciclo_año: cicloAño,
      num_acciones: g.numAcciones,
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
    return NextResponse.json({
      rows: previewRows,
      total: previewRows.length,
      matched: matchedActive.length + matchedInactive.length,
      unmatched: unmatched.length,
      duplicados: duplicados.length,
      ciclos: Array.from(new Set(previewRows.map((r) => r.ciclo_año))).sort(),
    });
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────
  const toImport = previewRows.filter((r) => r.matched);
  const errors: string[] = [];
  let upserted = 0;

  for (const r of toImport) {
    const colab = colabMap.get(r.id_empleado_num)!;

    const { error: err } = await supabase.from("picd").upsert(
      {
        id_empleado:             colab.uuid,
        ciclo_año:               r.ciclo_año,
        entrego_picd:            true,
        porcentaje_cumplimiento: r.porcentaje_cumplimiento,
        id_evaluacion_origen:    r.id_evaluacion_origen,
        origen_dato:             "ReportePICD",
      },
      { onConflict: "id_empleado,ciclo_año", ignoreDuplicates: false }
    );

    if (err) errors.push(`${r.nombre ?? r.id_empleado_num} (ciclo ${r.ciclo_año}): ${err.message}`);
    else upserted++;
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skipped: unmatched.length,
    errors: errors.slice(0, 20),
  });
}
