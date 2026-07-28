"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  sincronizarTalentoClave,
  promoverTalentoClave,
  removerTalentoClave,
} from "@/app/actions/talento_clave";

type Row = {
  colaborador_id: string;
  nombre_completo: string;
  puesto: string | null;
  organización: string | null;
  segmento_organizacional: string | null;
  area: string | null;
  es_talento_clave: boolean;
  fuente: string;
  zona_eip: string | null;
};

type ColaboradorOption = {
  id: string;
  nombre_completo: string;
  puesto: string | null;
  organización: string | null;
  zona_eip: string | null;
  ya_es_tc: boolean;
};

type LogRow = {
  id: string;
  colaborador_id: string;
  colaborador_nombre: string;
  ciclo_año: number;
  accion: string;
  justificacion: string;
  zona_eip: string | null;
  es_talento_clave_anterior: boolean | null;
  creado_por: string;
  creado_por_nombre: string;
  created_at: string;
};

type Props = {
  rows: Row[];
  logRows: LogRow[];
  cicloAño: number;
  allColaboradores: ColaboradorOption[];
};

const ZONA_COLORS: Record<string, { bg: string; text: string }> = {
  Sobresaliente: { bg: "bg-purple-100", text: "text-purple-700" },
  Desarrollo:    { bg: "bg-blue-100",   text: "text-blue-700"   },
};

type Tab       = "lista" | "log";
type FilterKey = "todos" | "tc" | "removidos";
type ModalState = { colaborador_id: string; nombre: string; accion: "promover" | "remover" } | null;

