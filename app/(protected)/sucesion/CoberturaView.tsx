"use client";

import { useState, useMemo } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";

export type SucesorItem = {
  sucesor_nombre: string;
  readiness: string | null;
  tiempo_estimado: string | null;
  estado: string;
};

export type TitularItem = {
  id: string;
  nombre_completo: string;
};

export type PuestoCoberturaItem = {
  id: string;
  clave: string;
  nombre: string;
  organización: string | null;
  segmento_organizacional: string | null;
  tipo_vacante: string | null;
  es_critico: boolean;
  titulares: TitularItem[];
  sucesores: SucesorItem[];
};

type RiesgoLevel = "sin_sucesor" | "tres_mas" | "listo" | "vacante";

function getRiesgo(p: PuestoCoberturaItem): RiesgoLevel {
  if (p.titulares.length === 0) return "vacante";
  if (p.sucesores.length === 0) return "sin_sucesor";
  const readinessValues = p.sucesores.map((s) => s.readiness ?? s.tiempo_estimado ?? "");
  if (readinessValues.some((r) => r === "listo_ahora" || r === "uno_dos_anios")) return "listo";
  return "tres_mas";
}

const RIESGO_CONFIG: Record<RiesgoLevel, { label: string; color: string; dot: string; order: number }> = {
  sin_sucesor: { label: "Sin sucesor",  color: "bg-red-100 text-red-700",     dot: "bg-red-500",    order: 0 },
  tres_mas:    { label: "3+ años",       color: "bg-amber-100 text-amber-700", dot: "bg-amber-400",  order: 1 },
  listo:       { label: "Con sucesor",   color: "bg-green-100 text-green-700", dot: "bg-green-500",  order: 2 },
  vacante:     { label: "Vacante",        color: "bg-gray-100 text-gray-500",   dot: "bg-gray-400",   order: 3 },
};

const READINESS_LABEL: Record<string, string> = {
  listo_ahora:    "Listo ahora",
  uno_dos_anios:  "1-2 años",
  tres_mas_anios: "3+ años",
};

const TIPO_COLORS: Record<string, string> = {
  Gerencial:      "bg-purple-100 text-purple-800",
  Administrativa: "bg-blue-100 text-blue-800",
  Operativa:      "bg-orange-100 text-orange-800",
};

