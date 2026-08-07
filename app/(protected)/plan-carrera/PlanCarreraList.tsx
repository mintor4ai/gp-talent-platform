"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type PlanRow = {
  id: string;
  colaborador_id: string;
  estado: string;
  ciclo_año: number;
  created_at: string;
  colaborador_nombre: string;
  colaborador_puesto: string;
  colaborador_area: string;
  colaborador_org: string;
  objetivo_principal: string | null;
  objetivo_org: string | null;
  objetivos_count: number;
  progress: number;
  acciones_total: number;
  acciones_completadas: number;
  ultima_revision_ciclo: number | null;
  ultima_revision_estado: string | null;
};

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  activo:  { label: "Activo",  color: "bg-green-100 text-green-700" },
  pausado: { label: "Pausado", color: "bg-amber-100 text-amber-700" },
  cerrado: { label: "Cerrado", color: "bg-gray-100 text-gray-500" },
};

const REV_ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:   { label: "Pendiente",   color: "text-gray-400" },
  en_proceso:  { label: "En proceso",  color: "text-blue-500" },
  completada:  { label: "Completada",  color: "text-green-600" },
};

export default function PlanCarreraList({ planes }: { planes: PlanRow[] }) {
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [selectedEstado, setSelectedEstado] = useState("all");

  const uens = useMemo(
    () => Array.from(new Set(planes.map((p) => p.colaborador_org).filter(Boolean))).sort(),
    [planes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return planes.filter((p) => {
      if (selectedOrg !== "all" && p.colaborador_org !== selectedOrg) return false;
      if (selectedEstado !== "all" && p.estado !== selectedEstado) return false;
      if (q) {
        const match =
          p.colaborador_nombre.toLowerCase().includes(q) ||
          p.colaborador_puesto.toLowerCase().includes(q) ||
          (p.objetivo_principal ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [planes, search, selectedOrg, selectedEstado]);

  const stats = useMemo(() => ({
    total: filtered.length,
    activos: filtered.filter((p) => p.estado === "activo").length,
    avgProgress: filtered.length
      ? Math.round(filtered.reduce((s, p) => s + p.progress, 0) / filtered.length)
      : 0,
    conRevision: filtered.filter((p) => p.ultima_revision_estado === "completada").length,
  }), [filtered]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a3a5c] text-white px-6 py-8 md:px-10"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "32px 32px",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight">Plano de Carrera</h1>
          <p className="text-white/60 text-sm mt-1">Planes de desarrollo individuales post-validación</p>

          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Planes totales",       value: stats.total },
              { label: "Activos",              value: stats.activos },
              { label: "Progreso promedio",    value: `${stats.avgProgress}%` },
              { label: "Con revisión completa", value: stats.conRevision },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                <p className="text-xs text-white/50 mb-0.5">{label}</p>
                <p className="text-xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar colaborador, puesto u objetivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] w-72 bg-white"
          />
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            <option value="all">Todas las UEN</option>
            {uens.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select
            value={selectedEstado}
            onChange={(e) => setSelectedEstado(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            <option value="all">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="cerrado">Cerrado</option>
          </select>
          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} {filtered.length === 1 ? "plan" : "planes"}
          </span>
        </div>

        {/* Empty state */}
        {planes.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <div className="text-4xl mb-3">📐</div>
            <p className="text-sm font-medium text-gray-700">Sin planes de carrera aún</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              Los planes se crean automáticamente al validar un match en el Motor de Sucesión.
            </p>
            <Link
              href="/sucesion"
              className="inline-block mt-4 text-sm font-medium text-[#1a3a5c] hover:underline"
            >
              Ir al Motor de Matching →
            </Link>
          </div>
        )}

        {/* Table */}
        {planes.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3">Colaborador</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">UEN</th>
                    <th className="text-left px-4 py-3">Objetivo principal</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Objetivos</th>
                    <th className="text-left px-4 py-3">Progreso</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Última revisión</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-sm text-gray-400">
                        Sin resultados para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((plan) => {
                      const estadoCfg = ESTADO_CONFIG[plan.estado] ?? ESTADO_CONFIG["activo"];
                      const revCfg = plan.ultima_revision_estado
                        ? REV_ESTADO_CONFIG[plan.ultima_revision_estado]
                        : null;

                      return (
                        <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                          {/* Colaborador */}
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{plan.colaborador_nombre}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">
                              {plan.colaborador_puesto}
                            </p>
                          </td>

                          {/* UEN */}
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-gray-600">{plan.colaborador_org || "—"}</span>
                          </td>

                          {/* Objetivo principal */}
                          <td className="px-4 py-3">
                            {plan.objetivo_principal ? (
                              <div>
                                <p className="text-sm text-gray-800 leading-snug">{plan.objetivo_principal}</p>
                                {plan.objetivo_org && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">{plan.objetivo_org}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>

                          {/* Objetivos count */}
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-gray-500 tabular-nums">
                              {plan.objetivos_count > 1
                                ? `${plan.objetivos_count} objetivos`
                                : "1 objetivo"}
                            </span>
                          </td>

                          {/* Progress */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                                <div
                                  className="h-full bg-[#1a3a5c] rounded-full transition-all"
                                  style={{ width: `${plan.progress}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-gray-600 font-medium">
                                {plan.progress}%
                              </span>
                            </div>
                            {plan.acciones_total > 0 && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                {plan.acciones_completadas}/{plan.acciones_total} acciones
                              </p>
                            )}
                          </td>

                          {/* Última revisión */}
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {revCfg ? (
                              <div>
                                <span className={`text-xs font-medium ${revCfg.color}`}>
                                  {revCfg.label}
                                </span>
                                {plan.ultima_revision_ciclo && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    Ciclo {plan.ultima_revision_ciclo}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">Sin revisiones</span>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${estadoCfg.color}`}>
                              {estadoCfg.label}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="px-4 py-3">
                            <Link
                              href={`/plan-carrera/${plan.colaborador_id}`}
                              className="text-xs font-medium text-[#1a3a5c] hover:underline whitespace-nowrap"
                            >
                              Ver plan →
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
