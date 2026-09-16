"use client";

import { useState, useRef, useEffect, useMemo, useId } from "react";
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
  segmento: string | null;
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

const Q_D1 = D_MIN + (D_MAX - D_MIN) / 3;
const Q_D2 = D_MIN + (2 * (D_MAX - D_MIN)) / 3;
const Q_P1 = P_MIN + (P_MAX - P_MIN) / 3;
const Q_P2 = P_MIN + (2 * (P_MAX - P_MIN)) / 3;

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

  addIfInRange(D_MIN,         sumHi - D_MIN);
  addIfInRange(sumHi - P_MAX, P_MAX);
  addIfInRange(D_MAX,         sumHi - D_MAX);
  addIfInRange(sumHi - P_MIN, P_MIN);
  addIfInRange(sumLo - P_MIN, P_MIN);
  addIfInRange(D_MAX,         sumLo - D_MAX);
  addIfInRange(sumLo - P_MAX, P_MAX);
  addIfInRange(D_MIN,         sumLo - D_MIN);

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
  contentTransform,
  showLabels = true,
  prevCyclePoints,
}: {
  zonaBands: ZonaBand[];
  points?: EIPPoint[];
  multiCyclePoints?: { ciclo: number; points: EIPPoint[]; color: string }[];
  dimmedIds?: Set<string>;
  showQuadrantLines?: boolean;
  width?: number | string;
  height?: number | string;
  showTitle?: boolean;
  interactive?: boolean;
  highlightPoint?: boolean;
  onPointClick?: (p: EIPPoint) => void;
  onPointHover?: (p: EIPPoint | null, x: number, y: number) => void;
  contentTransform?: string;
  showLabels?: boolean;
  prevCyclePoints?: EIPPoint[];
}) {
  const rawId = useId();
  const clipId = `eip-clip-${rawId.replace(/:/g, "")}`;

  const sortedZones = [...zonaBands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);
  const scaledZones = sortedZones.map((z) => ({
    ...z,
    umbral_inferior: z.umbral_inferior * 2,
    umbral_superior: z.umbral_superior * 2,
  }));
  const boundaryLines = scaledZones.slice(0, -1).map((z) => z.umbral_superior);
  const gridLines = [80, 85, 90, 95, 100, 105, 110, 115, 120];

  const highlightZona = highlightPoint && points.length === 1 ? points[0].zona : null;

  type RenderItem = { point: EIPPoint; color: string };
  const allItems: RenderItem[] = multiCyclePoints
    ? multiCyclePoints.flatMap(({ points: pts, color }) => pts.map((p) => ({ point: p, color })))
    : points.map((p) => ({ point: p, color: ZONA_DOT[p.zona ?? ""] ?? "#6b7280" }));

  const activeItems = allItems.filter(({ point }) => !dimmedIds?.has(point.id));
  const dimmedItems = allItems.filter(({ point }) =>  dimmedIds?.has(point.id));

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
        <clipPath id={clipId}>
          {/* Full-SVG clip: white gutter rects below mask dot overflow in padding zones */}
          <rect x={0} y={0} width={CW} height={CH} />
        </clipPath>
      </defs>

      {/* Static white background */}
      <rect x={0} y={0} width={CW} height={CH} fill="white" />

      {showTitle && (
        <text x={CW / 2} y={28} textAnchor="middle" fontSize={13} fill="#374151" fontWeight="600" letterSpacing="1">
          EVALUACIÓN INTEGRAL DE PERSONAL
        </text>
      )}

      {/* Zoomable/pannable content — clipped to the plot area */}
      <g clipPath={`url(#${clipId})`} transform={contentTransform || undefined}>
        {/* Zone fills */}
        {scaledZones.map((z) => {
          const poly = diagonalPolygon(z.umbral_inferior, z.umbral_superior);
          if (!poly) return null;
          const isHighlighted = highlightZona === z.zona;
          return (
            <polygon key={z.zona} points={poly}
              fill={ZONA_FILL[z.zona] ?? "#f5f5f5"} opacity={isHighlighted ? 0.75 : 0.35} />
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
            <line x1={toX(Q_D1)} y1={PAD.top}   x2={toX(Q_D1)} y2={PAD.top + H}   stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
            <line x1={toX(Q_D2)} y1={PAD.top}   x2={toX(Q_D2)} y2={PAD.top + H}   stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
            <line x1={PAD.left}  y1={toY(Q_P1)} x2={PAD.left + W} y2={toY(Q_P1)} stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
            <line x1={PAD.left}  y1={toY(Q_P2)} x2={PAD.left + W} y2={toY(Q_P2)} stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5,3" />
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

        {/* Ghost dots for previous-cycle overlay */}
        {prevCyclePoints?.map((p) => (
          <circle key={`ghost-${p.id}`} cx={toX(p.desempeno)} cy={toY(p.potencial)} r={3}
            fill="#94a3b8" opacity={0.28} />
        ))}

        {/* Dimmed points */}
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

          if (!showLabels) {
            return (
              <g key={p.id} {...hoverHandlers(p)}>
                <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="white" strokeWidth={1.2} />
              </g>
            );
          }

          const labelW  = label.length * 5.5 + 6;
          const toRight = cx + 8 + labelW < PAD.left + W - 2;
          const labelX  = toRight ? cx + 8 : cx - labelW - 4;
          const labelY  = cy + 3.5;
          return (
            <g key={p.id} {...hoverHandlers(p)}>
              <rect x={labelX - 1} y={labelY - 9} width={labelW} height={12} rx={1.5}
                fill="white" stroke={color} strokeWidth={0.8} opacity={0.92} />
              <text x={labelX + 2} y={labelY} fontSize={8} fill="#374151" fontWeight="500">{label}</text>
              <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="white" strokeWidth={1.2} />
            </g>
          );
        })}
      </g>

      {/* White gutters — mask dots that overflow the plot area (right side left open so labels can extend) */}
      <rect x={0} y={0}         width={PAD.left} height={CH}            fill="white" />
      <rect x={0} y={0}         width={CW}       height={PAD.top}       fill="white" />
      <rect x={0} y={PAD.top+H} width={CW}       height={CH-PAD.top-H} fill="white" />

      {/* Static chart frame — rendered on top of zoomable content */}
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
    </svg>
  );
}

