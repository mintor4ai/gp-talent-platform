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

function numOrND(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "ND" || s === "N/A" || s === "-") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export type DesempenoPreviewRow = {
  id_empleado_num: string;
  nombre: string;
  puesto: string | null;
  matched: boolean;
  planea: number | null;
  ejecuta: number | null;
  optimiza: number | null;
  trabaja_equipo: number | null;
  atiende_cliente: number | null;
  informa: number | null;
  resultado_logra: number | null;
  persona_clave: number | null;
  estatus_desem: string | null;
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
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // Load colaboradores
  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado, nombre_completo");
  const colabByEmpId = new Map<string, string>();
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), c.id);
  }

  // Parse rows
  type ParsedRow = {
    id_empleado_num: string;
    nombre: string;
    puesto: string | null;
    evaluador_nombre: string | null;
    aprobador_nombre: string | null;
    planea: number | null;
    ejecuta: number | null;
    optimiza: number | null;
    trabaja_equipo: number | null;
    atiende_cliente: number | null;
    informa: number | null;
    resultado_logra: number | null;
    persona_clave: number | null;
    estatus_desem: string | null;
  };

  const parsed: ParsedRow[] = [];
  for (const row of rows) {
    const idRaw = col(row, "#", "Id", "ID", "No", "Numero", "Empleado");
    if (!idRaw) continue;

    parsed.push({
      id_empleado_num:  String(idRaw).trim(),
      nombre:           str(col(row, "Nombre", "NombreCompleto", "Nombre Completo")) ?? "",
      puesto:           str(col(row, "Puesto")),
      evaluador_nombre: str(col(row, "Evaluador Desem.", "EvaluadorDesem", "Evaluador")),
      aprobador_nombre: str(col(row, "Aprobador Desem.", "AprobadorDesem", "Aprobador")),
      planea:           numOrND(col(row, "Planea con efectividad", "Planea")),
      ejecuta:          numOrND(col(row, "Ejecuta con Calidad y Oportunidad", "Ejecuta")),
      optimiza:         numOrND(col(row, "Optimiza Recursos", "Optimiza")),
      trabaja_equipo:   numOrND(col(row, "Colabora en Equipo", "ColaboraenEquipo", "Trabaja en Equipo")),
      atiende_cliente:  numOrND(col(row, "Cliente", "AtendeCliente", "Atiende Cliente")),
      informa:          numOrND(col(row, "Reporta oportunamente y confiable", "Reporta", "Informa")),
      resultado_logra:  numOrND(col(row, "En Resumen, logra los resultados esperados de su puesto",
                                       "En Resumen logra los resultados esperados de su puesto",
                                       "ResultadoLogra", "Logra", "En Resumen")),
      persona_clave:    numOrND(col(row, "Persona Clave", "PersonaClave", "PC")) as number | null,
      estatus_desem:    str(col(row, "Estatus Desem.", "EstatusDesem", "Estatus")),
    });
  }

  // Build preview
  const preview: DesempenoPreviewRow[] = parsed.map((p) => {
    const uuid = colabByEmpId.get(p.id_empleado_num);
    return {
      id_empleado_num: p.id_empleado_num,
      nombre:          p.nombre,
      puesto:          p.puesto,
      matched:         !!uuid,
      planea:          p.planea,
      ejecuta:         p.ejecuta,
      optimiza:        p.optimiza,
      trabaja_equipo:  p.trabaja_equipo,
      atiende_cliente: p.atiende_cliente,
      informa:         p.informa,
      resultado_logra: p.resultado_logra,
      persona_clave:   p.persona_clave,
      estatus_desem:   p.estatus_desem,
      error:           !uuid ? `No encontrado en BD (${p.id_empleado_num})` : undefined,
    };
  });

  if (modo === "preview") {
    // Check existing data for this cycle
    const { count } = await supabase
      .from("evaluacion_desempeno_anual")
      .select("id", { count: "exact", head: true })
      .eq("ciclo_año", cicloAño);

    const { data: lastRow } = await supabase
      .from("evaluacion_desempeno_anual")
      .select("created_at")
      .eq("ciclo_año", cicloAño)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      rows: preview,
      total: preview.length,
      matched: preview.filter((r) => r.matched).length,
      unmatched: preview.filter((r) => !r.matched).length,
      existing_data: (count ?? 0) > 0
        ? { registros: count, ultima_importacion: lastRow?.created_at ?? null }
        : null,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const errors: string[] = [];
  let upserted = 0;
  let eipUpdated = 0;

  for (const p of parsed) {
    const uuid = colabByEmpId.get(p.id_empleado_num);
    if (!uuid) continue;

    const payload = {
      id_empleado:     uuid,
      ciclo_año:       cicloAño,
      planea:          p.planea,
      ejecuta:         p.ejecuta,
      optimiza:        p.optimiza,
      trabaja_equipo:  p.trabaja_equipo,
      atiende_cliente: p.atiende_cliente,
      informa:         p.informa,
      resultado_logra: p.resultado_logra,
      persona_clave:   p.persona_clave,
      evaluador_nombre: p.evaluador_nombre,
      aprobador_nombre: p.aprobador_nombre,
      estatus_desem:   p.estatus_desem,
      fuente:          "apreciativo",
      origen_dato:     "ImportadorDesempeno",
    };

    const { error } = await supabase
      .from("evaluacion_desempeno_anual")
      .upsert(payload, { onConflict: "id_empleado,ciclo_año" });

    if (error) {
      errors.push(`${p.id_empleado_num}: ${error.message}`);
      continue;
    }
    upserted++;

    // Sync desempeno_logra into EIP
    if (p.resultado_logra != null) {
      const { error: eipErr } = await supabase
        .from("evaluacion_integral_personal")
        .upsert(
          { id_empleado: uuid, ciclo_año: cicloAño, desempeno_logra: p.resultado_logra },
          { onConflict: "id_empleado,ciclo_año" }
        );
      if (eipErr) errors.push(`EIP ${p.id_empleado_num}: ${eipErr.message}`);
      else eipUpdated++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: parsed.length,
    matched: preview.filter((r) => r.matched).length,
    unmatched: preview.filter((r) => !r.matched).length,
    upserted,
    eip_updated: eipUpdated,
    errors: errors.slice(0, 20),
  });
}
