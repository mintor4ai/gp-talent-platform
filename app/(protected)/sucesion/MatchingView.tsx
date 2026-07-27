"use client";

import { useState, useTransition, useMemo } from "react";
import { recalcularMatches, validarMatch, descartarMatch, reactivarMatch } from "@/app/actions/sucesion_matches";

export type MatchRow = {
  id: string;
  ciclo_año: number;
  colaborador_id: string | null;
  titular_ids: string[];
  puesto_catalogo_id: string;
  tipo_match: "bidireccional" | "aspiracion" | "propuesta" | "gap_critico";
  readiness: string | null;
  es_puesto_critico: boolean;
  validado_ch: boolean | null;
  validado_por: string | null;
  fecha_validacion: string | null;
  descartado: boolean;
  descartado_por: string | null;
  fecha_descarte: string | null;
  created_at: string;
  // joined fields (populated server-side)
  colaborador_nombre?: string | null;
  titular_nombres?: string[];
  puesto_nombre?: string | null;
  puesto_org?: string | null;
};

const TIPO_CONFIG = {
  bidireccional: {
    label: "Bidireccional",
    description: "El colaborador aspira al puesto Y está propuesto como sucesor",
    color: "bg-emerald-50 border-emerald-300 text-emerald-800",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    order: 0,
  },
  aspiracion: {
    label: "Aspiración",
    description: "El colaborador aspira al puesto en su PICD",
    color: "bg-blue-50 border-blue-300 text-blue-800",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    order: 1,
  },
  propuesta: {
    label: "Propuesta",
    description: "El colaborador está propuesto como sucesor",
    color: "bg-violet-50 border-violet-300 text-violet-800",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    order: 2,
  },
  gap_critico: {
    label: "Gap crítico",
    description: "Puesto crítico sin sucesor propuesto",
    color: "bg-red-50 border-red-300 text-red-800",
    badge: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
    order: 3,
  },
} as const;

const READINESS_LABEL: Record<string, string> = {
  listo_ahora: "Listo ahora",
  uno_dos_anios: "1-2 años",
  tres_mas_anios: "3+ años",
};

