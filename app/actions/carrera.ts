"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type RutaGenerada = {
  tipo_ruta: string;
  puesto_objetivo: string;
  uen_objetivo: string;
  plazo_estimado: string;
  habilidades_gap: string;
  acciones_recomendadas: string;
};

export async function generarRutasCarrera(colaboradorId: string): Promise<{
  ok: boolean;
  error?: string;
  rutas?: RutaGenerada[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  const isAdmin =
    perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return { ok: false, error: "Sin permisos" };

  type ColabRow = {
    nombre_completo: string; puesto: string | null; nivel: string | null;
    nivel_num: number | null; area: string | null; organización: string | null;
    nivel_academico: string | null; resumen_exp_interno: string | null;
    resumen_exp_externo: string | null; resumen_formacion_profesional: string | null;
    dispuesto_cambiar_residencia: boolean | null; fecha_antiguedad: string | null;
  };
  type EipRow = {
    ciclo_año: number | null; zona_evaluacion: string | null;
    evaluacion_potencial_total: number | null; desempeno_logra: number | null;
  };
  type PicdRow = {
    ciclo_año: number | null; puesto_futuro_opcion1: string | null;
    puesto_futuro_opcion2: string | null; areas_oportunidad: string | null;
  };
  type HistorialRow = { puesto: string | null; empresa: string | null; tipo: string | null; años: number | null; };

  const [colabRes, eipRes, picdRes, historialRes] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("id", colaboradorId).single(),
    supabase.from("ultimo_eip_vigente").select("*").eq("id_empleado", colaboradorId).single(),
    supabase.from("picd").select("*").eq("id_empleado", colaboradorId)
      .order("ciclo_ano", { ascending: false }).limit(1).single(),
    supabase.from("historial_carrera").select("puesto, empresa, tipo, años")
      .eq("id_empleado", colaboradorId).order("fecha_inicio", { ascending: false }).limit(6),
  ]);

  const colab = colabRes.data as ColabRow | null;
  const eip = eipRes.data as EipRow | null;
  const picd = picdRes.data as PicdRow | null;
  const historial = historialRes.data as HistorialRow[] | null;

  if (!colab) return { ok: false, error: "Colaborador no encontrado" };

  const antiguedad = colab.fecha_antiguedad
    ? Math.floor(
        (Date.now() - new Date(colab.fecha_antiguedad).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  const prompt = `Eres un experto en desarrollo de talento para Grupo GP, empresa mexicana líder en construcción e infraestructura.
Analiza el perfil del colaborador y genera exactamente 3 rutas de carrera realistas y distintas entre sí.

PERFIL DEL COLABORADOR:
- Nombre: ${colab.nombre_completo}
- Puesto actual: ${colab.puesto}
- Nivel: ${colab.nivel} (nivel_num: ${colab.nivel_num ?? "N/D"})
- Área: ${(colab as any).organización ?? colab.area ?? "N/D"}
- Antigüedad: ${antiguedad !== null ? `${antiguedad} años` : "N/D"}
- Nivel académico: ${colab.nivel_academico ?? "N/D"}
- Disponible para cambio de residencia: ${colab.dispuesto_cambiar_residencia ? "Sí" : "No"}
${colab.resumen_exp_interno ? `- Experiencia interna GP: ${colab.resumen_exp_interno}` : ""}
${colab.resumen_exp_externo ? `- Experiencia externa: ${colab.resumen_exp_externo}` : ""}
${colab.resumen_formacion_profesional ? `- Formación: ${colab.resumen_formacion_profesional}` : ""}

EVALUACIÓN INTEGRAL (EIP ${eip?.ciclo_año ?? "N/D"}):
- Zona: ${eip?.zona_evaluacion ?? "N/D"}
- Potencial: ${eip?.evaluacion_potencial_total?.toFixed(1) ?? "N/D"}
- Desempeño: ${eip?.desempeno_logra?.toFixed(1) ?? "N/D"}

${picd ? `PLAN DE DESARROLLO (PICD ${picd.ciclo_año}):
- Puesto futuro aspirado 1: ${picd.puesto_futuro_opcion1 ?? "N/D"}
- Puesto futuro aspirado 2: ${picd.puesto_futuro_opcion2 ?? "N/D"}
- Áreas de oportunidad: ${picd.areas_oportunidad ?? "N/D"}` : ""}

${historial && historial.length > 0 ? `HISTORIAL DE CARRERA:
${historial.map((h) => `- ${h.puesto} en ${h.empresa ?? (h.tipo === "interno" ? "Grupo GP" : "Externo")} (${h.años ?? "?"} años)`).join("\n")}` : ""}

Genera exactamente 3 rutas de carrera: una ASCENDENTE, una LATERAL y una de ESPECIALIZACIÓN.
Para cada ruta, responde en formato JSON con esta estructura exacta:

{
  "rutas": [
    {
      "tipo_ruta": "ascendente",
      "puesto_objetivo": "Nombre del puesto objetivo",
      "uen_objetivo": "Unidad o área de destino dentro de Grupo GP",
      "plazo_estimado": "1-2 años" (o "2-3 años" o "3-5 años"),
      "habilidades_gap": "Descripción concisa de las brechas de habilidades a desarrollar (máx 2 oraciones)",
      "acciones_recomendadas": "3 acciones concretas separadas por punto y coma"
    },
    ... (2 rutas más)
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional, sin markdown, sin bloques de código.`;

  let raw: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1200,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, error: "Respuesta vacía del modelo" };
    }
    raw = textBlock.text.trim();
  } catch (err) {
    console.error("Claude error:", err);
    return { ok: false, error: "Error al contactar el modelo de IA" };
  }

  let parsed: { rutas: RutaGenerada[] };
  try {
    // Strip possible markdown fences if model added them despite instructions
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.rutas) || parsed.rutas.length === 0) {
      throw new Error("Estructura inválida");
    }
  } catch {
    return { ok: false, error: "No se pudo interpretar la respuesta del modelo" };
  }

  const cicloActual = new Date().getFullYear();

  // Inactivar rutas anteriores del mismo colaborador/ciclo
  await supabase
    .from("rutas_carrera")
    .update({ activa: false })
    .eq("id_empleado", colaboradorId)
    .eq("ciclo_año", cicloActual);

  // Insertar nuevas rutas
  const inserts = parsed.rutas.map((r) => ({
    id_empleado: colaboradorId,
    ciclo_año: cicloActual,
    tipo_ruta: r.tipo_ruta,
    descripcion: null,
    puesto_objetivo: r.puesto_objetivo,
    uen_objetivo: r.uen_objetivo,
    plazo_estimado: r.plazo_estimado,
    habilidades_gap: r.habilidades_gap,
    acciones_recomendadas: r.acciones_recomendadas,
    generado_con_ia: true,
    activa: true,
  }));

  const { error: insertError } = await supabase
    .from("rutas_carrera")
    .insert(inserts);

  if (insertError) {
    console.error("Insert error:", insertError);
    return { ok: false, error: "No se pudieron guardar las rutas: " + insertError.message };
  }

  revalidatePath(`/colaboradores/${colaboradorId}`);
  return { ok: true, rutas: parsed.rutas };
}
