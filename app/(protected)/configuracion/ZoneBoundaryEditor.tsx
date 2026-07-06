"use client";

import { useState, useRef } from "react";
import type { ZonaBand } from "@/lib/types";

// ── Chart geometry ────────────────────────────────────────────────────────────
const PAD   = { left: 64, right: 30, top: 48, bottom: 56 };
const CW = 580, CH = 500;
const W  = CW - PAD.left - PAD.right;
const H  = CH - PAD.top  - PAD.bottom;
const D_MIN = 80, D_MAX = 120;
const P_MIN = 80, P_MAX = 120;
const MIN_GAP = 5;
const SNAP    = 0.5;
const GRID = [80, 85, 90, 95, 100, 105, 110, 115, 120];
const LINE_COLOR  = "#5b9bd5";
const LABEL_COLOR = "#4a80b5";

const ZONE_ORDER = ["Inicio", "Revisión", "Estabilidad", "Desarrollo", "Sobresaliente"] as const;

const ZONA_FILL: Record<string, string> = {
  Sobresaliente: "#ede9fe", Desarrollo: "#dbeafe",
  Estabilidad:   "#d1fae5", Revisión:   "#ffedd5", Inicio: "#fef9c3",
};
const ZONA_DOT: Record<string, string> = {
  Sobresaliente: "#7c3aed", Desarrollo: "#2563eb",
  Estabilidad:   "#059669", Revisión:   "#ea580c", Inicio: "#ca8a04",
};

// ── SVG helpers ───────────────────────────────────────────────────────────────
const toX = (d: number) => PAD.left + ((d - D_MIN) / (D_MAX - D_MIN)) * W;
const toY = (p: number) => PAD.top  + H - ((p - P_MIN) / (P_MAX - P_MIN)) * H;

function xyToSum(svgX: number, svgY: number) {
  const d = D_MIN + ((svgX - PAD.left) / W) * (D_MAX - D_MIN);
  const p = P_MAX - ((svgY - PAD.top)  / H) * (P_MAX - P_MIN);
  return d + p;
}

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }

function diagonalPolygon(lo: number, hi: number): string {
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const pts: [number, number][] = [];
  const add = (d: number, p: number) => {
    if (d >= D_MIN - 0.01 && d <= D_MAX + 0.01 && p >= P_MIN - 0.01 && p <= P_MAX + 0.01)
      pts.push([clamp(d, D_MIN, D_MAX), clamp(p, P_MIN, P_MAX)]);
  };
  add(D_MIN, hi - D_MIN); add(hi - P_MAX, P_MAX);
  add(D_MAX, hi - D_MAX); add(hi - P_MIN, P_MIN);
  add(lo - P_MIN, P_MIN); add(D_MAX, lo - D_MAX);
  add(lo - P_MAX, P_MAX); add(D_MIN, lo - D_MIN);
  const seen = new Map<string, [number, number]>();
  for (const pt of pts) seen.set(`${pt[0].toFixed(2)},${pt[1].toFixed(2)}`, pt);
  const u = Array.from(seen.values());
  if (u.length < 3) return "";
  return u.map(([d, p]) => `${toX(d)},${toY(p)}`).join(" ");
}

function boundaryLine(s: number): [number, number, number, number] | null {
  const cands: [number, number][] = [
    [D_MIN, s - D_MIN], [D_MAX, s - D_MAX],
    [s - P_MIN, P_MIN], [s - P_MAX, P_MAX],
  ];
  const seen = new Set<string>();
  const uniq: [number, number][] = [];
  for (const [d, p] of cands) {
    if (d >= D_MIN - 0.01 && d <= D_MAX + 0.01 && p >= P_MIN - 0.01 && p <= P_MAX + 0.01) {
      const k = `${d.toFixed(1)},${p.toFixed(1)}`;
      if (!seen.has(k)) { seen.add(k); uniq.push([d, p]); }
    }
  }
  if (uniq.length < 2) return null;
  return [toX(uniq[0][0]), toY(uniq[0][1]), toX(uniq[1][0]), toY(uniq[1][1])];
}