function MatchCard({
  match,
  onValidar,
  onDescartar,
  onReactivar,
}: {
  match: MatchRow;
  onValidar: (id: string) => void;
  onDescartar: (id: string) => void;
  onReactivar: (id: string) => void;
}) {
  const cfg = TIPO_CONFIG[match.tipo_match];
  const isGap = match.tipo_match === "gap_critico";

  return (
    <div
      className={`rounded-xl border p-4 transition-opacity ${cfg.color} ${
        match.descartado ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Puesto */}
          <p className="font-semibold text-sm truncate">
            {match.puesto_nombre ?? "Puesto desconocido"}
          </p>
          {match.puesto_org && (
            <p className="text-xs opacity-70 mt-0.5">{match.puesto_org}</p>
          )}

          {/* Colaborador / gap info */}
          <div className="mt-2 space-y-0.5 text-xs">
            {!isGap && match.colaborador_nombre && (
              <div className="flex items-center gap-1.5">
                <span className="opacity-60">Colaborador:</span>
                <span className="font-medium">{match.colaborador_nombre}</span>
              </div>
            )}
            {match.titular_nombres && match.titular_nombres.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="opacity-60 flex-shrink-0">
                  {match.titular_nombres.length > 1 ? "Titulares:" : "Titular actual:"}
                </span>
                <span className="font-medium">{match.titular_nombres.join(", ")}</span>
              </div>
            )}
            {match.readiness && (
              <div className="flex items-center gap-1.5">
                <span className="opacity-60">Readiness:</span>
                <span className="font-medium">
                  {READINESS_LABEL[match.readiness] ?? match.readiness}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          {match.es_puesto_critico && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
              Crítico
            </span>
          )}
          {match.validado_ch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
              ✓ Validado
            </span>
          )}
          {match.descartado && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
              Descartado
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!match.descartado && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-10 flex gap-2">
          {!match.validado_ch && (
            <button
              onClick={() => onValidar(match.id)}
              className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-60 hover:bg-opacity-90 transition-colors border border-current border-opacity-20"
            >
              Validar
            </button>
          )}
          <button
            onClick={() => onDescartar(match.id)}
            className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-40 hover:bg-opacity-70 transition-colors border border-current border-opacity-20 text-opacity-70"
          >
            Descartar
          </button>
        </div>
      )}
      {match.descartado && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-10">
          <button
            onClick={() => onReactivar(match.id)}
            className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-60 hover:bg-opacity-90 transition-colors border border-current border-opacity-20"
          >
            Reactivar
          </button>
        </div>
      )}
    </div>
  );
}

export default function MatchingView({
  matches: initialMatches,
  ciclosDisponibles,
  uens,
}: {
  matches: MatchRow[];
  ciclosDisponibles: number[];
  uens: string[];
}) {
  const [matches, setMatches] = useState<MatchRow[]>(initialMatches);
  const [isPending, startTransition] = useTransition();
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const [selectedCiclo, setSelectedCiclo] = useState<number | "all">("all");
  const [selectedTipo, setSelectedTipo] = useState<string>("all");
  const [selectedUen, setSelectedUen] = useState<string>("all");
  const [showDescartados, setShowDescartados] = useState(false);
  const [recalcCiclo, setRecalcCiclo] = useState<number>(
    ciclosDisponibles[0] ?? new Date().getFullYear()
  );

  const handleRecalcular = () => {
    setRecalcMsg(null);
    startTransition(async () => {
      const result = await recalcularMatches(recalcCiclo);
      if (result.ok) {
        const counts = result.counts ?? {};
        setRecalcMsg(
          `Ciclo ${recalcCiclo}: ${counts.bidireccional ?? 0} bidireccional · ${counts.aspiracion ?? 0} aspiración · ${counts.propuesta ?? 0} propuesta · ${counts.gap_critico ?? 0} gap crítico`
        );
        setTimeout(() => window.location.reload(), 1800);
      } else {
        setRecalcMsg(`Error: ${result.error}`);
      }
    });
  };

  const handleValidar = (id: string) => {
    startTransition(async () => {
      const result = await validarMatch(id);
      if (result.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, validado_ch: true } : m
          )
        );
      }
    });
  };

  const handleDescartar = (id: string) => {
    startTransition(async () => {
      const result = await descartarMatch(id);
      if (result.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, descartado: true } : m
          )
        );
      }
    });
  };

  const handleReactivar = (id: string) => {
    startTransition(async () => {
      const result = await reactivarMatch(id);
      if (result.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, descartado: false } : m
          )
        );
      }
    });
  };

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (!showDescartados && m.descartado) return false;
      if (selectedCiclo !== "all" && m.ciclo_año !== selectedCiclo) return false;
      if (selectedTipo !== "all" && m.tipo_match !== selectedTipo) return false;
      if (selectedUen !== "all" && m.puesto_org !== selectedUen) return false;
      return true;
    });
  }, [matches, showDescartados, selectedCiclo, selectedTipo, selectedUen]);

  // Summary counts (active only)
  const activeCounts = useMemo(() => {
    const base = matches.filter((m) => !m.descartado);
    return {
      bidireccional: base.filter((m) => m.tipo_match === "bidireccional").length,
      aspiracion: base.filter((m) => m.tipo_match === "aspiracion").length,
      propuesta: base.filter((m) => m.tipo_match === "propuesta").length,
      gap_critico: base.filter((m) => m.tipo_match === "gap_critico").length,
    };
  }, [matches]);

  const gapsCriticos = filtered.filter((m) => m.tipo_match === "gap_critico" && !m.descartado);

  return (
    <div className="space-y-5">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIPO_CONFIG) as (keyof typeof TIPO_CONFIG)[]).map((tipo) => {
          const cfg = TIPO_CONFIG[tipo];
          return (
            <button
              key={tipo}
              onClick={() => setSelectedTipo(selectedTipo === tipo ? "all" : tipo)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                selectedTipo === tipo
                  ? cfg.badge + " ring-2 ring-offset-1 ring-current"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
              <span className="font-bold">{activeCounts[tipo]}</span>
            </button>
          );
        })}
      </div>

      {/* Filters + Recalcular */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={String(selectedCiclo)}
          onChange={(e) =>
            setSelectedCiclo(e.target.value === "all" ? "all" : parseInt(e.target.value))
          }
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
        >
          <option value="all">Todos los ciclos</option>
          {ciclosDisponibles.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {uens.length > 0 && (
          <select
            value={selectedUen}
            onChange={(e) => setSelectedUen(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
          >
            <option value="all">Todas las UEN</option>
            {uens.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDescartados}
            onChange={(e) => setShowDescartados(e.target.checked)}
            className="rounded"
          />
          Mostrar descartados
        </label>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={recalcCiclo}
            onChange={(e) => setRecalcCiclo(parseInt(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
          >
            {ciclosDisponibles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={handleRecalcular}
            disabled={isPending}
            className="text-sm px-4 py-1.5 rounded-lg font-medium bg-[#1a3a5c] text-white hover:bg-[#152e4a] disabled:opacity-60 transition-colors"
          >
            {isPending ? "Calculando…" : "Recalcular matches"}
          </button>
        </div>
      </div>

      {recalcMsg && (
        <div className="text-sm px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700">
          {recalcMsg}
        </div>
      )}

      {/* Gaps críticos alert panel */}
      {gapsCriticos.length > 0 && selectedTipo === "all" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-800">
              {gapsCriticos.length} puesto{gapsCriticos.length !== 1 ? "s" : ""} crítico
              {gapsCriticos.length !== 1 ? "s" : ""} sin sucesor
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {gapsCriticos.map((g) => (
              <span
                key={g.id}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-700 border border-red-200 font-medium"
              >
                {g.puesto_nombre ?? "Puesto sin nombre"}
                {g.puesto_org ? ` · ${g.puesto_org}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Match grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No hay matches con los filtros seleccionados.</p>
          {matches.length === 0 && (
            <p className="text-xs mt-2">
              Usa <strong>Recalcular matches</strong> para generar el análisis del ciclo seleccionado.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered
            .sort(
              (a, b) =>
                TIPO_CONFIG[a.tipo_match].order - TIPO_CONFIG[b.tipo_match].order
            )
            .map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onValidar={handleValidar}
                onDescartar={handleDescartar}
                onReactivar={handleReactivar}
              />
            ))}
        </div>
      )}
    </div>
  );
}
