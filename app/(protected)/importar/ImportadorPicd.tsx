"use client";

import { useState, useRef } from "react";
import type { PicdPreviewRow } from "@/app/api/importar/picd/route";

type PreviewResponse = {
  rows: PicdPreviewRow[];
  total: number;
  matched: number;
  unmatched: number;
  duplicados: number;
  ciclos: number[];
};

type ImportResult = {
  ok: boolean;
  upserted: number;
  skipped: number;
  errors: string[];
};

export default function ImportadorPicd() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCiclo, setFilterCiclo] = useState<number | "all">("all");
  const [confirmed, setConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setPreview(null); setResult(null);
    setError(null); setConfirmed(false); setFilterCiclo("all");
    if (inputRef.current) inputRef.current.value = "";
  };

  const call = async (modo: "preview" | "import") => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", modo);
      const res = await fetch("/api/importar/picd", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Error del servidor"); return; }
      if (modo === "preview") { setPreview(json); setConfirmed(false); }
      else { setResult(json); setPreview(null); }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = preview
    ? (filterCiclo === "all"
        ? preview.rows
        : preview.rows.filter((r) => r.ciclo_año === filterCiclo))
    : [];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">
          Importa el reporte de <strong>Cumplimiento PICD</strong> (Plan Individual de Capacitación y Desarrollo).
          El archivo puede contener múltiples periodos; el sistema calcula automáticamente el ciclo por año de cierre.
        </p>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Reglas de cálculo</p>
        <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5">
          <li><strong>Porcentaje de cumplimiento</strong> = promedio de <code>Porcentaje2</code> por persona y periodo (vacíos = 0)</li>
          <li><strong>Ciclo</strong> = año de <code>Fecha Cierre</code> + 1 (ej. cierre dic/2025 → Ciclo 2026)</li>
          <li>Cualquier empleado en el archivo se marca como <strong>entregó PICD</strong></li>
          <li>Si ya existe un registro para ese empleado y ciclo, se <strong>sobreescribe</strong> el porcentaje</li>
        </ul>
      </div>

      {/* File picker */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Archivo Excel / CSV del reporte PICD
              </label>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPreview(null); setResult(null); setError(null);
                  setConfirmed(false); setFilterCiclo("all");
                  setFile(f);
                }}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-[#1a3a5c] file:text-white hover:file:bg-[#15304e] cursor-pointer"
              />
            </div>
            <button
              onClick={() => call("preview")}
              disabled={!file || loading}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] disabled:opacity-50 font-medium"
            >
              {loading ? "Procesando…" : "Vista previa"}
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
          {/* Summary chips */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Total registros", value: preview.total, color: "gray" },
                { label: "Con match en BD", value: preview.matched, color: "green" },
                { label: "Sin match", value: preview.unmatched, color: preview.unmatched > 0 ? "orange" : "gray" },
                { label: "Actualizarán registro existente", value: preview.duplicados, color: preview.duplicados > 0 ? "yellow" : "gray" },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg border px-4 py-3 text-center min-w-[120px] ${
                  s.color === "green"  ? "bg-green-50 border-green-200" :
                  s.color === "orange" ? "bg-orange-50 border-orange-200" :
                  s.color === "yellow" ? "bg-yellow-50 border-yellow-200" :
                  "bg-gray-50 border-gray-200"
                }`}>
                  <p className={`text-2xl font-bold ${
                    s.color === "green"  ? "text-green-700" :
                    s.color === "orange" ? "text-orange-700" :
                    s.color === "yellow" ? "text-yellow-700" :
                    "text-gray-700"
                  }`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Ciclo filter */}
            {preview.ciclos.length > 1 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500 font-medium">Filtrar ciclo:</span>
                <button
                  onClick={() => setFilterCiclo("all")}
                  className={`text-xs px-3 py-1 rounded-full border ${filterCiclo === "all" ? "bg-[#1a3a5c] text-white border-[#1a3a5c]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                >
                  Todos
                </button>
                {preview.ciclos.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilterCiclo(c)}
                    className={`text-xs px-3 py-1 rounded-full border ${filterCiclo === c ? "bg-[#1a3a5c] text-white border-[#1a3a5c]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Confirm + import */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="confirmar-picd"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 rounded accent-[#1a3a5c]"
              />
              <label htmlFor="confirmar-picd" className="text-sm text-gray-700 cursor-pointer select-none">
                Confirmo importar PICD para <strong>{preview.matched}</strong> colaboradores
                {preview.ciclos.length > 0 && (
                  <> — ciclos: <strong>{preview.ciclos.join(", ")}</strong></>
                )}.
                {preview.duplicados > 0 && (
                  <span className="text-yellow-700"> ({preview.duplicados} sobreescribirán registros existentes)</span>
                )}
              </label>
            </div>
            <button
              onClick={() => call("import")}
              disabled={loading || !confirmed || preview.matched === 0}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] disabled:opacity-50 font-semibold whitespace-nowrap"
            >
              {loading ? "Importando…" : "Importar PICD"}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                Vista previa — {visibleRows.length} registros
                {filterCiclo !== "all" && ` · Ciclo ${filterCiclo}`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5 whitespace-nowrap">Colaborador</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-center">Ciclo</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-right"># Acciones</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-right">Avance 1 (%)</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-right">Cumplimiento (%)</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map((row, i) => (
                    <tr key={i} className={row.error && !row.activo ? "opacity-60" : row.error ? "bg-red-50/40 opacity-60" : ""}>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap max-w-[220px] truncate">
                        {row.nombre ?? row.id_empleado_num}
                        {row.error && (
                          <span className="ml-1 text-[10px] text-orange-500">({row.error})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-gray-600">{row.ciclo_año}</td>
                      <td className="px-3 py-2 text-right text-gray-600 font-mono">{row.num_acciones}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{row.porcentaje_p1.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#1a3a5c]">
                        {row.porcentaje_cumplimiento.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!row.matched ? (
                          <span className="inline-block bg-red-100 text-red-700 rounded-full px-2 py-0.5 text-[10px] font-medium">Sin match</span>
                        ) : row.isDuplicate ? (
                          <span className="inline-block bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5 text-[10px] font-medium">Actualizará</span>
                        ) : (
                          <span className="inline-block bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-[10px] font-medium">Nuevo</span>
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
            {result.errors.length ? "PICD importado con advertencias" : "PICD importado exitosamente"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Registros guardados", value: result.upserted },
              { label: "Sin match (omitidos)", value: result.skipped },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
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
            Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}
