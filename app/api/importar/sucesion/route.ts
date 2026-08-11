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
  empleado_puesto: string | null;      // titular's current position (for display)
  empleado_puesto_id: string | null;   // catalog ID of titular's position
  // succession entry
  ciclo_año: number;
  sucesor_nombre: string;
  sucesor_id: string | null;
  sucesor_matched: boolean;
  sucesor_puesto_nombre: string | null;    // from BD snapshot (matched) or Excel text (unmatched)
  sucesor_puesto_catalogo_id: string | null; // BD snapshot only when sucesor matched
  listo_rol: string | null;
  readiness: string | null;
  brechas: string | null;
  acciones_desarrollo: string | null;
  estatus_evaluacion: string | null;
  // aspiraciones del titular (puesto futuro)
  puesto1_nombre: string | null;
  puesto1_id: string | null;
  puesto2_nombre: string | null;
  puesto2_id: string | null;
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

// ── catalog lookup helpers ────────────────────────────────────────────────────

type CatalogLookup = {
  byNombreOrg: Map<string, string>; // "NOMBRE|ORG" → id (unique)
  byNombre: Map<string, string>;    // "NOMBRE" → id (only if unique across all orgs)
};

function buildCatalogLookup(
  catalogoRaw: Array<{ id: string; nombre: string; [k: string]: unknown }>
): CatalogLookup {
  const byNombreOrg = new Map<string, string>();
  const byNombreAll = new Map<string, string[]>();
  for (const c of catalogoRaw) {
    const nom = (c.nombre ?? "").trim().toUpperCase();
    const org = String((c as Record<string, unknown>)["organización"] ?? "").trim().toUpperCase();
    byNombreOrg.set(`${nom}|${org}`, c.id);
    if (!byNombreAll.has(nom)) byNombreAll.set(nom, []);
    byNombreAll.get(nom)!.push(c.id);
  }
  const byNombre = new Map<string, string>();
  for (const [nom, ids] of byNombreAll.entries()) {
    if (ids.length === 1) byNombre.set(nom, ids[0]);
  }
  return { byNombreOrg, byNombre };
}

