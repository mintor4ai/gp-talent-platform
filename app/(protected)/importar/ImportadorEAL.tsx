"use client";

import { useState, useRef } from "react";
import type { EalPreviewRow } from "@/app/api/importar/eal/route";

type ExistingData = {
  evaluados: number;
  ultima_importacion: string | null;
};

type PreviewResponse = {
  rows: EalPreviewRow[];
  total: number;
  matched: number;
  unmatched: number;
  inactivos: number;
  existing_data: ExistingData | null;
};

type ImportResult = {
  ok: boolean;
  upserted: number;
  detail_rows: number;
  mediana: number;
  min_actual: number;
  errors: string[];
  message?: string;
};

export default function ImportadorEAL() {
  const [cicloAño, setCicloAño] = useState<number>(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError(null); setConfirmedOverwrite(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const call = async (modo: "preview" | "import") => {
    if (!file) return;
    setLoading(true); setError(null);
    const fd = new FormData();
    fd.append("archivo", file);
    fd.append("ciclo_año", String(cicloAño));
    fd.append("modo", modo);
    try {
      const res = await fetch("/api/importar/eal", { method: "POST", body: fd });
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

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500">
          Importa el reporte de Evaluación Anual de Liderazgo (EAL) desde el archivo{" "}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">Evaluacion_PorPeriodoTodos.xlsx</code>.
          Solo se importan colaboradores activos. Los valores <em>N/A</em> se excluyen del cálculo de promedios.
        </p>
      </div>

      {/* Format hint */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 text-sm text-violet-800 space-y-2">
        <p className="font-semibold">Estructura esperada del archivo</p>
        <div className="text-xs space-y-1 text-violet-700">
          <p><strong>Hoja 1</strong> — Período (ej. <em>Periodo_20250901-20250923</em>): columnas = pares (evaluador, evaluado), filas = preguntas por categoría.</p>
          <p><strong>Hoja 2</strong> — <em>PROMEDIO GENERAL</em>: resumen por evaluado (se usa para verificación).</p>
          <p>La escala de respuestas es 1–5. Los valores <em>N/A</em> se excluyen del promedio. La categoría <em>Libre</em> contiene texto.</p>
          <p>El sistema calcula automáticamente la <strong>evaluación EAL (80–120)</strong> y el <strong>percentil</strong> al importar.</p>
        </div>
      </div>

      {/* Upload form */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo</label>
              <select
                value={cicloAño}
                onChange={(e) => { setCicloAño(Number(e.target.value)); reset(); }}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] bg-white"
              >
                {[2023, 2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Archivo Excel (.xlsx)</label>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); }}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#7c3aed] file:text-white hover:file:bg-[#6d28d9] cursor-pointer"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => call("preview")}
              disabled={!file || loading}
              className="text-sm bg-[#7c3aed] text-white px-5 py-2 rounded-lg hover:bg-[#6d28d9] disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? "Leyendo..." : "Vista previa"}
            </button>
            {file && (
              <button onClick={reset} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* Overwrite warning */}
          {preview.existing_data && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    El ciclo {cicloAño} ya tiene datos de EAL importados
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {preview.existing_data.evaluados} evaluados registrados
                    {preview.existing_data.ultima_importacion && (
                      <> · Importado el{" "}
                        {new Date(preview.existing_data.ultima_importacion).toLocaleDateString("es-MX", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Si confirmas, los datos del ciclo {cicloAño} serán <strong>reemplazados</strong>.
                    Los percentiles se recalcularán automáticamente.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmedOverwrite}
                  onChange={(e) => setConfirmedOverwrite(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 accent-amber-600"
                />
                <span className="text-xs font-medium text-amber-800">
                  Entiendo que se reemplazarán los datos del ciclo {cicloAño}
                </span>
              </label>
            </div>
          )}

          {/* Summary stats */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Total en archivo", value: preview.total, color: "gray" },
              { label: "Activos a importar", value: preview.matched, color: "green" },
              { label: "No encontrados", value: preview.unmatched, color: preview.unmatched > 0 ? "red" : "gray" },
              { label: "Inactivos (omitidos)", value: preview.inactivos, color: preview.inactivos > 0 ? "orange" : "gray" },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg border px-4 py-3 text-center min-w-[110px] ${
                s.color === "green"  ? "bg-green-50 border-green-200" :
                s.color === "red"    ? "bg-red-50 border-red-200" :
                s.color === "orange" ? "bg-orange-50 border-orange-200" :
                "bg-gray-50 border-gray-200"
              }`}>
                <p className={`text-2xl font-bold ${
                  s.color === "green"  ? "text-green-700" :
                  s.color === "red"    ? "text-red-700" :
                  s.color === "orange" ? "text-orange-700" :
                  "text-gray-700"
                }`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa — EAL Ciclo {cicloAño}</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => call("import")}
                  disabled={loading || preview.matched === 0 || (!!preview.existing_data && !confirmedOverwrite)}
                  className="text-xs bg-[#7c3aed] text-white px-4 py-1.5 rounded-lg hover:bg-[#6d28d9] disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : preview.existing_data ? `Reemplazar ciclo ${cicloAño}` : `Importar ${preview.matched} evaluados`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="px-3 py-2.5">No.Emp</th>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5 text-center">BD</th>
                    <th className="px-3 py-2.5 text-center">Activo</th>
                    <th className="px-3 py-2.5 text-right">Evaluadores</th>
                    <th className="px-3 py-2.5 text-right">Preguntas</th>
                    <th className="px-3 py-2.5 text-right">Promedio EAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row) => {
                    const skip = !row.matched || !row.activo;
                    return (
                      <tr key={row.id_empleado_num} className={skip ? "bg-red-50/40 opacity-60" : ""}>
                        <td className="px-3 py-2 text-gray-500 font-mono">{row.id_empleado_num}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                          {row.nombre ?? <span className="text-gray-400 italic">Desconocido</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.matched
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500" title={row.error}>✗</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!row.matched ? <span className="text-gray-300">—</span>
                            : row.activo
                              ? <span className="text-green-600 font-bold">✓</span>
                              : <span className="text-orange-500 font-bold" title="No se importará">Baja</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.num_evaluadores}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.num_preguntas}</td>
                        <td className="px-3 py-2 text-right font-mono text-violet-700 font-semibold">
                          {row.promedio_eal != null ? row.promedio_eal.toFixed(2) : "—"}
                        </td>
                      </tr>
                    );
                  })}
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
            {result.message ?? (result.errors.length ? "Importación con advertencias" : "Importación EAL exitosa")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Evaluados importados", value: result.upserted },
              { label: "Respuestas detalle", value: result.detail_rows },
              { label: "Promedio org. (mediana)", value: result.mediana?.toFixed(2) ?? "—" },
              { label: "Mínimo importado", value: result.min_actual?.toFixed(2) ?? "—" },
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
            className="text-sm bg-[#7c3aed] text-white px-5 py-2 rounded-lg hover:bg-[#6d28d9] transition-colors"
          >
            Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}
