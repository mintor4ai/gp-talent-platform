"use client";

import { useState, useTransition, useMemo, useRef, useEffect, useCallback } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";
import {
  togglePuestoCritico,
  togglePuestoActivo,
  editarPuesto,
  aprobarPuesto,
  type PuestoEditFields,
} from "@/app/actions/catalogo-puestos";
import type { PuestoCatalogo } from "./page";

const TIPO_COLORS: Record<string, string> = {
  Gerencial:      "bg-purple-100 text-purple-800",
  Administrativa: "bg-blue-100 text-blue-800",
  Operativa:      "bg-orange-100 text-orange-800",
};

type FilterActivo = "" | "activo" | "inactivo" | "propuesto";

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
  const [filterActivo, setFilterActivo] = useState<FilterActivo>("activo");
  const [optimistic, setOptimistic] = useState<Map<string, Partial<PuestoCatalogo>>>(new Map());
  const [, startTransition] = useTransition();
  const { sortKey, sortDir, handleSort } = useSortState<"clave" | "nombre" | "organización" | "segmento_organizacional" | "tipo_vacante" | "titulares_count" | "sucesion_count">("nombre");

  // Edit/approve modal state
  const [editingPuesto, setEditingPuesto] = useState<PuestoCatalogo | null>(null);
  const [editFields, setEditFields] = useState<PuestoEditFields>({
    nombre: "", clave: null, organización: null, area: null,
    segmento_organizacional: null, tipo_vacante: null, es_critico: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  function openModal(p: PuestoCatalogo) {
    setEditingPuesto(p);
    setEditFields({
      nombre: p.nombre,
      clave: p.clave ?? null,
      organización: p.organización ?? null,
      area: p.area ?? null,
      segmento_organizacional: p.segmento_organizacional ?? null,
      tipo_vacante: p.tipo_vacante ?? null,
      es_critico: p.es_critico,
    });
    setModalError(null);
  }

  function closeModal() {
    setEditingPuesto(null);
    setModalError(null);
  }

  async function handleGuardar() {
    if (!editingPuesto) return;
    setIsSaving(true);
    setModalError(null);
    const res = await editarPuesto(editingPuesto.id, editFields);
    setIsSaving(false);
    if (res.error) { setModalError(res.error); return; }
    setOptimistic((prev) => {
      const next = new Map(prev);
      next.set(editingPuesto.id, {
        ...(next.get(editingPuesto.id) ?? {}),
        nombre: editFields.nombre.trim().toUpperCase(),
        clave: editFields.clave?.trim() || null,
        organización: editFields.organización,
        area: editFields.area?.trim() || null,
        segmento_organizacional: editFields.segmento_organizacional || null,
        tipo_vacante: editFields.tipo_vacante || null,
        es_critico: editFields.es_critico,
      });
      return next;
    });
    closeModal();
  }

  async function handleAprobar() {
    if (!editingPuesto) return;
    setIsSaving(true);
    setModalError(null);
    const res = await aprobarPuesto(editingPuesto.id, editFields);
    setIsSaving(false);
    if (res.error) { setModalError(res.error); return; }
    setOptimistic((prev) => {
      const next = new Map(prev);
      next.set(editingPuesto.id, {
        ...(next.get(editingPuesto.id) ?? {}),
        nombre: editFields.nombre.trim().toUpperCase(),
        clave: editFields.clave?.trim()?.toUpperCase() || null,
        organización: editFields.organización,
        area: editFields.area?.trim() || null,
        segmento_organizacional: editFields.segmento_organizacional || null,
        tipo_vacante: editFields.tipo_vacante || null,
        es_critico: editFields.es_critico,
        propuesto: false,
        activo: true,
      });
      return next;
    });
    closeModal();
  }

  function getField<K extends keyof PuestoCatalogo>(p: PuestoCatalogo, key: K): PuestoCatalogo[K] {
    return optimistic.get(p.id)?.[key] !== undefined
      ? (optimistic.get(p.id)![key] as PuestoCatalogo[K])
      : p[key];
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = puestos.filter((p) => {
      const critico   = getField(p, "es_critico");
      const activo    = getField(p, "activo");
      const propuesto = getField(p, "propuesto");
      if (filterActivo === "activo"    && (!activo || propuesto)) return false;
      if (filterActivo === "inactivo"  && (activo || propuesto))  return false;
      if (filterActivo === "propuesto" && !propuesto)             return false;
      if (filterCritico === "si" && !critico) return false;
      if (filterCritico === "no" && critico)  return false;
      if (filterUen      && p.organización !== filterUen)               return false;
      if (filterSegmento && p.segmento_organizacional !== filterSegmento) return false;
      if (filterTipo     && p.tipo_vacante !== filterTipo)              return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !(p.clave ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === "titulares_count" || sortKey === "sucesion_count")
        return dir * (a[sortKey] - b[sortKey]);
      return dir * ((a[sortKey] ?? "") as string).localeCompare((b[sortKey] ?? "") as string, "es");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestos, search, filterUen, filterSegmento, filterTipo, filterCritico, filterActivo, optimistic, sortKey, sortDir]);

  const criticosCount  = filtered.filter((p) => getField(p, "es_critico")).length;
  const sinTitular     = filtered.filter((p) => p.titulares_count === 0).length;
  const propuestosCount = filtered.filter((p) => getField(p, "propuesto")).length;

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
        <Chip label="Total filtrados"  value={filtered.length}   color="gray" />
        <Chip label="Críticos"         value={criticosCount}     color="red" />
        <Chip label="Sin titular"      value={sinTitular}        color="orange" />
        {propuestosCount > 0 && (
          <Chip label="Propuestos"     value={propuestosCount}   color="violet" />
        )}
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
          <select value={filterActivo} onChange={(e) => setFilterActivo(e.target.value as FilterActivo)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="activo">Solo activos</option>
            <option value="inactivo">Solo inactivos</option>
            <option value="propuesto">Solo propuestos</option>
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

      {/* ── Mobile cards (< md) ─────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            No hay puestos que coincidan con los filtros
          </div>
        )}
        {filtered.map((p) => {
          const esCritico  = getField(p, "es_critico");
          const esActivo   = getField(p, "activo");
          const esPropuesto = getField(p, "propuesto");
          return (
            <div key={p.id}
              className={`bg-white rounded-xl border px-4 py-3 space-y-2 transition-opacity ${
                esPropuesto ? "border-violet-200" : !esActivo ? "opacity-50 border-gray-100" : esCritico ? "border-red-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-start gap-2">
                {esCritico && <span className="text-red-500 text-xs font-bold mt-0.5 flex-shrink-0">★</span>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{p.nombre}</p>
                    {esPropuesto && (
                      <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Propuesto</span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-gray-400 mt-0.5">{p.clave ?? "—"}</p>
                </div>
                <button
                  onClick={() => openModal(p)}
                  className="text-gray-400 hover:text-[#1a3a5c] transition-colors p-1"
                  title="Editar puesto"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {p.organización && (
                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.organización}</span>
                )}
                {p.segmento_organizacional && (
                  <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{p.segmento_organizacional}</span>
                )}
                {p.tipo_vacante && (
                  <span className={`px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[p.tipo_vacante] ?? "bg-gray-100 text-gray-700"}`}>
                    {p.tipo_vacante}
                  </span>
                )}
                {p.titulares_count > 0 && (
                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.titulares_count} titular{p.titulares_count !== 1 ? "es" : ""}</span>
                )}
                {p.sucesion_count > 0 && (
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{p.sucesion_count} plan{p.sucesion_count !== 1 ? "es" : ""}</span>
                )}
              </div>
              {!esPropuesto && (
                <div className="flex items-center gap-4 pt-1 border-t border-gray-50">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Toggle on={esCritico} onColor="bg-red-500" onClick={() => handleToggleCritico(p)} />
                    <span className="text-xs text-gray-500">Crítico</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Toggle on={esActivo} onColor="bg-green-500" onClick={() => handleToggleActivo(p)} />
                    <span className="text-xs text-gray-500">Activo</span>
                  </label>
                </div>
              )}
              {esPropuesto && (
                <div className="pt-1 border-t border-gray-50">
                  <button
                    onClick={() => openModal(p)}
                    className="text-xs font-medium text-violet-700 hover:text-violet-900 transition-colors"
                  >
                    Revisar y aprobar →
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-center pt-1">
            Mostrando {filtered.length} de {puestos.length} puestos
          </p>
        )}
      </div>

      {/* ── Desktop table (≥ md) ─────────────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                <SortableTh label="Clave"    sortKey="clave"                   currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 whitespace-nowrap" />
                <SortableTh label="Nombre"   sortKey="nombre"                  currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 min-w-[260px]" />
                <SortableTh label="UEN"      sortKey="organización"            currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 min-w-[140px]" />
                <SortableTh label="Segmento" sortKey="segmento_organizacional" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 min-w-[120px]" />
                <SortableTh label="Tipo"     sortKey="tipo_vacante"            currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 whitespace-nowrap" />
                <SortableTh label="Titulares" sortKey="titulares_count"        currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 text-center whitespace-nowrap" />
                <SortableTh label="Planes"   sortKey="sucesion_count"          currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 text-center whitespace-nowrap" />
                <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Crítico</th>
                <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Activo</th>
                <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                    No hay puestos que coincidan con los filtros
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const esCritico   = getField(p, "es_critico");
                const esActivo    = getField(p, "activo");
                const esPropuesto = getField(p, "propuesto");
                return (
                  <tr key={p.id} className={`hover:bg-gray-50/60 transition-colors ${esPropuesto ? "bg-violet-50/30" : !esActivo ? "opacity-50" : ""} ${esCritico && !esPropuesto ? "bg-red-50/20" : ""}`}>
                    <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">{p.clave ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {esCritico && <span className="text-red-500 text-[10px] font-bold flex-shrink-0">★</span>}
                        <span className="leading-snug">{p.nombre}</span>
                        {esPropuesto && (
                          <span className="text-[9px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">Propuesto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 leading-snug">{p.organización ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 leading-snug">{p.segmento_organizacional ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.tipo_vacante
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${TIPO_COLORS[p.tipo_vacante] ?? "bg-gray-100 text-gray-700"}`}>
                            {p.tipo_vacante}
                          </span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.titulares_count > 0
                        ? <span className="text-gray-700 font-medium">{p.titulares_count}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.sucesion_count > 0
                        ? <span className="text-green-600 font-medium">{p.sucesion_count}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {esPropuesto
                        ? <span className="text-gray-200">—</span>
                        : <Toggle on={esCritico} onColor="bg-red-500"
                            onClick={() => handleToggleCritico(p)}
                            title={esCritico ? "Quitar de críticos" : "Marcar como crítico"}
                          />
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {esPropuesto
                        ? <span className="text-gray-200">—</span>
                        : <Toggle on={esActivo} onColor="bg-green-500"
                            onClick={() => handleToggleActivo(p)}
                            title={esActivo ? "Desactivar" : "Activar"}
                          />
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openModal(p)}
                          className="text-gray-400 hover:text-[#1a3a5c] transition-colors p-1 rounded"
                          title="Editar puesto"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {esPropuesto && (
                          <button
                            onClick={() => openModal(p)}
                            className="text-[10px] font-semibold text-violet-700 hover:text-violet-900 transition-colors px-2 py-0.5 rounded border border-violet-200 hover:border-violet-400 whitespace-nowrap"
                            title="Aprobar puesto"
                          >
                            Aprobar
                          </button>
                        )}
                      </div>
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

      {/* ── Edit / Approve Modal ─────────────────────────────────────────── */}
      {editingPuesto && (
        <EditModal
          puesto={editingPuesto}
          fields={editFields}
          setFields={setEditFields}
          uens={uens}
          segmentos={segmentos}
          tipos={tipos}
          isSaving={isSaving}
          error={modalError}
          onClose={closeModal}
          onGuardar={handleGuardar}
          onAprobar={editingPuesto.propuesto ? handleAprobar : undefined}
        />
      )}
    </div>
  );
}

// ── Edit/Approve Modal ──────────────────────────────────────────────────────

function EditModal({
  puesto,
  fields,
  setFields,
  uens,
  segmentos,
  tipos,
  isSaving,
  error,
  onClose,
  onGuardar,
  onAprobar,
}: {
  puesto: PuestoCatalogo;
  fields: PuestoEditFields;
  setFields: (f: PuestoEditFields) => void;
  uens: string[];
  segmentos: string[];
  tipos: string[];
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onGuardar: () => void;
  onAprobar?: () => void;
}) {
  function set<K extends keyof PuestoEditFields>(key: K, val: PuestoEditFields[K]) {
    setFields({ ...fields, [key]: val });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 pt-5 pb-4 border-b border-gray-100 ${puesto.propuesto ? "bg-violet-50" : ""}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                {puesto.propuesto ? "Revisar y aprobar puesto" : "Editar puesto"}
              </h2>
              {puesto.propuesto && (
                <p className="text-xs text-violet-600 mt-0.5">
                  Asigna una clave y completa los datos para aprobar este puesto propuesto.
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={fields.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
              placeholder="Nombre del puesto"
            />
          </div>

          {/* Clave */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Clave {puesto.propuesto && <span className="text-red-500">*</span>}
              {!puesto.propuesto && <span className="text-gray-400 font-normal ml-1">(opcional)</span>}
            </label>
            <input
              type="text"
              value={fields.clave ?? ""}
              onChange={(e) => set("clave", e.target.value || null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] font-mono"
              placeholder="Ej. GER-001"
            />
          </div>

          {/* UEN */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">UEN</label>
            <select
              value={fields.organización ?? ""}
              onChange={(e) => set("organización", e.target.value || null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
            >
              <option value="">— Sin UEN —</option>
              {uens.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Área */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Área</label>
            <input
              type="text"
              value={fields.area ?? ""}
              onChange={(e) => set("area", e.target.value || null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
              placeholder="Área o dirección"
            />
          </div>

          {/* Segmento */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Segmento organizacional</label>
            <select
              value={fields.segmento_organizacional ?? ""}
              onChange={(e) => set("segmento_organizacional", e.target.value || null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
            >
              <option value="">— Sin segmento —</option>
              {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Tipo vacante */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de vacante</label>
            <select
              value={fields.tipo_vacante ?? ""}
              onChange={(e) => set("tipo_vacante", e.target.value || null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
            >
              <option value="">— Sin tipo —</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Crítico */}
          <div className="flex items-center gap-3">
            <Toggle on={fields.es_critico} onColor="bg-red-500" onClick={() => set("es_critico", !fields.es_critico)} />
            <span className="text-sm text-gray-700">Puesto crítico</span>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-4 py-2"
          >
            Cancelar
          </button>
          <button
            onClick={onGuardar}
            disabled={isSaving}
            className="text-sm font-medium text-white bg-[#1a3a5c] hover:bg-[#15304d] disabled:opacity-50 transition-colors px-4 py-2 rounded-lg"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
          {onAprobar && (
            <button
              onClick={onAprobar}
              disabled={isSaving}
              className="text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors px-4 py-2 rounded-lg"
            >
              {isSaving ? "Aprobando…" : "Aprobar puesto"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small components ────────────────────────────────────────────────────────

function Toggle({ on, onColor, onClick, title }: { on: boolean; onColor: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`relative inline-flex w-10 h-[22px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#1a3a5c] ${
        on ? onColor : "bg-gray-300"
      }`}
    >
      <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${
        on ? "translate-x-[22px]" : "translate-x-[3px]"
      }`} />
    </button>
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
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return puestos
      .filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.clave ?? "").toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [puestos, value]);

  useEffect(() => {
    setActiveIdx(-1);
    setOpen(suggestions.length > 0);
  }, [suggestions]);

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
                  <span className="font-mono">{p.clave ?? "—"}</span>
                  {p.organización && <><span>·</span><span className="truncate">{p.organización}</span></>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {p.propuesto && (
                  <span className={`text-[9px] font-bold ${i === activeIdx ? "text-violet-200" : "text-violet-600"}`}>Propuesto</span>
                )}
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

function Chip({ label, value, color }: { label: string; value: number; color: "gray" | "red" | "orange" | "violet" }) {
  const cls = {
    gray:   "bg-white border-gray-200 text-gray-700",
    red:    "bg-red-50 border-red-200 text-red-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  }[color];
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-center ${cls}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
