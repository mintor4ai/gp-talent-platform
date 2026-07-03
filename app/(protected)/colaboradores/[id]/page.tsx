import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";
import RutaCarreraSection from "./RutaCarreraSection";

export default async function ColaboradorPerfilPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  const isJefe = rol === "jefe";

  const [
    { data: colab },
    { data: eips },
    { data: desempenos },
    { data: competencias },
    { data: historial },
    { data: semaforo },
    { data: rutasCarrera },
  ] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("*")
      .eq("id", params.id)
      .single(),
    supabase
      .from("evaluacion_integral_personal")
      .select("*")
      .eq("id_empleado", params.id)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("evaluacion_desempeno_anual")
      .select("*")
      .eq("id_empleado", params.id)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("evaluacion_competencias_360")
      .select("*")
      .eq("id_empleado", params.id)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("historial_carrera")
      .select("*")
      .eq("id_empleado", params.id)
      .order("fecha_inicio", { ascending: false }),
    supabase
      .from("config_semaforo_movilidad")
      .select("*")
      .eq("activo", true)
      .single(),
    supabase
      .from("rutas_carrera")
      .select("id, tipo_ruta, puesto_objetivo, uen_objetivo, plazo_estimado, habilidades_gap, acciones_recomendadas, generado_con_ia")
      .eq("id_empleado", params.id)
      .eq("activa", true)
      .order("created_at", { ascending: true }),
  ]);

  if (!colab) notFound();

  // RBAC: colaborador solo ve su propio perfil
  if (rol === "colaborador" && perfil.id_empleado !== params.id) {
    redirect("/dashboard");
  }

  // RBAC: jefe solo ve su equipo directo
  if (isJefe && !isAdmin) {
    const { data: miColab } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();

    if (miColab && colab.jefe_inmediato_nombre !== miColab.nombre_completo) {
      redirect("/dashboard");
    }
  }

  const eipActual = eips?.[0] ?? null;
  const zonaColors = eipActual?.zona_evaluacion
    ? ZONA_COLORS[eipActual.zona_evaluacion] ?? { bg: "bg-gray-100", text: "text-gray-700" }
    : null;

  // Semáforo de movilidad
  const añosEnPuesto = eipActual?.años_en_puesto ?? 0;
  const semColor =
    !semaforo
      ? "gray"
      : añosEnPuesto <= semaforo.umbral_verde_max
      ? "green"
      : añosEnPuesto <= semaforo.umbral_amarillo_max
      ? "yellow"
      : "red";

  const semLabels: Record<string, string> = {
    green: "Disponible para movilidad",
    yellow: "Considerar movilidad",
    red: "Alta permanencia en puesto",
    gray: "Sin datos",
  };

  const semClasses: Record<string, string> = {
    green: "bg-green-500",
    yellow: "bg-yellow-400",
    red: "bg-red-500",
    gray: "bg-gray-300",
  };

  // Competencias 360 agrupadas por bloque (ciclo más reciente)
  const ciclo360 = competencias?.[0]?.ciclo_año;
  const comp360 = competencias?.filter((c) => c.ciclo_año === ciclo360) ?? [];
  const bloques: Record<string, typeof comp360> = {};
  for (const c of comp360) {
    const b = c.bloque ?? "General";
    if (!bloques[b]) bloques[b] = [];
    bloques[b].push(c);
  }

  // Antigüedad calculada
  const antiguedad = colab.fecha_antiguedad
    ? Math.floor(
        (Date.now() - new Date(colab.fecha_antiguedad).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <a href="/colaboradores" className="hover:text-gray-600 transition-colors">
            Colaboradores
          </a>
          <span>/</span>
          <span className="text-gray-700 font-medium">{colab.nombre_completo}</span>
        </div>
        <a
          href={`/picd/${params.id}`}
          className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] transition-colors"
        >
          Ver PICD →
        </a>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl font-bold">
              {colab.nombre_completo.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{colab.nombre_completo}</h1>
            <p className="text-gray-600 mt-0.5">{colab.puesto}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
              <span>{(colab as any).organización}</span>
              <span>{colab.nivel}</span>
              {colab.area && <span>{colab.area}</span>}
              {colab.entidad && <span>{colab.entidad}</span>}
              {antiguedad !== null && <span>{antiguedad} años de antigüedad</span>}
            </div>
          </div>
          {eipActual && zonaColors && (
            <span
              className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full ${zonaColors.bg} ${zonaColors.text} flex-shrink-0`}
            >
              {eipActual.zona_evaluacion}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Potencial EIP {eipActual?.ciclo_año}</p>
          <p className="text-2xl font-bold text-gray-900">
            {eipActual?.evaluacion_potencial_total?.toFixed(1) ?? "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Desempeño {eipActual?.ciclo_año}</p>
          <p className="text-2xl font-bold text-gray-900">
            {eipActual?.desempeno_logra?.toFixed(1) ?? "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Años en puesto</p>
          <p className="text-2xl font-bold text-gray-900">
            {añosEnPuesto ?? "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-2">Semáforo movilidad</p>
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full ${semClasses[semColor]} flex-shrink-0`} />
            <p className="text-xs text-gray-600 font-medium">{semLabels[semColor]}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* EIP histórico */}
        {(eips?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
              Evaluación Integral (EIP) — Histórico
            </p>
            <div className="space-y-3">
              {eips!.map((e) => {
                const zc = e.zona_evaluacion
                  ? ZONA_COLORS[e.zona_evaluacion] ?? { bg: "bg-gray-100", text: "text-gray-700" }
                  : null;
                return (
                  <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{e.ciclo_año}</span>
                      {zc && (
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${zc.bg} ${zc.text}`}>
                          {e.zona_evaluacion}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm text-right">
                      <div>
                        <p className="text-xs text-gray-400">Potencial</p>
                        <p className="font-semibold text-gray-900">
                          {e.evaluacion_potencial_total?.toFixed(1) ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Desempeño</p>
                        <p className="font-semibold text-gray-900">
                          {e.desempeno_logra?.toFixed(1) ?? "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Desempeño anual */}
        {(desempenos?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
              Desempeño Anual — Competencias
            </p>
            <div className="space-y-4">
              {desempenos!.map((d) => (
                <div key={d.id}>
                  <p className="text-sm font-medium text-gray-700 mb-2">{d.ciclo_año}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      ["Planea", d.planea],
                      ["Ejecuta", d.ejecuta],
                      ["Optimiza", d.optimiza],
                      ["Trabaja en equipo", d.trabaja_equipo],
                      ["Atiende cliente", d.atiende_cliente],
                      ["Informa", d.informa],
                    ].map(([label, val]) =>
                      val != null ? (
                        <div key={label as string} className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{label as string}</span>
                          <span className="text-xs font-semibold text-gray-800">
                            {(val as number).toFixed(1)}
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>
                  {d.resultado_logra != null && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between">
                      <span className="text-xs font-medium text-gray-600">Resultado Logra</span>
                      <span className="text-sm font-bold text-gray-900">
                        {d.resultado_logra.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Competencias 360 */}
      {comp360.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Competencias 360
          </p>
          <p className="text-xs text-gray-400 mb-4">Ciclo {ciclo360}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(bloques).map(([bloque, items]) => (
              <div key={bloque}>
                <p className="text-xs font-semibold text-gray-600 mb-2">{bloque}</p>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs text-gray-500 truncate pr-2">
                          {item.sub_competencia ?? "General"}
                        </span>
                        <span className="text-xs font-semibold text-gray-800 flex-shrink-0">
                          {item.evaluacion?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                      {item.evaluacion != null && (
                        <div className="w-full bg-gray-100 rounded-full h-1">
                          <div
                            className="bg-[#1a3a5c] h-1 rounded-full"
                            style={{ width: `${Math.min(100, (item.evaluacion / 5) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de carrera */}
      {(historial?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
            Historial de Carrera
          </p>
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />
            <div className="space-y-4">
              {historial!.map((h) => (
                <div key={h.id} className="flex gap-4 relative">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex-shrink-0 relative z-10 mt-0.5" />
                  <div className="flex-1 pb-2">
                    <p className="text-sm font-medium text-gray-900">{h.puesto}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {h.empresa ?? (h.tipo === "interno" ? "Grupo GP" : "Externo")}
                      {h.años != null && ` · ${h.años} año${h.años !== 1 ? "s" : ""}`}
                    </p>
                    {(h.fecha_inicio || h.fecha_fin) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {h.fecha_inicio ?? ""}
                        {h.fecha_inicio && h.fecha_fin && " → "}
                        {h.fecha_fin ?? (h.fecha_inicio ? " → actual" : "")}
                      </p>
                    )}
                    <span
                      className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                        h.tipo === "interno"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      {h.tipo === "interno" ? "Interno" : "Externo"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Formación */}
      {(colab.resumen_formacion_profesional ||
        colab.resumen_formacion_especialidad ||
        colab.resumen_exp_interno ||
        colab.resumen_exp_externo) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
            Formación y Experiencia
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {colab.nivel_academico && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Nivel Académico</p>
                <p className="text-gray-700">{colab.nivel_academico}</p>
              </div>
            )}
            {colab.resumen_formacion_profesional && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Formación Profesional</p>
                <p className="text-gray-700">{colab.resumen_formacion_profesional}</p>
              </div>
            )}
            {colab.resumen_exp_interno && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Experiencia Interna</p>
                <p className="text-gray-700">{colab.resumen_exp_interno}</p>
              </div>
            )}
            {colab.resumen_exp_externo && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Experiencia Externa</p>
                <p className="text-gray-700">{colab.resumen_exp_externo}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rutas de carrera IA */}
      <RutaCarreraSection
        colaboradorId={params.id}
        isAdmin={isAdmin}
        rutasIniciales={rutasCarrera ?? []}
      />
    </div>
  );
}
