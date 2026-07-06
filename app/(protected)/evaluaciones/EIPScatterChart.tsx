"use client";

import { useState, useRef } from "react";
import type { ZonaBand } from "@/lib/types";
export type { ZonaBand };

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

const ZONE_LINE_COLOR  = "#5b9bd5";
const ZONE_LABEL_COLOR = "#4a80b5";

const ZONA_DOT: Record<string, string> = {
  Sobresaliente: "#7c3aed",
  Desarrollo:    "#2563eb",
  Estabilidad:   "#059669",
  Revisión:      "#ea580c",
  Inicio:        "#ca8a04",
};

const ZONA_FILL: Record<string, string> = {
  Sobresaliente: "#ede9fe",
  Desarrollo:    "#dbeafe",
  Estabilidad:   "#d1fae5",
  Revisión:      "#ffedd5",
  Inicio:        "#fef9c3",
};

function toX(d: number) { return PAD.left + ((d - D_MIN) / (D_MAX - D_MIN)) * W; }
function toY(p: number) { return PAD.top  + H - ((p - P_MIN) / (P_MAX - P_MIN)) * H; }

// Polygon for a diagonal zone band (d+p in [sumLo, sumHi])
function diagonalPolygon(sumLo: number, sumHi: number): string {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const pts: [number, number][] = [];

  function addIfInRange(d: number, p: number) {
    if (d >= D_MIN - 0.01 && d <= D_MAX + 0.01 && p >= P_MIN - 0.01 && p <= P_MAX + 0.01)
      pts.push([clamp(d, D_MIN, D_MAX), clamp(p, P_MIN, P_MAX)]);
  }

  // Upper boundary (sum = sumHi), left→right
  addIfInRange(D_MIN,        sumHi - D_MIN);
  addIfInRange(sumHi - P_MAX, P_MAX);
  addIfInRange(D_MAX,        sumHi - D_MAX);
  addIfInRange(sumHi - P_MIN, P_MIN);

  // Lower boundary (sum = sumLo), right→left
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

// Diagonal boundary line endpoints for sum = s
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

// Label position: inside band, ~20% from left
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

// Abbreviated name label: "J. LEGUIZAMO"
function abbrevName(nombre: string): string {
  const words = nombre.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 12).toUpperCase();
  return `${words[0][0].toUpperCase()}. ${words[1].toUpperCase().substring(0, 10)}`;
}

