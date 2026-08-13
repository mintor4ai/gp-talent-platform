"use client";

import { useState, useRef } from "react";

type PreviewRow = {
  fila: number;
  clave: string;
  id_externo: number | null;
  nombre: string;
  organización: string | null;
  segmento_organizacional: string | null;
  razon_social: string | null;
  horario: string | null;
  tipo_trabajador: string | null;
  periodo_pago: string | null;
  tabla_prestaciones: string | null;
  esNuevo: boolean;
  hayCambios: boolean;
  cambios: string[];
  error?: string;
};

type PreviewResponse = {
  rows: PreviewRow[];
  total: number;
  nuevos: number;
  con_cambios: number;
  sin_cambios: number;
  errores: number;
};

type ImportResult = {
  ok: boolean;
  total: number;
  upserted: number;
  sin_cambios: number;
  errores: number;
  errors: string[];
};

export default function ImportadorCatalogoPuestos() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "preview");
      const res = await fetch("/api/importar/catalogo-puestos", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al leer el archivo");
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    const writeCount = preview.nuevos + preview.con_cambios;
    if (!confirm(`¿Importar ${writeCount} puestos al catálogo? (${preview.nuevos} nuevos + ${preview.con_cambios} con cambios). Los registros sin cambios se omiten.`)) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "import");
      const res = await fetch("/api/importar/catalogo-puestos", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al importar");
      setResult(data);
      setPreview(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setExpandedRow(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const writeCount = preview ? preview.nuevos + preview.con_cambios : 0;

  return (
    <div className="space-y-5">

      {/* Format hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato del archivo Excel — Catálogo de Puestos HRCorp</p>
        <p className="text-xs text-blue-700">Columnas tal como las exporta HRCorp (el sistema las detecta automáticamente por nombre):</p>
        <div className="overflow-x-auto mt-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {[
                  "Identificador", "Nombre", "Clave", "Organización",
                  "RAZON SOCIAL", "UNIDAD ORGANIZACIONAL", "SEGMENTO ORGANIZACIONAL",
                  "HORARIO", "TIPO DE TRABAJADOR", "PERIODO DE PAGO", "TABLA DE PRESTACIONES"
                ].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-blue-600">
                {[
                  "1116", "ABOGADO CORPORATIVO", "Q4010001", "401 GP CORPORATIVO",
                  "SERVICIOS ADMINISTRATIVOS G P", "401 GP CORPORATIVO", "H COORDINADOR DE DEPTO",
                  "OFICINA", "NO SINDICALIZADO", "QUINCENA", "PRESTACIONES 2023"
                ].map((v, i) => (
                  <td key={i} className="border border-blue-100 px-2 py-1 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-blue-600 space-y-0.5 mt-2 list-disc list-inside">
          <li><strong>Clave</strong> y <strong>Nombre</strong> son obligatorios — la Clave (código Q) es el identificador único</li>
          <li>Los registros existentes se actualizan solo si hay cambios en los campos; los registros idénticos se omiten</li>
          <li>La columna <strong>Perfil de Puesto</strong> se ignora (siempre "PERFIL DEFAULT")</li>
          <li>El campo <strong>¿Es posición crítica?</strong> se configura manualmente en el catálogo, no se importa</li>
        </ul>
      </div>

      {/* Upload */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Archivo Excel (.xlsx)</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); }}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1a3a5c] file:text-white hover:file:bg-[#152e4d] cursor-pointer"
            />
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

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <StatCard label="Nuevos" value={preview.nuevos} color="green" />
            <StatCard label="Con cambios" value={preview.con_cambios} color="blue" />
            <StatCard label="Sin cambios" value={preview.sin_cambios} color="gray" />
            {preview.errores > 0 && <StatCard label="Errores" value={preview.errores} color="red" />}
            <StatCard label="Total" value={preview.total} color="gray" />
          </div>

          {preview.sin_cambios > 0 && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
              {preview.sin_cambios} puestos sin cambios no se escribirán en la base de datos.
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa — Catálogo de Puestos</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || writeCount === 0}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : `Importar ${writeCount} puestos`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="px-3 py-2.5">Clave</th>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Organización</th>
                    <th className="px-3 py-2.5">Segmento</th>
                    <th className="px-3 py-2.5">Tipo Trabajador</th>
                    <th className="px-3 py-2.5">Horario</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row) => (
                    <>
                      <tr
                        key={row.fila}
                        className={`${
                          row.error       ? "bg-red-50/50" :
                          row.esNuevo     ? "bg-green-50/30" :
                          row.hayCambios  ? "bg-blue-50/30" :
                          "opacity-50"
                        } ${row.hayCambios ? "cursor-pointer hover:bg-blue-50/50" : ""}`}
                        onClick={() => row.hayCambios ? setExpandedRow(expandedRow === row.clave ? null : row.clave) : undefined}
                      >
                        <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.clave || "—"}</td>
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[220px] truncate">{row.nombre || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">{row.organización || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">{row.segmento_organizacional || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.tipo_trabajador || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.horario || "—"}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {row.error
                            ? <span className="text-red-500">{row.error}</span>
                            : row.esNuevo
                              ? <span className="text-green-600 font-semibold">Nuevo</span>
                              : row.hayCambios
                                ? <span className="text-blue-600 font-semibold">
                                    {row.cambios.length} cambio{row.cambios.length !== 1 ? "s" : ""} ▾
                                  </span>
                                : <span className="text-gray-400">Sin cambios</span>
                          }
                        </td>
                      </tr>
                      {row.hayCambios && expandedRow === row.clave && (
                        <tr key={`${row.fila}-detail`} className="bg-blue-50/60">
                          <td colSpan={7} className="px-6 py-2">
                            <ul className="text-xs text-blue-800 space-y-0.5 list-disc list-inside">
                              {row.cambios.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </>
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
            {result.errors.length ? "Importación con advertencias" : "Catálogo actualizado"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas" value={result.total} color="gray" />
            <StatCard label="Insertados / actualizados" value={result.upserted} color="green" />
            <StatCard label="Sin cambios (omitidos)" value={result.sin_cambios} color="gray" />
            <StatCard label="Errores" value={result.errores} color={result.errores > 0 ? "red" : "gray"} />
          </div>
          <p className="text-sm text-green-700">
            Los puestos importados ya están disponibles para vincular a colaboradores y planes de sucesión.
          </p>
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
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

function StatCard({ label, value, color }: { label: string; value: number; color: "green" | "blue" | "red" | "gray" }) {
  const cls = {
    green: "border-green-200 bg-green-50 text-green-700",
    blue:  "border-blue-200 bg-blue-50 text-blue-700",
    red:   "border-red-200 bg-red-50 text-red-700",
    gray:  "border-gray-200 bg-white text-gray-700",
  }[color];
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
