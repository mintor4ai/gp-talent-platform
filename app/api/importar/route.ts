import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// ── zona thresholds (suma = desempeno + potencial) ─────────────────────────
function calcZona(suma: number): string {
  if (suma <= 174) return "Inicio";
  if (suma <= 187) return "Revisión";
  if (suma <= 212) return "Estabilidad";
  if (suma <= 224) return "Desarrollo";
  return "Sobresaliente";
}

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function parseBool(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "SI" || s === "SÍ" || s === "1" || s === "TRUE" || s === "X") return true;
  if (s === "NO" || s === "0" || s === "FALSE") return false;
  return null;
}

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
  if (!cicloAño || cicloAño < 2020 || cicloAño > 2030)
    return NextResponse.json({ error: "Ciclo inválido" }, { status: 400 });

  // Parse Excel
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // Load colaboradores for matching
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, id_empleado, nombre_completo")
    .eq("activo", true);

  const colabByIdNum = new Map<string, string>(); // id_empleado → uuid
  const colabByName  = new Map<string, string>(); // nombre_upper → uuid
  for (const c of colabs ?? []) {
    if (c.id_empleado) colabByIdNum.set(String(c.id_empleado).trim(), c.id);
    colabByName.set((c.nombre_completo ?? "").trim().toUpperCase(), c.id);
  }

  // Column aliases (case-insensitive)
  function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
    for (const a of aliases) {
      const key = Object.keys(row).find((k) => k.trim().toLowerCase() === a.toLowerCase());
      if (key !== undefined) return row[key];
    }
    return null;
  }

  const results: {
    fila: number;
    nombre: string;
    uuid: string | null;
    matched: boolean;
    planea: number | null;
    ejecuta: number | null;
    optimiza: number | null;
    trabaja_equipo: number | null;
    atiende_cliente: number | null;
    informa: number | null;
    resultado_logra: number | null;
    potencial_total: number | null;
    tuvo_eal: boolean | null;
    entrego_picd: boolean | null;
    zona: string | null;
    error?: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2; // 1-indexed + header row

    const noEmp    = col(row, "no_empleado", "no. empleado", "id_empleado", "numero", "clave");
    const nombre   = String(col(row, "nombre", "nombre_completo", "colaborador", "empleado") ?? "").trim();

    // Find UUID
    let uuid: string | null = null;
    if (noEmp) uuid = colabByIdNum.get(String(noEmp).trim()) ?? null;
    if (!uuid && nombre) uuid = colabByName.get(nombre.toUpperCase()) ?? null;

    const resultado_logra  = parseNum(col(row, "resultado_logra", "desempeno_logra", "desempeno", "resultado"));
    const potencial_total  = parseNum(col(row, "potencial_total", "evaluacion_potencial_total", "potencial", "ev_potencial"));
    const planea           = parseNum(col(row, "planea"));
    const ejecuta          = parseNum(col(row, "ejecuta"));
    const optimiza         = parseNum(col(row, "optimiza"));
    const trabaja_equipo   = parseNum(col(row, "trabaja_equipo", "trabajo_equipo", "equipo"));
    const atiende_cliente  = parseNum(col(row, "atiende_cliente", "cliente"));
    const informa          = parseNum(col(row, "informa"));
    const tuvo_eal         = parseBool(col(row, "tuvo_eal", "eal"));
    const entrego_picd     = parseBool(col(row, "entrego_picd", "picd"));

    const zona = (resultado_logra != null && potencial_total != null)
      ? calcZona(resultado_logra + potencial_total)
      : null;

    results.push({
      fila,
      nombre: nombre || String(noEmp ?? `Fila ${fila}`),
      uuid,
      matched: !!uuid,
      planea, ejecuta, optimiza, trabaja_equipo, atiende_cliente, informa,
      resultado_logra, potencial_total, tuvo_eal, entrego_picd, zona,
      error: !uuid ? "No se encontró al colaborador" : undefined,
    });
  }

  if (modo === "preview") {
    return NextResponse.json({ rows: results, ciclo_año: cicloAño });
  }

  // ── IMPORT mode ───────────────────────────────────────────────────────────
  const matched = results.filter((r) => r.matched);
  let insertedDesemp = 0;
  let insertedEip    = 0;
  const errors: string[] = [];

  for (const r of matched) {
    // Desempeño
    const hasDesemp = [r.planea, r.ejecuta, r.optimiza, r.trabaja_equipo, r.atiende_cliente, r.informa].some((v) => v != null);
    if (hasDesemp) {
      const { error } = await supabase.from("evaluacion_desempeno_anual").upsert(
        {
          id_empleado:    r.uuid!,
          ciclo_año:      cicloAño,
          planea:         r.planea,
          ejecuta:        r.ejecuta,
          optimiza:       r.optimiza,
          trabaja_equipo: r.trabaja_equipo,
          atiende_cliente:r.atiende_cliente,
          informa:        r.informa,
          resultado_logra:r.resultado_logra,
          origen_dato:    "importado_excel",
        },
        { onConflict: "id_empleado,ciclo_año" }
      );
      if (error) errors.push(`${r.nombre}: ${error.message}`);
      else insertedDesemp++;
    }

    // EIP
    if (r.resultado_logra != null && r.potencial_total != null) {
      const suma = r.resultado_logra + r.potencial_total;
      const { error } = await supabase.from("evaluacion_integral_personal").upsert(
        {
          id_empleado:               r.uuid!,
          ciclo_año:                 cicloAño,
          tipo_matriz:               "general",
          desempeno_logra:           r.resultado_logra,
          evaluacion_potencial_total:r.potencial_total,
          zona_evaluacion:           r.zona,
          coordenada_x:              r.resultado_logra,
          coordenada_y:              Math.round(suma),
          tuvo_eal:                  r.tuvo_eal,
          entrego_picd:              r.entrego_picd,
          origen_dato:               "importado_excel",
        },
        { onConflict: "id_empleado,ciclo_año" }
      );
      if (error) errors.push(`${r.nombre} (EIP): ${error.message}`);
      else insertedEip++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    matched: matched.length,
    unmatched: results.filter((r) => !r.matched).length,
    insertedDesemp,
    insertedEip,
    errors: errors.slice(0, 10),
  });
}