// ── Exported matrix SVG (shared with config preview) ──────────────────────────
export function TalentMatrixSVG({
  zonaBands,
  points = [],
  width = CW,
  height = CH,
  showTitle = true,
  interactive = false,
  onPointClick,
  onPointHover,
}: {
  zonaBands: ZonaBand[];
  points?: EIPPoint[];
  width?: number;
  height?: number;
  showTitle?: boolean;
  interactive?: boolean;
  onPointClick?: (p: EIPPoint) => void;
  onPointHover?: (p: EIPPoint | null, x: number, y: number) => void;
}) {
  const sortedZones = [...zonaBands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);
  const boundaryLines = sortedZones.slice(0, -1).map((z) => z.umbral_superior);
  const gridLines = [80, 85, 90, 95, 100, 105, 110, 115, 120];

  const scale = width / CW;

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} width={width} height={height} style={{ display: "block" }}>

      {/* White background */}
      <rect x={0} y={0} width={CW} height={CH} fill="white" />

      {/* Title */}
      {showTitle && (
        <text
          x={CW / 2} y={28}
          textAnchor="middle"
          fontSize={13}
          fill="#374151"
          fontWeight="600"
          letterSpacing="1"
        >
          EVALUACIÓN INTEGRAL DE PERSONAL
        </text>
      )}

      {/* Zone fills */}
      {sortedZones.map((z) => {
        const poly = diagonalPolygon(z.umbral_inferior, z.umbral_superior);
        if (!poly) return null;
        return (
          <polygon
            key={z.zona}
            points={poly}
            fill={ZONA_FILL[z.zona] ?? "#f5f5f5"}
            opacity={0.55}
          />
        );
      })}

      {/* Grid lines */}
      {gridLines.map((v) => (
        <g key={`g${v}`}>
          <line x1={toX(v)} y1={PAD.top} x2={toX(v)} y2={PAD.top + H} stroke="#e5e7eb" strokeWidth={0.8} />
          <line x1={PAD.left} y1={toY(v)} x2={PAD.left + W} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.8} />
        </g>
      ))}

      {/* Diagonal zone boundary lines */}
      {boundaryLines.map((sum) => {
        const line = boundaryLine(sum);
        if (!line) return null;
        return (
          <line
            key={sum}
            x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]}
            stroke={ZONE_LINE_COLOR}
            strokeWidth={1.4}
          />
        );
      })}

      {/* Chart border */}
      <rect
        x={PAD.left} y={PAD.top}
        width={W} height={H}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={1}
      />

      {/* Axis tick labels */}
      {gridLines.map((v) => (
        <g key={`tick${v}`}>
          <text x={toX(v)} y={PAD.top + H + 16} textAnchor="middle" fontSize={9.5} fill="#6b7280">{v}</text>
          <text x={PAD.left - 8} y={toY(v) + 3.5} textAnchor="end" fontSize={9.5} fill="#6b7280">{v}</text>
        </g>
      ))}

      {/* Axis title — DESEMPEÑO */}
      <text
        x={PAD.left + W / 2}
        y={CH - 6}
        textAnchor="middle"
        fontSize={11}
        fill="#374151"
        fontWeight="700"
        letterSpacing="2"
      >
        D E S E M P E Ñ O
      </text>

      {/* Axis title — POTENCIAL (rotated) */}
      <text
        x={14}
        y={PAD.top + H / 2}
        textAnchor="middle"
        fontSize={11}
        fill="#374151"
        fontWeight="700"
        letterSpacing="2"
        transform={`rotate(-90, 14, ${PAD.top + H / 2})`}
      >
        P O T E N C I A L
      </text>

      {/* Zone labels */}
      {sortedZones.map((z) => {
        const pos = zoneLabelPos(z);
        if (!pos) return null;
        return (
          <text
            key={`lbl-${z.zona}`}
            x={toX(pos.d)}
            y={toY(pos.p)}
            textAnchor="start"
            fontSize={11.5}
            fill={ZONE_LABEL_COLOR}
            fontStyle="italic"
            opacity={0.95}
          >
            {z.zona}
          </text>
        );
      })}

      {/* Data points */}
      {points.map((p) => {
        const cx = toX(p.desempeno);
        const cy = toY(p.potencial);
        const color = ZONA_DOT[p.zona ?? ""] ?? "#6b7280";
        const label = abbrevName(p.nombre);
        const labelX = cx + 8;
        const labelY = cy + 3.5;
        const labelW = label.length * 5.5 + 6;
        return (
          <g
            key={p.id}
            style={{ cursor: interactive ? "pointer" : "default" }}
            onClick={() => onPointClick?.(p)}
            onMouseEnter={(e) => {
              const svg = (e.currentTarget as SVGElement).closest("svg");
              const rect = svg?.getBoundingClientRect();
              if (rect) onPointHover?.(p, e.clientX - rect.left, e.clientY - rect.top);
            }}
            onMouseLeave={() => onPointHover?.(null, 0, 0)}
          >
            {/* Label box */}
            <rect
              x={labelX - 1}
              y={labelY - 9}
              width={labelW}
              height={12}
              rx={1.5}
              fill="white"
              stroke={color}
              strokeWidth={0.8}
              opacity={0.92}
            />
            <text x={labelX + 2} y={labelY} fontSize={8} fill="#374151" fontWeight="500">
              {label}
            </text>
            {/* Dot */}
            <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="white" strokeWidth={1.2} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Main component with filters and tooltip ────────────────────────────────────
export default function EIPScatterChart({
  points,
  uens,
  areas,
  jefes,
  zonaBands,
}: {
  points: EIPPoint[];
  uens: string[];
  areas: string[];
  jefes: string[];
  zonaBands: ZonaBand[];
}) {
  const [filterUen,  setFilterUen]  = useState("Todos");
  const [filterArea, setFilterArea] = useState("Todos");
  const [filterJefe, setFilterJefe] = useState("Todos");
  const [tooltip, setTooltip]       = useState<{ x: number; y: number; point: EIPPoint } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = points.filter((p) => {
    if (filterUen  !== "Todos" && p.uen  !== filterUen)  return false;
    if (filterArea !== "Todos" && p.area !== filterArea) return false;
    if (filterJefe !== "Todos" && p.jefe !== filterJefe) return false;
    return true;
  });

  const sortedZones = [...zonaBands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Mapa de Talento — EIP</p>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} colaboradores</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {uens.length > 0 && (
            <select value={filterUen} onChange={(e) => setFilterUen(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
              <option value="Todos">Todas las UEN</option>
              {uens.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
          {areas.length > 0 && (
            <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
              <option value="Todos">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {jefes.length > 0 && (
            <select value={filterJefe} onChange={(e) => setFilterJefe(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]">
              <option value="Todos">Todos los jefes</option>
              {jefes.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* SVG chart */}
      <div ref={wrapRef} className="relative overflow-x-auto">
        <TalentMatrixSVG
          zonaBands={zonaBands}
          points={filtered}
          width={CW}
          height={CH}
          showTitle
          interactive
          onPointClick={(p) => { window.location.href = `/carpeta/${p.id_empleado}`; }}
          onPointHover={(p, x, y) => setTooltip(p ? { x, y, point: p } : null)}
        />

        {/* Tooltip */}
        {tooltip && (
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
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-1 justify-center">
        {[...sortedZones].reverse().map((z) => (
          <div key={z.zona} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2" style={{ backgroundColor: ZONA_DOT[z.zona] ?? "#9ca3af", borderColor: ZONA_DOT[z.zona] ?? "#9ca3af" }} />
            <span className="text-xs text-gray-500 font-medium">{z.zona}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
