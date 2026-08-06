"use client";

import { useState, useRef } from "react";
import type { SucesionPreviewRow } from "@/app/api/importar/sucesion/route";

type PreviewResponse = {
  rows: SucesionPreviewRow[];
  total: number;
  emp_matched: number;
  emp_unmatched: number;
  suc_unmatched: number;
  duplicados: number;
  ciclos: number[];
  _debug?: { raw_rows: number; first_row_keys: string[] };
};

type ImportResult = {
  ok: boolean;
  inserted: number;
  skipped_emp: number;
  skipped_dup: number;
  errors: string[];
};

const READINESS_LABELS: Record<string, string> = {
  listo_ahora:    "Listo ahora",
  uno_dos_anios:  "1–2 años",
  tres_mas_anios: "3+ años",
};

export default function ImportadorSucesion() {
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
      const res = await fetch("/api/importar/sucesion", { method: "POST", body: fd });
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

  const canImport = preview && preview.emp_matched > 0 && (preview.emp_matched - preview.duplicados) > 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">
          Importa el reporte de <strong>Plan de Sucesión</strong> desde Excel.
          El archivo puede contener múltiples periodos (Id Periodo 1 = Ciclo 2026, Id Periodo 2 = Ciclo 2027).
        </p>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Reglas de importación</p>
        <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5">
          <li><strong>Ciclo</strong>: Id Periodo 1 → 2026 · Id Periodo 2 → 2027</li>
          <li><strong>Readiness</strong>: Largo Plazo → 3+ años · Mediano Plazo → 1-2 años · Corto Plazo → Listo ahora</li>
          <li>Si el sucesor no existe en BD se importa <strong>sin vincular</strong> (solo nombre)</li>
          <li>Si ya existe la combinación empleado + ciclo + sucesor, se <strong>omite</strong> (no sobreescribe)</li>
          <li>El campo <strong>Listo Rol</strong> del Excel se guarda como referencia visible</li>
        </ul>
      </div>

      {/* File picker */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Archivo Excel del reporte de Sucesión
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
                { label: "Total registros",             value: preview.total,           color: "gray"   },
                { label: "Empleados con match",          value: preview.emp_matched,     color: "green"  },
                { label: "Empleados sin match (omitidos)",value: preview.emp_unmatched,  color: preview.emp_unmatched > 0 ? "orange" : "gray" },
                { label: "Sucesores sin match",          value: preview.suc_unmatched,   color: preview.suc_unmatched > 0 ? "yellow" : "gray" },
                { label: "Ya existen (se omitirán)",     value: preview.duplicados,      color: preview.duplicados > 0 ? "yellow" : "gray" },
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

            {/* Debug panel */}
            {preview._debug && (
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Diagnóstico de parseo</summary>
                <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-1 text-gray-600">
                  <p>Filas brutas en archivo: <strong>{preview._debug.raw_rows}</strong></p>
                  <p className="mt-1">Columnas detectadas en fila 1:</p>
                  <p className="text-gray-500 break-all">{preview._debug.first_row_keys.join(" | ")}</p>
                </div>
              </details>
            )}

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
                id="confirmar-sucesion"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 rounded accent-[#1a3a5c]"
                disabled={!canImport}
              />
              <label htmlFor="confirmar-sucesion" className="text-sm text-gray-700 cursor-pointer select-none">
                Confirmo importar{" "}
                <strong>{(preview.emp_matched - preview.duplicados)}</strong> registros de sucesión
                {preview.ciclos.length > 0 && (
                  <> — ciclos: <strong>{preview.ciclos.join(", ")}</strong></>
                )}.
                {preview.duplicados > 0 && (
                  <span className="text-yellow-700"> ({preview.duplicados} ya existen y se omitirán)</span>
                )}
                {preview.suc_unmatched > 0 && (
                  <span className="text-orange-700"> ({preview.suc_unmatched} sucesores sin vincular se importarán con nombre)</span>
                )}
              </label>
            </div>
            <button
              onClick={() => call("import")}
              disabled={loading || !confirmed || !canImport}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#15304e] disabled:opacity-50 font-semibold whitespace-nowrap"
            >
              {loading ? "Importando…" : "Importar Sucesión"}
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">
                Vista previa — {visibleRows.length} registros
                {filterCiclo !== "all" && ` · Ciclo ${filterCiclo}`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5 whitespace-nowrap">Empleado</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-center">Ciclo</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Sucesor</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Listo Rol</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Readiness</th>
                    <th className="px-3 py-2.5 whitespace-nowrap text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map((row, i) => (
                    <tr
                      key={i}
                      className={
                        !row.empleado_matched ? "bg-red-50/40 opacity-60" :
                        row.isDuplicate       ? "bg-yellow-50/40 opacity-60" :
                        ""
                      }
                    >
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap max-w-[200px] truncate">
                        {row.empleado_nombre ?? row.id_empleado_num}
                        <span className="ml-1 text-[10px] text-gray-400 font-mono">#{row.id_empleado_num}</span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-gray-600">{row.ciclo_año}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                        {row.sucesor_nombre}
                        {!row.sucesor_matched && row.empleado_matched && (
                          <span className="ml-1 text-[10px] text-orange-500">(sin ID)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.listo_rol ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.readiness ? (
                          <span className="inline-block bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-[10px] font-medium">
                            {READINESS_LABELS[row.readiness] ?? row.readiness}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!row.empleado_matched ? (
                          <span className="inline-block bg-red-100 text-red-700 rounded-full px-2 py-0.5 text-[10px] font-medium">Sin match</span>
                        ) : row.isDuplicate ? (
                          <span className="inline-block bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5 text-[10px] font-medium">Ya existe</span>
                        ) : !row.sucesor_matched ? (
                          <span className="inline-block bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 text-[10px] font-medium">Nuevo (sin ID)</span>
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
            {result.errors.length ? "Sucesión importada con advertencias" : "Sucesión importada exitosamente"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Registros insertados",    value: result.inserted     },
              { label: "Empleados sin match",      value: result.skipped_emp  },
              { label: "Duplicados omitidos",      value: result.skipped_dup  },
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
