"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";

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

type ColKey = "puesto" | "nivel" | "organización" | "area" | "jefe" | "segmento";

const COL_DEFS: { key: ColKey; label: string; adminOnly?: boolean }[] = [
  { key: "puesto",       label: "Puesto" },
  { key: "nivel",        label: "Nivel" },
  { key: "organización", label: "UEN" },
  { key: "area",         label: "Área" },
  { key: "jefe",         label: "Jefe inmediato", adminOnly: true },
  { key: "segmento",     label: "Segmento",        adminOnly: true },
];

const DEFAULT_VISIBLE: ColKey[] = ["puesto", "nivel", "organización", "area"];

function Cell({ value }: { value: string | null }) {
  const text = value ?? "—";
  return (
    <td className="px-4 py-3 text-gray-500 max-w-[180px]">
      <span className="block truncate" title={text}>
        {text}
      </span>
    </td>
  );
}

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
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE));
  const pickerRef = useRef<HTMLDivElement>(null);

  const { sortKey, sortDir, handleSort } = useSortState<
    "nombre" | "puesto" | "nivel" | "organización" | "area" | "segmento_organizacional"
  >("nombre");

  // Close column picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const availableCols = COL_DEFS.filter((c) => !c.adminOnly || isAdmin);

  function toggleCol(key: ColKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = nombre.trim().toLowerCase();
    const base = colaboradores.filter((c) => {
      if (q && !c.nombre_completo.toLowerCase().includes(q)) return false;
      if (filterUen && c.organización !== filterUen) return false;
      if (filterArea && c.area !== filterArea) return false;
      if (filterJefe && c.jefe_inmediato_nombre !== filterJefe) return false;
      if (filterSegmento && c.segmento_organizacional !== filterSegmento) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      let av: string;
      let bv: string;
      switch (sortKey) {
        case "nombre":       av = a.nombre_completo;           bv = b.nombre_completo;           break;
        case "puesto":       av = a.puesto ?? "";              bv = b.puesto ?? "";              break;
        case "nivel":        av = a.nivel ?? "";               bv = b.nivel ?? "";               break;
        case "organización": av = a.organización ?? "";        bv = b.organización ?? "";        break;
        case "area":         av = a.area ?? "";                bv = b.area ?? "";                break;
        default:             av = a.segmento_organizacional ?? ""; bv = b.segmento_organizacional ?? ""; break;
      }
      return dir * av.localeCompare(bv, "es");
    });
  }, [colaboradores, nombre, filterUen, filterArea, filterJefe, filterSegmento, sortKey, sortDir]);

  const hasFilters = nombre || filterUen || filterArea || filterJefe || filterSegmento;
  const colCount = 1 + visibleCols.size + 1; // nombre + visible + ver

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-2 items-center">
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
            <select value={filterUen} onChange={(e) => setFilterUen(e.target.value)}
              className="flex-1 min-w-[130px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700">
              <option value="">Todas las UEN</option>
              {uens.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}
              className="flex-1 min-w-[130px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700">
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filterJefe} onChange={(e) => setFilterJefe(e.target.value)}
              className="flex-1 min-w-[130px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700">
              <option value="">Todos los jefes</option>
              {jefes.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
            <select value={filterSegmento} onChange={(e) => setFilterSegmento(e.target.value)}
              className="flex-1 min-w-[130px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700">
              <option value="">Todos los segmentos</option>
              {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}

        {hasFilters && (
          <button type="button"
            onClick={() => { setNombre(""); setFilterUen(""); setFilterArea(""); setFilterJefe(""); setFilterSegmento(""); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap">
            Limpiar
          </button>
        )}

        {/* Column picker */}
        <div className="relative ml-auto" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setColPickerOpen((o) => !o)}
            title="Columnas visibles"
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
              colPickerOpen
                ? "border-[#1a3a5c] text-[#1a3a5c] bg-[#1a3a5c]/5"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3 9h18M3 15h18" />
            </svg>
            <span className="hidden sm:inline text-xs font-medium">Columnas</span>
          </button>

          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[180px] space-y-1">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Columnas visibles</p>
              {availableCols.map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onChange={() => toggleCol(col.key)}
                    className="rounded text-[#1a3a5c] focus:ring-[#1a3a5c]"
                  />
                  <span className="text-sm text-gray-700">{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 px-1">
        {filtered.length} de {colaboradores.length} colaboradores
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ minWidth: "600px", width: "100%" }}>
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                {/* Sticky name column */}
                <SortableTh
                  label="Nombre"
                  sortKey="nombre"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  className="px-4 py-3 sticky left-0 bg-gray-50 z-10 min-w-[180px] max-w-[240px]"
                />
                {visibleCols.has("puesto") && (
                  <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                )}
                {visibleCols.has("nivel") && (
                  <SortableTh label="Nivel" sortKey="nivel" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                )}
                {visibleCols.has("organización") && (
                  <SortableTh label="UEN" sortKey="organización" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                )}
                {visibleCols.has("area") && (
                  <SortableTh label="Área" sortKey="area" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                )}
                {visibleCols.has("jefe") && isAdmin && (
                  <th className="px-4 py-3 font-medium">Jefe</th>
                )}
                {visibleCols.has("segmento") && isAdmin && (
                  <SortableTh label="Segmento" sortKey="segmento_organizacional" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                )}
                <th className="px-4 py-3 font-medium w-8 sticky right-0 bg-gray-50 z-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-8 text-center text-sm text-gray-400">
                    Sin resultados para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                    {/* Sticky name */}
                    <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-gray-50 z-10 min-w-[180px] max-w-[240px] transition-colors">
                      <a
                        href={`/colaboradores/${c.id}`}
                        className="block font-medium text-gray-900 hover:text-[#1a3a5c] truncate transition-colors"
                        title={c.nombre_completo}
                      >
                        {c.nombre_completo}
                      </a>
                    </td>
                    {visibleCols.has("puesto") && <Cell value={c.puesto} />}
                    {visibleCols.has("nivel") && <Cell value={c.nivel} />}
                    {visibleCols.has("organización") && <Cell value={c.organización} />}
                    {visibleCols.has("area") && <Cell value={c.area} />}
                    {visibleCols.has("jefe") && isAdmin && <Cell value={c.jefe_inmediato_nombre} />}
                    {visibleCols.has("segmento") && isAdmin && <Cell value={c.segmento_organizacional} />}
                    {/* Sticky action */}
                    <td className="px-4 py-3 sticky right-0 bg-white group-hover:bg-gray-50 z-10 transition-colors">
                      <a
                        href={`/colaboradores/${c.id}`}
                        className="text-[#1a3a5c] hover:underline text-xs font-medium whitespace-nowrap"
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
