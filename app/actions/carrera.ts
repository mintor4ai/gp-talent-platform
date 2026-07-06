"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type AccionRuta = {
  quien: string;
  que: string;
  para_cuando: string;
};

type RutaGenerada = {
  tipo_ruta: string;
  puesto_objetivo: string;
  uen_objetivo: string;
  plazo_estimado: string;
  habilidades_gap: string;
  acciones_recomendadas: string;
  acciones: AccionRuta[];
};

// ─── Manual create / update ───────────────────────────────────────────────────

export async function upsertRutaCarrera(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();
  if (!perfil) return { ok: false, error: "Sin perfil" };

  const colaboradorId = formData.get("colaborador_id") as string;
  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  const isOwn = perfil.id_empleado === colaboradorId;
  if (!isAdmin && !isOwn) return { ok: false, error: "Sin permisos" };

  const rutaId = formData.get("ruta_id") as string | null;
  const tipo_ruta = formData.get("tipo_ruta") as string;
  const puesto_objetivo = formData.get("puesto_objetivo") as string;
  const plazo_estimado = formData.get("plazo_estimado") as string;
  const habilidades_gap = (formData.get("habilidades_gap") as string) ?? "";
  const ciclo_año = Number(formData.get("ciclo_año"));
  const aspiracion = (formData.get("aspiracion") as string) ?? "";

  // Parse structured actions (up to 5)
  const acciones: AccionRuta[] = [];
  for (let i = 0; i < 5; i++) {
    const quien = (formData.get(`accion_quien_${i}`) as string)?.trim();
    const que = (formData.get(`accion_que_${i}`) as string)?.trim();
    const para_cuando = (formData.get(`accion_cuando_${i}`) as string)?.trim();
    if (quien && que) acciones.push({ quien, que, para_cuando: para_cuando ?? "" });
  }

  const row = {
    id_empleado: colaboradorId,
    ciclo_año,
    tipo_ruta,
    puesto_objetivo,
    plazo_estimado,
    habilidades_gap,
    aspiracion,
    acciones,
    generado_con_ia: false,
    activa: true,
  };

  if (rutaId) {
    await supabase.from("rutas_carrera").update(row).eq("id", rutaId);
  } else {
    await supabase.from("rutas_carrera").insert(row);
  }

  revalidatePath(`/carpeta/${colaboradorId}`);
  revalidatePath(`/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function deleteRutaCarrera(rutaId: string, colaboradorId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  await supabase.from("rutas_carrera").update({ activa: false }).eq("id", rutaId);
  revalidatePath(`/carpeta/${colaboradorId}`);
  return { ok: true };
}

// ─── AI generation with preference switches ───────────────────────────────────

export async function generarRutasCarreraIA(
  colaboradorId: string,
  prefs: {
    tipos: string[];       // ["ascendente","lateral","especializacion"] — which route types to generate
    velocidad: string;     // "corto" | "mediano" | "largo"
    aspiracion: string;    // "tecnico" | "directivo" | "emprendedor"
  }
): Promise<{ ok: boolean; error?: string; rutas?: RutaGenerada[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado, coach_habilitado")
    .eq("id", user.id)
    .single();
  if (!perfil) return { ok: false, error: "Sin perfil" };

  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  const isOwn = perfil.id_empleado === colaboradorId;
  if (!isAdmin && !isOwn) return { ok: false, error: "Sin permisos" };

  const [colabRes, eipRes, picdRes, historialRes] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("id", colaboradorId).single(),
    supabase.from("evaluacion_integral_personal").select("*").eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false }).limit(1).single(),
    supabase.from("picd").select("*").eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false }).limit(1).single(),
    supabase.from("historial_carrera").select("puesto, empresa, tipo, años")
      .eq("id_empleado", colaboradorId).order("fecha_inicio", { ascending: false }).limit(6),
  ]);

  const colab = colabRes.data as any;
  const eip = eipRes.data as any;
  const picd = picdRes.data as any;
  const historial = (historialRes.data ?? []) as any[];

  if (!colab) return { ok: false, error: "Colaborador no encontrado" };

  const antiguedad = colab.fecha_antiguedad
    ? Math.floor((Date.now() - new Date(colab.fecha_antiguedad).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const velocidadLabel: Record<string, string> = { corto: "1-2 años", mediano: "2-3 años", largo: "3-5 años" };
  const aspiracionLabel: Record<string, string> = {
    tecnico: "especialización técnica profunda",
    directivo: "liderazgo y gestión de equipos",
    emprendedor: "innovación y emprendimiento interno",
  };

  const tiposLabel = prefs.tipos.map((t) =>
    t === "ascendente" ? "ASCENDENTE" : t === "lateral" ? "LATERAL" : "ESPECIALIZACIÓN"
  ).join(", ");

  const prompt = `Eres un experto en desarrollo de talento para Grupo GP, empresa mexicana líder en construcción e infraestructura.
Genera exactamente ${prefs.tipos.length} ruta(s) de carrera para este colaborador: ${tiposLabel}.

PERFIL:
- Nombre: ${colab.nombre_completo}
- Puesto actual: ${colab.puesto}
- Nivel: ${colab.nivel} (num: ${colab.nivel_num ?? "N/D"})
- Área/UEN: ${colab.organización ?? colab.area ?? "N/D"}
- Antigüedad: ${antiguedad !== null ? `${antiguedad} años` : "N/D"}
- Académico: ${colab.nivel_academico ?? "N/D"}
${colab.resumen_exp_interno ? `- Exp. interna: ${colab.resumen_exp_interno}` : ""}
${colab.resumen_exp_externo ? `- Exp. externa: ${colab.resumen_exp_externo}` : ""}

EIP ${eip?.ciclo_año ?? "N/D"}: zona=${eip?.zona_evaluacion ?? "N/D"}, potencial=${eip?.evaluacion_potencial_total?.toFixed(1) ?? "N/D"}, desempeño=${eip?.desempeno_logra?.toFixed(1) ?? "N/D"}
${picd ? `PICD: puesto_futuro1="${picd.puesto_futuro_opcion1 ?? "N/D"}", áreas_oportunidad="${picd.areas_oportunidad ?? "N/D"}"` : ""}
${historial.length > 0 ? `Historial: ${historial.map((h: any) => `${h.puesto}/${h.empresa ?? (h.tipo === "interno" ? "GP" : "Ext")} (${h.años ?? "?"}a)`).join("; ")}` : ""}

PREFERENCIAS DEL COLABORADOR:
- Velocidad deseada: ${velocidadLabel[prefs.velocidad] ?? prefs.velocidad}
- Aspiración: ${aspiracionLabel[prefs.aspiracion] ?? prefs.aspiracion}

Para CADA ruta, responde con este JSON exacto:
{
  "rutas": [
    {
      "tipo_ruta": "ascendente|lateral|especializacion",
      "puesto_objetivo": "...",
      "uen_objetivo": "...",
      "plazo_estimado": "${velocidadLabel[prefs.velocidad] ?? "2-3 años"}",
      "habilidades_gap": "brecha de habilidades en 1-2 oraciones",
      "acciones_recomendadas": "acción1; acción2; acción3",
      "acciones": [
        {"quien": "Colaborador", "que": "acción concreta", "para_cuando": "mes/año"},
        {"quien": "Jefe inmediato", "que": "acción de apoyo", "para_cuando": "mes/año"},
        {"quien": "Capital Humano", "que": "acción institucional", "para_cuando": "mes/año"}
      ]
    }
  ]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.`;

  let raw: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { ok: false, error: "Respuesta vacía del modelo" };
    raw = textBlock.text.trim();
  } catch (err) {
    console.error("Claude error:", err);
    return { ok: false, error: "Error al contactar el modelo de IA" };
  }

  let parsed: { rutas: RutaGenerada[] };
  try {
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.rutas) || parsed.rutas.length === 0) throw new Error("Estructura inválida");
  } catch {
    return { ok: false, error: "No se pudo interpretar la respuesta del modelo" };
  }

  const cicloActual = new Date().getFullYear();
  await supabase.from("rutas_carrera").update({ activa: false })
    .eq("id_empleado", colaboradorId).eq("ciclo_año", cicloActual).eq("generado_con_ia", true);

  const inserts = parsed.rutas.map((r) => ({
    id_empleado: colaboradorId,
    ciclo_año: cicloActual,
    tipo_ruta: r.tipo_ruta,
    puesto_objetivo: r.puesto_objetivo,
    uen_objetivo: r.uen_objetivo,
    plazo_estimado: r.plazo_estimado,
    habilidades_gap: r.habilidades_gap,
    acciones_recomendadas: r.acciones_recomendadas,
    acciones: r.acciones ?? [],
    aspiracion: prefs.aspiracion,
    generado_con_ia: true,
    activa: true,
  }));

  const { error: insertError } = await supabase.from("rutas_carrera").insert(inserts);
  if (insertError) return { ok: false, error: "No se pudieron guardar las rutas: " + insertError.message };

  revalidatePath(`/carpeta/${colaboradorId}`);
  revalidatePath(`/colaboradores/${colaboradorId}`);
  return { ok: true, rutas: parsed.rutas };
}

// Keep legacy admin-only function for backward compat with /colaboradores page
export async function generarRutasCarrera(colaboradorId: string) {
  return generarRutasCarreraIA(colaboradorId, {
    tipos: ["ascendente", "lateral", "especializacion"],
    velocidad: "mediano",
    aspiracion: "directivo",
  });
}
