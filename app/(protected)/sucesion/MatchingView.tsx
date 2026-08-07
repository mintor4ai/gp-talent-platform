"use client";

import { useState, useTransition, useMemo } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";
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
  motivo_descarte?: string | null;
  created_at: string;
  // joined fields (populated server-side)
  colaborador_nombre?: string | null;
  titular_nombres?: string[];
  puesto_nombre?: string | null;
  puesto_org?: string | null;
  puesto_area?: string | null;
  colaborador_area?: string | null;
  colaborador_org?: string | null;
  validado_por_nombre?: string | null;
  descartado_por_nombre?: string | null;
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

// ── MatchCard ───────────────────────────────────────────────────────────────
function MatchCard({
  match,
  onValidar,
  onDescartar,
  onReactivar,
  onReadinessChange,
}: {
  match: MatchRow;
  onValidar: (id: string) => void;
  onDescartar: (id: string, motivo: string | null) => void;
  onReactivar: (id: string) => void;
  onReadinessChange: (id: string, readiness: string | null) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [profile, setProfile] = useState<ColaboradorMatchProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [localReadiness, setLocalReadiness] = useState<string | null>(match.readiness);
  const [showDiscardForm, setShowDiscardForm] = useState(false);
  const [motivoText, setMotivoText] = useState("");

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

  const handleConfirmDiscard = () => {
    const motivo = motivoText.trim() || null;
    onDescartar(match.id, motivo);
    setShowDiscardForm(false);
    setMotivoText("");
  };

  // ── Front face ──────────────────────────────────────────────────────────
  const front = (
    <div
      className={`absolute inset-0 rounded-xl border p-4 flex flex-col ${cfg.color} ${
        match.descartado ? "opacity-50" : ""
      }`}
      style={{ backfaceVisibility: "hidden" }}
    >
      {/* Ciclo badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold tracking-wide opacity-50 uppercase">
          Ciclo {match.ciclo_año}
        </span>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          {match.es_puesto_critico && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
              Crítico
            </span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 flex-1">
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
              <div className="flex items-center gap-1.5">
                <span className="opacity-60 flex-shrink-0">
                  {match.titular_nombres.length > 1 ? "Titulares:" : "Titular:"}
                </span>
                <TitularBadge nombres={match.titular_nombres} />
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

      {/* Inline discard form */}
      {showDiscardForm && !match.descartado && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-10">
          <p className="text-xs font-medium mb-1.5 opacity-80">
            Motivo del descarte{isGap ? <span className="text-red-600"> *</span> : " (opcional)"}
          </p>
          <textarea
            value={motivoText}
            onChange={(e) => setMotivoText(e.target.value)}
            placeholder="Ej. No cumple perfil de liderazgo requerido..."
            rows={2}
            className="w-full text-xs border border-current border-opacity-20 rounded-lg px-2.5 py-1.5 bg-white bg-opacity-70 focus:outline-none focus:ring-2 focus:ring-current focus:ring-opacity-20 resize-none placeholder-gray-400 text-gray-800"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleConfirmDiscard}
              disabled={isGap && !motivoText.trim()}
              className="text-xs px-3 py-1 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirmar descarte
            </button>
            <button
              onClick={() => { setShowDiscardForm(false); setMotivoText(""); }}
              className="text-xs px-3 py-1 rounded-lg font-medium bg-white bg-opacity-60 hover:bg-opacity-90 transition-colors border border-current border-opacity-20"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showDiscardForm && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-10 flex items-center gap-2 flex-wrap">
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
              <button onClick={() => setShowDiscardForm(true)}
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
      )}
    </div>
  );

  // ── Back face ───────────────────────────────────────────────────────────
  const back = (
    <div
      className="absolute inset-0 rounded-xl border border-gray-200 bg-white p-4 flex flex-col"
      style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
    >
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

      <div className="flex-1 flex flex-col gap-3 overflow-auto">
        {loadingProfile ? (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
            Cargando perfil…
          </div>
        ) : profile ? (
          <>
            <div>
              <p className="font-bold text-sm text-gray-900 break-words leading-snug">
                {profile.nombre_completo}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 break-words">
                {profile.puesto}{profile.nivel ? ` · ${profile.nivel}` : ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatChip label="Edad" value={profile.edad !== null ? `${profile.edad} años` : "—"} />
              <StatChip label="Antigüedad" value={profile.antiguedad !== null ? `${profile.antiguedad} año${profile.antiguedad !== 1 ? "s" : ""}` : "—"} />
            </div>

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
          </>
        ) : (
          <p className="text-xs text-gray-400 text-center py-2">Sin datos de evaluación.</p>
        )}

        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">
            Readiness para este puesto
            {savingReadiness && <span className="normal-case ml-1 text-gray-300">(guardando…)</span>}
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

        {(match.validado_ch || match.descartado) && (
          <div className="pt-2 border-t border-gray-100">
            {match.validado_ch && match.validado_por_nombre && (
              <div className="flex items-start gap-1.5 text-[10px] text-green-700">
                <span className="font-medium flex-shrink-0">✓ Validado por</span>
                <span>{match.validado_por_nombre}</span>
                {match.fecha_validacion && (
                  <span className="text-green-500 ml-auto flex-shrink-0">{fmtDate(match.fecha_validacion)}</span>
                )}
              </div>
            )}
            {match.descartado && match.descartado_por_nombre && (
              <div className="mt-1">
                <div className="flex items-start gap-1.5 text-[10px] text-gray-500">
                  <span className="font-medium flex-shrink-0">✕ Descartado por</span>
                  <span>{match.descartado_por_nombre}</span>
                  {match.fecha_descarte && (
                    <span className="text-gray-400 ml-auto flex-shrink-0">{fmtDate(match.fecha_descarte)}</span>
                  )}
                </div>
                {match.motivo_descarte && (
                  <p className="text-[10px] text-gray-400 mt-0.5 italic ml-4">"{match.motivo_descarte}"</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const cardH = showDiscardForm ? 420 : 320;

  return (
    <div style={{ perspective: "1000px", height: cardH }}>
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          position: "relative",
          height: cardH,
        }}
      >
        {front}
        {back}
      </div>
    </div>
  );
}

// ── TitularBadge ────────────────────────────────────────────────────────────
function TitularBadge({ nombres, inTable = false }: { nombres: string[] | undefined; inTable?: boolean }) {
  if (!nombres || nombres.length === 0) return <span className="text-gray-300">—</span>;

  if (nombres.length === 1) {
    return <span className={inTable ? "text-gray-600" : "font-medium text-xs break-words"}>{nombres[0]}</span>;
  }

  return (
    <div className="relative group inline-block">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200 cursor-default select-none">
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z"/>
          <path d="M12.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm2 6.5s.5 0 .5-.5c0-.5-.3-3-3-3.5"/>
        </svg>
        {nombres.length} titulares
      </span>
      {/* Tooltip */}
      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-gray-900 text-white rounded-lg px-3 py-2 shadow-xl min-w-[160px] max-w-[260px]">
          <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
            {nombres.length} titulares
          </p>
          <ul className="space-y-1">
            {nombres.map((n, i) => (
              <li key={i} className="text-[11px] leading-snug text-gray-100">{n}</li>
            ))}
          </ul>
        </div>
        <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 ml-3 -mt-1.5" />
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

// ── MatchTable ───────────────────────────────────────────────────────────────
function MatchTable({
  matches,
  onValidar,
  onDescartar,
  onReactivar,
}: {
  matches: MatchRow[];
  onValidar: (id: string) => void;
  onDescartar: (id: string, motivo: string | null) => void;
  onReactivar: (id: string) => void;
}) {
  const { sortKey, sortDir, handleSort } = useSortState<
    "ciclo" | "puesto" | "colaborador" | "tipo" | "readiness" | "estado"
  >("ciclo", "desc");
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [motivoText, setMotivoText] = useState("");

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...matches].sort((a, b) => {
      switch (sortKey) {
        case "ciclo":       return dir * (a.ciclo_año - b.ciclo_año);
        case "puesto":      return dir * (a.puesto_nombre ?? "").localeCompare(b.puesto_nombre ?? "", "es");
        case "colaborador": return dir * (a.colaborador_nombre ?? "").localeCompare(b.colaborador_nombre ?? "", "es");
        case "tipo":        return dir * (TIPO_CONFIG[a.tipo_match].order - TIPO_CONFIG[b.tipo_match].order);
        case "readiness":   return dir * (a.readiness ?? "").localeCompare(b.readiness ?? "");
        case "estado": {
          const stA = a.descartado ? 2 : (a.validado_ch ? 1 : 0);
          const stB = b.descartado ? 2 : (b.validado_ch ? 1 : 0);
          return dir * (stA - stB);
        }
        default: return 0;
      }
    });
  }, [matches, sortKey, sortDir]);

  const handleDiscardConfirm = (id: string, isGap: boolean) => {
    if (isGap && !motivoText.trim()) return;
    const motivo = motivoText.trim() || null;
    onDescartar(id, motivo);
    setDiscardId(null);
    setMotivoText("");
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
            <SortableTh label="Ciclo" sortKey="ciclo" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left font-medium" />
            <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left font-medium" />
            <SortableTh label="Colaborador" sortKey="colaborador" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left font-medium" />
            <SortableTh label="Tipo" sortKey="tipo" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left font-medium" />
            <SortableTh label="Readiness" sortKey="readiness" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left font-medium" />
            <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2.5 text-left font-medium" />
            <th className="px-4 py-2.5 text-left font-medium">Titular(es)</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {sorted.map((m) => {
            const cfg = TIPO_CONFIG[m.tipo_match];
            const isGap = m.tipo_match === "gap_critico";
            const isDiscarding = discardId === m.id;

            return (
              <>
                <tr key={m.id} className={`hover:bg-gray-50 ${m.descartado ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5 tabular-nums font-medium text-gray-500 whitespace-nowrap">
                    {m.ciclo_año}
                  </td>
                  <td className="px-4 py-2.5 max-w-[220px]">
                    <p className="font-semibold text-gray-800 break-words leading-snug">{m.puesto_nombre ?? "—"}</p>
                    {m.puesto_org && <p className="text-gray-400 text-[10px] mt-0.5">{m.puesto_org}</p>}
                    {m.es_puesto_critico && (
                      <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-100">
                        Crítico
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-[160px]">
                    {m.colaborador_nombre
                      ? <span className="break-words">{m.colaborador_nombre}</span>
                      : <span className="text-gray-300 italic">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {m.readiness ? READINESS_LABEL[m.readiness] ?? m.readiness : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.descartado ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                        Descartado
                      </span>
                    ) : m.validado_ch ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
                        ✓ Validado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-600 border border-yellow-100">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    <TitularBadge nombres={m.titular_nombres} inTable />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <div className="flex items-center gap-1.5 justify-end">
                      {m.descartado ? (
                        <button
                          onClick={() => onReactivar(m.id)}
                          className="text-[11px] px-2.5 py-1 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Reactivar
                        </button>
                      ) : (
                        <>
                          {!m.validado_ch && (
                            <button
                              onClick={() => onValidar(m.id)}
                              className="text-[11px] px-2.5 py-1 rounded-lg font-medium border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                            >
                              Validar
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (discardId === m.id) {
                                setDiscardId(null);
                                setMotivoText("");
                              } else {
                                setDiscardId(m.id);
                                setMotivoText("");
                              }
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-lg font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            Descartar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {isDiscarding && (
                  <tr key={`${m.id}-discard`} className="bg-red-50 border-b border-red-100">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <p className="text-xs font-medium text-red-800 mb-1.5">
                            Motivo del descarte{isGap ? <span className="text-red-600"> *</span> : " (opcional)"}
                          </p>
                          <textarea
                            value={motivoText}
                            onChange={(e) => setMotivoText(e.target.value)}
                            placeholder="Ej. No cumple perfil de liderazgo requerido..."
                            rows={2}
                            className="w-full text-xs border border-red-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 resize-none placeholder-gray-400"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <button
                            onClick={() => handleDiscardConfirm(m.id, isGap)}
                            disabled={isGap && !motivoText.trim()}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => { setDiscardId(null); setMotivoText(""); }}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── DescartadosPanel ─────────────────────────────────────────────────────────
function DescartadosPanel({
  matches,
  onReactivar,
}: {
  matches: MatchRow[];
  onReactivar: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { sortKey, sortDir, handleSort } = useSortState<"puesto" | "colaborador" | "fecha">("fecha", "desc");

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...matches].sort((a, b) => {
      switch (sortKey) {
        case "puesto":      return dir * (a.puesto_nombre ?? "").localeCompare(b.puesto_nombre ?? "", "es");
        case "colaborador": return dir * (a.colaborador_nombre ?? "").localeCompare(b.colaborador_nombre ?? "", "es");
        case "fecha":       return dir * (a.fecha_descarte ?? "").localeCompare(b.fecha_descarte ?? "");
        default: return 0;
      }
    });
  }, [matches, sortKey, sortDir]);

  if (matches.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          Descartados
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold">
            {matches.length}
          </span>
        </span>
        <span className="text-gray-400 text-xs">{open ? "▲ Ocultar" : "▼ Ver"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-400">
                <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2 text-left" />
                <SortableTh label="Colaborador" sortKey="colaborador" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2 text-left" />
                <th className="px-4 py-2 font-medium text-left">Motivo</th>
                <th className="px-4 py-2 font-medium text-left">Descartado por</th>
                <SortableTh label="Fecha" sortKey="fecha" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-2 text-left" />
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-700 max-w-[200px]">
                    <p className="break-words leading-snug">{m.puesto_nombre ?? "—"}</p>
                    {m.puesto_org && <p className="text-gray-400 text-[10px]">{m.puesto_org}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {m.colaborador_nombre ?? <span className="text-gray-300 italic">Gap crítico</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[220px]">
                    {m.motivo_descarte
                      ? <span className="italic">"{m.motivo_descarte}"</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {m.descartado_por_nombre ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                    {fmtDate(m.fecha_descarte)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onReactivar(m.id)}
                      className="text-[11px] px-2.5 py-1 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Reactivar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MatchingView (main) ───────────────────────────────────────────────────────
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

  // Filters
  const [selectedCiclo, setSelectedCiclo] = useState<number | "all">(ciclosDisponibles[0] ?? "all");
  const [selectedTipo, setSelectedTipo] = useState<string>("all");
  const [selectedUen, setSelectedUen] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedPuesto, setSelectedPuesto] = useState<string>("all");
  const [selectedEstado, setSelectedEstado] = useState<"all" | "pendiente" | "validado" | "descartado">("all");
  const [soloCriticos, setSoloCriticos] = useState(false);
  const [search, setSearch] = useState("");

  // View
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Recalcular
  const [recalcCiclo, setRecalcCiclo] = useState<number>(
    ciclosDisponibles[0] ?? new Date().getFullYear()
  );

  // ── Actions ──────────────────────────────────────────────────────────────
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
          prev.map((m) => (m.id === id ? { ...m, validado_ch: true } : m))
        );
      }
    });
  };

  const handleDescartar = (id: string, motivo: string | null) => {
    startTransition(async () => {
      const result = await descartarMatch(id, motivo);
      if (result.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, descartado: true, motivo_descarte: motivo, fecha_descarte: new Date().toISOString() }
              : m
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
            m.id === id
              ? { ...m, descartado: false, descartado_por: null, fecha_descarte: null, motivo_descarte: null }
              : m
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

  // ── Cascade options ────────────────────────────────────────────────────────
  // Available areas: collaborator.area, restricted to collaborators whose own UEN matches the selected UEN
  const availableAreas = useMemo(() => {
    let source = matches;
    if (selectedUen !== "all") {
      // Only show areas from collaborators who belong to the same UEN as the target puesto
      source = source.filter((m) => m.puesto_org === selectedUen && m.colaborador_org === selectedUen);
    }
    return Array.from(new Set(source.map((m) => m.colaborador_area).filter(Boolean))).sort() as string[];
  }, [matches, selectedUen]);

  // Available puestos given selected UEN + Area
  const availablePuestos = useMemo(() => {
    let source = matches;
    if (selectedUen !== "all") source = source.filter((m) => m.puesto_org === selectedUen && m.colaborador_org === selectedUen);
    if (selectedArea !== "all") source = source.filter((m) => m.colaborador_area === selectedArea);
    return Array.from(new Set(source.map((m) => m.puesto_nombre).filter(Boolean))).sort() as string[];
  }, [matches, selectedUen, selectedArea]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  // Base predicate (ciclo + uen + area + puesto + criticos + search + tipo) — applied to all matches
  function passesBase(m: MatchRow, includeTipo: boolean): boolean {
    if (selectedCiclo !== "all" && m.ciclo_año !== selectedCiclo) return false;
    if (includeTipo && selectedTipo !== "all" && m.tipo_match !== selectedTipo) return false;
    if (selectedUen !== "all" && m.puesto_org !== selectedUen) return false;
    if (selectedArea !== "all" && m.colaborador_area !== selectedArea) return false;
    if (selectedPuesto !== "all" && m.puesto_nombre !== selectedPuesto) return false;
    if (soloCriticos && !m.es_puesto_critico) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nm = (m.colaborador_nombre ?? "").toLowerCase().includes(q);
      const pm = (m.puesto_nombre ?? "").toLowerCase().includes(q);
      const tm = (m.titular_nombres ?? []).some((t) => t.toLowerCase().includes(q));
      if (!nm && !pm && !tm) return false;
    }
    return true;
  }

  // Counts for tipo chips: exclude tipo from the base so counts reflect other filters
  const countBase = useMemo(
    () => matches.filter((m) => !m.descartado && passesBase(m, false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, selectedCiclo, selectedUen, selectedArea, selectedPuesto, soloCriticos, search]
  );

  const typeCounts = useMemo(() => ({
    bidireccional: countBase.filter((m) => m.tipo_match === "bidireccional").length,
    aspiracion:    countBase.filter((m) => m.tipo_match === "aspiracion").length,
    propuesta:     countBase.filter((m) => m.tipo_match === "propuesta").length,
    gap_critico:   countBase.filter((m) => m.tipo_match === "gap_critico").length,
  }), [countBase]);

  // Active (non-discarded) after all base filters
  const activeFiltered = useMemo(
    () => matches.filter((m) => !m.descartado && passesBase(m, true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, selectedCiclo, selectedTipo, selectedUen, selectedArea, selectedPuesto, soloCriticos, search]
  );

  // Discarded after all base filters (excluding estado)
  const discardedFiltered = useMemo(
    () => matches.filter((m) => m.descartado && passesBase(m, true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, selectedCiclo, selectedTipo, selectedUen, selectedArea, selectedPuesto, soloCriticos, search]
  );

  // What goes in the main grid depends on selectedEstado
  const gridMatches = useMemo(() => {
    if (selectedEstado === "descartado") return discardedFiltered;
    if (selectedEstado === "pendiente") return activeFiltered.filter((m) => !m.validado_ch);
    if (selectedEstado === "validado")  return activeFiltered.filter((m) => !!m.validado_ch);
    return [...activeFiltered].sort((a, b) => TIPO_CONFIG[a.tipo_match].order - TIPO_CONFIG[b.tipo_match].order);
  }, [activeFiltered, discardedFiltered, selectedEstado]);

  const gapsCriticos = useMemo(
    () => activeFiltered.filter((m) => m.tipo_match === "gap_critico"),
    [activeFiltered]
  );

  const showDescartadosPanel = selectedEstado === "all";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">

        {/* Row 1: text search + ciclo + uen */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar colaborador, puesto, titular…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
            />
          </div>

          <select
            value={String(selectedCiclo)}
            onChange={(e) =>
              setSelectedCiclo(e.target.value === "all" ? "all" : parseInt(e.target.value))
            }
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
          >
            <option value="all">Todos los ciclos</option>
            {ciclosDisponibles.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {uens.length > 0 && (
            <select
              value={selectedUen}
              onChange={(e) => {
                setSelectedUen(e.target.value);
                setSelectedArea("all");
                setSelectedPuesto("all");
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
            >
              <option value="all">Todas las UEN</option>
              {uens.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}

          {availableAreas.length > 0 && (
            <select
              value={selectedArea}
              onChange={(e) => {
                setSelectedArea(e.target.value);
                setSelectedPuesto("all");
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
            >
              <option value="all">
                {selectedUen === "all" ? "Todas las áreas" : "Todas las áreas"}
              </option>
              {availableAreas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}

          {availablePuestos.length > 1 && (
            <select
              value={selectedPuesto}
              onChange={(e) => setSelectedPuesto(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 max-w-[220px]"
            >
              <option value="all">Todos los puestos</option>
              {availablePuestos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setViewMode("cards")}
              title="Vista cards"
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === "cards"
                  ? "bg-[#1a3a5c] text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="Vista tabla"
              className={`px-3 py-1.5 text-sm transition-colors border-l border-gray-200 ${
                viewMode === "table"
                  ? "bg-[#1a3a5c] text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              ☰
            </button>
          </div>
        </div>

        {/* Row 2: tipo chips + solo críticos */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedTipo("all")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              selectedTipo === "all"
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
            }`}
          >
            Todos
            <span className="font-bold">{countBase.length}</span>
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
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {cfg.label}
                <span className="font-bold">{typeCounts[tipo]}</span>
              </button>
            );
          })}

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <button
            onClick={() => setSoloCriticos((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              soloCriticos
                ? "bg-orange-100 text-orange-700 border-orange-200 ring-2 ring-offset-1 ring-orange-300"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            Solo críticos
          </button>
        </div>

        {/* Row 3: estado filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">Estado:</span>
          {(
            [
              { value: "all",         label: "Todos" },
              { value: "pendiente",   label: "Pendientes" },
              { value: "validado",    label: "Validados" },
              { value: "descartado",  label: "Descartados" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSelectedEstado(value)}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                selectedEstado === value
                  ? value === "validado"   ? "bg-green-100 text-green-700 border-green-300 ring-2 ring-offset-1 ring-green-200"
                  : value === "pendiente"  ? "bg-yellow-100 text-yellow-700 border-yellow-300 ring-2 ring-offset-1 ring-yellow-200"
                  : value === "descartado" ? "bg-gray-200 text-gray-600 border-gray-300 ring-2 ring-offset-1 ring-gray-300"
                  : "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Recalcular ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-400 mr-auto">
          Mostrando <strong className="text-gray-700">{gridMatches.length}</strong> match{gridMatches.length !== 1 ? "es" : ""}
          {selectedCiclo !== "all" ? ` · Ciclo ${selectedCiclo}` : " · Todos los ciclos"}
        </p>
        <select
          value={recalcCiclo}
          onChange={(e) => setRecalcCiclo(parseInt(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
        >
          {ciclosDisponibles.map((c) => (
            <option key={c} value={c}>{c}</option>
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

      {recalcMsg && (
        <div className="text-sm px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700">
          {recalcMsg}
        </div>
      )}

      {/* ── Gaps críticos alert ──────────────────────────────────────────── */}
      {gapsCriticos.length > 0 && selectedTipo === "all" && selectedEstado !== "descartado" && (
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
                <span className="ml-1.5 text-red-400 font-normal">({g.ciclo_año})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid / table ───────────────────────────────────────────── */}
      {gridMatches.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No hay matches con los filtros seleccionados.</p>
          {matches.length === 0 && (
            <p className="text-xs mt-2">
              Usa <strong>Recalcular matches</strong> para generar el análisis del ciclo seleccionado.
            </p>
          )}
        </div>
      ) : viewMode === "cards" ? (
        <div
          key={`cards|${selectedCiclo}|${selectedUen}|${selectedArea}|${selectedPuesto}|${selectedTipo}|${selectedEstado}|${soloCriticos}`}
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
        >
          {gridMatches.map((m) => (
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
      ) : (
        <MatchTable
          matches={gridMatches}
          onValidar={handleValidar}
          onDescartar={handleDescartar}
          onReactivar={handleReactivar}
        />
      )}

      {/* ── Descartados panel (only when estado = all) ───────────────────── */}
      {showDescartadosPanel && (
        <DescartadosPanel matches={discardedFiltered} onReactivar={handleReactivar} />
      )}
    </div>
  );
}
