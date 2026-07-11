"use client";

import { useState, useMemo } from "react";

type Colaborador = {
  id: string;
  nombre_completo: string;
  puesto: string | null;
  nivel: string | null;
  organización: string | null;
  area: string | null;
  jefe_inmediato_nombre: string | null;
  segmento_organizacional: string | null;
};

type Props = {
  colaboradores: Colaborador[];
  uens: string[];
  areas: string[];
  jefes: string[];
  segmentos: string[];
  isAdmin: boolean;
};

export default function ColaboradoresClient({
  colaboradores,
  uens,
  areas,
  jefes,
  segmentos,
  isAdmin,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [filterUen, setFilterUen] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterJefe, setFilterJefe] = useState("");
  const [filterSegmento, setFilterSegmento] = useState("");

  const filtered = useMemo(() => {
    const q = nombre.trim().toLowerCase();
    return colaboradores.filter((c) => {
      if (q && !c.nombre_completo.toLowerCase().includes(q)) return false;
      if (filterUen && c.organización !== filterUen) return false;
      if (filterArea && c.area !== filterArea) return false;
      if (filterJefe && c.jefe_inmediato_nombre !== filterJefe) return false;
      if (filterSegmento && c.segmento_organizacional !== filterSegmento) return false;
      return true;
    });
  }, [colaboradores, nombre, filterUen, filterArea, filterJefe, filterSegmento]);

  const hasFilters = nombre || filterUen || filterArea || filterJefe || filterSegmento;

  return (
    <div className="space-y-4">
      {/* Search / filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-2">
        {/* Nombre — autocomplete as-you-type */}
        <div className="relative flex-1 min-w-[160px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre…"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c]"
          />
        </div>

        {isAdmin && (
          <>
            <select
              value={filterUen}
              onChange={(e) => setFilterUen(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700"
            >
              <option value="">Todas las UEN</option>
              {uens.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>

            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700"
            >
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            <select
              value={filterJefe}
              onChange={(e) => setFilterJefe(e.target.value)}
              className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700"
            >
              <option value="">Todos los jefes</option>
              {jefes.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>

            <select
              value={filterSegmento}
              onChange={(e) => setFilterSegmento(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700"
            >
              <option value="">Todos los segmentos</option>
              {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}

        {hasFilters && (
          <button
            type="button"
            onClick={() => { setNombre(""); setFilterUen(""); setFilterArea(""); setFilterJefe(""); setFilterSegmento(""); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap"
          >
            Limpiar
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 px-1">
        {filtered.length} de {colaboradores.length} colaboradores
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Puesto</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Nivel</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">UEN</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Área</th>
                {isAdmin && <th className="px-5 py-3 font-medium hidden xl:table-cell">Jefe</th>}
                {isAdmin && <th className="px-5 py-3 font-medium hidden xl:table-cell">Segmento</th>}
                <th className="px-5 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 6} className="px-5 py-8 text-center text-sm text-gray-400">
                    Sin resultados para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{c.nombre_completo}</td>
                    <td className="px-5 py-3 text-gray-600">{c.puesto ?? "—"}</td>
                    <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{c.nivel ?? "—"}</td>
                    <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{c.organización ?? "—"}</td>
                    <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{c.area ?? "—"}</td>
                    {isAdmin && <td className="px-5 py-3 text-gray-500 hidden xl:table-cell">{c.jefe_inmediato_nombre ?? "—"}</td>}
                    {isAdmin && <td className="px-5 py-3 text-gray-500 hidden xl:table-cell">{c.segmento_organizacional ?? "—"}</td>}
                    <td className="px-5 py-3">
                      <a
                        href={`/colaboradores/${c.id}`}
                        className="text-[#1a3a5c] hover:underline text-xs font-medium"
                      >
                        Ver →
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
