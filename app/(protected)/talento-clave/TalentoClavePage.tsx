"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  semaforo_movilidad: "verde" | "amarillo" | "rojo" | "sin_datos";
  meses_en_posicion: number | null;
  tiene_picd: boolean;
  estado_picd: string | null;
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

// Visual identity per fuente (analogous to SEMAFORO_CONFIG in movilidad)
const FUENTE_CONFIG: Record<string, { stripe: string; bg: string; text: string; label: string }> = {
  auto:      { stripe: "#22c55e", bg: "bg-green-50",  text: "text-green-700",  label: "Auto EIP"  },
  manual_ch: { stripe: "#fbbf24", bg: "bg-amber-50",  text: "text-amber-700",  label: "Manual CH" },
};
const REMOVED_STRIPE = "#d1d5db";

// Movilidad semáforo colors (same as MovilidadView)
const MOV_STRIPE: Record<string, string> = {
  verde:     "#22c55e",
  amarillo:  "#fbbf24",
  rojo:      "#ef4444",
  sin_datos: "#d1d5db",
};
const MOV_LABEL: Record<string, string> = {
  verde:     "En adaptación",
  amarillo:  "Establecido",
  rojo:      "Alta permanencia",
  sin_datos: "Sin fecha",
};

function fmtMeses(m: number): string {
  if (m < 12) return `${m} mes${m !== 1 ? "es" : ""}`;
  return `${(m / 12).toFixed(1)} años`;
}

const PICD_LABEL: Record<string, string> = {
  abierto:   "activo",
  cerrado:   "cerrado",
  aprobado:  "aprobado",
  rechazado: "rechazado",
};

function getStripe(row: Row): string {
  if (!row.es_talento_clave) return REMOVED_STRIPE;
  return FUENTE_CONFIG[row.fuente]?.stripe ?? REMOVED_STRIPE;
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
    </svg>
  );
}

type Tab        = "lista" | "log";
type CardFilter = "" | "sobresaliente" | "desarrollo" | "manual" | "removidos";
type ModalState = { colaborador_id: string; nombre: string; accion: "promover" | "remover" } | null;

