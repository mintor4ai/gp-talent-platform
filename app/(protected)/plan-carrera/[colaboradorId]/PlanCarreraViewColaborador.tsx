"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { PlanCarreraFull, PlanCarreraAccion } from "@/app/actions/plan_carrera";

type ColabInfo = {
  id: string;
  nombre_completo: string;
  puesto: string;
  nivel: string;
  area: string;
  organización: string;
};

const DIMENSION_CONFIG = {
  tecnica:     { label: "Competencias Técnicas",  icon: "⚙️", accent: "bg-blue-500",   track: "bg-blue-100" },
  liderazgo:   { label: "Liderazgo y Gestión",    icon: "🧭", accent: "bg-violet-500", track: "bg-violet-100" },
  visibilidad: { label: "Visibilidad Ejecutiva",  icon: "📡", accent: "bg-amber-500",  track: "bg-amber-100" },
  operativa:   { label: "Experiencia Operativa",  icon: "🏗️", accent: "bg-emerald-500",track: "bg-emerald-100" },
} as const;
type Dimension = keyof typeof DIMENSION_CONFIG;

const TIPO_LABELS: Record<PlanCarreraAccion["tipo"], string> = {
  capacitacion: "Capacitación",
  proyecto:     "Proyecto",
  mentoria:     "Mentoría",
  rotacion:     "Rotación",
  visibilidad:  "Visibilidad",
};

const TIPO_COLORS: Record<PlanCarreraAccion["tipo"], string> = {
  capacitacion: "bg-blue-100 text-blue-700",
  proyecto:     "bg-violet-100 text-violet-700",
  mentoria:     "bg-pink-100 text-pink-700",
  rotacion:     "bg-orange-100 text-orange-700",
  visibilidad:  "bg-cyan-100 text-cyan-700",
};

const ESTADO_ICON: Record<PlanCarreraAccion["estado"], { icon: string; color: string }> = {
  pendiente:   { icon: "○", color: "text-gray-400" },
  en_progreso: { icon: "◐", color: "text-blue-500" },
  completado:  { icon: "✓", color: "text-emerald-600" },
  cancelado:   { icon: "✕", color: "text-gray-300" },
};

function dimProgress(acciones: PlanCarreraAccion[], dim: Dimension) {
  const active = acciones.filter((a) => a.dimension === dim && a.estado !== "cancelado");
  if (!active.length) return 0;
  return Math.round((active.filter((a) => a.estado === "completado").length / active.length) * 100);
}

function globalProgress(acciones: PlanCarreraAccion[]) {
  const active = acciones.filter((a) => a.estado !== "cancelado");
  if (!active.length) return 0;
  return Math.round((active.filter((a) => a.estado === "completado").length / active.length) * 100);
}

