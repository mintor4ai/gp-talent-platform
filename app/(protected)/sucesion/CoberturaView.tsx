"use client";

import { useState, useMemo } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";

export type SucesorItem = {
  sucesor_nombre: string;
  sucesor_id?: string | null;
  readiness: string | null;
  tiempo_estimado: string | null;
  estado: string;
  titular_id?: string | null;
  titular_nombre?: string | null;
};

export type TitularItem = {
  id: string;
  nombre_completo: string;
};

export type AspiranteItem = {
  colaborador_id: string;
  colaborador_nombre: string | null;
  tipo_match: "aspiracion" | "bidireccional";
};

export type MatchValidadoItem = {
  colaborador_id: string;
  colaborador_nombre: string | null;
  tipo_match: string;
  readiness: string | null;
};

export type PuestoCoberturaItem = {
  id: string;
  clave: string;
  nombre: string;
  organización: string | null;
  area: string | null;
  segmento_organizacional: string | null;
  tipo_vacante: string | null;
  es_critico: boolean;
  titulares: TitularItem[];
  sucesores: SucesorItem[];
  matchesValidados: MatchValidadoItem[];
  aspirantes: AspiranteItem[];
};

type RiesgoLevel = "sin_sucesor" | "tres_mas" | "listo" | "vacante";

function getRiesgo(p: PuestoCoberturaItem): RiesgoLevel {
  const hasCoverage = p.sucesores.length > 0 || p.matchesValidados.length > 0;
  if (p.titulares.length === 0 && !hasCoverage) return "vacante";
  if (!hasCoverage) return "sin_sucesor";
  const readinessValues = [
    ...p.sucesores.map((s) => s.readiness ?? s.tiempo_estimado ?? ""),
    ...p.matchesValidados.map((m) => m.readiness ?? ""),
  ];
  if (readinessValues.some((r) => r === "listo_ahora" || r === "uno_dos_anios")) return "listo";
  return "tres_mas";
}

const RIESGO_CONFIG: Record<RiesgoLevel, { label: string; color: string; dot: string; order: number }> = {
  sin_sucesor: { label: "Sin sucesor",  color: "bg-red-100 text-red-700",     dot: "bg-red-500",    order: 0 },
  tres_mas:    { label: "3+ años",       color: "bg-amber-100 text-amber-700", dot: "bg-amber-400",  order: 1 },
  listo:       { label: "Con sucesor",   color: "bg-green-100 text-green-700", dot: "bg-green-500",  order: 2 },
  vacante:     { label: "Vacante",         color: "bg-gray-100 text-gray-500",   dot: "bg-gray-400",   order: 3 },
};

const READINESS_LABEL: Record<string, string> = {
  listo_ahora:    "Inmediato",
  uno_dos_anios:  "Mediano Plazo",
  tres_mas_anios: "Largo Plazo",
};

const TIPO_COLORS: Record<string, string> = {
  Gerencial:      "bg-purple-100 text-purple-800",
  Administrativa: "bg-blue-100 text-blue-800",
  Operativa:      "bg-orange-100 text-orange-800",
};

const ESTADO_LABELS: Record<string, string> = {
  borrador:     "Borrador",
  pendiente_v1: "En revisión",
  pendiente_v2: "Pend. Dir.",
  aprobado:     "Aprobado",
  rechazado:    "Rechazado",
};

const ESTADO_COLORS: Record<string, string> = {
  borrador:     "bg-gray-100 text-gray-500",
  pendiente_v1: "bg-yellow-100 text-yellow-700",
  pendiente_v2: "bg-orange-100 text-orange-700",
  aprobado:     "bg-green-100 text-green-700",
  rechazado:    "bg-red-100 text-red-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type SucesorGroup = {
  key: string;
  sucesor_nombre: string;
  sucesor_id: string | null;
  readiness: string | null;
  estado: string;
  titulares: string[];
};

