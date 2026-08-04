"use client";

import { useState, useTransition, useCallback } from "react";
import {
  saveTablasExp,
  saveTablaMov,
  copyTablasExpFromCycle,
  copyTablaMovFromCycle,
} from "@/app/actions/tablas_eip";
import type { Periodo } from "@/lib/types";

// ── types ─────────────────────────────────────────────────────────────────────

export type TablasEipRow = {
  ciclo_año: number;
  fila: number;     // años (exp) or movilidad_floor (mov)
  nivel_num: number;
  score: number;
};

// Matrix: fila → nivel_num → score
type Matrix = Record<number, Record<number, number>>;

// ── helpers ───────────────────────────────────────────────────────────────────

function buildMatrix(rows: TablasEipRow[], ciclo: number): Matrix {
  const m: Matrix = {};
  for (const r of rows) {
    if (r.ciclo_año !== ciclo) continue;
    if (!m[r.fila]) m[r.fila] = {};
    m[r.fila][r.nivel_num] = r.score;
  }
  return m;
}

function matrixToCells(m: Matrix) {
  const cells: { fila: number; nivel_num: number; score: number }[] = [];
  for (const [fila, niveles] of Object.entries(m)) {
    for (const [nivel, score] of Object.entries(niveles)) {
      cells.push({ fila: Number(fila), nivel_num: Number(nivel), score });
    }
  }
  return cells;
}

const SCORE_BG: Record<number, string> = {
  80:  "bg-red-50 text-red-700",
  85:  "bg-orange-50 text-orange-700",
  90:  "bg-amber-50 text-amber-700",
  95:  "bg-yellow-50 text-yellow-800",
  100: "bg-white text-gray-700",
  105: "bg-emerald-50 text-emerald-700",
  110: "bg-green-50 text-green-700",
  115: "bg-green-100 text-green-800",
  120: "bg-green-200 text-green-900",
};

function scoreBg(score: number): string {
  return SCORE_BG[score] ?? "bg-blue-50 text-blue-700";
}

function clampScore(v: number) {
  return Math.min(120, Math.max(80, Math.round(v / 5) * 5));
}

// Detect gaps: rows where value decreases as años increase (for same nivel)
function detectGaps(m: Matrix, maxFila: number): Set<string> {
  const bad = new Set<string>();
  for (let nivel = 1; nivel <= 13; nivel++) {
    let prev: number | null = null;
    for (let fila = 0; fila <= maxFila; fila++) {
      const val = m[fila]?.[nivel];
      if (val == null) {
        bad.add(`${fila}-${nivel}`);
        continue;
      }
      if (prev !== null && val < prev) {
        bad.add(`${fila}-${nivel}`);
      }
      prev = val;
    }
  }
  return bad;
}

// ── sub-component: one matrix editor ─────────────────────────────────────────

