"use client";

import { useState, useRef } from "react";
import type { DesempenoPreviewRow } from "@/app/api/importar/desempeno/route";

type ImportResult = {
  ok: boolean;
  total: number;
  matched: number;
  unmatched: number;
  upserted: number;
  eip_updated: number;
  errors: string[];
};

type PreviewResponse = {
  rows: DesempenoPreviewRow[];
  total: number;
  matched: number;
  unmatched: number;
  existing_data: { registros: number | null; ultima_importacion: string | null } | null;
};

const ESTATUS_COLORS: Record<string, string> = {
  APROBADA:  "bg-green-100 text-green-700",
  TERMINADA: "bg-blue-100 text-blue-700",
  PENDIENTE: "bg-amber-100 text-amber-700",
};

const SUB_LABELS = [
  { key: "planea",          label: "Planea" },
  { key: "ejecuta",         label: "Ejecuta" },
  { key: "optimiza",        label: "Optimiza" },
  { key: "trabaja_equipo",  label: "Trabaja en Equipo" },
  { key: "atiende_cliente", label: "Cliente" },
  { key: "informa",         label: "Informa" },
] as const;

export default function ImportadorDesempeno() {
  const [cicloAño, setCicloAño] = useState<number>(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setPreview(null); setResult(null);
    setError(null); setConfirmedOverwrite(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true); setError(null); setPreview(null); setResult(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("ciclo_año", String(cicloAño));
      fd.set("modo", "preview");
      const res = await fetch("/api/importar/desempeno", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al leer el archivo");
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("ciclo_año", String(cicloAño));
      fd.set("modo", "import");
      const res = await fetch("/api/importar/desempeno", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al importar");
      setResult(data);
      setPreview(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Formato esperado — Evaluación de Desempeño</p>
        <p className="text-xs text-blue-600">
          Columnas requeridas: <code>#</code> · <code>Nombre</code> · <code>Evaluador Desem.</code> · <code>Aprobador Desem.</code> ·
          {" "}<code>Planea con efectividad</code> · <code>Ejecuta con Calidad y Oportunidad</code> · <code>Optimiza Recursos</code> ·
          {" "}<code>Colabora en Equipo</code> · <code>Cliente</code> · <code>Reporta oportunamente y confiable</code> ·
          {" "}<code>En Resumen, logra los resultados esperados de su puesto</code> · <code>Persona Clave</code> · <code>Estatus Desem.</code>
        </p>
        <p className="text-xs text-blue-600">
          Los valores numéricos están en escala 80–120. &quot;ND&quot; se importa como nulo.
          Al importar también se actualiza <code>evaluacion_integral_personal.desempeno_logra</code>.
        </p>
      </div>

      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo</label>
              <select
                value={cicloAño}
                onChange={(e) => { setCicloAño(Number(e.target.value)); reset(); }}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
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
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); setConfirmedOverwrite(false); }}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1a3a5c] file:text-white hover:file:bg-[#152e4d] cursor-pointer"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handlePreview}
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

      {preview && (
        <div className="space-y-4">
          {/* Summary chips */}
          <div className="flex flex-wrap gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-green-700">{preview.matched}</p>
              <p className="text-xs text-green-600">Identificados</p>
            </div>
            {preview.unmatched > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-700">{preview.unmatched}</p>
                <p className="text-xs text-red-600">No encontrados</p>
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-gray-700">{preview.total}</p>
              <p className="text-xs text-gray-500">Total filas</p>
            </div>
          </div>

          {/* Overwrite warning */}
          {preview.existing_data && !confirmedOverwrite && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">
                Ya existen {preview.existing_data.registros} registros de desempeño para el ciclo {cicloAño}.
              </p>
              {preview.existing_data.ultima_importacion && (
                <p className="text-xs text-amber-600">
                  Última importación: {new Date(preview.existing_data.ultima_importacion).toLocaleString("es-MX")}
                </p>
              )}
              <p className="text-xs text-amber-700">La importación sobreescribirá los datos existentes por colaborador.</p>
              <label className="flex items-center gap-2 text-xs font-medium text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedOverwrite}
                  onChange={(e) => setConfirmedOverwrite(e.target.checked)}
                  className="rounded"
                />
                Entiendo y quiero continuar
              </label>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa — Desempeño {cicloAño}</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || preview.matched === 0 || (!!preview.existing_data && !confirmedOverwrite)}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : `Importar ${preview.matched} registros`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5">No.Emp</th>
                    <th className="px-3 py-2.5">Colaborador</th>
                    <th className="px-3 py-2.5 text-center">BD</th>
                    {SUB_LABELS.map((s) => (
                      <th key={s.key} className="px-3 py-2.5 text-right whitespace-nowrap">{s.label}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold">LOGRA</th>
                    <th className="px-3 py-2.5 text-center">PC</th>
                    <th className="px-3 py-2.5">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row) => (
                    <tr key={row.id_empleado_num} className={row.matched ? "hover:bg-gray-50/50" : "bg-red-50/40"}>
                      <td className="px-3 py-2 text-gray-500 font-mono">{row.id_empleado_num}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                        {row.nombre}
                        {row.puesto && <span className="block text-[10px] text-gray-400 font-normal">{row.puesto}</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.matched
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-red-500" title={row.error}>✗</span>}
                      </td>
                      {SUB_LABELS.map((s) => (
                        <td key={s.key} className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {row[s.key] != null ? row[s.key] : <span className="text-gray-300">ND</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-[#1a3a5c]">
                        {row.resultado_logra != null ? row.resultado_logra : <span className="text-gray-300 font-normal">ND</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-500">
                        {row.persona_clave != null ? row.persona_clave : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.estatus_desem ? (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${ESTATUS_COLORS[row.estatus_desem.toUpperCase()] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.estatus_desem}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-6 space-y-4 ${result.errors.length ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"}`}>
          <p className={`text-lg font-bold ${result.errors.length ? "text-orange-800" : "text-green-800"}`}>
            {result.errors.length ? "Importación con advertencias" : "Importación exitosa"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas" value={result.total} />
            <StatCard label="Identificados" value={result.matched} />
            <StatCard label="Importados" value={result.upserted} />
            <StatCard label="EIP actualizados" value={result.eip_updated} />
          </div>
          {result.unmatched > 0 && (
            <p className="text-sm text-orange-700">{result.unmatched} fila(s) no importadas — colaborador no encontrado en BD.</p>
          )}
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e}</p>
              ))}
            </div>
          )}
          <button
            onClick={reset}
            className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] transition-colors"
          >
            Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
