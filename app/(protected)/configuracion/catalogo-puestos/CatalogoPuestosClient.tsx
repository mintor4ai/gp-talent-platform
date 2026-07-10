"use client";

import { useState, useTransition, useMemo, useRef, useEffect, useCallback } from "react";
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
          <PuestoAutocomplete
            puestos={puestos}
            value={search}
            onChange={setSearch}
            className="col-span-full sm:col-span-2 lg:col-span-1"
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

const TIPO_COLORS_AC: Record<string, string> = {
  Gerencial:      "text-purple-700",
  Administrativa: "text-blue-700",
  Operativa:      "text-orange-600",
};

function PuestoAutocomplete({
  puestos,
  value,
  onChange,
  className,
}: {
  puestos: PuestoCatalogo[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return puestos
      .filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.clave.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [puestos, value]);

  useEffect(() => {
    setActiveIdx(-1);
    setOpen(suggestions.length > 0);
  }, [suggestions]);

  // Close on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  const select = useCallback((p: PuestoCatalogo) => {
    onChange(p.nombre);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }, [onChange]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        e.preventDefault();
        select(suggestions[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  function highlight(text: string, q: string) {
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-100 text-yellow-900 rounded-sm">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Buscar por nombre o clave..."
          autoComplete="off"
          className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="puesto-suggestions"
          role="combobox"
        />
        {value && (
          <button
            onClick={() => { onChange(""); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
            tabIndex={-1}
            aria-label="Limpiar búsqueda"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <ul
          id="puesto-suggestions"
          ref={listRef}
          role="listbox"
          className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto"
        >
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); select(p); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                i === activeIdx ? "bg-[#1a3a5c] text-white" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${i === activeIdx ? "text-white" : "text-gray-800"}`}>
                  {i === activeIdx ? p.nombre : highlight(p.nombre, value.trim())}
                </p>
                <div className={`flex items-center gap-2 mt-0.5 text-[10px] ${i === activeIdx ? "text-blue-200" : "text-gray-400"}`}>
                  <span className="font-mono">{p.clave}</span>
                  {p.organización && <><span>·</span><span className="truncate">{p.organización}</span></>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {p.es_critico && (
                  <span className={`text-[9px] font-bold ${i === activeIdx ? "text-red-200" : "text-red-500"}`}>★ crítico</span>
                )}
                {p.tipo_vacante && (
                  <span className={`text-[10px] font-medium ${i === activeIdx ? "text-blue-100" : (TIPO_COLORS_AC[p.tipo_vacante] ?? "text-gray-500")}`}>
                    {p.tipo_vacante}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
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