function lookupCatalog(
  lookup: CatalogLookup,
  nombre: string | null,
  org: string | null
): string | null {
  if (!nombre) return null;
  const nom = nombre.trim().toUpperCase();
  const orgKey = (org ?? "").trim().toUpperCase();
  return (
    lookup.byNombreOrg.get(`${nom}|${orgKey}`) ??
    lookup.byNombre.get(nom) ??
    null
  );
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

  // ── Load reference data ───────────────────────────────────────────────────
  const [{ data: colabsRaw }, { data: catalogoRaw }, { data: existingRaw }] = await Promise.all([
    supabase.from("colaboradores").select("id, id_empleado, nombre_completo, puesto, puesto_catalogo_id, organización"),
    supabase.from("catalogo_puestos").select("id, nombre, organización").eq("activo", true),
    supabase.from("plan_sucesion").select("id_empleado, ciclo_año, sucesor_nombre"),
  ]);

  // Employee lookups
  const colabByEmpId = new Map<string, { uuid: string; nombre: string; puesto: string | null; org: string | null; puestoCatalogoId: string | null }>();
  const colabByName  = new Map<string, string>(); // nombre lowercase → uuid
  const colabByUUID  = new Map<string, { puesto: string | null; org: string | null; puestoCatalogoId: string | null }>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) {
      colabByEmpId.set(String(c.id_empleado).trim(), {
        uuid: c.id,
        nombre: c.nombre_completo ?? "",
        puesto: (c as Record<string, unknown>)["puesto"] as string | null,
        org: (c as Record<string, unknown>)["organización"] as string | null,
        puestoCatalogoId: (c as Record<string, unknown>)["puesto_catalogo_id"] as string | null,
      });
    }
    if (c.nombre_completo) colabByName.set((c.nombre_completo as string).toLowerCase().trim(), c.id);
    colabByUUID.set(c.id, {
      puesto: (c as Record<string, unknown>)["puesto"] as string | null,
      org: (c as Record<string, unknown>)["organización"] as string | null,
      puestoCatalogoId: (c as Record<string, unknown>)["puesto_catalogo_id"] as string | null,
    });
  }

  // Catalog lookup (for aspiraciones NombrePuesto1/2 and for employee's own position)
  type CatalogRow = { id: string; nombre: string; [k: string]: unknown };
  const catalogLookup = buildCatalogLookup((catalogoRaw ?? []) as CatalogRow[]);

  // Existing plans set for dedup
  const existingSet = new Set(
    ((existingRaw ?? []) as unknown as Array<{ id_empleado: string; ciclo_año: number; sucesor_nombre: string }>)
      .map((r) => `${r.id_empleado}|${r.ciclo_año}|${r.sucesor_nombre.toLowerCase().trim()}`)
  );

  // ── Parse rows ────────────────────────────────────────────────────────────
  const previewRows: SucesionPreviewRow[] = [];

  for (const row of rows) {
    const empIdRaw = col(row, "EmpleadoId", "Empleado Id", "Id Empleado", "NumEmpleado", "Id", "EmpId");
    const empId = empIdRaw != null ? String(empIdRaw).trim() : null;
    if (!empId) continue;

    const idPeriodoRaw = col(row, "Id Periodo", "IdPeriodo", "Periodo", "Id_Periodo", "Ciclo");
    const idPeriodo = num(idPeriodoRaw);
    const cicloAño = idPeriodo === 1 ? 2026 : idPeriodo === 2 ? 2027 : idPeriodo ? idPeriodo + 2025 : 2026;

    const sucNombreRaw = col(
      row,
      "NombreCompletoSucesor", "Nombre Completo Sucesor",
      "Sucesor", "SucesorNombre", "Sucesor Nombre", "Nombre Sucesor",
      "SucesoresClaves", "Sucesores Claves", "Sucesor Clave"
    );
    const sucNombre = str(sucNombreRaw);
    if (!sucNombre) continue;

    const listoRolRaw = col(row, "ListoRol", "Listo Rol", "Readiness", "Disponibilidad", "Plazo");
    const listoRolStr = str(listoRolRaw);
    const listoRolNorm = listoRolStr?.toLowerCase();
    const listoRol = (listoRolNorm === "n/a" || listoRolNorm === "na" || listoRolStr === "-") ? null : listoRolStr;
    const readiness = mapReadiness(listoRol);

    const brechas        = str(col(row, "Brechas", "Gap", "Gaps", "BrechasClave"));
    const accionesDes    = str(col(row, "AccionesDesarrollo", "Acciones Desarrollo", "Acciones", "PlanDesarrollo", "DesarrolloNecesario", "Desarrollo Necesario"));
    const estatusEval    = str(col(row, "EstatusEvaluacion", "Estatus Evaluacion", "EstatusSucesion", "Estatus"));
    const empleadoNombre = str(col(row, "NombreCompleto", "Nombre Completo", "Nombre", "Empleado"));

    // Aspiraciones: NombrePuesto1 / NombrePuesto2
    const puesto1Nombre = str(col(row, "NombrePuesto1", "Nombre Puesto 1", "PuestoFuturo1", "Puesto Futuro 1", "Puesto1"));
    const puesto2Nombre = str(col(row, "NombrePuesto2", "Nombre Puesto 2", "PuestoFuturo2", "Puesto Futuro 2", "Puesto2"));

    const empleadoColab = colabByEmpId.get(empId);
    const empleadoOrg   = empleadoColab?.org ?? null;

    const puesto1Id = lookupCatalog(catalogLookup, puesto1Nombre, empleadoOrg);
    const puesto2Id = lookupCatalog(catalogLookup, puesto2Nombre, empleadoOrg);

    const empleadoMatched = !!empleadoColab;

    let sucId: string | null = null;
    let sucMatched = false;
    if (sucNombre.toLowerCase() !== "sucesor externo") {
      const byName = colabByName.get(sucNombre.toLowerCase().trim());
      if (byName) { sucId = byName; sucMatched = true; }
    }

    // Sucesor puesto: read from BD snapshot if matched (immutable per cycle), else use Excel text + tag
    const sucPuestoExcel = str(col(row, "NombrePuestoSucesor", "Nombre Puesto Sucesor", "PuestoSucesor", "Puesto Sucesor"));
    let sucPuestoNombre: string | null = null;
    let sucPuestoCatalogoId: string | null = null;
    if (sucMatched && sucId) {
      const sucInfo = colabByUUID.get(sucId);
      sucPuestoNombre = sucInfo?.puesto ?? null;
      sucPuestoCatalogoId = sucInfo?.puestoCatalogoId ?? null;
    } else {
      sucPuestoNombre = sucPuestoExcel;
    }

    const isDuplicate = empleadoMatched
      ? existingSet.has(`${empleadoColab!.uuid}|${cicloAño}|${sucNombre.toLowerCase().trim()}`)
      : false;

    let error: string | undefined;
    if (!empleadoMatched) error = `Empleado ${empId} no encontrado en BD`;
    else if (!sucMatched && sucNombre.toLowerCase() !== "sucesor externo") error = "Sucesor no encontrado — se importará sin ID";

    const isExternal = sucNombre.toLowerCase() === "sucesor externo";

    previewRows.push({
      id_empleado_num: empId,
      empleado_nombre: empleadoColab?.nombre ?? empleadoNombre,
      empleado_matched: empleadoMatched,
      empleado_puesto: empleadoColab?.puesto ?? null,
      empleado_puesto_id: empleadoColab?.puestoCatalogoId ?? null,
      ciclo_año: cicloAño,
      sucesor_nombre: sucNombre,
      sucesor_id: sucId,
      sucesor_matched: sucMatched,
      sucesor_puesto_nombre: sucPuestoNombre,
      sucesor_puesto_catalogo_id: sucPuestoCatalogoId,
      listo_rol: isExternal ? null : listoRol,
      readiness: isExternal ? null : readiness,
      brechas,
      acciones_desarrollo: accionesDes,
      estatus_evaluacion: estatusEval,
      puesto1_nombre: puesto1Nombre,
      puesto1_id: puesto1Id,
      puesto2_nombre: puesto2Nombre,
      puesto2_id: puesto2Id,
      isDuplicate,
      error,
    });
  }

  previewRows.sort((a, b) =>
    a.ciclo_año !== b.ciclo_año
      ? a.ciclo_año - b.ciclo_año
      : (a.empleado_nombre ?? "").localeCompare(b.empleado_nombre ?? "") ||
        a.sucesor_nombre.localeCompare(b.sucesor_nombre)
  );

  const totalRows    = previewRows.length;
  const empMatched   = previewRows.filter((r) => r.empleado_matched).length;
  const empUnmatched = previewRows.filter((r) => !r.empleado_matched).length;
  const sucUnmatched = previewRows.filter((r) => r.empleado_matched && !r.sucesor_matched).length;
  const duplicados   = previewRows.filter((r) => r.isDuplicate).length;
  const ciclos       = Array.from(new Set(previewRows.map((r) => r.ciclo_año))).sort();

  // Aspiration summary: unique titulares with at least one puesto resolved
  const aspiracionesSet = new Set<string>();
  let aspiraciones_pendientes_validacion = 0;
  for (const r of previewRows) {
    if (!r.empleado_matched) continue;
    const empleadoColab2 = colabByEmpId.get(r.id_empleado_num);
    if (!empleadoColab2) continue;
    if (r.puesto1_id || r.puesto2_id) {
      aspiracionesSet.add(`${empleadoColab2.uuid}|${r.ciclo_año}`);
    }
    if ((r.puesto1_nombre && !r.puesto1_id) || (r.puesto2_nombre && !r.puesto2_id)) {
      aspiraciones_pendientes_validacion++;
    }
  }
  const aspiraciones_resueltas = aspiracionesSet.size;
  const sucesores_sin_match = previewRows.filter((r) => r.empleado_matched && !r.sucesor_matched && r.sucesor_nombre.toLowerCase() !== "sucesor externo").length;

  if (modo === "preview") {
    const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]).slice(0, 20) : [];
    return NextResponse.json({
      rows: previewRows,
      total: totalRows,
      emp_matched: empMatched,
      emp_unmatched: empUnmatched,
      suc_unmatched: sucUnmatched,
      duplicados,
      aspiraciones_resueltas,
      aspiraciones_pendientes_validacion,
      sucesores_sin_match,
      ciclos,
      _debug: { raw_rows: rows.length, first_row_keys: firstRowKeys },
    });
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────
  const toImport  = previewRows.filter((r) => r.empleado_matched && !r.isDuplicate);
  const errors: string[] = [];
  let inserted = 0;

  for (const r of toImport) {
    const colab = colabByEmpId.get(r.id_empleado_num)!;

    // Resolve the employee's own current position for puesto_catalogo_id on the plan
    const empleadoPuestoCatalogoId = lookupCatalog(catalogLookup, colab.puesto, colab.org);

    const { error: err } = await supabase.from("plan_sucesion").insert({
      id_empleado:               colab.uuid,
      ciclo_año:                 r.ciclo_año,
      sucesor_nombre:            r.sucesor_nombre,
      sucesor_id:                r.sucesor_id,
      sucesor_sin_match:         !r.sucesor_matched,
      sucesor_puesto_nombre:     r.sucesor_puesto_nombre,
      sucesor_puesto_catalogo_id: r.sucesor_puesto_catalogo_id,
      readiness:                 r.readiness ?? "tres_mas_anios",
      listo_rol:                 r.listo_rol,
      brechas:                   r.brechas,
      acciones_desarrollo:       r.acciones_desarrollo,
      estatus_evaluacion:        r.estatus_evaluacion,
      estado:                    "borrador",
      fuente:                    "importacion",
      puesto_catalogo_id:        empleadoPuestoCatalogoId,
    });

    if (err) errors.push(`${r.empleado_nombre ?? r.id_empleado_num} → ${r.sucesor_nombre}: ${err.message}`);
    else inserted++;
  }

  // ── UPSERT ASPIRACIONES en picd ───────────────────────────────────────────
  // NombrePuesto1/2 are the EMPLOYEE's (titular) own career aspirations.
  // Key by (empleado_uuid, ciclo) — one upsert per titular even if they have multiple successors.
  type AspiracionKey = string; // `${empleado_uuid}|${ciclo}`
  const aspiracionMap = new Map<AspiracionKey, {
    uuid: string; ciclo: number;
    p1Nombre: string | null; p1Id: string | null;
    p2Nombre: string | null; p2Id: string | null;
  }>();

  for (const r of previewRows) {
    if (!r.empleado_matched) continue;
    if (!r.puesto1_id && !r.puesto2_id) continue;
    const empleadoColab = colabByEmpId.get(r.id_empleado_num);
    if (!empleadoColab) continue;
    const key: AspiracionKey = `${empleadoColab.uuid}|${r.ciclo_año}`;
    if (!aspiracionMap.has(key)) {
      aspiracionMap.set(key, {
        uuid: empleadoColab.uuid, ciclo: r.ciclo_año,
        p1Nombre: r.puesto1_nombre, p1Id: r.puesto1_id,
        p2Nombre: r.puesto2_nombre, p2Id: r.puesto2_id,
      });
    }
  }

  let aspiraciones_guardadas = 0;
  for (const [, a] of aspiracionMap.entries()) {
    // Upsert: create record if not exists, only fill nulls if exists
    const { error: picdErr } = await supabase.rpc("upsert_picd_aspiraciones", {
      p_id_empleado:          a.uuid,
      p_ciclo_año:            a.ciclo,
      p_puesto_futuro_opcion1: a.p1Nombre,
      p_puesto_futuro_id1:    a.p1Id,
      p_puesto_futuro_opcion2: a.p2Nombre,
      p_puesto_futuro_id2:    a.p2Id,
    });
    if (picdErr) errors.push(`Aspiración ${a.uuid} ciclo ${a.ciclo}: ${picdErr.message}`);
    else aspiraciones_guardadas++;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped_emp: empUnmatched,
    skipped_dup: duplicados,
    aspiraciones_guardadas,
    sucesores_sin_match,
    aspiraciones_pendientes_validacion,
    errors: errors.slice(0, 20),
  });
}