export default function TalentoClavePage({ rows, logRows, cicloAño, allColaboradores }: Props) {
  const [tab,       setTab]       = useState<Tab>("lista");
  const [isPending, startTransition] = useTransition();
  const [msg,       setMsg]       = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  // Justification modal (promote/remove from table row)
  const [modal,         setModal]         = useState<ModalState>(null);
  const [justificacion, setJustificacion] = useState("");

  // Add-collaborator modal
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [addSearch,      setAddSearch]      = useState("");
  const [addSelected,    setAddSelected]    = useState<ColaboradorOption | null>(null);
  const [addJustif,      setAddJustif]      = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterZona, setFilterZona] = useState<FilterKey>("todos");

  const { sortKey, sortDir, handleSort } = useSortState<
    "nombre" | "puesto" | "organización" | "zona_eip" | "fuente"
  >("nombre");

  const filteredRows = useMemo(() => {
    const base = rows.filter((r) => {
      if (filterZona === "tc")       return r.es_talento_clave;
      if (filterZona === "removidos") return !r.es_talento_clave && r.fuente === "manual";
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "nombre":       return dir * a.nombre_completo.localeCompare(b.nombre_completo, "es");
        case "puesto":       return dir * (a.puesto ?? "").localeCompare(b.puesto ?? "", "es");
        case "organización": return dir * (a.organización ?? "").localeCompare(b.organización ?? "", "es");
        case "zona_eip":     return dir * (a.zona_eip ?? "").localeCompare(b.zona_eip ?? "", "es");
        case "fuente":       return dir * a.fuente.localeCompare(b.fuente, "es");
        default: return 0;
      }
    });
  }, [rows, filterZona, sortKey, sortDir]);

  const tcCount     = rows.filter((r) => r.es_talento_clave).length;
  const manualCount = rows.filter((r) => r.es_talento_clave && r.fuente === "manual").length;

  // Search results for add modal
  const addResults = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return allColaboradores.slice(0, 50);
    return allColaboradores
      .filter((c) =>
        c.nombre_completo.toLowerCase().includes(q) ||
        (c.puesto ?? "").toLowerCase().includes(q) ||
        (c.organización ?? "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allColaboradores, addSearch]);

  // Focus search on open
  useEffect(() => {
    if (showAddModal) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showAddModal]);

  // Close add modal on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddModal) closeAddModal();
        else if (modal) closeModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddModal, modal]);

  function showMsg(texto: string, tipo: "ok" | "error" = "ok") {
    setMsg({ texto, tipo });
    setTimeout(() => setMsg(null), 4500);
  }

  function handleSincronizar() {
    if (!confirm(`¿Sincronizar Talento Clave desde EIP ${cicloAño}? Esto actualizará registros automáticos.`)) return;
    startTransition(async () => {
      const res = await sincronizarTalentoClave(cicloAño);
      if (res.ok) {
        showMsg(`Sincronizado: +${res.added} añadidos, -${res.removed} removidos.`);
      } else {
        showMsg(res.error ?? "Error al sincronizar", "error");
      }
    });
  }

  // ── Row action modal ──────────────────────────────────────────────────────────
  function openModal(row: Row, accion: "promover" | "remover") {
    setModal({ colaborador_id: row.colaborador_id, nombre: row.nombre_completo, accion });
    setJustificacion("");
  }
  function closeModal() { setModal(null); setJustificacion(""); }

  function handleConfirmModal() {
    if (!modal || !justificacion.trim()) return;
    const { colaborador_id, accion } = modal;
    closeModal();
    startTransition(async () => {
      const res = accion === "promover"
        ? await promoverTalentoClave(colaborador_id, cicloAño, justificacion.trim())
        : await removerTalentoClave(colaborador_id, cicloAño, justificacion.trim());
      if (res.ok) {
        showMsg(accion === "promover" ? "Colaborador promovido a Talento Clave." : "Colaborador removido de Talento Clave.");
      } else {
        showMsg(res.error ?? "Error al guardar", "error");
      }
    });
  }

  // ── Add-collaborator modal ────────────────────────────────────────────────────
  function closeAddModal() {
    setShowAddModal(false);
    setAddSearch("");
    setAddSelected(null);
    setAddJustif("");
  }

  function handleAddConfirm() {
    if (!addSelected || !addJustif.trim()) return;
    const id = addSelected.id;
    closeAddModal();
    startTransition(async () => {
      const res = await promoverTalentoClave(id, cicloAño, addJustif.trim());
      if (res.ok) {
        showMsg(`${addSelected.nombre_completo} promovido a Talento Clave.`);
      } else {
        showMsg(res.error ?? "Error al guardar", "error");
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Talento Clave</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ciclo {cicloAño} · {tcCount} talento clave identificado{tcCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            disabled={isPending}
            className="text-sm border border-[#1a3a5c] text-[#1a3a5c] px-4 py-2 rounded-lg hover:bg-[#1a3a5c]/5 disabled:opacity-50 font-medium transition-colors whitespace-nowrap"
          >
            + Promover colaborador
          </button>
          <button
            onClick={handleSincronizar}
            disabled={isPending}
            className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 font-medium transition-colors whitespace-nowrap"
          >
            {isPending ? "Procesando…" : "↻ Sincronizar desde EIP"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total TC</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{tcCount}</p>
        </div>
        <div className="bg-purple-50 rounded-xl border border-purple-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">Sobresaliente</p>
          <p className="text-3xl font-bold text-purple-700 mt-1">
            {rows.filter((r) => r.es_talento_clave && r.zona_eip === "Sobresaliente").length}
          </p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">Desarrollo</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">
            {rows.filter((r) => r.es_talento_clave && r.zona_eip === "Desarrollo").length}
          </p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Promovidos manualmente</p>
          <p className="text-3xl font-bold text-amber-700 mt-1">{manualCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["lista", "log"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-[#1a3a5c] text-[#1a3a5c]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "lista" ? "Lista actual" : "Historial de cambios"}
          </button>
        ))}
      </div>

      {/* Message banner */}
      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
          msg.tipo === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {msg.texto}
        </div>
      )}

      {/* ── Lista ── */}
      {tab === "lista" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
            {(["todos", "tc", "removidos"] as FilterKey[]).map((f) => {
              const labels: Record<FilterKey, string> = {
                todos:    "Todos",
                tc:       `Talento Clave (${tcCount})`,
                removidos: "Removidos manualmente",
              };
              return (
                <button
                  key={f}
                  onClick={() => setFilterZona(f)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    filterZona === f
                      ? "bg-[#1a3a5c] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-gray-400">{filteredRows.length} registros</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <SortableTh label="Colaborador" sortKey="nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
                  <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 hidden md:table-cell" />
                  <SortableTh label="UEN" sortKey="organización" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 hidden lg:table-cell" />
                  <SortableTh label="Zona EIP" sortKey="zona_eip" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
                  <SortableTh label="Fuente" sortKey="fuente" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 hidden sm:table-cell" />
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                      Sin registros para este filtro
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const zona = r.zona_eip;
                    const zonaColors = zona ? (ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-600" }) : null;
                    return (
                      <tr key={r.colaborador_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <a href={`/carpeta/${r.colaborador_id}`} className="font-medium text-gray-900 hover:text-[#1a3a5c] hover:underline">
                            {r.nombre_completo}
                          </a>
                        </td>
                        <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{r.puesto ?? "—"}</td>
                        <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{r.organización ?? "—"}</td>
                        <td className="px-5 py-3">
                          {zonaColors ? (
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${zonaColors.bg} ${zonaColors.text}`}>
                              {zona}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            r.fuente === "automatico"
                              ? "bg-gray-100 text-gray-500"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {r.fuente === "automatico" ? "Auto" : "Manual"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {r.es_talento_clave ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                              Talento Clave
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No activo</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {r.es_talento_clave ? (
                            <button
                              onClick={() => openModal(r, "remover")}
                              disabled={isPending}
                              className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40 transition-colors"
                            >
                              Remover
                            </button>
                          ) : (
                            <button
                              onClick={() => openModal(r, "promover")}
                              disabled={isPending}
                              className="text-xs text-[#1a3a5c] hover:underline font-medium disabled:opacity-40 transition-colors"
                            >
                              Promover
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-gray-50 flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
              Talento Clave activo este ciclo
            </span>
            <span className="text-xs text-gray-400">
              Auto = calculado desde EIP · Manual = promovido/removido por Capital Humano
            </span>
          </div>
        </div>
      )}

      {tab === "log" && <LogPanel logRows={logRows} />}

      {/* ── Justification modal (row action) ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              {modal.accion === "promover" ? "Promover a Talento Clave" : "Remover de Talento Clave"}
            </h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{modal.nombre}</span>
              {modal.accion === "promover"
                ? " será marcado como Talento Clave para este ciclo."
                : " será removido del listado de Talento Clave."}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Justificación <span className="text-red-500">*</span>
              </label>
              <textarea
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                rows={3}
                placeholder="Describe el motivo de este cambio…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleConfirmModal}
                disabled={isPending || !justificacion.trim()}
                className={`px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition-colors ${
                  modal.accion === "promover" ? "bg-[#1a3a5c] hover:bg-[#152e4d]" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {modal.accion === "promover" ? "Promover" : "Remover"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add-collaborator modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: "85vh" }}>
            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Promover colaborador a Talento Clave</h2>
              <p className="text-xs text-gray-400 mt-0.5">Busca a cualquier persona del directorio y agrégala con justificación.</p>
            </div>

            {/* Search + list */}
            <div className="px-6 pt-4 pb-2 space-y-3 flex-1 overflow-hidden flex flex-col">
              {/* Search input */}
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por nombre, puesto o UEN…"
                value={addSearch}
                onChange={(e) => { setAddSearch(e.target.value); setAddSelected(null); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c]"
              />

              {/* Results list */}
              {!addSelected && (
                <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {addResults.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">Sin resultados</p>
                  ) : (
                    addResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setAddSelected(c); setAddJustif(""); }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.nombre_completo}</p>
                          <p className="text-xs text-gray-400 truncate">{[c.puesto, c.organización].filter(Boolean).join(" · ")}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.zona_eip && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              ZONA_COLORS[c.zona_eip]?.bg ?? "bg-gray-100"
                            } ${ZONA_COLORS[c.zona_eip]?.text ?? "text-gray-600"}`}>
                              {c.zona_eip}
                            </span>
                          )}
                          {c.ya_es_tc && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              TC
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Selected: show card + justification */}
              {addSelected && (
                <div className="space-y-3">
                  {/* Selected card */}
                  <div className="flex items-start justify-between gap-3 bg-[#1a3a5c]/5 border border-[#1a3a5c]/20 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{addSelected.nombre_completo}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {[addSelected.puesto, addSelected.organización].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      onClick={() => setAddSelected(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
                    >
                      Cambiar
                    </button>
                  </div>

                  {addSelected.ya_es_tc && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Esta persona ya está marcada como Talento Clave en el ciclo {cicloAño}.
                      Puedes actualizar su justificación si lo deseas.
                    </p>
                  )}

                  {/* Justification */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Justificación <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={addJustif}
                      onChange={(e) => setAddJustif(e.target.value)}
                      rows={3}
                      placeholder="¿Por qué es Talento Clave esta persona?"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] resize-none"
                      autoFocus
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeAddModal} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleAddConfirm}
                disabled={isPending || !addSelected || !addJustif.trim()}
                className="px-4 py-2 text-sm bg-[#1a3a5c] text-white rounded-lg font-medium disabled:opacity-40 hover:bg-[#152e4d] transition-colors"
              >
                Promover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LogPanel({ logRows }: { logRows: LogRow[] }) {
  const { sortKey, sortDir, handleSort } = useSortState<
    "colaborador_nombre" | "accion" | "ciclo_año" | "creado_por_nombre" | "created_at"
  >("created_at", "desc");

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...logRows].sort((a, b) => {
      switch (sortKey) {
        case "colaborador_nombre": return dir * a.colaborador_nombre.localeCompare(b.colaborador_nombre, "es");
        case "accion":             return dir * a.accion.localeCompare(b.accion, "es");
        case "ciclo_año":          return dir * (a.ciclo_año - b.ciclo_año);
        case "creado_por_nombre":  return dir * a.creado_por_nombre.localeCompare(b.creado_por_nombre, "es");
        case "created_at":         return dir * a.created_at.localeCompare(b.created_at);
        default: return 0;
      }
    });
  }, [logRows, sortKey, sortDir]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <SectionHeader label="Historial de cambios manuales" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
              <SortableTh label="Colaborador" sortKey="colaborador_nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
              <SortableTh label="Ciclo" sortKey="ciclo_año" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 hidden sm:table-cell" />
              <SortableTh label="Acción" sortKey="accion" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
              <th className="px-5 py-3 font-medium hidden md:table-cell">Justificación</th>
              <SortableTh label="Por" sortKey="creado_por_nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 hidden lg:table-cell" />
              <SortableTh label="Fecha" sortKey="created_at" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">
                  Sin cambios manuales registrados
                </td>
              </tr>
            ) : (
              sorted.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{l.colaborador_nombre}</td>
                  <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">{l.ciclo_año}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      l.accion === "promover"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}>
                      {l.accion === "promover" ? "Promovido" : "Removido"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate hidden md:table-cell" title={l.justificacion}>
                    {l.justificacion}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs hidden lg:table-cell">{l.creado_por_nombre}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {new Date(l.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
