"use client";

import { useState } from "react";
import type { SucesionItem } from "../carpeta/[id]/SucesionEditor";
import { readinessBadge, ESTADO_CONFIG } from "../carpeta/[id]/SucesionEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";

type ColabRow = {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  organización: string | null;
};

const ESTADO_FILTER_OPTIONS = [
  { value: "",            label: "Todos los estados" },
  { value: "borrador",     label: "Borrador" },
  { value: "pendiente_v1", label: "En revisión (V1)" },
  { value: "pendiente_v2", label: "Validación Dir. (V2)" },
  { value: "aprobado",     label: "Aprobado" },
  { value: "rechazado",    label: "Rechazado" },
];

const READINESS_FILTER_OPTIONS = [
  { value: "",               label: "Todos los niveles" },
  { value: "listo_ahora",    label: "Listo ahora" },
  { value: "uno_dos_anios",  label: "1-2 años" },
  { value: "tres_mas_anios", label: "3+ años" },
];

export default function SucesionAdminView({
  planes,
  colabs,
  ciclos,
}: {
  planes: SucesionItem[];
  colabs: ColabRow[];
  ciclos: number[];
}) {
  const [cicloActual, setCicloActual] = useState<number>(ciclos[0] ?? new Date().getFullYear());
  const [estadoFilter, setEstadoFilter]     = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [searchFilter, setSearchFilter]     = useState("");

  const plansCiclo = planes.filter((p) => p.ciclo_año === cicloActual);

  const filtered = plansCiclo.filter((p) => {
    if (estadoFilter   && p.estado !== estadoFilter)                    return false;
    if (readinessFilter && (p.readiness ?? p.tiempo_estimado) !== readinessFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const titular = colabs.find((c) => c.id === p.id_empleado);
      if (
        !p.sucesor_nombre.toLowerCase().includes(q) &&
        !(titular?.nombre_completo ?? "").toLowerCase().includes(q) &&
        !(titular?.puesto ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Group filtered by titular
  const porTitular: Record<string, SucesionItem[]> = {};
  for (const p of filtered) {
    const key = p.id_empleado;
    if (!porTitular[key]) porTitular[key] = [];
    porTitular[key].push(p);
  }

  // Stats
  const totalTitulares = new Set(plansCiclo.map((p) => p.id_empleado)).size;
  const totalSucesores = plansCiclo.length;
  const pendingV1 = plansCiclo.filter((p) => p.estado === "pendiente_v1").length;
  const pendingV2 = plansCiclo.filter((p) => p.estado === "pendiente_v2").length;
  const aprobados = plansCiclo.filter((p) => p.estado === "aprobado").length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan de Sucesión</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión y validación de planes de sucesión organizacional</p>
        </div>
        {ciclos.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {ciclos.map((c) => (
              <button key={c} onClick={() => setCicloActual(c)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  c === cicloActual ? "bg-[#1a3a5c] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Posiciones con plan" value={totalTitulares} />
        <StatCard label="Sucesores propuestos" value={totalSucesores} />
        <StatCard label="En revisión (V1)" value={pendingV1} highlight={pendingV1 > 0} />
        <StatCard label="Pendiente Dir. (V2)" value={pendingV2} highlight={pendingV2 > 0} />
        <StatCard label="Aprobados" value={aprobados} positive />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Buscar titular o sucesor..."
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] w-56 bg-white"
        />
        <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
          {ESTADO_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={readinessFilter} onChange={(e) => setReadinessFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
          {READINESS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(estadoFilter || readinessFilter || searchFilter) && (
          <button onClick={() => { setEstadoFilter(""); setReadinessFilter(""); setSearchFilter(""); }}
            className="text-xs text-gray-400 hover:text-gray-600">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400 -mt-3">
        {Object.keys(porTitular).length} posición{Object.keys(porTitular).length !== 1 ? "es" : ""} · {filtered.length} sucesor{filtered.length !== 1 ? "es" : ""}
      </p>

      {/* Cards grid */}
      {Object.keys(porTitular).length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No hay planes de sucesión registrados para los filtros seleccionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(porTitular).map(([titularId, sucesores]) => {
            const titular = colabs.find((c) => c.id === titularId);
            return (
              <TitularCard key={titularId} titular={titular ?? null} sucesores={sucesores} colabs={colabs} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TitularCard({
  titular,
  sucesores,
  colabs,
}: {
  titular: ColabRow | null;
  sucesores: SucesionItem[];
  colabs: ColabRow[];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      {/* Titular header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">
            {(titular?.nombre_completo ?? "?").charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{titular?.nombre_completo ?? "—"}</p>
          <p className="text-xs text-gray-500 truncate">{titular?.puesto ?? "—"}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5 text-xs text-gray-400">
            {titular?.nivel && <span>{titular.nivel}</span>}
            {titular?.area && <span>{titular.area}</span>}
          </div>
        </div>
        {titular?.id && (
          <a href={`/carpeta/${titular.id}`}
            className="text-xs text-[#1a3a5c] hover:underline flex-shrink-0 self-start mt-0.5">
            Ver carpeta →
          </a>
        )}
      </div>

      {/* Sucesores */}
      <div className="space-y-2 pl-1">
        <SectionHeader label={`Sucesores (${sucesores.length})`} />
        {sucesores.map((s) => {
          const readiness = readinessBadge(s.readiness);
          const estado    = ESTADO_CONFIG[s.estado] ?? ESTADO_CONFIG.borrador;
          const sucesorColab = s.sucesor_id ? colabs.find((c) => c.id === s.sucesor_id) : null;
          return (
            <div key={s.id} className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.sucesor_nombre}</p>
                  {sucesorColab && (
                    <p className="text-xs text-gray-500 truncate">{sucesorColab.puesto} · {sucesorColab.area}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${readiness.color}`}>
                    {readiness.label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estado.color}`}>
                    {estado.label}
                  </span>
                  {s.requiere_v2 && s.estado !== "borrador" && (
                    <span className="text-xs text-orange-600 font-medium">V2</span>
                  )}
                </div>
              </div>
              {s.fecha_objetivo && (
                <p className="text-xs text-gray-400">
                  Objetivo: {new Date(s.fecha_objetivo + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "short" })}
                </p>
              )}
              {s.validado_v1_at && (
                <p className="text-xs text-gray-400">
                  V1: {s.validado_v1_nombre ?? "Jefe"} · {new Date(s.validado_v1_at).toLocaleDateString("es-MX")}
                  {s.informar_sucesor && s.estado !== "rechazado" && (
                    <span className="ml-1 text-blue-500">· Sucesor informado</span>
                  )}
                </p>
              )}
              {s.sucesor_aspiracion !== null && (
                <p className={`text-xs font-medium ${s.sucesor_aspiracion ? "text-green-600" : "text-gray-400"}`}>
                  {s.sucesor_aspiracion ? "✓ Con aspiración" : "Sin aspiración"}
                </p>
              )}
              {sucesorColab?.id && (
                <a href={`/carpeta/${sucesorColab.id}`}
                  className="text-xs text-[#1a3a5c] hover:underline block">
                  Ver carpeta del sucesor →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight, positive }: { label: string; value: number; highlight?: boolean; positive?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-orange-200 bg-orange-50" : positive ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-orange-700" : positive ? "text-green-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