function labelPos(lo: number, hi: number): { x: number; y: number } | null {
  const mid = (lo + hi) / 2;
  let d = Math.max(D_MIN + 4, mid - P_MAX + 4);
  let p = mid - d;
  if (p > P_MAX - 2) { p = P_MAX - 2; d = mid - p; }
  if (p < P_MIN + 2) { p = P_MIN + 2; d = mid - p; }
  if (d > D_MAX - 2) { d = D_MAX - 2; p = mid - d; }
  if (d < D_MIN + 2 || p < P_MIN || p > P_MAX || d > D_MAX) return null;
  return { x: toX(d), y: toY(p) };
}

// ── Conversion helpers ────────────────────────────────────────────────────────
function bandsToLimits(bands: ZonaBand[]): number[] {
  const sorted = [...bands].sort((a, b) => a.umbral_inferior - b.umbral_inferior);
  if (sorted.length !== ZONE_ORDER.length) return [160, 175, 187.5, 212.5, 225, 240];
  return [sorted[0].umbral_inferior, ...sorted.map((b) => b.umbral_superior)];
}

function limitsToBands(limits: number[]): ZonaBand[] {
  return ZONE_ORDER.map((zona, i) => ({
    zona,
    umbral_inferior: limits[i],
    umbral_superior: limits[i + 1],
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ZoneBoundaryEditor({
  initialBands,
  onSave,
  isPending,
}: {
  initialBands: ZonaBand[];
  onSave: (bands: ZonaBand[]) => void;
  isPending: boolean;
}) {
  const [limits, setLimits]     = useState<number[]>(() => bandsToLimits(initialBands));
  const [dragging, setDragging] = useState(false);
  const dragIdx = useRef<number | null>(null);
  const svgRef  = useRef<SVGSVGElement>(null);

  const bands = limitsToBands(limits);

  function moveBoundary(idx: number, raw: number) {
    if (idx <= 0 || idx >= limits.length - 1) return;
    setLimits((prev) => {
      const lo = prev[idx - 1] + MIN_GAP;
      const hi = prev[idx + 1] - MIN_GAP;
      const v  = Math.max(lo, Math.min(hi, snap(raw)));
      const n  = [...prev];
      n[idx] = v;
      return n;
    });
  }

  function svgCoords(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (CW / rect.width),
      (e.clientY - rect.top)  * (CH / rect.height),
    ];
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const [sx, sy] = svgCoords(e);
    const HIT = 16;
    for (let i = 1; i < limits.length - 1; i++) {
      const line = boundaryLine(limits[i]);
      if (!line) continue;
      const mx = (line[0] + line[2]) / 2;
      const my = (line[1] + line[3]) / 2;
      if (Math.hypot(sx - mx, sy - my) <= HIT) {
        e.preventDefault();
        dragIdx.current = i;
        setDragging(true);
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        return;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragIdx.current === null) return;
    const [sx, sy] = svgCoords(e);
    moveBoundary(dragIdx.current, xyToSum(sx, sy));
  }

  function onPointerUp() {
    dragIdx.current = null;
    setDragging(false);
  }

  const activeIdx = dragging ? dragIdx.current : null;

  return (
    <div className="space-y-4">
      {/* ── Interactive SVG ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Vista previa interactiva</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Arrastra los puntos{" "}
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#5b9bd5] align-middle" />{" "}
              sobre las líneas azules para reubicar los límites entre zonas
            </p>
          </div>
          <span className="text-xs text-gray-300 mt-0.5 whitespace-nowrap">
            Δ mínimo por zona: {MIN_GAP} pts
          </span>
        </div>
        <div className="p-4 flex justify-center select-none">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CW} ${CH}`}
            width={520}
            height={448}
            style={{ display: "block", cursor: dragging ? "grabbing" : "default", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <rect x={0} y={0} width={CW} height={CH} fill="white" />

            {/* Zone fills */}
            {bands.map((z) => {
              const poly = diagonalPolygon(z.umbral_inferior, z.umbral_superior);
              return poly
                ? <polygon key={z.zona} points={poly} fill={ZONA_FILL[z.zona] ?? "#f5f5f5"} opacity={0.55} />
                : null;
            })}

            {/* Grid */}
            {GRID.map((v) => (
              <g key={v}>
                <line x1={toX(v)} y1={PAD.top} x2={toX(v)} y2={PAD.top + H} stroke="#e5e7eb" strokeWidth={0.8} />
                <line x1={PAD.left} y1={toY(v)} x2={PAD.left + W} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.8} />
              </g>
            ))}

            {/* Interior boundary lines */}
            {limits.slice(1, -1).map((s, i) => {
              const line = boundaryLine(s);
              return line ? (
                <line key={i}
                  x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]}
                  stroke={LINE_COLOR}
                  strokeWidth={activeIdx === i + 1 ? 2.5 : 1.8}
                />
              ) : null;
            })}

            {/* Chart border */}
            <rect x={PAD.left} y={PAD.top} width={W} height={H} fill="none" stroke="#9ca3af" strokeWidth={1} />

            {/* Axis ticks */}
            {GRID.map((v) => (
              <g key={`t${v}`}>
                <text x={toX(v)} y={PAD.top + H + 16} textAnchor="middle" fontSize={9.5} fill="#6b7280">{v}</text>
                <text x={PAD.left - 8} y={toY(v) + 3.5} textAnchor="end" fontSize={9.5} fill="#6b7280">{v}</text>
              </g>
            ))}

            {/* Axis titles */}
            <text x={PAD.left + W / 2} y={CH - 6} textAnchor="middle" fontSize={11} fill="#374151" fontWeight="700" letterSpacing="2">D E S E M P E Ñ O</text>
            <text x={14} y={PAD.top + H / 2} textAnchor="middle" fontSize={11} fill="#374151" fontWeight="700" letterSpacing="2" transform={`rotate(-90, 14, ${PAD.top + H / 2})`}>P O T E N C I A L</text>

            {/* Zone labels */}
            {bands.map((z) => {
              const pos = labelPos(z.umbral_inferior, z.umbral_superior);
              return pos ? (
                <text key={z.zona} x={pos.x} y={pos.y} textAnchor="start" fontSize={11.5} fill={LABEL_COLOR} fontStyle="italic" opacity={0.9}>
                  {z.zona}
                </text>
              ) : null;
            })}

            {/* Drag handles */}
            {limits.slice(1, -1).map((s, i) => {
              const line = boundaryLine(s);
              if (!line) return null;
              const mx = (line[0] + line[2]) / 2;
              const my = (line[1] + line[3]) / 2;
              const active = activeIdx === i + 1;
              return (
                <g key={`h${i}`} style={{ cursor: active ? "grabbing" : "grab", pointerEvents: "none" }}>
                  <circle cx={mx} cy={my} r={active ? 9 : 7} fill="white" stroke={LINE_COLOR} strokeWidth={2} />
                  <circle cx={mx} cy={my} r={active ? 4.5 : 3} fill={LINE_COLOR} />
                  {active && (
                    <>
                      <rect x={mx + 12} y={my - 22} width={58} height={18} rx={4} fill="white" stroke={LINE_COLOR} strokeWidth={1} opacity={0.95} />
                      <text x={mx + 16} y={my - 8} fontSize={10} fill={LINE_COLOR} fontWeight="600">Σ = {s}</text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Numeric fine-tune ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">Ajuste numérico</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Edita el límite <strong>hasta</strong> de cada zona; el <strong>desde</strong> de la zona siguiente se actualiza automáticamente.
          </p>
        </div>
        <div className="p-5 space-y-3">
          {ZONE_ORDER.map((zona, i) => (
            <div key={zona} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-28 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ZONA_DOT[zona] }} />
                <span className="text-xs font-medium text-gray-700">{zona}</span>
              </div>
              <span className="text-xs text-gray-400 w-10 text-right">desde</span>
              <span className="w-20 px-2 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-400 text-center inline-block">
                {limits[i]}
              </span>
              <span className="text-xs text-gray-400">hasta</span>
              {i === ZONE_ORDER.length - 1 ? (
                <span className="w-20 px-2 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-400 text-center inline-block">
                  {limits[i + 1]}
                </span>
              ) : (
                <input
                  type="number"
                  value={limits[i + 1]}
                  step={SNAP}
                  min={limits[i] + MIN_GAP}
                  max={limits[i + 2] - MIN_GAP}
                  onChange={(e) => moveBoundary(i + 1, Number(e.target.value))}
                  className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button
          onClick={() => onSave(bands)}
          disabled={isPending}
          className="text-sm bg-[#1a3a5c] text-white px-6 py-2.5 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
        >
          {isPending ? "Guardando..." : "Guardar zonas"}
        </button>
      </div>
    </div>
  );
}
