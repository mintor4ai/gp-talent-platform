"use client";

import { useState, useRef } from "react";

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

export type ZonaBand = {
  zona: string;
  umbral_inferior: number;
  umbral_superior: number;
};

const ZONA_DOT_COLORS: Record<string, string> = {
  Sobresaliente: "#8b5cf6",
  Desarrollo: "#3b82f6",
  Estabilidad: "#10b981",
  Revisión: "#f97316",
  Inicio: "#eab308",
};

const ZONA_FILL: Record<string, string> = {
  Sobresaliente: "#f3e8ff",
  Desarrollo: "#dbeafe",
  Estabilidad: "#d1fae5",
  Revisión: "#ffedd5",
  Inicio: "#fef9c3",
};

// Chart dimensions
const PAD = { left: 55, right: 30, top: 30, bottom: 50 };
const CW = 560;
const CH = 440;
const W = CW - PAD.left - PAD.right;
const H = CH - PAD.top - PAD.bottom;
const D_MIN = 80, D_MAX = 120;
const P_MIN = 80, P_MAX = 120;

function toX(d: number) { return PAD.left + ((d - D_MIN) / (D_MAX - D_MIN)) * W; }
function toY(p: number) { return PAD.top + H - ((p - P_MIN) / (P_MAX - P_MIN)) * H; }

function diagonalPolygon(sumLo: number, sumHi: number): string {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const pts: [number, number][] = [];

  // Upper boundary (d+p = sumHi), walk left to right then right to lower
  const corners: [number, number][] = [];
  if (sumHi - D_MIN >= P_MIN && sumHi - D_MIN <= P_MAX) corners.push([D_MIN, clamp(sumHi - D_MIN, P_MIN, P_MAX)]);
  if (sumHi - P_MAX >= D_MIN && sumHi - P_MAX <= D_MAX) corners.push([clamp(sumHi - P_MAX, D_MIN, D_MAX), P_MAX]);
  if (sumHi - D_MAX >= P_MIN && sumHi - D_MAX <= P_MAX) corners.push([D_MAX, clamp(sumHi - D_MAX, P_MIN, P_MAX)]);
  if (sumHi - P_MIN >= D_MIN && sumHi - P_MIN <= D_MAX) corners.push([clamp(sumHi - P_MIN, D_MIN, D_MAX), P_MIN]);
  // unique
  const seen = new Set<string>();
  for (const c of corners) {
    const k = `${c[0]},${c[1]}`;
    if (!seen.has(k)) { seen.add(k); pts.push(c); }
  }

  // Lower boundary (d+p = sumLo), reverse
  const cornersLo: [number, number][] = [];
  if (sumLo - P_MIN >= D_MIN && sumLo - P_MIN <= D_MAX) cornersLo.push([clamp(sumLo - P_MIN, D_MIN, D_MAX), P_MIN]);
  if (sumLo - D_MAX >= P_MIN && sumLo - D_MAX <= P_MAX) cornersLo.push([D_MAX, clamp(sumLo - D_MAX, P_MIN, P_MAX)]);
  if (sumLo - P_MAX >= D_MIN && sumLo - P_MAX <= D_MAX) cornersLo.push([clamp(sumLo - P_MAX, D_MIN, D_MAX), P_MAX]);
  if (sumLo - D_MIN >= P_MIN && sumLo - D_MIN <= P_MAX) cornersLo.push([D_MIN, clamp(sumLo - D_MIN, P_MIN, P_MAX)]);
  const seenLo = new Set<string>();
  const ptsLo: [number, number][] = [];
  for (const c of cornersLo) {
    const k = `${c[0]},${c[1]}`;
    if (!seenLo.has(k)) { seenLo.add(k); ptsLo.push(c); }
  }

  const all = [...pts, ...ptsLo];
  if (all.length < 3) return "";
  return all.map(([d, p]) => `${toX(d)},${toY(p)}`).join(" ");
}

