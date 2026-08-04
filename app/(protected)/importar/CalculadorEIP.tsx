"use client";

import { useState } from "react";
import type { EipPreviewRow } from "@/app/api/calcular-eip/route";

type PreviewResponse = {
  rows: EipPreviewRow[];
  total: number;
  con_total: number;
  sin_comp: number;
  sin_exp: number;
  con_eal: number;
  con_picd: number;
  ref_date: string;
};

type CalcResult = {
  ok: boolean;
  upserted: number;
  skipped: number;
  errors: string[];
  ref_date: string;
};

const ZONA_COLOR: Record<string, string> = {
  "Inicio":        "bg-red-100 text-red-700",
  "Revisión":      "bg-orange-100 text-orange-700",
  "Estabilidad":   "bg-yellow-100 text-yellow-800",
  "Desarrollo":    "bg-blue-100 text-blue-700",
  "Sobresaliente": "bg-green-100 text-green-700",
};

export default function CalculadorEIP() {
  const [cicloAño, setCicloAño] = useState<number>(new Date().getFullYear());
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(false);

  const call = async (modo: "preview" | "calcular") => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/calcular-eip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciclo_año: cicloAño, modo }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Error del servidor"); return; }
      if (modo === "preview") setPreview(json);
      else setResult(json);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setPreview(null); setResult(null); setError(null); setConfirmedOverwrite(false); };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">
          Calcula la <strong>Evaluación Integral de Potencial (EIP)</strong> para el ciclo seleccionado
          usando las tablas de experiencia/movilidad, competencias 360 ya importadas, EAL y PICD.
        </p>
      </div>

      {/* Info card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Fuentes de datos utilizadas</p>
        <ul className="text-xs space-y-1 text-blue-700 list-disc list-inside">
          <li><strong>ev_exp</strong> = ev_años × ev_movilidad / 100 — Tablas Experiencia/Movilidad (Configuración)</li>
          <li><strong>ev_form_acad</strong> — Formación Académica registrada (nivel más alto)</li>
          <li><strong>ev_comp</strong> — Competencias 360 (ya calculadas en el ciclo)</li>
          <li><strong>ev_eal</strong> — EAL importado para el ciclo</li>
          <li><strong>ev_picd</strong> — % cumplimiento PICD del ciclo</li>
          <li><strong>Ponderaciones</strong> — Configuración EIP del ciclo</li>
        </ul>
      </div>

      {/* Controls */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo</label>
              <select
                value={cicloAño}
                onChange={(e) => { setCicloAño(Number(e.target.value)); reset(); }}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => call("preview")}
              disabled={loading}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? "Calculando…" : "Vista previa"}
            </button>
            {preview && (
              <button onClick={reset} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">
                Limpiar
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>
      )}

      {/* Preview */}
      {preview && !result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs text-gray-400 mb-3">
              Fecha de referencia para antigüedad: <strong>{preview.ref_date}</strong>
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Colaboradores", value: preview.total, color: "gray" },
                { label: "Con EIP completo", value: preview.con_total, color: "green" },
                { label: "Sin competencias 360", value: preview.sin_comp, color: preview.sin_comp > 0 ? "orange" : "gray" },
                { label: "Sin exp/nivel", value: preview.sin_exp, color: preview.sin_exp > 0 ? "orange" : "gray" },
                { label: "Con EAL", value: preview.con_eal, color: "blue" },
                { label: "Con PICD", value: preview.con_picd, color: "blue" },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg border px-4 py-3 text-center min-w-[100px] ${
                  s.color === "green"  ? "bg-green-50 border-green-200" :
                  s.color === "orange" ? "bg-orange-50 border-orange-200" :
                  s.color === "blue"   ? "bg-blue-50 border-blue-200" :
                  "bg-gray-50 border-gray-200"
                }`}>
                  <p className={`text-2xl font-bold ${
                    s.color === "green"  ? "text-green-700" :
                    s.color === "orange" ? "text-orange-700" :
                    s.color === "blue"   ? "text-blue-700" :
                    "text-gray-700"
                  }`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="confirmar"
                checked={confirmedOverwrite}
                onChange={(e) => setConfirmedOverwrite(e.target.checked)}
                className="w-4 h-4 rounded accent-[#1a3a5c]"
              />
              <label htmlFor="confirmar" className="text-sm text-gray-700 cursor-pointer select-none">
                Confirmo que deseo <strong>calcular y guardar</strong> el EIP {cicloAño} para los {preview.con_total} colaboradores con datos completos.
              </label>
            </div>
            <button
              onClick={() => call("calcular")}
              disabled={loading || !confirmedOverwrite || preview.con_total === 0}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] disabled:opacity-50 font-semibold whitespace-nowrap"
            >
              {loading ? "Guardando…" : `Calcular EIP ${cicloAño}`}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Vista previa — EIP Ciclo {cicloAño}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5 whitespace-nowrap">Colaborador</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Segmento</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Años exp</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Años puesto</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_años</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_mov</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_exp</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_form</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_comp</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_eal</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">ev_picd</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Clase</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">Total EIP</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Zona</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row) => (
                    <tr key={row.id_empleado} className={row.error ? "bg-red-50/40 opacity-60" : ""}>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap max-w-[200px] truncate">
                        {row.nombre ?? "—"}
                        {row.error && <span className="ml-1 text-red-500 text-[10px]">({row.error})</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-[11px]">{row.segmento ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-600 font-mono">{row.años_experiencia ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-600 font-mono">{row.años_en_puesto ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-600 font-mono">{row.ev_años ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-600 font-mono">{row.ev_mov ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-700">{row.ev_exp?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{row.ev_form_acad ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{row.ev_comp?.toFixed(1) ?? <span className="text-orange-500">—</span>}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">
                        {row.tuvo_eal ? (row.ev_eal?.toFixed(1) ?? "—") : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">
                        {row.entrego_picd ? (row.ev_picd?.toFixed(1) ?? "—") : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.calif_ponderada != null && (
                          <span className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono text-[11px]">
                            {row.calif_ponderada}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#1a3a5c]">
                        {row.evaluacion_potencial_total?.toFixed(2) ?? <span className="text-gray-400 font-normal">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.zona && (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ZONA_COLOR[row.zona] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.zona}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 space-y-4 ${result.errors.length ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"}`}>
          <p className={`text-lg font-bold ${result.errors.length ? "text-orange-800" : "text-green-800"}`}>
            {result.errors.length ? "EIP calculado con advertencias" : "EIP calculado y guardado exitosamente"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Registros guardados", value: result.upserted },
              { label: "Omitidos (sin datos)", value: result.skipped },
              { label: "Fecha de referencia", value: result.ref_date },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          <button
            onClick={reset}
            className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] transition-colors"
          >
            Nuevo cálculo
          </button>
        </div>
      )}
    </div>
  );
}