export default function TalentoClavePage({ rows, logRows, cicloAño, allColaboradores }: Props) {
  const router = useRouter();
  const [tab,       setTab]       = useState<Tab>("lista");
  const [isPending, startTransition] = useTransition();
  const [msg,       setMsg]       = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);

  // Justification modal (promote/remove from table row)
  const [modal,         setModal]         = useState<ModalState>(null);
  const [justificacion, setJustificacion] = useState("");

  // Add-collaborator modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch,    setAddSearch]    = useState("");
  const [addSelected,  setAddSelected]  = useState<ColaboradorOption | null>(null);
  const [addJustif,    setAddJustif]    = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterCard,    setFilterCard]    = useState<CardFilter>("");
  const [search,        setSearch]        = useState("");
  const [filterUen,     setFilterUen]     = useState("");
  const [filterZonaEip, setFilterZonaEip] = useState("");
  const [filterFuente,  setFilterFuente]  = useState("");

  const { sortKey, sortDir, handleSort } = useSortState<
    "nombre" | "puesto" | "organización" | "zona_eip" | "fuente"
  >("nombre");

  // Derived UEN list from rows
  const uens = useMemo(() => {
    const set = new Set(rows.map((r) => r.organización).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  // KPI counts
  const tcCount            = rows.filter((r) => r.es_talento_clave).length;
  const sobresalienteCount = rows.filter((r) => r.es_talento_clave && r.zona_eip === "Sobresaliente").length;
  const desarrolloCount    = rows.filter((r) => r.es_talento_clave && r.zona_eip === "Desarrollo").length;
  const manualCount        = rows.filter((r) => r.es_talento_clave && r.fuente === "manual_ch").length;
  const removidosCount     = rows.filter((r) => !r.es_talento_clave && r.fuente === "manual_ch").length;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rows.filter((r) => {
      // Base: what rows are visible depends on the active card
      if (filterCard === "removidos") {
        if (r.es_talento_clave || r.fuente !== "manual_ch") return false;
      } else {
        // All non-removidos cards show only active TC
        if (!r.es_talento_clave) return false;
        if (filterCard === "sobresaliente" && r.zona_eip !== "Sobresaliente") return false;
        if (filterCard === "desarrollo"    && r.zona_eip !== "Desarrollo")    return false;
        if (filterCard === "manual"        && r.fuente   !== "manual_ch")     return false;
      }

      // Dropdown filters (combinable on top of card)
      if (q && !r.nombre_completo.toLowerCase().includes(q) && !(r.puesto ?? "").toLowerCase().includes(q)) return false;
      if (filterUen     && r.organización !== filterUen)     return false;
      if (filterZonaEip && r.zona_eip     !== filterZonaEip) return false;
      if (filterFuente  && r.fuente       !== filterFuente)  return false;

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
  }, [rows, filterCard, search, filterUen, filterZonaEip, filterFuente, sortKey, sortDir]);

  const totalForCount = filterCard === "removidos" ? removidosCount : tcCount;

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

  useEffect(() => {
    if (showAddModal) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [showAddModal]);

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
        router.refresh();
        showMsg(`Sincronizado: +${res.added} añadidos, -${res.removed} removidos.`);
      } else {
        showMsg(res.error ?? "Error al sincronizar", "error");
      }
    });
  }

  function openModal(row: Row, accion: "promover" | "remover") {
    setModal({ colaborador_id: row.colaborador_id, nombre: row.nombre_completo, accion });
    setJustificacion("");
  }
  function closeModal() { setModal(null); setJustificacion(""); }

  function handleConfirmModal() {
    if (!modal || !justificacion.trim()) return;
    const { colaborador_id, accion } = modal;
    const justif = justificacion.trim();
    closeModal();
    startTransition(async () => {
      const res = accion === "promover"
        ? await promoverTalentoClave(colaborador_id, cicloAño, justif)
        : await removerTalentoClave(colaborador_id, cicloAño, justif);
      if (res.ok) {
        router.refresh();
        showMsg(accion === "promover" ? "Colaborador promovido a Talento Clave." : "Colaborador removido de Talento Clave.");
      } else {
        showMsg(res.error ?? "Error al guardar", "error");
      }
    });
  }

  function closeAddModal() {
    setShowAddModal(false);
    setAddSearch("");
    setAddSelected(null);
    setAddJustif("");
  }

  function handleAddConfirm() {
    if (!addSelected || !addJustif.trim()) return;
    const id     = addSelected.id;
    const nombre = addSelected.nombre_completo;
    const justif = addJustif.trim();
    closeAddModal();
    startTransition(async () => {
      const res = await promoverTalentoClave(id, cicloAño, justif);
      if (res.ok) {
        router.refresh();
        showMsg(`${nombre} promovido a Talento Clave.`);
      } else {
        showMsg(res.error ?? "Error al guardar", "error");
      }
    });
  }

  function clearFilters() {
    setSearch("");
    setFilterUen("");
    setFilterZonaEip("");
    setFilterFuente("");
    setFilterCard("");
  }

  const hasActiveFilters = search || filterUen || filterZonaEip || filterFuente;

  // KPI card definitions
  const kpiCards: { key: CardFilter; count: number; label: string; sublabel: string; dot: string }[] = [
    { key: "sobresaliente", count: sobresalienteCount, label: "Sobresaliente", sublabel: "Zona EIP",                 dot: "bg-purple-500" },
    { key: "desarrollo",    count: desarrolloCount,    label: "Desarrollo",    sublabel: "Zona EIP",                 dot: "bg-blue-500"   },
    { key: "manual",        count: manualCount,        label: "Manual CH",     sublabel: "Promovidos por Cap. Hum.", dot: "bg-amber-400"  },
    { key: "removidos",     count: removidosCount,     label: "Removidos",     sublabel: "Por Capital Humano",       dot: "bg-gray-400"   },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Talento Clave</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ciclo {cicloAño} · <span className="font-medium text-gray-700">{tcCount}</span> talento clave activo{tcCount !== 1 ? "s" : ""}
            {removidosCount > 0 && (
              <> · <span className="text-gray-400">{removidosCount} removido{removidosCount !== 1 ? "s" : ""}</span></>
            )}
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
        <>
          {/* KPI cards (clickable, like movilidad semáforo chips) */}
          <div className="flex flex-wrap gap-3">
            {kpiCards.map(({ key, count, label, sublabel, dot }) => {
              const active = filterCard === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilterCard(active ? "" : key)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    active
                      ? "border-gray-400 bg-white shadow-md ring-2 ring-gray-200"
                      : "border-gray-200 bg-white hover:shadow-sm"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                  <div>
                    <p className="text-2xl font-bold text-gray-900 leading-none">{count}</p>
                    <p className="text-[11px] font-semibold text-gray-700 mt-0.5">{label}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 max-w-[110px] leading-tight">{sublabel}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nombre o puesto..."
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 min-w-[200px] flex-1"
              />
              <select
                value={filterUen}
                onChange={(e) => setFilterUen(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              >
                <option value="">Todas las UEN</option>
                {uens.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select
                value={filterZonaEip}
                onChange={(e) => setFilterZonaEip(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              >
                <option value="">Toda zona EIP</option>
                <option value="Sobresaliente">Sobresaliente</option>
                <option value="Desarrollo">Desarrollo</option>
              </select>
              <select
                value={filterFuente}
                onChange={(e) => setFilterFuente(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              >
                <option value="">Toda fuente</option>
                <option value="auto">Auto EIP</option>
                <option value="manual_ch">Manual CH</option>
              </select>
              {(hasActiveFilters || filterCard) && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header: count + fuente legend */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{filteredRows.length}</span> de{" "}
                {totalForCount} {filterCard === "removidos" ? "removidos" : "activos"}
              </p>
              <div className="flex items-center gap-4">
                {Object.entries(FUENTE_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setFilterFuente(filterFuente === key ? "" : key)}
                    className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
                      filterFuente && filterFuente !== key ? "opacity-40" : "opacity-100"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.stripe }} />
                    <span className="text-gray-500">{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 select-none">
                    <th className="w-[3px] p-0" />
                    <SortableTh label="Colaborador" sortKey="nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                    <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 hidden md:table-cell" />
                    <SortableTh label="UEN" sortKey="organización" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 hidden lg:table-cell" />
                    <SortableTh label="Zona EIP" sortKey="zona_eip" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                    <th className="px-4 py-3 font-medium">Fuente / Plan</th>
                    <th className="px-4 py-3" />
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
                      const zonaColors = zona
                        ? (ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-600" })
                        : null;
                      const fuenteCfg = FUENTE_CONFIG[r.fuente];

                      return (
                        <tr key={r.colaborador_id} className="hover:bg-gray-50/60 transition-colors group">
                          {/* Color stripe */}
                          <td className="p-0 w-[3px]" style={{ backgroundColor: getStripe(r) }} />

                          <td className="pl-4 pr-3 py-3.5 font-medium text-gray-800 whitespace-nowrap">
                            {r.nombre_completo}
                          </td>

                          <td className="px-3 py-3.5 text-gray-500 hidden md:table-cell max-w-[180px]">
                            <span className="leading-snug line-clamp-2">{r.puesto ?? "—"}</span>
                          </td>

                          {/* UEN + segmento + movilidad indicator */}
                          <td className="px-3 py-3.5 hidden lg:table-cell min-w-[160px]">
                            {r.organización ? (
                              <span className="font-medium text-gray-700">{r.organización}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                            {r.segmento_organizacional && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">{r.segmento_organizacional}</span>
                            )}
                            {r.semaforo_movilidad !== "sin_datos" && r.meses_en_posicion !== null && (
                              <span className="flex items-center gap-1 mt-1" title={MOV_LABEL[r.semaforo_movilidad]}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: MOV_STRIPE[r.semaforo_movilidad] }} />
                                <span className="text-[9px] text-gray-400">{fmtMeses(r.meses_en_posicion)}</span>
                              </span>
                            )}
                          </td>

                          {/* Zona EIP */}
                          <td className="px-3 py-3.5">
                            {zonaColors ? (
                              <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${zonaColors.bg} ${zonaColors.text}`}>
                                {zona}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-[10px]">—</span>
                            )}
                          </td>

                          {/* Fuente (prominent) + PICD indicator */}
                          <td className="px-3 py-3.5">
                            {r.es_talento_clave && fuenteCfg ? (
                              <div className="flex flex-col gap-1.5">
                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full w-fit ${fuenteCfg.bg} ${fuenteCfg.text}`}>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: fuenteCfg.stripe }} />
                                  {fuenteCfg.label}
                                </span>
                                {r.tiene_picd && (
                                  <span className="inline-flex items-center gap-1 text-[9px] text-[#1a3a5c] font-medium">
                                    <span>✓</span>
                                    PICD {r.estado_picd ? (PICD_LABEL[r.estado_picd] ?? r.estado_picd) : ""}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">Removido</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <a
                                href={`/carpeta/${r.colaborador_id}`}
                                className="text-[11px] text-[#1a3a5c] opacity-0 group-hover:opacity-100 transition-opacity hover:underline whitespace-nowrap"
                              >
                                Ver carpeta →
                              </a>
                              {r.es_talento_clave ? (
                                <button
                                  onClick={() => openModal(r, "remover")}
                                  disabled={isPending}
                                  title="Remover de Talento Clave"
                                  className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                                >
                                  <TrashIcon />
                                </button>
                              ) : (
                                <button
                                  onClick={() => openModal(r, "promover")}
                                  disabled={isPending}
                                  title="Promover a Talento Clave"
                                  className="text-[#1a3a5c] hover:text-[#152e4d] disabled:opacity-40 transition-colors"
                                >
                                  <PlusCircleIcon />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer legend */}
            <div className="px-5 py-3 border-t border-gray-50 flex flex-wrap gap-x-5 gap-y-1">
              {Object.entries(FUENTE_CONFIG).map(([key, cfg]) => (
                <span key={key} className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.stripe }} />
                  {cfg.label} · {key === "auto" ? "calculado desde EIP" : "promovido/removido por Capital Humano"}
                </span>
              ))}
            </div>
          </div>
        </>
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
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Promover colaborador a Talento Clave</h2>
              <p className="text-xs text-gray-400 mt-0.5">Busca a cualquier persona del directorio y agrégala con justificación.</p>
            </div>

            <div className="px-6 pt-4 pb-2 space-y-3 flex-1 overflow-hidden flex flex-col">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por nombre, puesto o UEN…"
                value={addSearch}
                onChange={(e) => { setAddSearch(e.target.value); setAddSelected(null); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c]"
              />

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

              {addSelected && (
                <div className="space-y-3">
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