// ── Zoomable chart wrapper ─────────────────────────────────────────────────────
function ZoomableChartView({
  zonaBands,
  points,
  multiCyclePoints,
  dimmedIds,
  showQuadrantLines = false,
  width,
  height,
  showTitle,
  onPointClick,
  onExport,
  prevCyclePoints,
}: {
  zonaBands: ZonaBand[];
  points?: EIPPoint[];
  multiCyclePoints?: { ciclo: number; points: EIPPoint[]; color: string }[];
  dimmedIds?: Set<string>;
  showQuadrantLines?: boolean;
  width: number | string;
  height: number | string;
  showTitle: boolean;
  onPointClick?: (p: EIPPoint) => void;
  onExport?: () => void;
  prevCyclePoints?: EIPPoint[];
}) {
  const [vt, setVt]             = useState({ k: 1, tx: 0, ty: 0 });
  const vtRef                   = useRef({ k: 1, tx: 0, ty: 0 });
  const [isDragging, setIsDrag] = useState(false);
  const [tooltip, setTooltip]   = useState<{ x: number; y: number; point: EIPPoint } | null>(null);
  const wrapRef                 = useRef<HTMLDivElement>(null);

  function applyVt(next: { k: number; tx: number; ty: number }) {
    vtRef.current = next;
    setVt(next);
  }

  function resetZoom() { applyVt({ k: 1, tx: 0, ty: 0 }); }

  function zoomAroundCenter(factor: number) {
    const { k, tx, ty } = vtRef.current;
    const mx = PAD.left + W / 2;
    const my = PAD.top  + H / 2;
    const newK = Math.min(8, Math.max(1, k * factor));
    const ratio = newK / k;
    applyVt({ k: newK, tx: mx - (mx - tx) * ratio, ty: my - (my - ty) * ratio });
  }

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const mx = ((e.clientX - rect.left) / rect.width)  * CW;
      const my = ((e.clientY - rect.top)  / rect.height) * CH;
      const { k, tx, ty } = vtRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newK   = Math.min(8, Math.max(1, k * factor));
      const ratio  = newK / k;
      applyVt({ k: newK, tx: mx - (mx - tx) * ratio, ty: my - (my - ty) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag to pan
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let origin: { cx: number; cy: number; tx: number; ty: number } | null = null;

    const onDown = (e: MouseEvent) => {
      if (vtRef.current.k <= 1) return;
      origin = { cx: e.clientX, cy: e.clientY, tx: vtRef.current.tx, ty: vtRef.current.ty };
      setIsDrag(true);
    };
    const onMove = (e: MouseEvent) => {
      if (!origin) return;
      const rect = el.getBoundingClientRect();
      const sx = CW / rect.width;
      const sy = CH / rect.height;
      applyVt({
        ...vtRef.current,
        tx: origin.tx + (e.clientX - origin.cx) * sx,
        ty: origin.ty + (e.clientY - origin.cy) * sy,
      });
    };
    const onUp = () => { origin = null; setIsDrag(false); };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const contentTransform =
    vt.k === 1 && vt.tx === 0 && vt.ty === 0
      ? undefined
      : `translate(${vt.tx.toFixed(2)},${vt.ty.toFixed(2)}) scale(${vt.k.toFixed(4)})`;

  const showLabels = vt.k >= 1.5;

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
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ cursor: isDragging ? "grabbing" : vt.k > 1 ? "grab" : "default" }}
    >
      <TalentMatrixSVG
        zonaBands={zonaBands}
        points={points}
        multiCyclePoints={multiCyclePoints}
        dimmedIds={dimmedIds}
        showQuadrantLines={showQuadrantLines}
        width={width}
        height={height}
        showTitle={showTitle}
        interactive
        onPointClick={onPointClick}
        onPointHover={(p, x, y) => setTooltip(p ? { x, y, point: p } : null)}
        contentTransform={contentTransform}
        showLabels={showLabels}
        prevCyclePoints={prevCyclePoints}
      />
      {tooltipEl}

      {/* Hint bar when zoomed */}
      {vt.k > 1 && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 bg-white/90 border border-gray-200 rounded-full px-2.5 py-0.5 pointer-events-none shadow-sm">
          {showLabels ? "Nombres visibles · arrastra para moverse" : "Acerca más para ver nombres"}
        </div>
      )}

      {/* Zoom controls — bottom-right */}
      <div className="absolute bottom-2 right-2 flex flex-col items-center" style={{ gap: 0 }}>
        <button
          onClick={() => zoomAroundCenter(1.25)}
          className="w-7 h-7 flex items-center justify-center rounded-t-md bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 text-sm font-bold leading-none"
          title="Acercar (también rueda del mouse)"
        >+</button>
        <div className="w-7 h-5 flex items-center justify-center bg-white border-x border-b border-gray-200 text-[9px] text-gray-400 font-medium tabular-nums">
          {Math.round(vt.k * 100)}%
        </div>
        <button
          onClick={() => zoomAroundCenter(0.8)}
          className="w-7 h-7 flex items-center justify-center bg-white border-x border-b border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 text-sm font-bold leading-none"
          title="Alejar"
        >−</button>
        <button
          onClick={resetZoom}
          className="w-7 h-7 flex items-center justify-center rounded-b-md bg-white border-x border-b border-gray-200 shadow-sm text-gray-400 hover:text-gray-700 text-xs leading-none"
          title="Restablecer zoom"
        >↺</button>
      </div>
    </div>
  );
}