export default function EIPScatterChart({ points, uens, areas, jefes, zonaBands }: {
  points: EIPPoint[];
  uens: string[];
  areas: string[];
  jefes: string[];
  zonaBands: ZonaBand[];
}) {
  const [filterUen, setFilterUen] = useState("Todos");
  const [filterArea, setFilterArea] = useState("Todos");
  const [filterJefe, setFilterJefe] = useState("Todos");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: EIPPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const filtered = points.filter((p) => {
    if (filterUen !== "Todos" && p.uen !== filterUen) return false;
    if (filterArea !== "Todos" && p.area !== filterArea) return false;
    if (filterJefe !== "Todos" && p.jefe !== filterJefe) return false;
    return true;
  });

  // Sort zones by threshold for rendering order (bottom to top)
  const sortedZones = [...zonaBands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);
  const boundaryLines = sortedZones.slice(0, -1).map((z) => z.umbral_superior);

  const gridLines = [80, 90, 100, 110, 120];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Mapa de Talento — EIP
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} colaboradores</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {uens.length > 0 && (
            <select
              value={filterUen}
              onChange={(e) => setFilterUen(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            >
              <option value="Todos">Todas las UEN</option>
              {uens.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
          {areas.length > 0 && (
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            >
              <option value="Todos">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {jefes.length > 0 && (
            <select
              value={filterJefe}
              onChange={(e) => setFilterJefe(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            >
              <option value="Todos">Todos los jefes</option>
              {jefes.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CW} ${CH}`}
          className="w-full max-w-2xl mx-auto"
          style={{ minWidth: 320 }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Zone fills */}
          {sortedZones.map((z) => {
            const poly = diagonalPolygon(z.umbral_inferior, z.umbral_superior);
            if (!poly) return null;
            return (
              <polygon
                key={z.zona}
                points={poly}
                fill={ZONA_FILL[z.zona] ?? "#f5f5f5"}
                opacity={0.7}
              />
            );
          })}

          {/* Grid lines */}
          {gridLines.map((v) => (
            <g key={`grid-${v}`}>
              <line x1={toX(v)} y1={PAD.top} x2={toX(v)} y2={PAD.top + H} stroke="#e5e7eb" strokeWidth={1} />
              <line x1={PAD.left} y1={toY(v)} x2={PAD.left + W} y2={toY(v)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={toX(v)} y={PAD.top + H + 18} textAnchor="middle" fontSize={10} fill="#9ca3af">{v}</text>
              <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{v}</text>
            </g>
          ))}

          {/* Diagonal zone boundary lines */}
          {boundaryLines.map((sum) => {
            const x1 = toX(Math.max(D_MIN, sum - P_MAX));
            const y1 = toY(Math.min(P_MAX, sum - D_MIN));
            const x2 = toX(Math.min(D_MAX, sum - P_MIN));
            const y2 = toY(Math.max(P_MIN, sum - D_MAX));
            return (
              <line key={sum} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d1d5db" strokeWidth={1} strokeDasharray="4,3" />
            );
          })}

          {/* Axis labels */}
          <text x={PAD.left + W / 2} y={CH - 8} textAnchor="middle" fontSize={11} fill="#6b7280" fontWeight="500">
            Desempeño
          </text>
          <text
            x={16}
            y={PAD.top + H / 2}
            textAnchor="middle"
            fontSize={11}
            fill="#6b7280"
            fontWeight="500"
            transform={`rotate(-90, 16, ${PAD.top + H / 2})`}
          >
            Potencial
          </text>

          {/* Chart border */}
          <rect x={PAD.left} y={PAD.top} width={W} height={H} fill="none" stroke="#e5e7eb" strokeWidth={1} />

          {/* Zone labels */}
          {sortedZones.map((z) => {
            const midSum = (z.umbral_inferior + z.umbral_superior) / 2;
            const d = Math.min(D_MAX - 2, Math.max(D_MIN + 2, midSum / 2));
            const p = midSum - d;
            if (p < P_MIN || p > P_MAX || d < D_MIN || d > D_MAX) return null;
            return (
              <text
                key={z.zona}
                x={toX(d)}
                y={toY(p) - 6}
                textAnchor="middle"
                fontSize={9}
                fill={ZONA_DOT_COLORS[z.zona] ?? "#6b7280"}
                fontWeight="600"
                opacity={0.8}
              >
                {z.zona}
              </text>
            );
          })}

          {/* Data points */}
          {filtered.map((p) => {
            const cx = toX(p.desempeno);
            const cy = toY(p.potencial);
            const color = ZONA_DOT_COLORS[p.zona ?? ""] ?? "#6b7280";
            const initials = p.nombre.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
            return (
              <g
                key={p.id}
                onMouseEnter={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) {
                    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: p });
                  }
                }}
                style={{ cursor: "pointer" }}
                onClick={() => { window.location.href = `/carpeta/${p.id_empleado}`; }}
              >
                <circle cx={cx} cy={cy} r={14} fill={color} opacity={0.15} />
                <circle cx={cx} cy={cy} r={9} fill={color} opacity={0.9} />
                <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={7} fill="white" fontWeight="700">
                  {initials}
                </text>
              </g>
            );
          })}
        </svg>

        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none bg-white rounded-xl border border-gray-200 shadow-lg p-3 text-xs w-52"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
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
              <p className="mt-2 font-semibold" style={{ color: ZONA_DOT_COLORS[tooltip.point.zona] ?? "#6b7280" }}>
                {tooltip.point.zona}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-1">
        {sortedZones.map((z) => (
          <div key={z.zona} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ZONA_DOT_COLORS[z.zona] ?? "#6b7280" }} />
            <span className="text-xs text-gray-500">{z.zona}</span>
          </div>
        )).reverse()}
      </div>
    </div>
  );
}