export default function CoberturaView({
  puestos,
  uens,
  cicloActual,
  ciclosDisponibles,
  onCicloChange,
}: {
  puestos: PuestoCoberturaItem[];
  uens: string[];
  cicloActual: number | "todos";
  ciclosDisponibles: number[];
  onCicloChange: (c: number | "todos") => void;
}) {
  const [filterCritico, setFilterCritico] = useState<"" | "si" | "no">("si");
  const [filterRiesgo, setFilterRiesgo]   = useState<"" | RiesgoLevel>("");
  const [filterUen, setFilterUen]         = useState("");
  const [search, setSearch]               = useState("");
  const { sortKey, sortDir, handleSort } = useSortState<"nombre" | "organización" | "tipo_vacante" | "sucesores" | "riesgo">("riesgo");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = puestos.filter((p) => {
      if (filterCritico === "si" && !p.es_critico) return false;
      if (filterCritico === "no" && p.es_critico)  return false;
      if (filterUen && p.organización !== filterUen) return false;
      if (filterRiesgo && getRiesgo(p) !== filterRiesgo) return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.clave.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "nombre":       return dir * a.nombre.localeCompare(b.nombre, "es");
        case "organización": return dir * (a.organización ?? "").localeCompare(b.organización ?? "", "es");
        case "tipo_vacante": return dir * (a.tipo_vacante ?? "").localeCompare(b.tipo_vacante ?? "", "es");
        case "sucesores":    return dir * (a.sucesores.length - b.sucesores.length);
        case "riesgo":
        default:
          if (a.es_critico !== b.es_critico) return a.es_critico ? -1 : 1;
          return dir * (RIESGO_CONFIG[getRiesgo(a)].order - RIESGO_CONFIG[getRiesgo(b)].order);
      }
    });
  }, [puestos, filterCritico, filterRiesgo, filterUen, search, sortKey, sortDir]);

  const conSucesor     = filtered.filter((p) => p.sucesores.length > 0).length;
  const sinSucesor     = filtered.filter((p) => p.sucesores.length === 0 && p.titulares.length > 0).length;
  const coberturaPct   = filtered.length ? Math.round((conSucesor / filtered.length) * 100) : 0;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cobertura por Puesto</h2>
          <p className="text-sm text-gray-500 mt-0.5">Visibilidad de planes de sucesión ligados al catálogo de puestos</p>
        </div>
        {ciclosDisponibles.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">Ciclo:</span>
            {ciclosDisponibles.map((c) => (
              <button
                key={c}
                onClick={() => onCicloChange(c)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  cicloActual === c
                    ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => onCicloChange("todos")}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                cicloActual === "todos"
                  ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Todos
            </button>
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <CoverageChip label="Puestos" value={filtered.length} pct={null} color="gray" />
        <CoverageChip label="Con sucesor" value={conSucesor} pct={coberturaPct} color="green" />
        <CoverageChip label="Sin sucesor" value={sinSucesor} pct={null} color="red" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar puesto o clave..."
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] col-span-full sm:col-span-2 lg:col-span-1"
          />
          <select value={filterCritico} onChange={(e) => setFilterCritico(e.target.value as "" | "si" | "no")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="si">Solo críticos</option>
            <option value="no">Solo no críticos</option>
            <option value="">Todos</option>
          </select>
          <select value={filterUen} onChange={(e) => setFilterUen(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Todas las UEN</option>
            {uens.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={filterRiesgo} onChange={(e) => setFilterRiesgo(e.target.value as "" | RiesgoLevel)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Todos los riesgos</option>
            <option value="sin_sucesor">Sin sucesor 🔴</option>
            <option value="tres_mas">3+ años 🟡</option>
            <option value="listo">Con sucesor 🟢</option>
            <option value="vacante">Vacante ⚪</option>
          </select>
        </div>
        {(search || filterCritico !== "si" || filterUen || filterRiesgo) && (
          <button
            onClick={() => { setSearch(""); setFilterCritico("si"); setFilterUen(""); setFilterRiesgo(""); }}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                <SortableTh label="Puesto" sortKey="nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                <SortableTh label="UEN" sortKey="organización" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                <SortableTh label="Tipo" sortKey="tipo_vacante" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                <th className="px-4 py-3 font-medium">Titular(es)</th>
                <SortableTh label="Sucesores" sortKey="sucesores" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 text-center" />
                <th className="px-4 py-3 font-medium">Mejor Readiness</th>
                <SortableTh label="Riesgo" sortKey="riesgo" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No hay puestos que coincidan con los filtros
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const riesgo = getRiesgo(p);
                const rCfg   = RIESGO_CONFIG[riesgo];
                const bestReadiness = getBestReadiness(p.sucesores);
                return (
                  <tr key={p.id} className={`hover:bg-gray-50/50 transition-colors ${p.es_critico ? "bg-red-50/10" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[260px]">
                      <div className="flex items-start gap-1.5">
                        {p.es_critico && <span className="text-red-500 text-[10px] font-bold mt-0.5 flex-shrink-0">★</span>}
                        <span className="break-words leading-snug">{p.nombre}</span>
                      </div>
                      <span className="font-mono text-gray-400 text-[10px]">{p.clave}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[140px] truncate">{p.organización ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.tipo_vacante
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${TIPO_COLORS[p.tipo_vacante] ?? "bg-gray-100 text-gray-700"}`}>
                            {p.tipo_vacante}
                          </span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px]">
                      {p.titulares.length === 0
                        ? <span className="text-gray-400 italic">Vacante</span>
                        : p.titulares.map((t) => (
                            <a key={t.id} href={`/carpeta/${t.id}`}
                              className="block truncate hover:text-[#1a3a5c] hover:underline">
                              {t.nombre_completo}
                            </a>
                          ))
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.sucesores.length > 0
                        ? <span className="font-semibold text-gray-700">{p.sucesores.length}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {bestReadiness
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${readinessBadgeColor(bestReadiness)}`}>
                            {READINESS_LABEL[bestReadiness] ?? bestReadiness}
                          </span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${rCfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rCfg.dot}`} />
                        {rCfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            Mostrando {filtered.length} de {puestos.length} puestos · {coberturaPct}% con sucesor
          </div>
        )}
      </div>
    </div>
  );
}

function getBestReadiness(sucesores: SucesorItem[]): string | null {
  const order = ["listo_ahora", "uno_dos_anios", "tres_mas_anios"];
  let best: string | null = null;
  for (const s of sucesores) {
    const r = s.readiness ?? s.tiempo_estimado;
    if (!r) continue;
    if (!best || order.indexOf(r) < order.indexOf(best)) best = r;
  }
  return best;
}

function readinessBadgeColor(r: string): string {
  if (r === "listo_ahora")    return "bg-green-100 text-green-700";
  if (r === "uno_dos_anios")  return "bg-blue-100 text-blue-700";
  if (r === "tres_mas_anios") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function CoverageChip({ label, value, pct, color }: { label: string; value: number; pct: number | null; color: "gray" | "green" | "red" }) {
  const cls = {
    gray:  "bg-white border-gray-200 text-gray-700",
    green: "bg-green-50 border-green-200 text-green-700",
    red:   "bg-red-50 border-red-200 text-red-700",
  }[color];
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-center min-w-[100px] ${cls}`}>
      <p className="text-xl font-bold">{value}{pct !== null ? ` (${pct}%)` : ""}</p>
      <p className="text-[10px] opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
