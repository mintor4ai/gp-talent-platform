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
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

// ── types ─────────────────────────────────────────────────────────────────────

export type SucesionPreviewRow = {
  // employee
  id_empleado_num: string;
  empleado_nombre: string | null;
  empleado_matched: boolean;
  // succession entry
  ciclo_año: number;
  sucesor_nombre: string;
  sucesor_id: string | null;
  sucesor_matched: boolean;
  listo_rol: string | null;
  readiness: string | null;
  brechas: string | null;
  acciones_desarrollo: string | null;
  // import state
  isDuplicate: boolean;
  error?: string;
};

// ── readiness mapping ─────────────────────────────────────────────────────────

function mapReadiness(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "largo plazo" || v === "largo" || v === "3+" || v === "tres_mas_anios") return "tres_mas_anios";
  if (v === "mediano plazo" || v === "mediano" || v === "1-2" || v === "uno_dos_anios") return "uno_dos_anios";
  if (v === "corto plazo" || v === "corto" || v === "listo ahora" || v === "listo_ahora") return "listo_ahora";
  if (v === "n/a" || v === "na" || v === "-") return null;
  return null;
}

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

  // ── Load colaboradores (employee lookup: id_empleado numeric → UUID) ────────
  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado, nombre_completo");
  const colabByEmpId = new Map<string, { uuid: string; nombre: string }>();
  const colabByName  = new Map<string, string>(); // nombre_completo lowercase → uuid
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), { uuid: c.id, nombre: c.nombre_completo ?? "" });
    if (c.nombre_completo) colabByName.set((c.nombre_completo as string).toLowerCase().trim(), c.id);
  }

  // ── Load existing plan_sucesion to detect duplicates ──────────────────────
  const { data: existingRaw } = await supabase
    .from("plan_sucesion").select("id_empleado, ciclo_año, sucesor_nombre");
  const existingSet = new Set(
    ((existingRaw ?? []) as unknown as Array<{ id_empleado: string; ciclo_año: number; sucesor_nombre: string }>)
      .map((r) => `${r.id_empleado}|${r.ciclo_año}|${r.sucesor_nombre.toLowerCase().trim()}`)
  );

  // ── Parse rows ────────────────────────────────────────────────────────────
  const previewRows: SucesionPreviewRow[] = [];

  for (const row of rows) {
    // Employee ID (numeric string like "195")
    const empIdRaw = col(row, "EmpleadoId", "Empleado Id", "Id Empleado", "NumEmpleado", "Id", "EmpId");
    const empId = empIdRaw != null ? String(empIdRaw).trim() : null;
    if (!empId) continue;

    // Ciclo from Id Periodo: 1→2026, 2→2027
    const idPeriodoRaw = col(row, "Id Periodo", "IdPeriodo", "Periodo", "Id_Periodo", "Ciclo");
    const idPeriodo = num(idPeriodoRaw);
    const cicloAño = idPeriodo === 1 ? 2026 : idPeriodo === 2 ? 2027 : idPeriodo ? idPeriodo + 2025 : 2026;

    // Successor name
    const sucNombreRaw = col(
      row,
      "Sucesor", "SucesorNombre", "Sucesor Nombre", "Nombre Sucesor",
      "SucesoresClaves", "Sucesores Claves", "Sucesor Clave"
    );
    const sucNombre = str(sucNombreRaw);
    if (!sucNombre) continue; // skip rows without a successor name

    // Listo Rol (readiness)
    const listoRolRaw = col(row, "ListoRol", "Listo Rol", "Readiness", "Disponibilidad", "Plazo");
    const listoRol = str(listoRolRaw);
    const readiness = mapReadiness(listoRol);

    // Optional fields
    const brechas = str(col(row, "Brechas", "Gap", "Gaps", "BrechasClave"));
    const accionesDes = str(col(row, "AccionesDesarrollo", "Acciones Desarrollo", "Acciones", "PlanDesarrollo"));
    const empleadoNombreRaw = col(row, "NombreCompleto", "Nombre Completo", "Nombre", "Empleado");
    const empleadoNombre = str(empleadoNombreRaw);

    // Match employee
    const empleadoColab = colabByEmpId.get(empId);
    const empleadoMatched = !!empleadoColab;

    // Match successor
    let sucId: string | null = null;
    let sucMatched = false;
    if (sucNombre.toLowerCase() !== "sucesor externo") {
      const byName = colabByName.get(sucNombre.toLowerCase().trim());
      if (byName) { sucId = byName; sucMatched = true; }
    }

    // Duplicate check (only if employee matched)
    const isDuplicate = empleadoMatched
      ? existingSet.has(`${empleadoColab!.uuid}|${cicloAño}|${sucNombre.toLowerCase().trim()}`)
      : false;

    let error: string | undefined;
    if (!empleadoMatched) error = `Empleado ${empId} no encontrado en BD`;
    else if (!sucMatched && sucNombre.toLowerCase() !== "sucesor externo") error = "Sucesor no encontrado — se importará sin ID";

    previewRows.push({
      id_empleado_num: empId,
      empleado_nombre: empleadoColab?.nombre ?? empleadoNombre,
      empleado_matched: empleadoMatched,
      ciclo_año: cicloAño,
      sucesor_nombre: sucNombre,
      sucesor_id: sucId,
      sucesor_matched: sucMatched,
      listo_rol: listoRol,
      readiness,
      brechas,
      acciones_desarrollo: accionesDes,
      isDuplicate,
      error,
    });
  }

  // Sort: ciclo, then employee name, then successor name
  previewRows.sort((a, b) =>
    a.ciclo_año !== b.ciclo_año
      ? a.ciclo_año - b.ciclo_año
      : (a.empleado_nombre ?? "").localeCompare(b.empleado_nombre ?? "") ||
        a.sucesor_nombre.localeCompare(b.sucesor_nombre)
  );

  const totalRows      = previewRows.length;
  const empMatched     = previewRows.filter((r) => r.empleado_matched).length;
  const empUnmatched   = previewRows.filter((r) => !r.empleado_matched).length;
  const sucUnmatched   = previewRows.filter((r) => r.empleado_matched && !r.sucesor_matched).length;
  const duplicados     = previewRows.filter((r) => r.isDuplicate).length;
  const ciclos         = Array.from(new Set(previewRows.map((r) => r.ciclo_año))).sort();

  if (modo === "preview") {
    const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]).slice(0, 20) : [];
    return NextResponse.json({
      rows: previewRows,
      total: totalRows,
      emp_matched: empMatched,
      emp_unmatched: empUnmatched,
      suc_unmatched: sucUnmatched,
      duplicados,
      ciclos,
      _debug: { raw_rows: rows.length, first_row_keys: firstRowKeys },
    });
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────
  // Import all rows where employee matched (including unmatched successors)
  const toImport = previewRows.filter((r) => r.empleado_matched && !r.isDuplicate);
  const errors: string[] = [];
  let inserted = 0;

  for (const r of toImport) {
    const colab = colabByEmpId.get(r.id_empleado_num)!;

    const { error: err } = await supabase.from("plan_sucesion").insert({
      id_empleado:         colab.uuid,
      ciclo_año:           r.ciclo_año,
      sucesor_nombre:      r.sucesor_nombre,
      sucesor_id:          r.sucesor_id,
      readiness:           r.readiness ?? "tres_mas_anios",
      listo_rol:           r.listo_rol,
      brechas:             r.brechas,
      acciones_desarrollo: r.acciones_desarrollo,
      estado:              "borrador",
      fuente:              "importacion",
    });

    if (err) errors.push(`${r.empleado_nombre ?? r.id_empleado_num} → ${r.sucesor_nombre}: ${err.message}`);
    else inserted++;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped_emp: empUnmatched,
    skipped_dup: duplicados,
    errors: errors.slice(0, 20),
  });
}