// ── Main chart with filters, multi-cycle, fullscreen ──────────────────────────
export default function EIPScatterChart({
  allCyclePoints,
  uens,
  areas,
  jefes,
  segmentos,
  zonaBands,
}: {
  allCyclePoints: { ciclo: number; points: EIPPoint[] }[];
  uens: string[];
  areas: string[];
  jefes: string[];
  segmentos: string[];
  zonaBands: ZonaBand[];
}) {
  const ciclos = Array.from(new Set(allCyclePoints.map((c) => c.ciclo))).sort((a, b) => b - a);
  const mostRecentCiclo = ciclos[0] ?? 0;

  const [selectedCycles,     setSelectedCycles]     = useState<number[]>([mostRecentCiclo]);
  const [selectedPrevCycles, setSelectedPrevCycles] = useState<number[]>([]);
  const [filterUen,      setFilterUen]      = useState("Todos");
  const [filterArea,     setFilterArea]     = useState("Todos");
  const [filterJefe,     setFilterJefe]     = useState("Todos");
  const [filterSegmento, setFilterSegmento] = useState("Todos");
  const [filterZona,     setFilterZona]     = useState("Todos");
  const [nameFilter,     setNameFilter]     = useState("");
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [fsSize,         setFsSize]         = useState({ w: CW, h: CH });

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

  const cycleColorMap: Record<number, string> = Object.fromEntries(
    ciclos.map((c, i) => [c, CYCLE_PALETTE[i % CYCLE_PALETTE.length]])
  );

  const isMultiCycle = selectedCycles.length > 1;

  const visibleCycleData = allCyclePoints
    .filter((c) => selectedCycles.includes(c.ciclo))
    .map((c) => ({ ...c, color: cycleColorMap[c.ciclo] }));

  const allVisiblePoints = visibleCycleData.flatMap((c) => c.points);

  const prevCyclePoints = useMemo(() =>
    allCyclePoints
      .filter((c) => selectedPrevCycles.includes(c.ciclo))
      .flatMap((c) => c.points),
    [allCyclePoints, selectedPrevCycles]
  );

  function togglePrevCycle(c: number) {
    setSelectedPrevCycles((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  const pointCycleMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const { ciclo, points } of visibleCycleData) {
      for (const p of points) map.set(p.id, ciclo);
    }
    return map;
  }, [visibleCycleData]);

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
    filterJefe !== "Todos" || filterSegmento !== "Todos" ||
    filterZona !== "Todos" || nameFilter.trim() !== "";

  const matchingIds: Set<string> | null = hasActiveFilter
    ? new Set(
        allVisiblePoints
          .filter((p) => {
            if (filterUen      !== "Todos" && p.uen      !== filterUen)      return false;
            if (filterArea     !== "Todos" && p.area     !== filterArea)     return false;
            if (filterJefe     !== "Todos" && p.jefe     !== filterJefe)     return false;
            if (filterSegmento !== "Todos" && p.segmento !== filterSegmento) return false;
            if (filterZona     !== "Todos" && p.zona     !== filterZona)     return false;
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
    setFilterSegmento("Todos");
    setFilterZona("Todos");
    setNameFilter("");
  }

  function exportToExcel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const activePoints = matchingIds
      ? allVisiblePoints.filter((p) => matchingIds.has(p.id))
      : allVisiblePoints;
    const rows = activePoints.map((p) => ({
      Nombre:          p.nombre,
      Puesto:          p.puesto,
      "Área":          p.area       ?? "",
      UEN:             p.uen        ?? "",
      "Jefe Inmediato": p.jefe      ?? "",
      Segmento:        p.segmento   ?? "",
      "Desempeño":     p.desempeno,
      Potencial:       p.potencial,
      Zona:            p.zona       ?? "",
      Ciclo:           pointCycleMap.get(p.id) ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapa de Talento");
    XLSX.writeFile(wb, `MapaTalento_${selectedCycles.join("-")}.xlsx`);
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
      {segmentos.length > 0 && (
        <select value={filterSegmento} onChange={(e) => setFilterSegmento(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
          <option value="Todos">Todos los segmentos</option>
          {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <select value={filterZona} onChange={(e) => setFilterZona(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
        <option value="Todos">Todas las zonas</option>
        {(["Sobresaliente", "Desarrollo", "Estabilidad", "Revisión", "Inicio"] as const).map((z) => (
          <option key={z} value={z}>{z}</option>
        ))}
      </select>
      {hasActiveFilter && (
        <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-700 underline">
          Limpiar
        </button>
      )}
    </div>
  );

  const historicalOverlay = ciclos.length > 1 && (
    <div className="flex items-center gap-3 flex-wrap py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-100">
      <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">
        Superponer ciclos:
      </span>
      {ciclos.slice(1).map((c) => (
        <label key={c} className="flex items-center gap-1.5 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={selectedPrevCycles.includes(c)}
            onChange={() => togglePrevCycle(c)}
            className="w-3.5 h-3.5 rounded accent-slate-400 cursor-pointer"
          />
          <span className="text-xs text-gray-500 group-hover:text-gray-800 font-medium">{c}</span>
          <span className="text-[10px] text-gray-300 font-normal">histórico</span>
        </label>
      ))}
      {selectedPrevCycles.length > 0 && (
        <span className="text-[10px] text-slate-400 ml-1">
          · puntos grises = {selectedPrevCycles.join(", ")}
        </span>
      )}
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

  const svgProps = {
    zonaBands,
    points:           !isMultiCycle ? (visibleCycleData[0]?.points ?? []) : undefined,
    multiCyclePoints: isMultiCycle  ? visibleCycleData                    : undefined,
    dimmedIds:        dimmedIds.size > 0 ? dimmedIds : undefined,
    showQuadrantLines: false,
    onPointClick: (p: EIPPoint) => { window.location.href = `/carpeta/${p.id_empleado}`; },
    prevCyclePoints: prevCyclePoints.length > 0 ? prevCyclePoints : undefined,
  } as const;

  return (
    <>
      {/* ── Fullscreen overlay ── */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap flex-1">
              {cycleToggles}
              {filters(true)}
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{activeCount} colaboradores</span>
            <button
              onClick={exportToExcel}
              className="text-xs font-medium text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors"
              title="Exportar datos filtrados a Excel"
            >
              ↓ Excel
            </button>
            <button
              onClick={() => setIsFullscreen(false)}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 whitespace-nowrap"
            >
              ✕ Cerrar
            </button>
          </div>

          {historicalOverlay && (
            <div className="px-5 pb-2">{historicalOverlay}</div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 overflow-hidden">
            <ZoomableChartView
              {...svgProps}
              width={fsSize.w}
              height={fsSize.h}
              showTitle={false}
              onExport={exportToExcel}
            />
            {legend}
          </div>
        </div>
      )}

      {/* ── Normal card ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <SectionHeader label="Mapa de Talento — EIP" />
            <p className="text-xs text-gray-400 mt-0.5">{activeCount} colaboradores</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {cycleToggles}
            <button
              onClick={exportToExcel}
              className="text-xs border border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-300 px-2.5 py-1.5 rounded-lg transition-colors"
              title="Exportar datos filtrados a Excel"
            >
              ↓ Excel
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              title="Ver en pantalla completa"
            >
              ⛶ Pantalla completa
            </button>
          </div>
        </div>

        {filters(false)}

        {historicalOverlay}

        <ZoomableChartView
          {...svgProps}
          width="100%"
          height="auto"
          showTitle={true}
          onExport={exportToExcel}
        />

        <div className="pt-1">{legend}</div>
      </div>
    </>
  );
}
