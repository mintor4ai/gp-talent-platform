"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { ZonaBand } from "@/lib/types";
export type { ZonaBand };
import { SectionHeader } from "@/components/ui/SectionHeader";

type EIPPoint = {
  id: string;
  id_empleado: string;
  nombre: string;
  puesto: string;
  area: string | null;
  uen: string | null;
  jefe: string | null;
  desempeno: number;
  potencial: number;
  zona: string | null;
};

// ── Chart constants ────────────────────────────────────────────────────────────
const PAD   = { left: 64, right: 30, top: 48, bottom: 56 };
const CW    = 580;
const CH    = 500;
const W     = CW - PAD.left - PAD.right;
const H     = CH - PAD.top  - PAD.bottom;
const D_MIN = 80, D_MAX = 120;
const P_MIN = 80, P_MAX = 120;

// 9-box quadrant dividers at 1/3 and 2/3 of each axis
const Q_D1 = D_MIN + (D_MAX - D_MIN) / 3;
const Q_D2 = D_MIN + (2 * (D_MAX - D_MIN)) / 3;
const Q_P1 = P_MIN + (P_MAX - P_MIN) / 3;
const Q_P2 = P_MIN + (2 * (P_MAX - P_MIN)) / 3;

// Colors per cycle (most recent → oldest)
const CYCLE_PALETTE = ["#2563eb", "#ea580c", "#7c3aed", "#059669", "#db2777"];

const ZONE_LINE_COLOR  = "#5b9bd5";
const ZONE_LABEL_COLOR = "#4a80b5";

const ZONA_DOT: Record<string, string> = {
  Sobresaliente: "#7c3aed",
  Desarrollo:    "#2563eb",
  Estabilidad:   "#059669",
  "Revisión":    "#ea580c",
  Inicio:        "#ca8a04",
};

const ZONA_FILL: Record<string, string> = {
  Sobresaliente: "#ede9fe",
  Desarrollo:    "#dbeafe",
  Estabilidad:   "#d1fae5",
  "Revisión":    "#ffedd5",
  Inicio:        "#fef9c3",
};

function toX(d: number) { return PAD.left + ((d - D_MIN) / (D_MAX - D_MIN)) * W; }
function toY(p: number) { return PAD.top  + H - ((p - P_MIN) / (P_MAX - P_MIN)) * H; }

function diagonalPolygon(sumLo: number, sumHi: number): string {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const pts: [number, number][] = [];

  function addIfInRange(d: number, p: number) {
    if (d >= D_MIN - 0.01 && d <= D_MAX + 0.01 && p >= P_MIN - 0.01 && p <= P_MAX + 0.01)
      pts.push([clamp(d, D_MIN, D_MAX), clamp(p, P_MIN, P_MAX)]);
  }

  addIfInRange(D_MIN,        sumHi - D_MIN);
  addIfInRange(sumHi - P_MAX, P_MAX);
  addIfInRange(D_MAX,        sumHi - D_MAX);
  addIfInRange(sumHi - P_MIN, P_MIN);
  addIfInRange(sumLo - P_MIN, P_MIN);
  addIfInRange(D_MAX,        sumLo - D_MAX);
  addIfInRange(sumLo - P_MAX, P_MAX);
  addIfInRange(D_MIN,        sumLo - D_MIN);

  const seen = new Map<string, [number, number]>();
  for (const p of pts) seen.set(`${p[0].toFixed(2)},${p[1].toFixed(2)}`, p);
  const uniq = Array.from(seen.values());
  if (uniq.length < 3) return "";
  return uniq.map(([d, p]) => `${toX(d)},${toY(p)}`).join(" ");
}