function groupSucesores(sucesores: SucesorItem[]): SucesorGroup[] {
  const map = new Map<string, SucesorGroup>();
  for (const s of sucesores) {
    const key = s.sucesor_id ?? s.sucesor_nombre;
    if (!map.has(key)) {
      map.set(key, {
        key,
        sucesor_nombre: s.sucesor_nombre,
        sucesor_id: s.sucesor_id ?? null,
        readiness: s.readiness ?? s.tiempo_estimado,
        estado: s.estado,
        titulares: [],
      });
    }
    const g = map.get(key)!;
    if (s.titular_nombre && !g.titulares.includes(s.titular_nombre)) {
      g.titulares.push(s.titular_nombre);
    }
    // Keep best readiness
    const order = ["listo_ahora", "uno_dos_anios", "tres_mas_anios"];
    const cur = s.readiness ?? s.tiempo_estimado ?? "";
    if (cur && (!g.readiness || order.indexOf(cur) < order.indexOf(g.readiness))) {
      g.readiness = cur;
    }
  }
  return Array.from(map.values());
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function PuestoDrawer({
  puesto,
  onClose,
}: {
  puesto: PuestoCoberturaItem;
  onClose: () => void;
}) {
  const riesgo = getRiesgo(puesto);
  const rCfg = RIESGO_CONFIG[riesgo];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {puesto.es_critico && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide">
                  Crítico
                </span>
              )}
              {puesto.tipo_vacante && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TIPO_COLORS[puesto.tipo_vacante] ?? "bg-gray-100 text-gray-600"}`}>
                  {puesto.tipo_vacante}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${rCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${rCfg.dot}`} />
                {rCfg.label}
              </span>
            </div>
            <h3 className="text-base font-bold text-gray-900 leading-snug">{puesto.nombre}</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{puesto.clave} · {puesto.organización ?? "Sin UEN"}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none flex-shrink-0 mt-0.5"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Titulares */}
          <Section title="Titular actual" count={puesto.titulares.length}>
            {puesto.titulares.length === 0 ? (
              <EmptyMsg>Puesto vacante — nadie ocupa esta posición actualmente.</EmptyMsg>
            ) : (
              <div className="space-y-1.5">
                {puesto.titulares.map((t) => (
                  <a
                    key={t.id}
                    href={`/carpeta/${t.id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-blue-50 hover:text-[#1a3a5c] transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[11px] font-bold">{t.nombre_completo.charAt(0)}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-800 truncate group-hover:text-[#1a3a5c]">
                        {t.nombre_completo}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-[#1a3a5c] flex-shrink-0">Ver carpeta →</span>
                  </a>
                ))}
              </div>
            )}
          </Section>

          {/* Sucesores formales */}
          {(() => {
            const grouped = groupSucesores(puesto.sucesores);
            return (
              <Section title="Sucesores propuestos" count={grouped.length} accent="blue">
                {grouped.length === 0 ? (
                  <EmptyMsg>No hay sucesores formalmente propuestos para este ciclo.</EmptyMsg>
                ) : (
                  <div className="space-y-2">
                    {grouped.map((g) => (
                      <div key={g.key} className="px-3 py-2.5 bg-blue-50/60 rounded-lg space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">{g.sucesor_nombre}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            {g.readiness && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${readinessBadgeColor(g.readiness)}`}>
                                {READINESS_LABEL[g.readiness] ?? g.readiness}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ESTADO_COLORS[g.estado] ?? "bg-gray-100 text-gray-500"}`}>
                              {ESTADO_LABELS[g.estado] ?? g.estado}
                            </span>
                          </div>
                        </div>
                        {g.titulares.length > 0 && (
                          <p className="text-[10px] text-gray-400 leading-snug">
                            <span className="font-medium text-gray-500">Propuesto por:</span>{" "}
                            {g.titulares.join(" · ")}
                          </p>
                        )}
                        {g.sucesor_id && (
                          <a href={`/carpeta/${g.sucesor_id}`}
                            className="text-[10px] text-[#1a3a5c] hover:underline block">
                            Ver carpeta del sucesor →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* Matches validados por CH */}
          <Section
            title="Matches validados por CH"
            count={puesto.matchesValidados.length}
            accent="violet"
            badge={puesto.matchesValidados.length > 0 ? "Motor de Matching" : undefined}
          >
            {puesto.matchesValidados.length === 0 ? (
              <EmptyMsg>No hay matches validados por Capital Humano para este ciclo.</EmptyMsg>
            ) : (
              <div className="space-y-2">
                {puesto.matchesValidados.map((m) => (
                  <a
                    key={m.colaborador_id}
                    href={`/carpeta/${m.colaborador_id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 bg-violet-50/70 rounded-lg hover:bg-violet-100/80 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[11px] font-bold">
                          {(m.colaborador_nombre ?? "?").charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{m.colaborador_nombre ?? "—"}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold text-violet-700">✓ Validado por CH</span>
                          {m.readiness && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${readinessBadgeColor(m.readiness)}`}>
                              {READINESS_LABEL[m.readiness] ?? m.readiness}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-violet-700 flex-shrink-0">Ver carpeta →</span>
                  </a>
                ))}
              </div>
            )}
          </Section>

          {/* Aspirantes del Motor */}
          <Section
            title="Aspirantes detectados por el Motor"
            count={puesto.aspirantes.length}
            accent="emerald"
            badge={puesto.aspirantes.length > 0 ? "Motor de Matching" : undefined}
          >
            {puesto.aspirantes.length === 0 ? (
              <EmptyMsg>
                Ningún colaborador tiene este puesto como aspiración en su PICD para este ciclo.
                Si conoces candidatos potenciales, revisa el Motor de Matching o actualiza el PICD.
              </EmptyMsg>
            ) : (
              <div className="space-y-2">
                {puesto.aspirantes.map((a) => (
                  <a
                    key={a.colaborador_id}
                    href={`/carpeta/${a.colaborador_id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 bg-emerald-50/70 rounded-lg hover:bg-emerald-100/80 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[11px] font-bold">
                          {(a.colaborador_nombre ?? "?").charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {a.colaborador_nombre ?? "—"}
                        </p>
                        <span className={`text-[10px] font-semibold ${
                          a.tipo_match === "bidireccional"
                            ? "text-emerald-700"
                            : "text-blue-600"
                        }`}>
                          {a.tipo_match === "bidireccional" ? "✓ Bidireccional" : "Aspiración PICD"}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-emerald-700 flex-shrink-0">Ver carpeta →</span>
                  </a>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Footer actions */}
        {(puesto.aspirantes.length > 0 || (puesto.sucesores.length === 0 && puesto.matchesValidados.length === 0)) && (
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 space-y-2">
            {puesto.sucesores.length === 0 && puesto.matchesValidados.length === 0 && puesto.aspirantes.length > 0 && (
              <p className="text-xs text-amber-700 font-medium">
                Este puesto tiene aspirantes pero ningún plan formal. Considera abrir un proceso de sucesión.
              </p>
            )}
            {puesto.sucesores.length === 0 && puesto.matchesValidados.length === 0 && puesto.aspirantes.length === 0 && puesto.es_critico && (
              <p className="text-xs text-red-700 font-medium">
                Puesto crítico sin pipeline. Requiere acción inmediata de Capital Humano.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Section({
  title, count, accent = "gray", badge, children,
}: {
  title: string; count: number; accent?: "gray" | "blue" | "emerald" | "violet";
  badge?: string; children: React.ReactNode;
}) {
  const headerColor = {
    gray:    "text-gray-500 border-gray-200",
    blue:    "text-blue-700 border-blue-200",
    emerald: "text-emerald-700 border-emerald-200",
    violet:  "text-violet-700 border-violet-200",
  }[accent];
  return (
    <div className="px-5 py-4 border-b border-gray-100 last:border-b-0">
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${headerColor}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          accent === "violet"  ? "bg-violet-100 text-violet-700" :
          accent === "emerald" ? "bg-emerald-100 text-emerald-700" :
          accent === "blue"    ? "bg-blue-100 text-blue-700" :
          "bg-gray-100 text-gray-500"
        }`}>
          {count}
        </span>
        {badge && (
          <span className="ml-auto text-[10px] text-gray-400 font-medium">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 italic leading-relaxed">{children}</p>;
}

// ── Main view ─────────────────────────────────────────────────────────────────

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
  const [filterCritico,     setFilterCritico]     = useState<"" | "si" | "no">("si");
  const [filterRiesgo,      setFilterRiesgo]       = useState<"" | RiesgoLevel>("");
  const [filterUen,         setFilterUen]           = useState("");
  const [filterArea,        setFilterArea]         = useState("");
  const [filterSegmento,    setFilterSegmento]     = useState("");
  const [filterTipoVacante, setFilterTipoVacante] = useState("");
  const [search,            setSearch]             = useState("");
  const [selected, setSelected] = useState<PuestoCoberturaItem | null>(null);
  const { sortKey, sortDir, handleSort } = useSortState<"nombre" | "organización" | "segmento_organizacional" | "sucesores" | "validados" | "aspirantes" | "riesgo">("riesgo");

  // Cascading option lists — each level filtered by the upstream selection
  const availableAreas = useMemo(
    () => Array.from(new Set(
      puestos
        .filter((p) => !filterUen || p.organización === filterUen)
        .map((p) => p.area)
        .filter(Boolean) as string[]
    )).sort(),
    [puestos, filterUen]
  );

  const availableSegmentos = useMemo(
    () => Array.from(new Set(
      puestos
        .filter((p) => !filterUen || p.organización === filterUen)
        .filter((p) => !filterArea || (p.area ?? "") === filterArea)
        .map((p) => p.segmento_organizacional)
        .filter(Boolean) as string[]
    )).sort(),
    [puestos, filterUen, filterArea]
  );

  const tiposDisponibles = useMemo(
    () => Array.from(new Set(puestos.map((p) => p.tipo_vacante).filter(Boolean) as string[])).sort(),
    [puestos]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = puestos.filter((p) => {
      if (filterCritico === "si" && !p.es_critico) return false;
      if (filterCritico === "no" && p.es_critico)  return false;
      if (filterUen         && p.organización          !== filterUen)         return false;
      if (filterArea        && (p.area ?? "")           !== filterArea)        return false;
      if (filterSegmento    && (p.segmento_organizacional ?? "") !== filterSegmento) return false;
      if (filterTipoVacante && (p.tipo_vacante ?? "")   !== filterTipoVacante) return false;
      if (filterRiesgo      && getRiesgo(p)              !== filterRiesgo)      return false;
      if (q && !p.nombre.toLowerCase().includes(q) && !p.clave.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "nombre":                   return dir * a.nombre.localeCompare(b.nombre, "es");
        case "organización":             return dir * (a.organización ?? "").localeCompare(b.organización ?? "", "es");
        case "segmento_organizacional":  return dir * (a.segmento_organizacional ?? "").localeCompare(b.segmento_organizacional ?? "", "es");
        case "sucesores":   return dir * (a.sucesores.length - b.sucesores.length);
        case "validados":   return dir * (a.matchesValidados.length - b.matchesValidados.length);
        case "aspirantes":  return dir * (a.aspirantes.length - b.aspirantes.length);
        case "riesgo":
        default:
          if (a.es_critico !== b.es_critico) return a.es_critico ? -1 : 1;
          return dir * (RIESGO_CONFIG[getRiesgo(a)].order - RIESGO_CONFIG[getRiesgo(b)].order);
      }
    });
  }, [puestos, filterCritico, filterRiesgo, filterUen, filterArea, filterSegmento, filterTipoVacante, search, sortKey, sortDir]);

  const conSucesor   = filtered.filter((p) => p.sucesores.length > 0 || p.matchesValidados.length > 0).length;
  const sinSucesor   = filtered.filter((p) => p.sucesores.length === 0 && p.matchesValidados.length === 0 && p.titulares.length > 0).length;
  const conAspirante = filtered.filter((p) => p.sucesores.length === 0 && p.matchesValidados.length === 0 && p.aspirantes.length > 0).length;
  const coberturaPct = filtered.length ? Math.round((conSucesor / filtered.length) * 100) : 0;

  return (
    <div className="space-y-5 max-w-6xl">
      {selected && (
        <PuestoDrawer puesto={selected} onClose={() => setSelected(null)} />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cobertura por Puesto</h2>
          <p className="text-sm text-gray-500 mt-0.5">Visibilidad de planes de sucesión ligados al catálogo de puestos</p>
        </div>
        {ciclosDisponibles.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">Ciclo:</span>
            {ciclosDisponibles.map((c) => (
              <button key={c} onClick={() => onCicloChange(c)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  cicloActual === c ? "bg-[#1a3a5c] text-white border-[#1a3a5c]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}>
                {c}
              </button>
            ))}
            <button onClick={() => onCicloChange("todos")}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                cicloActual === "todos" ? "bg-[#1a3a5c] text-white border-[#1a3a5c]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}>
              Todos
            </button>
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <CoverageChip label="Puestos"           value={filtered.length} pct={null}         color="gray"   />
        <CoverageChip label="Con sucesor"        value={conSucesor}      pct={coberturaPct} color="green"  />
        <CoverageChip label="Sin sucesor"        value={sinSucesor}      pct={null}         color="red"    />
        {conAspirante > 0 && (
          <CoverageChip label="Sin plan · con aspirantes" value={conAspirante} pct={null} color="amber" />
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">

        {/* Row 1 — search + dropdowns */}
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar puesto o clave..."
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] min-w-[180px] flex-1" />
          <select value={filterUen} onChange={(e) => { setFilterUen(e.target.value); setFilterArea(""); setFilterSegmento(""); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">Todas las UEN</option>
            {uens.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {availableAreas.length > 0 && (
            <select value={filterArea} onChange={(e) => { setFilterArea(e.target.value); setFilterSegmento(""); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
              <option value="">Todas las Áreas</option>
              {availableAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {availableSegmentos.length > 0 && (
            <select value={filterSegmento} onChange={(e) => setFilterSegmento(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
              <option value="">Todos los segmentos</option>
              {availableSegmentos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {(search || filterCritico !== "si" || filterUen || filterArea || filterRiesgo || filterSegmento || filterTipoVacante) && (
            <button
              onClick={() => { setSearch(""); setFilterCritico("si"); setFilterUen(""); setFilterArea(""); setFilterRiesgo(""); setFilterSegmento(""); setFilterTipoVacante(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline px-1">
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Row 2 — tipo vacante chips + solo críticos toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">Tipo:</span>
          <button
            onClick={() => setFilterTipoVacante("")}
            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
              filterTipoVacante === ""
                ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
                : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"
            }`}>
            Todos
          </button>
          {tiposDisponibles.map((t) => {
            const count = puestos.filter((p) => p.tipo_vacante === t).length;
            return (
              <button key={t}
                onClick={() => setFilterTipoVacante(filterTipoVacante === t ? "" : t)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  filterTipoVacante === t
                    ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
                    : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"
                }`}>
                {t} <span className="opacity-60 ml-0.5">{count}</span>
              </button>
            );
          })}

          <div className="ml-auto">
            <button
              onClick={() => setFilterCritico(filterCritico === "si" ? "" : "si")}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors flex items-center gap-1 ${
                filterCritico === "si"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "text-gray-400 border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <span className="text-red-500">★</span> Solo críticos
            </button>
          </div>
        </div>

        {/* Row 3 — cobertura/riesgo status buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">Cobertura:</span>
          {([["", "Todos"], ["sin_sucesor", "Sin sucesor 🔴"], ["tres_mas", "3+ años 🟡"], ["listo", "Con sucesor 🟢"], ["vacante", "Vacante ⚪"]] as [string, string][]).map(([val, label]) => (
            <button key={val}
              onClick={() => setFilterRiesgo(val as "" | RiesgoLevel)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                filterRiesgo === val
                  ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
                  : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                <SortableTh label="Puesto" sortKey="nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-3 py-3" />
                <SortableTh label="UEN" sortKey="organización" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-3 py-3 hidden md:table-cell" />
                <SortableTh label="Segmento" sortKey="segmento_organizacional" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-3 py-3 hidden lg:table-cell" />
                <th className="px-3 py-3 font-medium hidden xl:table-cell">Titular(es)</th>
                <SortableTh label="Suc." sortKey="sucesores" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-3 text-center" />
                <SortableTh label="Val." sortKey="validados" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-3 text-center" />
                <SortableTh label="Asp." sortKey="aspirantes" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-3 text-center" />
                <th className="px-3 py-3 font-medium hidden lg:table-cell">Readiness</th>
                <SortableTh label="Riesgo" sortKey="riesgo" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-3 py-3 text-center" />
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-sm text-gray-400">
                    No hay puestos que coincidan con los filtros
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const riesgo = getRiesgo(p);
                const rCfg   = RIESGO_CONFIG[riesgo];
                const bestReadiness = getBestReadiness(p.sucesores);
                const isSelected = selected?.id === p.id;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#1a3a5c]/5 border-l-2 border-l-[#1a3a5c]"
                        : p.es_critico
                        ? "bg-red-50/10 hover:bg-blue-50/30"
                        : "hover:bg-blue-50/30"
                    }`}
                  >
                    <td className="px-3 py-3 font-medium text-gray-800 max-w-[200px]">
                      <div className="flex items-start gap-1.5">
                        {p.es_critico && <span className="text-red-500 text-[10px] font-bold mt-0.5 flex-shrink-0">★</span>}
                        <span className="break-words leading-snug">{p.nombre}</span>
                      </div>
                      <span className="font-mono text-gray-400 text-[10px]">{p.clave}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap hidden md:table-cell">{p.organización ?? "—"}</td>
                    <td className="px-3 py-3 text-gray-500 hidden lg:table-cell">
                      {p.segmento_organizacional
                        ? <span className="text-[11px]">{p.segmento_organizacional}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-gray-600 hidden xl:table-cell">
                      {p.titulares.length === 0
                        ? <span className="text-gray-400 italic text-[11px]">Vacante</span>
                        : p.titulares.map((t) => (
                            <span key={t.id} className="block text-[11px] truncate max-w-[160px]">{t.nombre_completo}</span>
                          ))}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {p.sucesores.length > 0
                        ? <span className="font-semibold text-gray-700">
                            {new Set(p.sucesores.map((s) => s.sucesor_id ?? s.sucesor_nombre)).size}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {p.matchesValidados.length > 0
                        ? <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                            {p.matchesValidados.length}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {p.aspirantes.length > 0 ? (
                        <span className={`inline-flex items-center gap-1 font-semibold text-[11px] px-1.5 py-0.5 rounded-full ${
                          p.aspirantes.some((a) => a.tipo_match === "bidireccional")
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {p.aspirantes.length}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 hidden lg:table-cell">
                      {bestReadiness
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${readinessBadgeColor(bestReadiness)}`}>
                            {READINESS_LABEL[bestReadiness] ?? bestReadiness}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${rCfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rCfg.dot}`} />
                        {rCfg.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-gray-400 text-center">
                      <span className={`text-xs transition-colors ${isSelected ? "text-[#1a3a5c] font-bold" : "group-hover:text-gray-600"}`}>›</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            Mostrando {filtered.length} de {puestos.length} puestos · {coberturaPct}% con cobertura
            {conAspirante > 0 && <span className="text-amber-600 ml-2">· {conAspirante} sin plan pero con aspirantes detectados</span>}
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

function CoverageChip({ label, value, pct, color }: { label: string; value: number; pct: number | null; color: "gray" | "green" | "red" | "amber" }) {
  const cls = {
    gray:  "bg-white border-gray-200 text-gray-700",
    green: "bg-green-50 border-green-200 text-green-700",
    red:   "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
  }[color];
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-center min-w-[100px] ${cls}`}>
      <p className="text-xl font-bold">{value}{pct !== null ? ` (${pct}%)` : ""}</p>
      <p className="text-[10px] opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
