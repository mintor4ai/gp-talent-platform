import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[_\s]/g, "");
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
  const n = Number(String(v).trim());
  return isNaN(n) ? null : n;
}

export type CompetenciasPreviewRow = {
  id_empleado_num: string;
  nombre: string;
  segmento: string | null;
  matched: boolean;
  num_evaluadores: number;
  num_calificaciones: number;
  promedio_calificacion: number | null;
  num_comentarios: number;
  promedio_general: number | null;
  error?: string;
};

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
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  // Find sheets — try by known names, then fallback to index
  const findSheet = (...names: string[]) => {
    for (const name of names) {
      const match = wb.SheetNames.find(
        (s) => s.toLowerCase().replace(/\s/g, "") === name.toLowerCase().replace(/\s/g, "")
      );
      if (match) return wb.Sheets[match];
    }
    return null;
  };

  const wsDetalle   = findSheet("Competencias detalle", "CompetenciasDetalle", "Detalle") ?? wb.Sheets[wb.SheetNames[0]];
  const wsComentarios = findSheet("Comentarios general", "ComentariosGeneral", "Comentarios") ?? wb.Sheets[wb.SheetNames[1]];

  const rowsDetalle     = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsDetalle,    { defval: null });
  const rowsComentarios = wsComentarios
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wsComentarios, { defval: null })
    : [];

  if (!rowsDetalle.length) return NextResponse.json({ error: "La hoja de detalle está vacía" }, { status: 400 });

  // Load colaboradores
  const { data: colabsRaw } = await supabase.from("colaboradores").select("id, id_empleado, nombre_completo");
  const colabByEmpId = new Map<string, string>(); // numeric id → UUID
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), c.id);
  }

  // ── Parse detalle ────────────────────────────────────────────────────────────
  type DetalleRaw = {
    empleado_evaluado_id: string;
    nombre: string;
    segmento: string | null;
    evaluador_id: string;
    evaluador_nombre: string | null;
    competencia_id: number | null;
    competencia: string | null;
    tipo_competencia: string | null;
    calificacion: number | null;
  };

  const detalleRows: DetalleRaw[] = [];
  for (const row of rowsDetalle) {
    const evaluado_id = col(row, "EmpleadoEvaluadoID", "EvaluadoID");
    const evaluador_id = col(row, "EmpleadoID", "EvaluadorID");
    if (!evaluado_id || !evaluador_id) continue;

    detalleRows.push({
      empleado_evaluado_id: String(evaluado_id).trim(),
      nombre:               str(col(row, "Evaluado")) ?? "",
      segmento:             str(col(row, "Segmento")),
      evaluador_id:         String(evaluador_id).trim(),
      evaluador_nombre:     str(col(row, "Evaluador")),
      competencia_id:       num(col(row, "CompetenciaID")),
      competencia:          str(col(row, "Competencia")),
      tipo_competencia:     str(col(row, "TipoCompetencia", "Tipo")),
      calificacion:         num(col(row, "Calificacion", "Calificación")),
    });
  }

  // ── Parse comentarios ────────────────────────────────────────────────────────
  type ComentarioRaw = {
    empleado_evaluado_id: string;
    evaluador_id: string;
    evaluador_nombre: string | null;
    calificacion_general: number | null;
    comentarios: string | null;
  };

  const comentarioRows: ComentarioRaw[] = [];
  for (const row of rowsComentarios) {
    const evaluado_id = col(row, "EmpleadoEvaluadoID", "EvaluadoID");
    const evaluador_id = col(row, "EmpleadoID", "EvaluadorID");
    if (!evaluado_id || !evaluador_id) continue;

    comentarioRows.push({
      empleado_evaluado_id: String(evaluado_id).trim(),
      evaluador_id:         String(evaluador_id).trim(),
      evaluador_nombre:     str(col(row, "Evaluador")),
      calificacion_general: num(col(row, "CalificacionGeneral", "Calificacion General")),
      comentarios:          str(col(row, "Comentarios")),
    });
  }

  // ── Group by evaluated person ────────────────────────────────────────────────
  const evaluadosMap = new Map<string, {
    nombre: string;
    segmento: string | null;
    detalle: DetalleRaw[];
    comentarios: ComentarioRaw[];
  }>();

  for (const d of detalleRows) {
    if (!evaluadosMap.has(d.empleado_evaluado_id)) {
      evaluadosMap.set(d.empleado_evaluado_id, { nombre: d.nombre, segmento: d.segmento, detalle: [], comentarios: [] });
    }
    evaluadosMap.get(d.empleado_evaluado_id)!.detalle.push(d);
  }
  for (const c of comentarioRows) {
    if (evaluadosMap.has(c.empleado_evaluado_id)) {
      evaluadosMap.get(c.empleado_evaluado_id)!.comentarios.push(c);
    } else {
      evaluadosMap.set(c.empleado_evaluado_id, { nombre: "", segmento: null, detalle: [], comentarios: [c] });
    }
  }

  // ── Build preview rows ───────────────────────────────────────────────────────
  const preview: CompetenciasPreviewRow[] = [];
  for (const [id_num, data] of Array.from(evaluadosMap.entries())) {
    const uuid = colabByEmpId.get(id_num);
    const evaluadores = new Set(data.detalle.map((d: DetalleRaw) => d.evaluador_id));
    const califs = data.detalle.map((d: DetalleRaw) => d.calificacion).filter((v: number | null): v is number => v != null);
    const generals = data.comentarios.map((c: ComentarioRaw) => c.calificacion_general).filter((v: number | null): v is number => v != null);
    const primerComentario = data.comentarios[0];
    const nombreFallback = (primerComentario?.evaluador_nombre) ?? "";

    preview.push({
      id_empleado_num: id_num,
      nombre: data.nombre || nombreFallback,
      segmento: data.segmento,
      matched: !!uuid,
      num_evaluadores: evaluadores.size,
      num_calificaciones: data.detalle.length,
      promedio_calificacion: califs.length ? Math.round(califs.reduce((a: number, b: number) => a + b, 0) / califs.length * 10) / 10 : null,
      num_comentarios: data.comentarios.length,
      promedio_general: generals.length ? Math.round(generals.reduce((a: number, b: number) => a + b, 0) / generals.length * 10) / 10 : null,
      error: !uuid ? `No encontrado en BD (${id_num})` : undefined,
    });
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: preview,
      total_evaluados: preview.length,
      matched: preview.filter((r) => r.matched).length,
      unmatched: preview.filter((r) => !r.matched).length,
      total_calificaciones: detalleRows.length,
      total_comentarios: comentarioRows.length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const errors: string[] = [];
  let insertedDetalle = 0;
  let insertedComentarios = 0;
  let upsertedAgregados = 0;

  for (const [id_num, data] of Array.from(evaluadosMap.entries())) {
    const uuid = colabByEmpId.get(id_num);
    if (!uuid) continue;

    // Delete existing for this colaborador+ciclo (clean re-import)
    await supabase.from("competencias_360_detalle")
      .delete().eq("colaborador_id", uuid).eq("ciclo_año", cicloAño);
    await supabase.from("competencias_360_comentarios")
      .delete().eq("colaborador_id", uuid).eq("ciclo_año", cicloAño);
    await supabase.from("evaluacion_competencias_360")
      .delete().eq("id_empleado", uuid).eq("ciclo_año", cicloAño);

    // Insert detail rows
    if (data.detalle.length) {
      const detallePayload = data.detalle.map((d: DetalleRaw) => ({
        colaborador_id:       uuid,
        ciclo_año:            cicloAño,
        empleado_evaluado_id: d.empleado_evaluado_id,
        segmento:             d.segmento,
        evaluador_id:         d.evaluador_id,
        evaluador_nombre:     d.evaluador_nombre,
        competencia_id:       d.competencia_id,
        competencia:          d.competencia,
        tipo_competencia:     d.tipo_competencia,
        calificacion:         d.calificacion,
        origen_dato:          "ReporteCompetencias",
      }));

      const { error } = await supabase.from("competencias_360_detalle").insert(detallePayload);
      if (error) errors.push(`Detalle ${id_num}: ${error.message}`);
      else insertedDetalle += detallePayload.length;
    }

    // Insert comment rows
    if (data.comentarios.length) {
      const comentariosPayload = data.comentarios.map((c: ComentarioRaw) => ({
        colaborador_id:       uuid,
        ciclo_año:            cicloAño,
        empleado_evaluado_id: c.empleado_evaluado_id,
        evaluador_id:         c.evaluador_id,
        evaluador_nombre:     c.evaluador_nombre,
        calificacion_general: c.calificacion_general,
        comentarios:          c.comentarios,
        origen_dato:          "ReporteCompetencias",
      }));

      const { error } = await supabase.from("competencias_360_comentarios").insert(comentariosPayload);
      if (error) errors.push(`Comentarios ${id_num}: ${error.message}`);
      else insertedComentarios += comentariosPayload.length;
    }

    // Compute aggregated averages per competencia
    const byCompetencia = new Map<number, { competencia: string; tipo: string; scores: number[] }>();
    for (const d of data.detalle as DetalleRaw[]) {
      if (!d.competencia_id || d.calificacion == null) continue;
      if (!byCompetencia.has(d.competencia_id)) {
        byCompetencia.set(d.competencia_id, { competencia: d.competencia ?? "", tipo: d.tipo_competencia ?? "", scores: [] });
      }
      byCompetencia.get(d.competencia_id)!.scores.push(d.calificacion);
    }

    const generals = (data.comentarios as ComentarioRaw[])
      .map((c: ComentarioRaw) => c.calificacion_general)
      .filter((v: number | null): v is number => v != null);
    const promedio_general = generals.length
      ? Math.round(generals.reduce((a: number, b: number) => a + b, 0) / generals.length * 100) / 100
      : null;

    const evalUniqueIds = new Set((data.detalle as DetalleRaw[]).map((d: DetalleRaw) => d.evaluador_id));

    const agregados = Array.from(byCompetencia.entries()).map(([comp_id, info]) => ({
      id_empleado:    uuid,
      ciclo_año:      cicloAño,
      bloque:         info.tipo,
      sub_competencia: info.competencia,
      competencia_id:  comp_id,
      evaluacion:     Math.round(info.scores.reduce((a: number, b: number) => a + b, 0) / info.scores.length * 10) / 10,
      num_evaluadores: evalUniqueIds.size,
      calificacion_general_promedio: promedio_general,
      origen_dato:    "ReporteCompetencias",
    }));

    if (agregados.length) {
      const { error } = await supabase.from("evaluacion_competencias_360").insert(agregados);
      if (error) errors.push(`Agregados ${id_num}: ${error.message}`);
      else upsertedAgregados += agregados.length;
    }
  }

  return NextResponse.json({
    ok: true,
    total_evaluados: evaluadosMap.size,
    matched: preview.filter((r) => r.matched).length,
    insertedDetalle,
    insertedComentarios,
    upsertedAgregados,
    errors: errors.slice(0, 20),
  });
}