function boundaryLine(s: number): [number, number, number, number] | null {
  const pts: [number, number][] = [];
  const candidates: [number, number][] = [
    [D_MIN,      s - D_MIN],
    [D_MAX,      s - D_MAX],
    [s - P_MIN,  P_MIN],
    [s - P_MAX,  P_MAX],
  ];
  for (const [d, p] of candidates) {
    if (d >= D_MIN - 0.01 && d <= D_MAX + 0.01 && p >= P_MIN - 0.01 && p <= P_MAX + 0.01)
      pts.push([d, p]);
  }
  const seen = new Set<string>();
  const uniq: [number, number][] = [];
  for (const pt of pts) {
    const k = `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(pt); }
  }
  if (uniq.length < 2) return null;
  return [toX(uniq[0][0]), toY(uniq[0][1]), toX(uniq[1][0]), toY(uniq[1][1])];
}

function zoneLabelPos(band: ZonaBand): { d: number; p: number } | null {
  const midSum = (band.umbral_inferior + band.umbral_superior) / 2;
  let d = Math.max(D_MIN + 4, midSum - P_MAX + 4);
  let p = midSum - d;
  if (p > P_MAX - 2) { p = P_MAX - 2; d = midSum - p; }
  if (p < P_MIN + 2) { p = P_MIN + 2; d = midSum - p; }
  if (d > D_MAX - 2) { d = D_MAX - 2; p = midSum - d; }
  if (d < D_MIN + 2) return null;
  if (p < P_MIN || p > P_MAX || d < D_MIN || d > D_MAX) return null;
  return { d, p };
}

function abbrevName(nombre: string): string {
  const words = nombre.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 12).toUpperCase();
  return `${words[0][0].toUpperCase()}. ${words[1].toUpperCase().substring(0, 10)}`;
}

// ── Exported matrix SVG ────────────────────────────────────────────────────────
export function TalentMatrixSVG({
  zonaBands,
  points = [],
  multiCyclePoints,
  dimmedIds,
  showQuadrantLines = false,
  width = CW,
  height = CH,
  showTitle = true,
  interactive = false,
  highlightPoint = false,
  onPointClick,
  onPointHover,
}: {
  zonaBands: ZonaBand[];
  points?: EIPPoint[];
  /** When provided, renders each group in its own color (multi-cycle mode). */
  multiCyclePoints?: { ciclo: number; points: EIPPoint[]; color: string }[];
  /** Point IDs to render dimmed (gray, low opacity) behind active points. */
  dimmedIds?: Set<string>;
  showQuadrantLines?: boolean;
  width?: number | string;
  height?: number | string;
  showTitle?: boolean;
  interactive?: boolean;
  highlightPoint?: boolean;
  onPointClick?: (p: EIPPoint) => void;
  onPointHover?: (p: EIPPoint | null, x: number, y: number) => void;
}) {
  const sortedZones = [...zonaBands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);
  // Zone thresholds are individual EIP values (80–120). The diagonal polygon
  // function expects D+P sums (160–240), so we scale by 2 for visualization only.
  const scaledZones = sortedZones.map((z) => ({
    ...z,
    umbral_inferior: z.umbral_inferior * 2,
    umbral_superior: z.umbral_superior * 2,
  }));
  const boundaryLines = scaledZones.slice(0, -1).map((z) => z.umbral_superior);
  const gridLines = [80, 85, 90, 95, 100, 105, 110, 115, 120];

  const highlightZona = highlightPoint && points.length === 1 ? points[0].zona : null;

  // Build a flat list of {point, color} for rendering
  type RenderItem = { point: EIPPoint; color: string };
  const allItems: RenderItem[] = multiCyclePoints
    ? multiCyclePoints.flatMap(({ points: pts, color }) => pts.map((p) => ({ point: p, color })))
    : points.map((p) => ({ point: p, color: ZONA_DOT[p.zona ?? ""] ?? "#6b7280" }));

  const activeItems  = allItems.filter(({ point }) => !dimmedIds?.has(point.id));
  const dimmedItems  = allItems.filter(({ point }) =>  dimmedIds?.has(point.id));

  const hoverHandlers = (p: EIPPoint) => interactive
    ? {
        style: { cursor: "pointer" as const },
        onClick: () => onPointClick?.(p),
        onMouseEnter: (e: React.MouseEvent<SVGElement>) => {
          const svg = (e.currentTarget as SVGElement).closest("svg");
          const rect = svg?.getBoundingClientRect();
          if (rect) onPointHover?.(p, e.clientX - rect.left, e.clientY - rect.top);
        },
        onMouseLeave: () => onPointHover?.(null, 0, 0),
      }
    : {};

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} width={width} height={height}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", height: height === "auto" ? "auto" : undefined }}>
      <defs>
        <filter id="dot-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="chart-shadow" x="-2%" y="-2%" width="104%" height="104%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#00000010" />
        </filter>
      </defs>

      <rect x={0} y={0} width={CW} height={CH} fill="white" />

      {showTitle && (
        <text x={CW / 2} y={28} textAnchor="middle" fontSize={13} fill="#374151" fontWeight="600" letterSpacing="1">
          EVALUACIÓN INTEGRAL DE PERSONAL
        </text>
      )}

      {/* Zone fills */}
      {scaledZones.map((z) => {
        const poly = diagonalPolygon(z.umbral_inferior, z.umbral_superior);
        if (!poly) return null;
        const isHighlighted = highlightZona === z.zona;
        return (
          <polygon key={z.zona} points={poly} fill={ZONA_FILL[z.zona] ?? "#f5f5f5"} opacity={isHighlighted ? 0.75 : 0.35} />
        );
      })}

      {/* Light grid */}
      {gridLines.map((v) => (
        <g key={`g${v}`}>
          <line x1={toX(v)} y1={PAD.top} x2={toX(v)} y2={PAD.top + H} stroke="#e5e7eb" strokeWidth={0.8} />
          <line x1={PAD.left} y1={toY(v)} x2={PAD.left + W} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.8} />
        </g>
      ))}

      {/* 9-box quadrant lines */}
      {showQuadrantLines && (
        <>
          <line x1={toX(Q_D1)} y1={PAD.top}     x2={toX(Q_D1)} y2={PAD.top + H}   stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
          <line x1={toX(Q_D2)} y1={PAD.top}     x2={toX(Q_D2)} y2={PAD.top + H}   stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
          <line x1={PAD.left}  y1={toY(Q_P1)}   x2={PAD.left + W} y2={toY(Q_P1)} stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
          <line x1={PAD.left}  y1={toY(Q_P2)}   x2={PAD.left + W} y2={toY(Q_P2)} stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
        </>
      )}

      {/* Diagonal zone boundaries */}
      {boundaryLines.map((sum) => {
        const line = boundaryLine(sum);
        if (!line) return null;
        return (
          <line key={sum} x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]}
            stroke={ZONE_LINE_COLOR} strokeWidth={1.6} strokeLinecap="round" />
        );
      })}

      {/* Chart border */}
      <rect x={PAD.left} y={PAD.top} width={W} height={H}
        fill="none" stroke="#d1d5db" strokeWidth={1.2} filter="url(#chart-shadow)" />

      {/* Axis tick labels */}
      {gridLines.map((v) => (
        <g key={`tick${v}`}>
          <text x={toX(v)}       y={PAD.top + H + 16} textAnchor="middle" fontSize={9.5} fill="#6b7280">{v}</text>
          <text x={PAD.left - 8} y={toY(v) + 3.5}     textAnchor="end"    fontSize={9.5} fill="#6b7280">{v}</text>
        </g>
      ))}

      {/* Axis titles */}
      <text x={PAD.left + W / 2} y={CH - 6} textAnchor="middle" fontSize={11} fill="#374151" fontWeight="700" letterSpacing="2">
        D E S E M P E Ñ O
      </text>
      <text x={14} y={PAD.top + H / 2} textAnchor="middle" fontSize={11} fill="#374151" fontWeight="700" letterSpacing="2"
        transform={`rotate(-90, 14, ${PAD.top + H / 2})`}>
        P O T E N C I A L
      </text>

      {/* Zone labels */}
      {scaledZones.map((z) => {
        const pos = zoneLabelPos(z);
        if (!pos) return null;
        const isHighlighted = highlightZona === z.zona;
        return (
          <text key={`lbl-${z.zona}`} x={toX(pos.d)} y={toY(pos.p)} textAnchor="start"
            fontSize={isHighlighted ? 13 : 11.5} fontWeight={isHighlighted ? "700" : "400"}
            fill={isHighlighted ? (ZONA_DOT[z.zona] ?? ZONE_LABEL_COLOR) : ZONE_LABEL_COLOR}
            fontStyle="italic" opacity={isHighlighted ? 1 : 0.85}>
            {z.zona}
          </text>
        );
      })}

      {/* Dimmed points — rendered behind active ones */}
      {dimmedItems.map(({ point: p }) => {
        const cx = toX(p.desempeno);
        const cy = toY(p.potencial);
        return (
          <circle key={`dim-${p.id}`} cx={cx} cy={cy} r={4}
            fill="#cbd5e1" opacity={0.3}
            style={interactive ? { cursor: "pointer" } : {}}
            onClick={interactive ? () => onPointClick?.(p) : undefined}
            onMouseEnter={interactive ? (e: React.MouseEvent<SVGElement>) => {
              const svg = (e.currentTarget as SVGElement).closest("svg");
              const rect = svg?.getBoundingClientRect();
              if (rect) onPointHover?.(p, e.clientX - rect.left, e.clientY - rect.top);
            } : undefined}
            onMouseLeave={interactive ? () => onPointHover?.(null, 0, 0) : undefined}
          />
        );
      })}

      {/* Active points */}
      {activeItems.map(({ point: p, color }) => {
        const cx = toX(p.desempeno);
        const cy = toY(p.potencial);
        const label = abbrevName(p.nombre);
        const isHighlight = highlightPoint && points.length === 1;

        if (isHighlight) {
          const labelX = cx + 14;
          const labelY = cy + 4;
          const labelW = label.length * 6.2 + 10;
          return (
            <g key={p.id}>
              <circle cx={cx} cy={cy} r={14} fill={color} opacity={0.15}>
                <animate attributeName="r" values="10;18;10" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0;0.2" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={cx} cy={cy} r={10} fill={color} opacity={0.18} />
              <circle cx={cx} cy={cy} r={7} fill={color} stroke="white" strokeWidth={2.5} filter="url(#dot-glow)" />
              <rect x={labelX - 2} y={labelY - 10} width={labelW} height={14} rx={7} fill={color} opacity={0.9} />
              <text x={labelX + labelW / 2 - 2} y={labelY + 1} textAnchor="middle" fontSize={8.5} fill="white" fontWeight="700">{label}</text>
            </g>
          );
        }

        const labelX = cx + 8;
        const labelY = cy + 3.5;
        const labelW = label.length * 5.5 + 6;
        return (
          <g key={p.id} {...hoverHandlers(p)}>
            <rect x={labelX - 1} y={labelY - 9} width={labelW} height={12} rx={1.5}
              fill="white" stroke={color} strokeWidth={0.8} opacity={0.92} />
            <text x={labelX + 2} y={labelY} fontSize={8} fill="#374151" fontWeight="500">{label}</text>
            <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="white" strokeWidth={1.2} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Main chart with filters, multi-cycle, fullscreen ──────────────────────────
export default function EIPScatterChart({
  allCyclePoints,
  uens,
  areas,
  jefes,
  zonaBands,
}: {
  allCyclePoints: { ciclo: number; points: EIPPoint[] }[];
  uens: string[];
  areas: string[];
  jefes: string[];
  zonaBands: ZonaBand[];
}) {
  const ciclos = Array.from(new Set(allCyclePoints.map((c) => c.ciclo))).sort((a, b) => b - a);
  const mostRecentCiclo = ciclos[0] ?? 0;

  const [selectedCycles, setSelectedCycles] = useState<number[]>([mostRecentCiclo]);
  const [filterUen,  setFilterUen]  = useState("Todos");
  const [filterArea, setFilterArea] = useState("Todos");
  const [filterJefe, setFilterJefe] = useState("Todos");
  const [nameFilter, setNameFilter] = useState("");
  const [showGrid,   setShowGrid]   = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSize, setFsSize]             = useState({ w: CW, h: CH });
  const [tooltip, setTooltip]           = useState<{ x: number; y: number; point: EIPPoint } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close fullscreen on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Compute fullscreen SVG dimensions
  useEffect(() => {
    if (!isFullscreen) return;
    const update = () => {
      const vw = window.innerWidth  - 48;
      const vh = window.innerHeight - 120;
      const aspect = CW / CH;
      if (vw / vh > aspect) {
        setFsSize({ w: Math.round(vh * aspect), h: vh });
      } else {
        setFsSize({ w: vw, h: Math.round(vw / aspect) });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isFullscreen]);

  // Cycle color map: most recent → index 0 → blue
  const cycleColorMap: Record<number, string> = Object.fromEntries(
    ciclos.map((c, i) => [c, CYCLE_PALETTE[i % CYCLE_PALETTE.length]])
  );

  const isMultiCycle = selectedCycles.length > 1;

  const visibleCycleData = allCyclePoints
    .filter((c) => selectedCycles.includes(c.ciclo))
    .map((c) => ({ ...c, color: cycleColorMap[c.ciclo] }));

  const allVisiblePoints = visibleCycleData.flatMap((c) => c.points);

  // Cascaded filter options: area/jefe lists narrow based on current UEN/area selection
  const availableAreas = useMemo(() => {
    const pts = filterUen === "Todos" ? allVisiblePoints : allVisiblePoints.filter((p) => p.uen === filterUen);
    return Array.from(new Set(pts.map((p) => p.area).filter(Boolean) as string[])).sort();
  }, [allVisiblePoints, filterUen]);

  const availableJefes = useMemo(() => {
    let pts = allVisiblePoints;
    if (filterUen  !== "Todos") pts = pts.filter((p) => p.uen  === filterUen);
    if (filterArea !== "Todos") pts = pts.filter((p) => p.area === filterArea);
    return Array.from(new Set(pts.map((p) => p.jefe).filter(Boolean) as string[])).sort();
  }, [allVisiblePoints, filterUen, filterArea]);

  const hasActiveFilter =
    filterUen !== "Todos" || filterArea !== "Todos" ||
    filterJefe !== "Todos" || nameFilter.trim() !== "";

  const matchingIds: Set<string> | null = hasActiveFilter
    ? new Set(
        allVisiblePoints
          .filter((p) => {
            if (filterUen  !== "Todos" && p.uen  !== filterUen)  return false;
            if (filterArea !== "Todos" && p.area !== filterArea) return false;
            if (filterJefe !== "Todos" && p.jefe !== filterJefe) return false;
            if (nameFilter.trim() && !p.nombre.toLowerCase().includes(nameFilter.toLowerCase())) return false;
            return true;
          })
          .map((p) => p.id)
      )
    : null;

  const dimmedIds: Set<string> = matchingIds
    ? new Set(allVisiblePoints.filter((p) => !matchingIds.has(p.id)).map((p) => p.id))
    : new Set();

  const activeCount = matchingIds ? matchingIds.size : allVisiblePoints.length;

  const sortedZones = [...zonaBands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);

  function toggleCycle(ciclo: number) {
    setSelectedCycles((prev) =>
      prev.includes(ciclo)
        ? prev.length > 1 ? prev.filter((c) => c !== ciclo) : prev
        : [...prev, ciclo]
    );
  }

  function clearFilters() {
    setFilterUen("Todos");
    setFilterArea("Todos");
    setFilterJefe("Todos");
    setNameFilter("");
  }

  const cycleToggles = ciclos.length > 1 && (
    <div className="flex gap-1.5 flex-wrap">
      {ciclos.map((c) => (
        <button
          key={c}
          onClick={() => toggleCycle(c)}
          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
            selectedCycles.includes(c)
              ? "text-white border-transparent"
              : "text-gray-400 border-gray-200 bg-white hover:border-gray-300"
          }`}
          style={selectedCycles.includes(c) ? { backgroundColor: cycleColorMap[c] } : {}}
        >
          {c}
        </button>
      ))}
    </div>
  );

  const filters = (compact = false) => (
    <div className={`flex flex-wrap ${compact ? "gap-2" : "gap-2"}`}>
      <input
        type="text"
        placeholder="Buscar persona..."
        value={nameFilter}
        onChange={(e) => setNameFilter(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] w-36"
      />
      {uens.length > 0 && (
        <select value={filterUen}
          onChange={(e) => { setFilterUen(e.target.value); setFilterArea("Todos"); setFilterJefe("Todos"); }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
          <option value="Todos">Todas las UEN</option>
          {uens.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      )}
      {availableAreas.length > 0 && (
        <select value={filterArea}
          onChange={(e) => { setFilterArea(e.target.value); setFilterJefe("Todos"); }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
          <option value="Todos">Todas las áreas</option>
          {availableAreas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {availableJefes.length > 0 && (
        <select value={filterJefe} onChange={(e) => setFilterJefe(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
          <option value="Todos">Todos los jefes</option>
          {availableJefes.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      )}
      {hasActiveFilter && (
        <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-700 underline">
          Limpiar
        </button>
      )}
      <label className="flex items-center gap-1.5 cursor-pointer select-none ml-1">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(e) => setShowGrid(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-[#1a3a5c]"
        />
        <span className="text-xs text-gray-500">Cuadrícula 9-box</span>
      </label>
    </div>
  );

  const legend = (
    <div className="flex flex-wrap gap-4 justify-center">
      {isMultiCycle
        ? ciclos.filter((c) => selectedCycles.includes(c)).map((c) => (
            <div key={c} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cycleColorMap[c] }} />
              <span className="text-xs text-gray-500 font-medium">Ciclo {c}</span>
            </div>
          ))
        : [...sortedZones].reverse().map((z) => (
            <div key={z.zona} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border-2"
                style={{ backgroundColor: ZONA_DOT[z.zona] ?? "#9ca3af", borderColor: ZONA_DOT[z.zona] ?? "#9ca3af" }} />
              <span className="text-xs text-gray-500 font-medium">{z.zona}</span>
            </div>
          ))
      }
    </div>
  );

  function chartSVG(w: number | string, h: number | string, showTit: boolean) {
    return (
      <TalentMatrixSVG
        zonaBands={zonaBands}
        points={!isMultiCycle ? (visibleCycleData[0]?.points ?? []) : []}
        multiCyclePoints={isMultiCycle ? visibleCycleData : undefined}
        dimmedIds={dimmedIds.size > 0 ? dimmedIds : undefined}
        showQuadrantLines={showGrid}
        width={w}
        height={h}
        showTitle={showTit}
        interactive
        onPointClick={(p) => { window.location.href = `/carpeta/${p.id_empleado}`; }}
        onPointHover={(p, x, y) => setTooltip(p ? { x, y, point: p } : null)}
      />
    );
  }

  const tooltipEl = tooltip && (
    <div
      className="absolute z-10 pointer-events-none bg-white rounded-xl border border-gray-200 shadow-lg p-3 text-xs w-52"
      style={{ left: tooltip.x + 14, top: tooltip.y - 14 }}
    >
      <p className="font-semibold text-gray-900 truncate">{tooltip.point.nombre}</p>
      <p className="text-gray-500 truncate mt-0.5">{tooltip.point.puesto}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <p className="text-gray-400">Desempeño</p>
          <p className="font-semibold text-gray-800">{tooltip.point.desempeno.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-gray-400">Potencial</p>
          <p className="font-semibold text-gray-800">{tooltip.point.potencial.toFixed(1)}</p>
        </div>
      </div>
      {tooltip.point.zona && (
        <p className="mt-2 font-semibold" style={{ color: ZONA_DOT[tooltip.point.zona] ?? "#6b7280" }}>
          {tooltip.point.zona}
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* ── Fullscreen overlay ── */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Compact header */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap flex-1">
              {cycleToggles}
              {filters(true)}
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{activeCount} colaboradores</span>
            <button
              onClick={() => setIsFullscreen(false)}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 whitespace-nowrap"
            >
              ✕ Cerrar
            </button>
          </div>

          {/* Chart area */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 overflow-hidden">
            <div className="relative">
              {chartSVG(fsSize.w, fsSize.h, false)}
              {tooltipEl}
            </div>
            {legend}
          </div>
        </div>
      )}

      {/* ── Normal card ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <SectionHeader label="Mapa de Talento — EIP" />
            <p className="text-xs text-gray-400 mt-0.5">{activeCount} colaboradores</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {cycleToggles}
            <button
              onClick={() => setIsFullscreen(true)}
              className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              title="Ver en pantalla completa"
            >
              ⛶ Pantalla completa
            </button>
          </div>
        </div>

        {/* Filters */}
        {filters(false)}

        {/* Chart — fills card width, scales via viewBox */}
        <div ref={wrapRef} className="relative">
          {chartSVG("100%", "auto", true)}
          {tooltipEl}
        </div>

        {/* Legend */}
        <div className="pt-1">{legend}</div>
      </div>
    </>
  );
}
