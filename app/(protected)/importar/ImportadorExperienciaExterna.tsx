"use client";

import { useState, useRef } from "react";

type PreviewRow = {
  fila: number;
  id_registro: string;
  id_empleado: string;
  nombre_empleado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  nombre_empresa: string | null;
  pais: string | null;
  ciudad: string | null;
  giro: string | null;
  area: string | null;
  departamento: string | null;
  responsabilidades: string | null;
  num_empleados_supervisados: number | null;
  esNuevo: boolean;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  total: number;
  inserted: number;
  skipped: number;
  errores: number;
  errors: string[];
};

export default function ImportadorExperienciaExterna() {
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
      const res = await fetch("/api/importar/experiencia-externa", { method: "POST", body: fd });
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
    const nuevos = preview.filter((r) => !r.error && r.esNuevo).length;
    if (!confirm(`¿Importar ${nuevos} registros nuevos de experiencia externa? Los registros ya existentes (por Id Registro) serán omitidos.`)) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "import");
      const res = await fetch("/api/importar/experiencia-externa", { method: "POST", body: fd });
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

  const nuevosCount     = preview?.filter((r) => !r.error && r.esNuevo).length ?? 0;
  const existentesCount = preview?.filter((r) => !r.error && !r.esNuevo).length ?? 0;
  const errorCount      = preview?.filter((r) => !!r.error).length ?? 0;

  return (
    <div className="space-y-5">
      {/* Format info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato ReporteExperiencia (HR Corp)</p>
        <p className="text-xs">Cada fila es un empleo anterior de un colaborador. La deduplicación es por <strong>Id Registro</strong> — solo se insertan registros cuyo Id Registro no exista aún en la base de datos.</p>
        <div className="overflow-x-auto mt-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {["Num Empleado","Empleado","Id Registro","Fecha Inicio","Fecha Fin","Pais","Ciudad","Nombre Empresa","Giro","Area","Departamento","Responsabilidades","Num Empleados Supervisados"].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <ul className="text-xs text-blue-600 space-y-0.5 mt-2 list-disc list-inside">
          <li>El colaborador debe existir en la BD (se busca por Num Empleado)</li>
          <li>Registros ya existentes (mismo Id Registro) se omiten sin error</li>
        </ul>
      </div>

      {/* Upload */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Archivo Excel ReporteExperiencia (.xlsx / .xls)
            </label>
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
            <StatCard label="Nuevos" value={nuevosCount} color="green" />
            {existentesCount > 0 && <StatCard label="Ya existen (se omiten)" value={existentesCount} color="gray" />}
            {errorCount > 0 && <StatCard label="Errores" value={errorCount} color="red" />}
            <StatCard label="Total filas" value={preview.length} color="gray" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa — Experiencia Externa</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || nuevosCount === 0}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : `Importar ${nuevosCount} nuevos`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5">Fila</th>
                    <th className="px-3 py-2.5">Id Reg.</th>
                    <th className="px-3 py-2.5">No.Emp</th>
                    <th className="px-3 py-2.5">Colaborador</th>
                    <th className="px-3 py-2.5">Empresa</th>
                    <th className="px-3 py-2.5">Área / Depto</th>
                    <th className="px-3 py-2.5">Período</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr
                      key={row.fila}
                      className={
                        row.error ? "bg-red-50/50" :
                        !row.esNuevo ? "bg-gray-50/70 opacity-60" : ""
                      }
                    >
                      <td className="px-3 py-2 text-gray-400">{row.fila}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{row.id_registro || "—"}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{row.id_empleado || "—"}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[150px] truncate">{row.nombre_empleado || "—"}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{row.nombre_empresa || "—"}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[130px] truncate">
                        {[row.area, row.departamento].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                        {row.fecha_inicio ? row.fecha_inicio.slice(0, 7) : ""}
                        {row.fecha_inicio && row.fecha_fin ? " → " : ""}
                        {row.fecha_fin ? row.fecha_fin.slice(0, 7) : "en curso"}
                        {!row.fecha_inicio && !row.fecha_fin ? "—" : ""}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.error ? (
                          <span className="text-red-500">{row.error}</span>
                        ) : row.esNuevo ? (
                          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Nuevo</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Ya existe</span>
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
            {result.errors.length ? "Importación completada con advertencias" : "Importación de Experiencia Externa exitosa"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas"    value={result.total}    color="gray" />
            <StatCard label="Insertados"     value={result.inserted} color="green" />
            <StatCard label="Ya existían"    value={result.skipped}  color="gray" />
            <StatCard label="Errores"        value={result.errores}  color={result.errores > 0 ? "red" : "gray"} />
          </div>
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
