"use client";

import { useState, useTransition, useMemo } from "react";
import {
  recalcularMatches,
  validarMatch,
  descartarMatch,
  reactivarMatch,
  updateMatchReadiness,
  getColaboradorMatchProfile,
} from "@/app/actions/sucesion_matches";
import type { ColaboradorMatchProfile } from "@/app/actions/sucesion_matches";

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

const ZONA_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
  D: "bg-red-100 text-red-700 border-red-200",
};

const READINESS_OPTIONS = [
  { value: "listo_ahora",    label: "Listo ahora",  color: "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200" },
  { value: "uno_dos_anios",  label: "1-2 años",     color: "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200" },
  { value: "tres_mas_anios", label: "3+ años",      color: "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200" },
];

function MatchCard({
  match,
  onValidar,
  onDescartar,
  onReactivar,
  onReadinessChange,
}: {
  match: MatchRow;
  onValidar: (id: string) => void;
  onDescartar: (id: string) => void;
  onReactivar: (id: string) => void;
  onReadinessChange: (id: string, readiness: string | null) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [profile, setProfile] = useState<ColaboradorMatchProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [localReadiness, setLocalReadiness] = useState<string | null>(match.readiness);

  const cfg = TIPO_CONFIG[match.tipo_match];
  const isGap = match.tipo_match === "gap_critico";

  const handleFlip = async () => {
    if (!flipped && !profile && match.colaborador_id) {
      setLoadingProfile(true);
      const result = await getColaboradorMatchProfile(match.colaborador_id);
      if (result.ok && result.data) setProfile(result.data);
      setLoadingProfile(false);
    }
    setFlipped((v) => !v);
  };

  const handleReadiness = async (value: string) => {
    const next = localReadiness === value ? null : value;
    setLocalReadiness(next);
    setSavingReadiness(true);
    const result = await updateMatchReadiness(match.id, next);
    if (result.ok) onReadinessChange(match.id, next);
    setSavingReadiness(false);
  };

  // ── Front face ──────────────────────────────────────────────────────────
  const front = (
    <div
      className={`absolute inset-0 rounded-xl border p-4 flex flex-col ${cfg.color} ${
        match.descartado ? "opacity-50" : ""
      }`}
      style={{ backfaceVisibility: "hidden" }}
    >
      <div className="flex items-start justify-between gap-3 flex-1">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm break-words leading-snug">
            {match.puesto_nombre ?? "Puesto desconocido"}
          </p>
          {match.puesto_org && (
            <p className="text-xs opacity-70 mt-0.5">{match.puesto_org}</p>
          )}
          <div className="mt-2 space-y-0.5 text-xs">
            {!isGap && match.colaborador_nombre && (
              <div className="flex items-start gap-1.5">
                <span className="opacity-60 flex-shrink-0">Colaborador:</span>
                <span className="font-medium break-words">{match.colaborador_nombre}</span>
              </div>
            )}
            {match.titular_nombres && match.titular_nombres.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="opacity-60 flex-shrink-0">
                  {match.titular_nombres.length > 1 ? "Titulares:" : "Titular:"}
                </span>
                <span className="font-medium break-words">{match.titular_nombres.join(", ")}</span>
              </div>
            )}
            {localReadiness && (
              <div className="flex items-center gap-1.5">
                <span className="opacity-60">Readiness:</span>
                <span className="font-medium">{READINESS_LABEL[localReadiness] ?? localReadiness}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.badge}`}>
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
      <div className="mt-3 pt-3 border-t border-current border-opacity-10 flex items-center gap-2">
        {!isGap && match.colaborador_id && (
          <button
            onClick={handleFlip}
            className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-70 hover:bg-opacity-100 transition-colors border border-current border-opacity-20"
          >
            {loadingProfile ? "…" : "Ver perfil →"}
          </button>
        )}
        {!match.descartado ? (
          <>
            {!match.validado_ch && (
              <button onClick={() => onValidar(match.id)}
                className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-60 hover:bg-opacity-90 transition-colors border border-current border-opacity-20">
                Validar
              </button>
            )}
            <button onClick={() => onDescartar(match.id)}
              className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-40 hover:bg-opacity-70 transition-colors border border-current border-opacity-20">
              Descartar
            </button>
          </>
        ) : (
          <button onClick={() => onReactivar(match.id)}
            className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-60 hover:bg-opacity-90 transition-colors border border-current border-opacity-20">
            Reactivar
          </button>
        )}
      </div>
    </div>
  );

  // ── Back face ───────────────────────────────────────────────────────────
  const back = (
    <div
      className="absolute inset-0 rounded-xl border border-gray-200 bg-white p-4 flex flex-col"
      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setFlipped(false)}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1">
          ← Volver
        </button>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {loadingProfile ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
          Cargando perfil…
        </div>
      ) : profile ? (
        <div className="flex-1 flex flex-col gap-3 overflow-auto">
          {/* Nombre + puesto */}
          <div>
            <p className="font-bold text-sm text-gray-900 break-words leading-snug">
              {profile.nombre_completo}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 break-words">
              {profile.puesto}{profile.nivel ? ` · ${profile.nivel}` : ""}
            </p>
          </div>

          {/* Datos demográficos */}
          <div className="grid grid-cols-2 gap-2">
            <StatChip label="Edad" value={profile.edad !== null ? `${profile.edad} años` : "—"} />
            <StatChip label="Antigüedad" value={profile.antiguedad !== null ? `${profile.antiguedad} año${profile.antiguedad !== 1 ? "s" : ""}` : "—"} />
          </div>

          {/* EIP + Desempeño */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                Potencial{profile.eip ? ` ${profile.eip.ciclo_año}` : ""}
              </p>
              {profile.eip ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm font-bold text-gray-800">
                    {profile.eip.total !== null ? profile.eip.total.toFixed(1) : "—"}
                  </span>
                  {profile.eip.zona && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${ZONA_COLORS[profile.eip.zona] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {profile.eip.zona}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm font-bold text-gray-300 mt-1">—</p>
              )}
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                Desempeño{profile.desempeno ? ` ${profile.desempeno.ciclo_año}` : ""}
              </p>
              <p className="text-sm font-bold text-gray-800 mt-1">
                {profile.desempeno?.calificacion !== null && profile.desempeno?.calificacion !== undefined
                  ? profile.desempeno.calificacion.toFixed(2)
                  : "—"}
              </p>
            </div>
          </div>

          {/* Readiness */}
          <div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">
              Readiness para este puesto {savingReadiness && <span className="normal-case">(guardando…)</span>}
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {READINESS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleReadiness(opt.value)}
                  disabled={savingReadiness}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all disabled:opacity-50 ${
                    localReadiness === opt.value
                      ? opt.color + " ring-2 ring-offset-1 ring-current"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
          No se pudo cargar el perfil.
        </div>
      )}
    </div>
  );

  return (
    <div style={{ perspective: "1000px" }} className="min-h-[260px]">
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          position: "relative",
          height: "100%",
          minHeight: "260px",
        }}
      >
        {front}
        {back}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
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
  const [soloCriticos, setSoloCriticos] = useState(false);
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

  const handleReadinessChange = (id: string, readiness: string | null) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, readiness } : m))
    );
  };

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (!showDescartados && m.descartado) return false;
      if (selectedCiclo !== "all" && m.ciclo_año !== selectedCiclo) return false;
      if (selectedTipo !== "all" && m.tipo_match !== selectedTipo) return false;
      if (selectedUen !== "all" && m.puesto_org !== selectedUen) return false;
      if (soloCriticos && !m.es_puesto_critico) return false;
      return true;
    });
  }, [matches, showDescartados, selectedCiclo, selectedTipo, selectedUen, soloCriticos]);

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
      {/* Summary chips + filtro críticos */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedTipo("all")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            selectedTipo === "all"
              ? "bg-gray-800 text-white border-gray-800"
              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
          }`}
        >
          Todos
          <span className="font-bold">{matches.filter((m) => !m.descartado).length}</span>
        </button>

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

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={() => setSoloCriticos((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            soloCriticos
              ? "bg-orange-100 text-orange-700 border-orange-200 ring-2 ring-offset-1 ring-orange-300"
              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          Solo críticos
        </button>
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
                onReadinessChange={handleReadinessChange}
              />
            ))}
        </div>
      )}
    </div>
  );
}
