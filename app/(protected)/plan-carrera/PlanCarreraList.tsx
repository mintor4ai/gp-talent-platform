"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cambiarEstadoPlan, eliminarPlan } from "@/app/actions/plan_carrera";

type PlanRow = {
  id: string;
  colaborador_id: string;
  estado: string;
  ciclo_año: number;
  created_at: string;
  colaborador_nombre: string;
  colaborador_puesto: string;
  colaborador_org: string;
  objetivo_principal: string | null;
  objetivo_org: string | null;
  objetivos_count: number;
  sesiones_count: number;
};

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  activo:  { label: "Activo",  color: "bg-green-100 text-green-700" },
  pausado: { label: "Pausado", color: "bg-amber-100 text-amber-700" },
  cerrado: { label: "Cerrado", color: "bg-gray-100 text-gray-500" },
};

function PlanActions({ plan, onDone }: { plan: PlanRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleEstado = (estado: "activo" | "pausado" | "cerrado") => {
    setOpen(false);
    startTransition(async () => {
      await cambiarEstadoPlan(plan.id, estado);
      onDone();
    });
  };

  const handleEliminar = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setOpen(false);
    setConfirmDelete(false);
    startTransition(async () => {
      await eliminarPlan(plan.id);
      onDone();
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setConfirmDelete(false); }}
        disabled={isPending}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
        title="Acciones"
      >
        {isPending ? (
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="4" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="10" cy="16" r="1.5" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setConfirmDelete(false); }} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44 text-sm">
            <Link
              href={`/plan-carrera/${plan.colaborador_id}`}
              className="block px-4 py-2 text-gray-700 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              Ver expediente
            </Link>
            <div className="border-t border-gray-100 my-1" />
            {plan.estado !== "activo" && (
              <button
                onClick={() => handleEstado("activo")}
                className="w-full text-left px-4 py-2 text-green-700 hover:bg-green-50"
              >
                Reactivar
              </button>
            )}
            {plan.estado !== "pausado" && (
              <button
                onClick={() => handleEstado("pausado")}
                className="w-full text-left px-4 py-2 text-amber-700 hover:bg-amber-50"
              >
                Pausar
              </button>
            )}
            {plan.estado !== "cerrado" && (
              <button
                onClick={() => handleEstado("cerrado")}
                className="w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50"
              >
                Cerrar
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={handleEliminar}
              className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
            >
              {confirmDelete ? "¿Confirmar eliminación?" : "Eliminar plan"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function PlanCarreraList({ planes }: { planes: PlanRow[] }) {
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [selectedEstado, setSelectedEstado] = useState("all");
  const router = useRouter();
  const [, startTransition] = useTransition();

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
    total:   planes.length,
    activos: planes.filter((p) => p.estado === "activo").length,
    pausados: planes.filter((p) => p.estado === "pausado").length,
    cerrados: planes.filter((p) => p.estado === "cerrado").length,
  }), [planes]);

  const refresh = () => startTransition(() => { router.refresh(); });

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
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight">Plano de Carrera</h1>
          <p className="text-white/60 text-sm mt-1">Expedientes de talento post-validación</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Planes totales", value: stats.total },
              { label: "Activos",        value: stats.activos },
              { label: "Pausados",       value: stats.pausados },
              { label: "Cerrados",       value: stats.cerrados },
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
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Sesiones</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-sm text-gray-400">
                        Sin resultados para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((plan) => {
                      const estadoCfg = ESTADO_CONFIG[plan.estado] ?? ESTADO_CONFIG["activo"];
                      return (
                        <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{plan.colaborador_nombre}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">
                              {plan.colaborador_puesto}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-gray-600">{plan.colaborador_org || "—"}</span>
                          </td>
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
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-gray-500 tabular-nums">
                              {plan.objetivos_count > 1 ? `${plan.objetivos_count} objetivos` : "1 objetivo"}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {plan.sesiones_count > 0 ? (
                              <span className="text-xs text-gray-700 tabular-nums font-medium">
                                {plan.sesiones_count} {plan.sesiones_count === 1 ? "sesión" : "sesiones"}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">Sin sesiones</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${estadoCfg.color}`}>
                              {estadoCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <PlanActions plan={plan} onDone={refresh} />
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
