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

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function DetailRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-gray-100 last:border-0 ${highlight ? "font-semibold" : ""}`}>
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-mono ${highlight ? "text-[#1a3a5c] text-sm" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function ColabModal({ row, cicloAño, onClose }: { row: EipPreviewRow; cicloAño: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">EIP Ciclo {cicloAño}</p>
            <h2 className="text-base font-bold text-gray-900 leading-tight">{row.nombre ?? "—"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{row.segmento ?? "—"} · Nivel {row.nivel_num ?? "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4 flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {row.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {row.error}
            </div>
          )}

          {/* Experiencia */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Experiencia</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <DetailRow label="Años de experiencia total" value={fmt(row.años_experiencia, 2)} />
              <DetailRow label="Años promedio por puesto (movilidad)" value={fmt(row.años_en_puesto, 2)} />
              <DetailRow label="ev_años (tabla experiencia)" value={fmt(row.ev_años, 0)} />
              <DetailRow label="ev_mov (tabla movilidad)" value={fmt(row.ev_mov, 0)} />
              <DetailRow label="ev_exp = ev_años × ev_mov / 100" value={
                <span className="text-blue-700 font-semibold">{fmt(row.ev_exp, 1)}</span>
              } />
            </div>
          </div>

          {/* Componentes */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Componentes EIP</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <DetailRow label="ev_form_acad (formación académica)" value={fmt(row.ev_form_acad, 0)} />
              <DetailRow label="ev_comp (competencias 360)" value={
                row.ev_comp != null
                  ? <span className="text-teal-700">{fmt(row.ev_comp, 1)}</span>
                  : <span className="text-orange-500 font-normal">Sin datos</span>
              } />
              <DetailRow label="ev_eal (liderazgo)" value={
                row.tuvo_eal
                  ? fmt(row.ev_eal, 1)
                  : <span className="text-gray-300 font-normal">No aplica</span>
              } />
              <DetailRow label="ev_picd (cumplimiento PICD)" value={
                row.entrego_picd
                  ? fmt(row.ev_picd, 1)
                  : <span className="text-gray-300 font-normal">No entregó</span>
              } />
            </div>
          </div>

          {/* Resultado */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Resultado</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <DetailRow label="Clase de ponderación" value={
                row.calif_ponderada != null
                  ? <span className="bg-gray-200 rounded px-2 py-0.5">{row.calif_ponderada}</span>
                  : "—"
              } />
              <DetailRow
                label="Total EIP"
                value={fmt(row.evaluacion_potencial_total, 2)}
                highlight
              />
              <DetailRow label="Zona" value={
                row.zona
                  ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ZONA_COLOR[row.zona] ?? "bg-gray-100 text-gray-600"}`}>{row.zona}</span>
                  : "—"
              } />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalculadorEIP({ ciclos }: { ciclos?: number[] }) {
  const availableCiclos = ciclos?.length ? ciclos : [2024, 2025, 2026, 2027];
  const [cicloAño, setCicloAño] = useState<number>(availableCiclos[0] ?? new Date().getFullYear());
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<EipPreviewRow | null>(null);

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

  const reset = () => {
    setPreview(null); setResult(null); setError(null);
    setConfirmedOverwrite(false); setSearch(""); setSelectedRow(null);
  };

  const filteredRows = preview?.rows.filter((r) =>
    !search.trim() || (r.nombre ?? "").toLowerCase().includes(search.trim().toLowerCase())
  ) ?? [];

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
                {availableCiclos.map((y) => (
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
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Vista previa — EIP Ciclo {cicloAño}
              </p>
              <div className="relative max-w-xs w-full">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
                />
              </div>
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
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-5 py-8 text-center text-sm text-gray-400">
                        No se encontraron resultados para &ldquo;{search}&rdquo;
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((row) => (
                    <tr key={row.id_empleado} className={`${row.error ? "bg-red-50/40 opacity-60" : "hover:bg-blue-50/30"} transition-colors`}>
                      <td className="px-3 py-2 whitespace-nowrap max-w-[200px]">
                        <button
                          onClick={() => setSelectedRow(row)}
                          className="font-medium text-[#1a3a5c] hover:underline underline-offset-2 text-left truncate max-w-full block"
                          title={row.nombre ?? undefined}
                        >
                          {row.nombre ?? "—"}
                        </button>
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
            {search && filteredRows.length > 0 && (
              <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
                {filteredRows.length} de {preview.rows.length} colaboradores
              </div>
            )}
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

      {/* Detail modal */}
      {selectedRow && (
        <ColabModal
          row={selectedRow}
          cicloAño={cicloAño}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