function MatrixEditor({
  label,
  matrix,
  maxFila,
  filaLabel,
  onChange,
  gaps,
}: {
  label: string;
  matrix: Matrix;
  maxFila: number;
  filaLabel: (f: number) => string;
  onChange: (fila: number, nivel: number, score: number) => void;
  gaps: Set<string>;
}) {
  const filas = Array.from({ length: maxFila + 1 }, (_, i) => i);
  const niveles = Array.from({ length: 13 }, (_, i) => i + 1);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap border-r border-gray-200 min-w-[60px]">
                Años
              </th>
              {niveles.map((n) => (
                <th key={n} className="px-1 py-1.5 text-center text-gray-500 font-medium min-w-[44px]">
                  N{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="sticky left-0 z-10 bg-white border-r border-gray-200 px-2 py-1 text-gray-500 font-mono font-medium">
                  {filaLabel(fila)}
                </td>
                {niveles.map((nivel) => {
                  const score = matrix[fila]?.[nivel] ?? 80;
                  const isGap = gaps.has(`${fila}-${nivel}`);
                  return (
                    <td key={nivel} className="p-0.5">
                      <select
                        value={score}
                        onChange={(e) => onChange(fila, nivel, Number(e.target.value))}
                        className={`w-full text-center text-xs rounded border-0 py-1 px-0.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] cursor-pointer ${
                          isGap ? "ring-1 ring-red-400 " : ""
                        }${scoreBg(score)}`}
                      >
                        {[80, 85, 90, 95, 100, 105, 110, 115, 120].map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TablasEipTab({
  tablaExp,
  tablaMov,
  periodos,
}: {
  tablaExp: TablasEipRow[];
  tablaMov: TablasEipRow[];
  periodos: Periodo[];
}) {
  const currentYear = new Date().getFullYear();
  const expCycles  = Array.from(new Set(tablaExp.map((r) => r.ciclo_año))).sort((a, b) => b - a);
  const movCycles  = Array.from(new Set(tablaMov.map((r) => r.ciclo_año))).sort((a, b) => b - a);
  const periodCycles = periodos.map((p) => p.ciclo_año);
  const allCycleSet = new Set([...expCycles, ...movCycles, ...periodCycles, currentYear]);
  const allCycles = Array.from(allCycleSet).sort((a, b) => b - a);
  const periodoMap = new Map(periodos.map((p) => [p.ciclo_año, p]));

  const [cicloAño, setCicloAño] = useState(allCycles[0] ?? currentYear);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sourceCiclo, setSourceCiclo] = useState(allCycles[1] ?? currentYear - 1);

  // Local matrices
  const [expMatrix, setExpMatrix] = useState<Matrix>(() => buildMatrix(tablaExp, cicloAño));
  const [movMatrix, setMovMatrix] = useState<Matrix>(() => buildMatrix(tablaMov, cicloAño));

  function handleCicloChange(año: number) {
    setCicloAño(año);
    setExpMatrix(buildMatrix(tablaExp, año));
    setMovMatrix(buildMatrix(tablaMov, año));
    setMsg(null);
  }

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4500);
  }

  const setExpCell = useCallback((fila: number, nivel: number, score: number) => {
    setExpMatrix((prev) => ({
      ...prev,
      [fila]: { ...(prev[fila] ?? {}), [nivel]: clampScore(score) },
    }));
  }, []);

  const setMovCell = useCallback((fila: number, nivel: number, score: number) => {
    setMovMatrix((prev) => ({
      ...prev,
      [fila]: { ...(prev[fila] ?? {}), [nivel]: clampScore(score) },
    }));
  }, []);

  const expGaps = detectGaps(expMatrix, 34);
  const movGaps = detectGaps(movMatrix, 20);
  const totalGaps = expGaps.size + movGaps.size;

  function handleSave() {
    startTransition(async () => {
      const [resExp, resMov] = await Promise.all([
        saveTablasExp(cicloAño, matrixToCells(expMatrix)),
        saveTablaMov(cicloAño, matrixToCells(movMatrix)),
      ]);
      if (resExp.error || resMov.error) {
        flash(resExp.error ?? resMov.error ?? "Error al guardar", false);
      } else {
        flash(`Tablas EIP ${cicloAño} guardadas correctamente.`);
      }
    });
  }

  function handleCopy() {
    startTransition(async () => {
      const [resExp, resMov] = await Promise.all([
        copyTablasExpFromCycle(sourceCiclo, cicloAño),
        copyTablaMovFromCycle(sourceCiclo, cicloAño),
      ]);
      if (resExp.error || resMov.error) {
        flash(resExp.error ?? resMov.error ?? "Error al copiar", false);
      } else {
        setExpMatrix(buildMatrix(tablaExp, sourceCiclo));
        setMovMatrix(buildMatrix(tablaMov, sourceCiclo));
        flash(`Copiado desde ${sourceCiclo}. Verifica y guarda los cambios.`);
      }
    });
  }

  function cycleLabel(año: number) {
    const p = periodoMap.get(año);
    const hasData = expCycles.includes(año);
    if (!p) return `${año}${!hasData ? " (nuevo)" : ""}`;
    const badge = p.activo ? " · Vigente" : p.estado === "cerrado" ? " · Cerrado" : "";
    return `${p.nombre}${badge}`;
  }

  const otherCycles = allCycles.filter((y) => y !== cicloAño);

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Tablas de Puntuación EIP</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Define los valores de experiencia (80–120) por años y nivel. La evaluación de experiencia se calcula como{" "}
            <code className="bg-gray-100 px-1 rounded">ev_exp = ev_años × ev_movilidad / 100</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Cycle selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo</label>
            <select
              value={cicloAño}
              onChange={(e) => handleCicloChange(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
            >
              {allCycles.map((y) => (
                <option key={y} value={y}>{cycleLabel(y)}</option>
              ))}
            </select>
          </div>

          {/* Copy from cycle */}
          {otherCycles.length > 0 && (
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Copiar desde</label>
                <select
                  value={sourceCiclo}
                  onChange={(e) => setSourceCiclo(Number(e.target.value))}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
                >
                  {otherCycles.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleCopy}
                disabled={isPending || sourceCiclo === cicloAño}
                className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Copiar tablas
              </button>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] disabled:opacity-50 transition-colors font-medium"
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

        {/* Gap warning */}
        {totalGaps > 0 && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <span className="text-red-400 font-bold mt-0.5">!</span>
            <span>
              {totalGaps} celda{totalGaps !== 1 ? "s" : ""} con valor decreciente (marcadas en rojo). Los valores deben ser no-decrecientes por año para cada nivel.
            </span>
          </div>
        )}

        {/* Flash message */}
        {msg && (
          <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${msg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500">Escala:</span>
        {[80, 85, 90, 95, 100, 105, 110, 115, 120].map((v) => (
          <span key={v} className={`text-xs px-2 py-0.5 rounded font-mono ${scoreBg(v)}`}>{v}</span>
        ))}
      </div>

      {/* Tabla Años de Experiencia */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Tabla Años de Experiencia</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Filas = años de antigüedad (0–34) · Columnas = nivel organizacional (N1–N13)
          </p>
        </div>
        <MatrixEditor
          label=""
          matrix={expMatrix}
          maxFila={34}
          filaLabel={(f) => String(f)}
          onChange={setExpCell}
          gaps={expGaps}
        />
      </div>

      {/* Tabla Movilidad */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Tabla Movilidad</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Filas = años en el puesto actual (0–20) · Columnas = nivel organizacional (N1–N13)
          </p>
        </div>
        <MatrixEditor
          label=""
          matrix={movMatrix}
          maxFila={20}
          filaLabel={(f) => String(f)}
          onChange={setMovCell}
          gaps={movGaps}
        />
      </div>
    </div>
  );
}