export default function PlanCarreraViewColaborador({
  colab,
  plan,
}: {
  colab: ColabInfo;
  plan: PlanCarreraFull | null;
}) {
  const progress = useMemo(() => globalProgress(plan?.acciones ?? []), [plan]);
  const activeObjetivos = useMemo(
    () => (plan?.objetivos ?? []).filter((o) => o.activo).sort((a, b) => a.prioridad - b.prioridad),
    [plan]
  );

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">📐</div>
          <h1 className="text-xl font-bold text-gray-900">Sin Plano de Carrera activo</h1>
          <p className="text-sm text-gray-500">
            Aún no tienes un Plano de Carrera asignado.
            Capital Humano lo generará una vez que seas validado como candidato sucesor.
          </p>
          <Link href="/dashboard" className="inline-block text-sm font-medium text-[#1a3a5c] hover:underline">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="bg-[#1a3a5c] text-white px-6 py-8 md:px-10"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "32px 32px",
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-4 text-xs text-white/50">
            <Link href="/dashboard" className="hover:text-white/80 transition-colors">Inicio</Link>
            <span>/</span>
            <span className="text-white/70">Mi Plano de Carrera</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Mi Plano de Carrera</h1>
              <p className="text-white/60 text-sm mt-1">{colab.puesto} · {colab.organización}</p>

              {/* Snapshot chips */}
              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { label: "UEN",   value: (plan.snapshot_json["organización"] as string) ?? colab.organización },
                  { label: "Nivel", value: (plan.snapshot_json["nivel"] as string) ?? colab.nivel },
                  { label: "Ciclo", value: String(plan.ciclo_año) },
                ].map(({ label, value }) => (
                  <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/20 text-white/80">
                    <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-white/50">{label}:</span>
                    <span className="font-medium text-white">{value || "—"}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Global progress */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-6 py-4 border border-white/20 min-w-[160px]">
              <p className="text-xs text-white/60 mb-1 font-medium uppercase tracking-wider">Mi progreso</p>
              <div className="text-3xl font-bold tabular-nums">{progress}%</div>
              <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">

        {/* Objetivo(s) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-800">
              {activeObjetivos.length === 1 ? "Mi posición objetivo" : "Mis posiciones objetivo"}
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {activeObjetivos.map((obj, idx) => (
              <div key={obj.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  idx === 0 ? "bg-[#1a3a5c] text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {obj.prioridad}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{obj.puesto_nombre ?? "—"}</p>
                  {obj.puesto_org && <p className="text-xs text-gray-400">{obj.puesto_org}</p>}
                  {obj.notas && <p className="text-xs text-gray-500 italic mt-0.5">{obj.notas}</p>}
                </div>
                {idx === 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a3a5c]/10 text-[#1a3a5c] font-medium">
                    Principal
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dimensions */}
        <div className="space-y-4">
          {(Object.keys(DIMENSION_CONFIG) as Dimension[]).map((dim) => {
            const cfg = DIMENSION_CONFIG[dim];
            const acciones = (plan.acciones ?? []).filter((a) => a.dimension === dim);
            const prog = dimProgress(plan.acciones ?? [], dim);
            const active = acciones.filter((a) => a.estado !== "cancelado");

            return (
              <div key={dim} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Dimension header */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cfg.icon}</span>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{cfg.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {acciones.filter((a) => a.estado === "completado").length} / {active.length} completadas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold tabular-nums text-gray-800">{prog}%</span>
                    <div className={`w-20 h-1.5 ${cfg.track} rounded-full overflow-hidden`}>
                      <div className={`h-full ${cfg.accent} rounded-full transition-all`} style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                </div>

                {/* Actions list */}
                {active.length === 0 ? (
                  <div className="px-5 py-5 text-sm text-gray-400 text-center">
                    Capital Humano agregará acciones próximamente.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {acciones.filter((a) => a.estado !== "cancelado").map((accion) => {
                      const est = ESTADO_ICON[accion.estado];
                      return (
                        <div key={accion.id} className="px-5 py-3 flex items-start gap-3">
                          <span className={`mt-0.5 flex-shrink-0 font-mono text-sm ${est.color}`}>{est.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <p className={`text-sm font-medium ${accion.estado === "completado" ? "line-through text-gray-400" : "text-gray-900"}`}>
                                {accion.titulo}
                              </p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLORS[accion.tipo]}`}>
                                {TIPO_LABELS[accion.tipo]}
                              </span>
                            </div>
                            {accion.descripcion && (
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{accion.descripcion}</p>
                            )}
                            {accion.fecha_fin_estimada && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                Estimado: {new Date(accion.fecha_fin_estimada + "T12:00:00").toLocaleDateString("es-MX", {
                                  day: "numeric", month: "short", year: "numeric",
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Revisiones */}
        {plan.revisiones.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-800">Revisiones anuales</p>
            </div>
            <div className="divide-y divide-gray-50">
              {plan.revisiones.map((rev) => (
                <div key={rev.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-800">Ciclo {rev.ciclo_año}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      rev.estado === "completada" ? "bg-green-100 text-green-700"
                      : rev.estado === "en_proceso" ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                    }`}>
                      {rev.estado === "completada" ? "Completada" : rev.estado === "en_proceso" ? "En proceso" : "Pendiente"}
                    </span>
                  </div>
                  {rev.notas_colaborador && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-1">Tus notas</p>
                      <p className="text-xs text-blue-800 leading-relaxed">{rev.notas_colaborador}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center pb-4">
          Este plan es confidencial y gestionado por Capital Humano.
          Consulta a tu gestor de CH para más información.
        </p>
      </div>
    </div>
  );
}
