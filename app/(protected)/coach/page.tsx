import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CoachChat from "./CoachChat";

export default async function CoachPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("id_empleado, coach_habilitado, tokens_consumidos_mes, tokens_limite_mes")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");

  if (!perfil.coach_habilitado) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-sm">
          El Coach IA no está habilitado para tu cuenta. Contacta a Capital Humano.
        </p>
      </div>
    );
  }

  type ColabCtx = {
    nombre_completo: string | null;
    puesto: string | null;
    nivel: string | null;
    area: string | null;
    organización: string | null;
    jefe_inmediato_nombre: string | null;
    nivel_academico: string | null;
    resumen_exp_interno: string | null;
    resumen_exp_externo: string | null;
    resumen_formacion_profesional: string | null;
    dispuesto_cambiar_residencia: boolean | null;
  };
  type EipCtx = {
    ciclo_año: number | null;
    zona_evaluacion: string | null;
    evaluacion_potencial_total: number | null;
    desempeno_logra: number | null;
  };
  type PicdCtx = {
    ciclo_año: number | null;
    puesto_futuro_opcion1: string | null;
    puesto_futuro_opcion2: string | null;
    areas_oportunidad: string | null;
    compromisos: string | null;
  };

  const [colabRes, eipRes, picdRes] = await Promise.all([
    supabase
      .from("colaboradores")
      .select(
        "nombre_completo, puesto, nivel, area, organización, jefe_inmediato_nombre, nivel_academico, resumen_exp_interno, resumen_exp_externo, resumen_formacion_profesional, dispuesto_cambiar_residencia"
      )
      .eq("id", perfil.id_empleado)
      .single(),
    supabase
      .from("ultimo_eip_vigente")
      .select("ciclo_año, zona_evaluacion, evaluacion_potencial_total, desempeno_logra")
      .eq("id_empleado", perfil.id_empleado)
      .single(),
    supabase
      .from("picd")
      .select("ciclo_año, puesto_futuro_opcion1, puesto_futuro_opcion2, areas_oportunidad, compromisos")
      .eq("id_empleado", perfil.id_empleado)
      .order("ciclo_año", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const colab = colabRes.data as ColabCtx | null;
  const eip = eipRes.data as EipCtx | null;
  const picd = picdRes.data as PicdCtx | null;

  const contexto = buildContexto({ colab, eip, picd });

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Coach IA</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tu asistente personal de desarrollo profesional
        </p>
      </div>

      <CoachChat
        contexto={contexto}
        tokensUsados={perfil.tokens_consumidos_mes ?? 0}
        tokensLimite={perfil.tokens_limite_mes ?? 10000}
      />
    </div>
  );
}

type ColabCtx = {
  nombre_completo: string | null; puesto: string | null; nivel: string | null;
  area: string | null; organización: string | null; jefe_inmediato_nombre: string | null;
  nivel_academico: string | null; resumen_exp_interno: string | null;
  resumen_exp_externo: string | null; resumen_formacion_profesional: string | null;
  dispuesto_cambiar_residencia: boolean | null;
};
type EipCtx = { ciclo_año: number | null; zona_evaluacion: string | null; evaluacion_potencial_total: number | null; desempeno_logra: number | null; };
type PicdCtx = { ciclo_año: number | null; puesto_futuro_opcion1: string | null; puesto_futuro_opcion2: string | null; areas_oportunidad: string | null; compromisos: string | null; };

function buildContexto({
  colab,
  eip,
  picd,
}: {
  colab: ColabCtx | null;
  eip: EipCtx | null;
  picd: PicdCtx | null;
}): string {
  const lines: string[] = [];

  if (colab) {
    lines.push(`Nombre: ${colab.nombre_completo ?? "—"}`);
    lines.push(`Puesto actual: ${colab.puesto ?? "—"}`);
    lines.push(`Nivel: ${colab.nivel ?? "—"}`);
    lines.push(`Área: ${colab.area ?? "—"}`);
    lines.push(`Organización: ${colab.organización ?? "—"}`);
    lines.push(`Jefe inmediato: ${colab.jefe_inmediato_nombre ?? "—"}`);
    lines.push(`Nivel académico: ${colab.nivel_academico ?? "—"}`);
    lines.push(`Disponible para cambio de residencia: ${colab.dispuesto_cambiar_residencia ? "Sí" : "No"}`);

    if (colab.resumen_exp_interno) {
      lines.push(`\nExperiencia interna en GP:\n${colab.resumen_exp_interno}`);
    }
    if (colab.resumen_exp_externo) {
      lines.push(`\nExperiencia previa (externa):\n${colab.resumen_exp_externo}`);
    }
    if (colab.resumen_formacion_profesional) {
      lines.push(`\nFormación profesional:\n${colab.resumen_formacion_profesional}`);
    }
  }

  if (eip) {
    lines.push(`\nEvaluación Integral (ciclo ${eip.ciclo_año}):`);
    lines.push(`  Zona: ${eip.zona_evaluacion ?? "—"}`);
    lines.push(`  Potencial: ${eip.evaluacion_potencial_total ?? "—"}`);
    lines.push(`  Desempeño: ${eip.desempeno_logra ?? "—"}`);
  }

  if (picd) {
    lines.push(`\nPlan de Desarrollo (ciclo ${picd.ciclo_año}):`);
    if (picd.puesto_futuro_opcion1) lines.push(`  Puesto futuro 1: ${picd.puesto_futuro_opcion1}`);
    if (picd.puesto_futuro_opcion2) lines.push(`  Puesto futuro 2: ${picd.puesto_futuro_opcion2}`);
    if (picd.areas_oportunidad) lines.push(`  Áreas de oportunidad: ${picd.areas_oportunidad}`);
    if (picd.compromisos) lines.push(`  Compromisos: ${picd.compromisos}`);
  }

  return lines.join("\n");
}
