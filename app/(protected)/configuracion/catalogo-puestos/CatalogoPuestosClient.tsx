"use client";

import { useState, useTransition, useMemo } from "react";
import { togglePuestoCritico, togglePuestoActivo } from "@/app/actions/catalogo-puestos";
import type { PuestoCatalogo } from "./page";

const TIPO_COLORS: Record<string, string> = {
  Gerencial:      "bg-purple-100 text-purple-800",
  Administrativa: "bg-blue-100 text-blue-800",
  Operativa:      "bg-orange-100 text-orange-800",
};

type Props = {
  puestos: PuestoCatalogo[];
  uens: string[];
  segmentos: string[];
  tipos: string[];
};

export default function CatalogoPuestosClient({ puestos, uens, segmentos, tipos }: Props) {
  const [search, setSearch] = useState("");
  const [filterUen, setFilterUen] = useState("");
  const [filterSegmento, setFilterSegmento] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterCritico, setFilterCritico] = useState<"" | "si" | "no">("");
  const [filterActivo, setFilterActivo] = useState<"" | "activo" | "inactivo">("activo");
  const [optimistic, setOptimistic] = useState<Map<string, Partial<PuestoCatalogo>>>(new Map());
  const [, startTransition] = useTransition();

  function getField<K extends keyof PuestoCatalogo>(p: PuestoCatalogo, key: K): PuestoCatalogo[K] {
    return optimistic.get(p.id)?.[key] !== undefined
      ? (optimistic.get(p.id)![key] as PuestoCatalogo[K])
      : p[key];
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return puestos.filter((p) => {
      const critico = getField(p, "es_critico");
      const activo  = getField(p, "activo");
      if (filterActivo === "activo"   && !activo)  return false;
      if (filterActivo === "inactivo" && activo)   return false;
      if (filterCritico === "si" && !critico) return false;
      if (filterCritico === "no" && critico)  return false;
      if (filterUen      && p.organización !== filterUen)               return false;
      if (filterSegmento && p.segmento_organizacional !== filterSegmento) return false;
      if (filterTipo     && p.tipo_vacante !== filterTipo)              return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.clave.toLowerCase().includes(q)) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestos, search, filterUen, filterSegmento, filterTipo, filterCritico, filterActivo, optimistic]);

  const criticosCount  = filtered.filter((p) => getField(p, "es_critico")).length;
  const sinTitular     = filtered.filter((p) => p.titulares_count === 0).length;

  function handleToggleCritico(p: PuestoCatalogo) {
    const newVal = !getField(p, "es_critico");
    setOptimistic((prev) => {
      const next = new Map(prev);
      next.set(p.id, { ...(next.get(p.id) ?? {}), es_critico: newVal });
      return next;
    });
    startTransition(async () => {
      const res = await togglePuestoCritico(p.id, newVal);
      if (res.error) {
        // revert
        setOptimistic((prev) => {
          const next = new Map(prev);
          next.set(p.id, { ...(next.get(p.id) ?? {}), es_critico: !newVal });
          return next;
        });
      }
    });
  }

  function handleToggleActivo(p: PuestoCatalogo) {
    const newVal = !getField(p, "activo");
    setOptimistic((prev) => {
      const next = new Map(prev);
      next.set(p.id, { ...(next.get(p.id) ?? {}), activo: newVal });
      return next;
    });
    startTransition(async () => {
      const res = await togglePuestoActivo(p.id, newVal);
      if (res.error) {
        setOptimistic((prev) => {
          const next = new Map(prev);
          next.set(p.id, { ...(next.get(p.id) ?? {}), activo: !newVal });
          return next;
        });
      }
    });
  }

  return (
    <div className="space-y-4">

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <Chip label="Total filtrados" value={filtered.length} color="gray" />
        <Chip label="Críticos" value={criticosCount} color="red" />
        <Chip label="Sin titular" value={sinTitular} color="orange" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o clave..."
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] col-span-full sm:col-span-2 lg:col-span-1"
          />
          <select value={filterUen} onChange={(e) => setFilterUen(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Todas las UEN</option>
            {uens.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={filterSegmento} onChange={(e) => setFilterSegmento(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Todos los segmentos</option>
            {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterCritico} onChange={(e) => setFilterCritico(e.target.value as "" | "si" | "no")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Críticos y no críticos</option>
            <option value="si">Solo críticos</option>
            <option value="no">Solo no críticos</option>
          </select>
          <select value={filterActivo} onChange={(e) => setFilterActivo(e.target.value as "" | "activo" | "inactivo")}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="activo">Solo activos</option>
            <option value="inactivo">Solo inactivos</option>
            <option value="">Todos</option>
          </select>
        </div>
        {(search || filterUen || filterSegmento || filterTipo || filterCritico || filterActivo !== "activo") && (
          <button
            onClick={() => { setSearch(""); setFilterUen(""); setFilterSegmento(""); setFilterTipo(""); setFilterCritico(""); setFilterActivo("activo"); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
                <th className="px-4 py-3 font-medium">Clave</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">UEN</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-center">Titulares</th>
                <th className="px-4 py-3 font-medium text-center">Planes</th>
                <th className="px-4 py-3 font-medium text-center">Crítico</th>
                <th className="px-4 py-3 font-medium text-center">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                    No hay puestos que coincidan con los filtros
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const esCritico = getField(p, "es_critico");
                const esActivo  = getField(p, "activo");
                return (
                  <tr key={p.id} className={`hover:bg-gray-50/50 transition-colors ${!esActivo ? "opacity-50" : ""} ${esCritico ? "bg-red-50/20" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-gray-500 whitespace-nowrap">{p.clave}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        {esCritico && <span className="text-red-500 text-[10px] font-bold">★</span>}
                        <span className="truncate">{p.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-[160px] truncate">{p.organización ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-[120px] truncate">{p.segmento_organizacional ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {p.tipo_vacante
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${TIPO_COLORS[p.tipo_vacante] ?? "bg-gray-100 text-gray-700"}`}>
                            {p.tipo_vacante}
                          </span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.titulares_count > 0
                        ? <span className="text-gray-700 font-medium">{p.titulares_count}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.sucesion_count > 0
                        ? <span className="text-green-600 font-medium">{p.sucesion_count}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleCritico(p)}
                        title={esCritico ? "Quitar de críticos" : "Marcar como crítico"}
                        className={`w-8 h-5 rounded-full transition-colors relative ${
                          esCritico ? "bg-red-500" : "bg-gray-200"
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          esCritico ? "translate-x-3.5" : "translate-x-0.5"
                        }`} />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleActivo(p)}
                        title={esActivo ? "Desactivar" : "Activar"}
                        className={`w-8 h-5 rounded-full transition-colors relative ${
                          esActivo ? "bg-green-500" : "bg-gray-200"
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          esActivo ? "translate-x-3.5" : "translate-x-0.5"
                        }`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            Mostrando {filtered.length} de {puestos.length} puestos
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: number; color: "gray" | "red" | "orange" }) {
  const cls = {
    gray:   "bg-white border-gray-200 text-gray-700",
    red:    "bg-red-50 border-red-200 text-red-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
  }[color];
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-center ${cls}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
