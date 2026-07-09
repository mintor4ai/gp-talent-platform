"use client";

import { useState, useRef } from "react";

type PreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_completo: string;
  organización: string | null;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  jefe_inmediato_nombre: string | null;
  correo: string | null;
  activo: boolean;
  esNuevo: boolean;
  puesto_catalogo_id: string | null;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  total: number;
  upserted: number;
  jefeLinked: number;
  catalogoLinked: number;
  errores: number;
  errors: string[];
};

export default function ImportadorColaboradores() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const res = await fetch("/api/importar/colaboradores", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al leer el archivo");
      setPreview(data.rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    const validos = preview.filter((r) => !r.error).length;
    if (!confirm(`¿Importar ${validos} colaboradores? Los registros existentes (mismo no_empleado) serán actualizados.`)) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "import");
      const res = await fetch("/api/importar/colaboradores", { method: "POST", body: fd });
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
    if (inputRef.current) inputRef.current.value = "";
  }

  const validCount    = preview?.filter((r) => !r.error).length ?? 0;
  const errorCount    = preview?.filter((r) => !!r.error).length ?? 0;
  const nuevosCount   = preview?.filter((r) => r.esNuevo && !r.error).length ?? 0;
  const updateCount   = preview?.filter((r) => !r.esNuevo && !r.error).length ?? 0;

  return (
    <div className="space-y-5">

      {/* Format hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato del archivo Excel — Colaboradores</p>
        <p>Una hoja con columnas (el orden y nombre exacto no importan, se detectan automáticamente):</p>
        <div className="overflow-x-auto mt-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {[
                  "no_empleado","nombre_completo","organización","puesto","nivel","nivel_num",
                  "area","departamento","entidad","centro_trabajo","razon_social",
                  "jefe_inmediato_nombre","unidad_costo","tipo_plantilla","segmento_organizacional",
                  "fecha_antiguedad","correo","sexo","edad","nivel_academico","activo",
                ].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-blue-600">
                {[
                  "4001","JUAN PÉREZ TORRES","Manufactura","Gerente de Operaciones","G","7",
                  "Producción","Planta Norte","CDMX","CT-01","Grupo Industrial S.A.",
                  "KARLA VARGAS","CC-001","Nómina","Operativo",
                  "01/03/2015","juan.perez@empresa.com","M","38","Licenciatura","SI",
                ].map((v, i) => (
                  <td key={i} className="border border-blue-100 px-2 py-1 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-blue-600 space-y-0.5 mt-2 list-disc list-inside">
          <li><strong>no_empleado</strong> y <strong>nombre_completo</strong> son obligatorios</li>
          <li>Fechas: dd/mm/yyyy o yyyy-mm-dd</li>
          <li>activo: SI/NO (default SI)</li>
          <li>Los jefes se vinculan por ID automáticamente si su nombre coincide con otro colaborador</li>
          <li>No incluyas RFC, CURP ni datos sensibles de autenticación</li>
          <li>Los registros existentes (mismo no_empleado) se actualizan, no se duplican</li>
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
          {/* Stats */}
          <div className="flex flex-wrap gap-3">
            <StatCard label="Nuevos" value={nuevosCount} color="green" />
            <StatCard label="Actualizaciones" value={updateCount} color="blue" />
            {errorCount > 0 && <StatCard label="Errores" value={errorCount} color="red" />}
            <StatCard label="Total" value={preview.length} color="gray" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa de importación</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || validCount === 0}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : `Importar ${validCount} registros`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="px-3 py-2.5">Fila</th>
                    <th className="px-3 py-2.5">No. Emp.</th>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Org. / Área</th>
                    <th className="px-3 py-2.5">Puesto</th>
                    <th className="px-3 py-2.5">Jefe</th>
                    <th className="px-3 py-2.5">Correo</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr key={row.fila} className={row.error ? "bg-red-50/50" : row.esNuevo ? "bg-green-50/30" : ""}>
                      <td className="px-3 py-2 text-gray-400">{row.fila}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{row.id_empleado || "—"}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px] truncate">{row.nombre_completo || "—"}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">
                        {[row.organización, row.area].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">
                        <span className="flex items-center gap-1">
                          {row.puesto || "—"}
                          {row.puesto_catalogo_id && (
                            <span title="Vinculado al catálogo de puestos" className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{row.jefe_inmediato_nombre || "—"}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{row.correo || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {row.error
                          ? <span className="text-red-500 text-xs">{row.error}</span>
                          : row.esNuevo
                            ? <span className="text-green-600 font-semibold text-xs">Nuevo</span>
                            : <span className="text-blue-500 text-xs">Actualizar</span>
                        }
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas" value={result.total} color="gray" />
            <StatCard label="Insertados / actualizados" value={result.upserted} color="green" />
            <StatCard label="Jefes vinculados" value={result.jefeLinked} color="blue" />
            <StatCard label="Catálogo vinculado" value={result.catalogoLinked ?? 0} color="blue" />
            <StatCard label="Errores" value={result.errores} color={result.errores > 0 ? "red" : "gray"} />
          </div>
          {result.jefeLinked > 0 && (
            <p className="text-sm text-green-700">
              {result.jefeLinked} colaborador(es) quedaron vinculados a su jefe por UUID.
            </p>
          )}
          {(result.catalogoLinked ?? 0) > 0 && (
            <p className="text-sm text-green-700">
              {result.catalogoLinked} colaborador(es) vinculados a su puesto en el catálogo.
            </p>
          )}
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] transition-colors"
            >
              Nueva importación
            </button>
            <a
              href="/colaboradores"
              className="text-sm text-[#1a3a5c] border border-[#1a3a5c] px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Ver colaboradores →
            </a>
          </div>
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
