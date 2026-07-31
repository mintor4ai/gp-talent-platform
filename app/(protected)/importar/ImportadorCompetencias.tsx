"use client";

import { useState, useRef } from "react";
import type { CompetenciasPreviewRow } from "@/app/api/importar/competencias/route";

type ImportResult = {
  ok: boolean;
  total_evaluados: number;
  matched: number;
  insertedDetalle: number;
  insertedComentarios: number;
  upsertedAgregados: number;
  percentiles_calculados: number;
  errors: string[];
};

type ExistingData = {
  evaluados: number;
  calificaciones: number;
  comentarios: number;
  ultima_importacion: string | null;
};

type PreviewResponse = {
  rows: CompetenciasPreviewRow[];
  total_evaluados: number;
  matched: number;
  unmatched: number;
  total_calificaciones: number;
  total_comentarios: number;
  existing_data: ExistingData | null;
};

export default function ImportadorCompetencias() {
  const [cicloAño, setCicloAño] = useState<number>(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError(null); setConfirmedOverwrite(false); setRecalcMsg(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const recalcularPercentiles = async () => {
    setRecalcLoading(true); setRecalcMsg(null);
    try {
      const res = await fetch("/api/importar/competencias/percentiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciclo_año: result ? cicloAño : cicloAño }),
      });
      const json = await res.json();
      if (!res.ok) { setRecalcMsg(`Error: ${json.error}`); return; }
      setRecalcMsg(`Percentiles recalculados: ${json.inserted} colaboradores actualizados.`);
    } catch {
      setRecalcMsg("Error de red al recalcular.");
    } finally {
      setRecalcLoading(false);
    }
  };

  const call = async (modo: "preview" | "import") => {
    if (!file) return;
    setLoading(true); setError(null);
    const fd = new FormData();
    fd.append("archivo", file);
    fd.append("ciclo_año", String(cicloAño));
    fd.append("modo", modo);
    try {
      const res = await fetch("/api/importar/competencias", { method: "POST", body: fd });
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
          Importa el reporte de Competencias 360° (Excel con 2 hojas: <em>Competencias detalle</em> y <em>Comentarios general</em>).
        </p>
      </div>

      {/* Format hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Estructura del archivo</p>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-medium text-blue-700 mb-1">Hoja 1 — Competencias detalle</p>
            <p className="font-mono text-blue-600">EmpleadoEvaluadoID · Evaluado · Segmento · EmpleadoID · Evaluador · CompetenciaID · Competencia · TipoCompetencia · Calificacion</p>
            <p className="mt-1 text-blue-500">Escala Calificacion: 80 / 100 / 120</p>
          </div>
          <div>
            <p className="font-medium text-blue-700 mb-1">Hoja 2 — Comentarios general</p>
            <p className="font-mono text-blue-600">EmpleadoEvaluadoID · Evaluado · EmpleadoID · Evaluador · CalificacionGeneral · Comentarios</p>
            <p className="mt-1 text-blue-500">Escala CalificacionGeneral: 1–10</p>
          </div>
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
                onChange={(e) => { setCicloAño(Number(e.target.value)); reset(); setConfirmedOverwrite(false); }}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
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
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1a3a5c] file:text-white hover:file:bg-[#152e4d] cursor-pointer"
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
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors font-medium"
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
                    El ciclo {cicloAño} ya tiene datos importados
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {preview.existing_data.evaluados} evaluados · {preview.existing_data.calificaciones} calificaciones · {preview.existing_data.comentarios} comentarios
                    {preview.existing_data.ultima_importacion && (
                      <> · Importado el {new Date(preview.existing_data.ultima_importacion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</>
                    )}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Si confirmas, los datos existentes del ciclo {cicloAño} serán <strong>reemplazados</strong> por los del nuevo archivo.
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
              { label: "Evaluados en archivo", value: preview.total_evaluados, color: "gray" },
              { label: "Encontrados en BD", value: preview.matched, color: "green" },
              { label: "No encontrados", value: preview.unmatched, color: preview.unmatched > 0 ? "red" : "gray" },
              { label: "Calificaciones detalle", value: preview.total_calificaciones, color: "blue" },
              { label: "Comentarios", value: preview.total_comentarios, color: "blue" },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg border px-4 py-3 text-center ${
                s.color === "green" ? "bg-green-50 border-green-200" :
                s.color === "red"   ? "bg-red-50 border-red-200" :
                s.color === "blue"  ? "bg-blue-50 border-blue-200" :
                "bg-gray-50 border-gray-200"
              }`}>
                <p className={`text-2xl font-bold ${
                  s.color === "green" ? "text-green-700" :
                  s.color === "red"   ? "text-red-700" :
                  s.color === "blue"  ? "text-blue-700" :
                  "text-gray-700"
                }`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa — Ciclo {cicloAño}</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => call("import")}
                  disabled={loading || preview.matched === 0 || (!!preview.existing_data && !confirmedOverwrite)}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
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
                    <th className="px-3 py-2.5">Segmento</th>
                    <th className="px-3 py-2.5 text-center">BD</th>
                    <th className="px-3 py-2.5 text-right">Evaluadores</th>
                    <th className="px-3 py-2.5 text-right">Calificaciones</th>
                    <th className="px-3 py-2.5 text-right">Prom. Comp.</th>
                    <th className="px-3 py-2.5 text-right">Comentarios</th>
                    <th className="px-3 py-2.5 text-right">Prom. General</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row) => (
                    <tr key={row.id_empleado_num} className={row.matched ? "" : "bg-red-50/50"}>
                      <td className="px-3 py-2 text-gray-500 font-mono">{row.id_empleado_num}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{row.nombre}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.segmento ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {row.matched
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-red-500" title={row.error}>✗</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.num_evaluadores}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.num_calificaciones}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">
                        {row.promedio_calificacion != null ? row.promedio_calificacion.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.num_comentarios}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700">
                        {row.promedio_general != null ? row.promedio_general.toFixed(1) : "—"}
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
            {result.errors.length ? "Importación completada con advertencias" : "Importación exitosa"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Evaluados importados", value: result.matched },
              { label: "Calificaciones detalle", value: result.insertedDetalle },
              { label: "Comentarios", value: result.insertedComentarios },
              { label: "Promedios por comp.", value: result.upsertedAgregados },
              { label: "Percentiles calculados", value: result.percentiles_calculados ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Recalculate percentiles */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Recalcular percentiles del ciclo {cicloAño}</p>
              <p className="text-xs text-gray-400 mt-0.5">Útil si cambiaron segmentos, puestos o UEN de algún colaborador.</p>
            </div>
            <button
              onClick={recalcularPercentiles}
              disabled={recalcLoading}
              className="text-xs bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 font-medium transition-colors whitespace-nowrap"
            >
              {recalcLoading ? "Calculando..." : "Recalcular"}
            </button>
          </div>
          {recalcMsg && (
            <p className="text-xs text-gray-600 px-1">{recalcMsg}</p>
          )}
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          <button onClick={reset} className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] transition-colors">
            Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}
