import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[_\s.#]/g, "");

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
  return s === "NA" || s === "N/A" || s === "-" ? null : s || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s === "NA" || s === "N/A" || s === "-") return null;
  const n = Number(s.replace("%", "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function pct(v: unknown): string | null {
  // Keep percentages as text: "91%", "NA" → null
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s === "NA" || s === "N/A" || s === "-") return null;
  return s;
}

function bool01(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "1" || s === "SI" || s === "SÍ" || s === "TRUE" || s === "YES") return true;
  if (s === "0" || s === "NO" || s === "FALSE") return false;
  return null;
}

export type EipPreviewRow = {
  fila: number;
  id_empleado_num: string;
  nombre: string;
  uen: string | null;
  segmento_organizacional: string | null;
  desempeno_logra: number | null;
  evaluacion_potencial_total: number | null;
  zona_evaluacion: string | null;
  tuvo_eal: boolean | null;
  entrego_picd: boolean | null;
  matched: boolean;
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

  // Load colaboradores — match by id_empleado (numeric string)
  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado, nombre_completo");
  const colabByEmpId  = new Map<string, string>(); // numeric id → UUID
  const colabByNombre = new Map<string, string>(); // nombre upper → UUID
  for (const c of colabsRaw ?? []) {
    if (c.id_empleado) colabByEmpId.set(String(c.id_empleado).trim(), c.id);
    if (c.nombre_completo) colabByNombre.set(c.nombre_completo.trim().toUpperCase(), c.id);
  }

  const results: EipPreviewRow[] = [];
  // For import: full payloads stored here
  const payloads: Array<{ uuid: string; data: Record<string, unknown> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    // ── Identity ──────────────────────────────────────────────────────────────
    const id_raw = col(row, "Id", "ID", "No Empleado", "NumEmpleado", "id_empleado");
    const id_empleado_num = id_raw != null ? String(id_raw).trim() : null;
    const nombre = str(col(row, "Nombre completo", "NombreCompleto", "Nombre", "Colaborador")) ?? "";

    let uuid: string | null = null;
    if (id_empleado_num) uuid = colabByEmpId.get(id_empleado_num) ?? null;
    if (!uuid && nombre) uuid = colabByNombre.get(nombre.toUpperCase()) ?? null;

    // ── Raw fields from file ──────────────────────────────────────────────────
    const uen                    = str(col(row, "UEN"));
    const desempeno_logra        = num(col(row, "DESEMPEÑO", "Desempeño", "Desempeno", "resultado_logra"));
    const tablero_gestion        = num(col(row, "Tablero de Gestión", "Tablero de Gestion", "TableroGestion"));
    const puesto_ciclo           = str(col(row, "Puesto"));
    const segmento_organizacional = str(col(row, "Segmento Organizacional de Ciclo", "Segmento Organizacional", "SegmentoOrganizacional"));
    const años_exp_total         = num(col(row, "Años de experiencia", "AñosExperiencia", "AniosExperiencia", "Años exp"));
    const num_puestos            = num(col(row, "#Puestos", "NumPuestos", "Num Puestos"));
    const movilidad              = num(col(row, "Movilidad"));
    const escolaridad_texto      = str(col(row, "Escolaridad"));
    const escolaridad_id         = num(col(row, "Escolaridad ID", "EscolaridadID", "EscolaridadId"));
    const horas_cursos           = num(col(row, "Horas Cursos", "HorasCursos", "Horas"));
    const competencias           = num(col(row, "Competencias"));
    const percentil_competencias = pct(col(row, "Percentil Competencias", "PercentilCompetencias"));
    const eal_score              = num(col(row, "EAL"));
    const percentil_eal          = pct(col(row, "Percentil EAL", "PercentilEAL"));
    const cumplimiento_picd      = num(col(row, "Cumplimiento PICD", "CumplimientoPICD", "Cumplimiento"));
    const ev_años                = num(col(row, "Ev. Años", "EvAños", "Ev Años", "EvAnios"));
    const ev_mov                 = num(col(row, "Ev. Movilidad", "EvMovilidad", "Ev Movilidad"));
    const ev_exp                 = num(col(row, "Ev. Experiencia", "EvExperiencia", "Ev Experiencia"));
    const ev_form_acad           = num(col(row, "Ev. Escolaridad", "EvEscolaridad", "Ev Escolaridad"));
    const ev_cursos              = num(col(row, "Ev. Cursos", "EvCursos", "Ev Cursos"));
    const ev_comp                = num(col(row, "Ev. Competencias", "EvCompetencias", "Ev Competencias"));
    const ev_eal                 = num(col(row, "Ev. de EAL", "EvEAL", "Ev EAL", "Ev de EAL"));
    const ev_picd                = num(col(row, "Ev. PICD", "EvPICD", "Ev PICD"));
    const tuvo_eal               = bool01(col(row, "Tuvo EAL", "TuvoEAL"));
    const entrego_picd           = bool01(col(row, "Entregó PICD", "EntregoPICD", "Entrego PICD"));
    const evaluacion_potencial_total = num(col(row, "POTENCIAL", "Potencial", "potencial_total"));
    const desemp_mas_potencial   = num(col(row, "DESEMPEÑO + POTENCIAL", "Desempeno+Potencial"));
    const zona_evaluacion        = str(col(row, "Zona Promocional", "ZonaPromocional", "Zona"));

    const coordenada_x = desempeno_logra;
    const coordenada_y = desemp_mas_potencial ?? (
      desempeno_logra != null && evaluacion_potencial_total != null
        ? desempeno_logra + evaluacion_potencial_total
        : null
    );

    results.push({
      fila,
      id_empleado_num: id_empleado_num ?? "",
      nombre,
      uen,
      segmento_organizacional,
      desempeno_logra,
      evaluacion_potencial_total,
      zona_evaluacion,
      tuvo_eal,
      entrego_picd,
      matched: !!uuid,
      error: !uuid ? `No encontrado en BD (${id_empleado_num ?? nombre})` : undefined,
    });

    if (uuid) {
      payloads.push({
        uuid,
        data: {
          id_empleado:               uuid,
          ciclo_año:                 cicloAño,
          origen_dato:               "importado_excel",
          tipo_matriz:               "importado",
          uen,
          desempeno_logra,
          tablero_gestion,
          puesto_ciclo,
          segmento_organizacional,
          años_exp_total,
          num_puestos,
          movilidad,
          escolaridad_texto,
          escolaridad_id:            escolaridad_id != null ? Math.round(escolaridad_id) : null,
          horas_cursos,
          competencias,
          percentil_competencias,
          eal_score,
          percentil_eal,
          cumplimiento_picd,
          ev_años,
          ev_mov,
          ev_exp,
          ev_form_acad,
          ev_cursos,
          ev_comp,
          ev_eal,
          ev_picd,
          tuvo_eal,
          entrego_picd,
          evaluacion_potencial_total,
          zona_evaluacion,
          coordenada_x,
          coordenada_y,
        },
      });
    }
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      ciclo_año: cicloAño,
      total: results.length,
      matched: results.filter((r) => r.matched).length,
      unmatched: results.filter((r) => !r.matched).length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const errors: string[] = [];
  let upserted = 0;

  for (const { data } of payloads) {
    const { error } = await supabase
      .from("evaluacion_integral_personal")
      .upsert(data, { onConflict: "id_empleado,ciclo_año" });
    if (error) {
      const nombre = results.find((r) => r.matched)?.nombre ?? "";
      errors.push(`Fila (${data.ciclo_año}): ${error.message}`);
    } else {
      upserted++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    matched: payloads.length,
    upserted,
    unmatched: results.filter((r) => !r.matched).length,
    errors: errors.slice(0, 20),
  });
}
