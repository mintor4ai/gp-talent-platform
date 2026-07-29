"use client";

import { useState, useRef } from "react";

const TIPO_COLORS: Record<string, string> = {
  "Certificación":  "bg-purple-100 text-purple-700",
  "Competencias":   "bg-indigo-100 text-indigo-700",
  "Cursos":         "bg-blue-100 text-blue-700",
  "Diplomado":      "bg-cyan-100 text-cyan-700",
  "Especialidad":   "bg-teal-100 text-teal-700",
  "Idiomas":        "bg-orange-100 text-orange-700",
  "Inducción":      "bg-gray-100 text-gray-600",
};

type PreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_empleado: string;
  id_registro_source: string | null;
  nombre_curso: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  tipo_curso: string | null;
  institucion: string | null;
  horas_efectivas: number | null;
  documento: string | null;
  evaluacion_final: number | null;
  estado_completitud: string | null;
  isDuplicate: boolean;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  total: number;
  inserted: number;
  duplicadosOmitidos: number;
  errores: number;
  errors: string[];
};

export default function ImportadorCursos() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [importarDuplicados, setImportarDuplicados] = useState(false);
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
    setHasDuplicates(false);
    setImportarDuplicados(false);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "preview");
      const res = await fetch("/api/importar/cursos", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al leer el archivo");
      setPreview(data.rows);
      setHasDuplicates(data.hasDuplicates);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    const toImport = preview.filter((r) => !r.error && (!r.isDuplicate || importarDuplicados)).length;
    if (!confirm(`¿Importar ${toImport} cursos?${importarDuplicados ? " (incluye duplicados)" : ""}`)) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "import");
      fd.set("importar_duplicados", importarDuplicados ? "true" : "false");
      const res = await fetch("/api/importar/cursos", { method: "POST", body: fd });
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
    setHasDuplicates(false);
    setImportarDuplicados(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const validCount     = preview?.filter((r) => !r.error && !r.isDuplicate).length ?? 0;
  const dupCount       = preview?.filter((r) => !r.error && r.isDuplicate).length ?? 0;
  const errorCount     = preview?.filter((r) => !!r.error).length ?? 0;
  const toImportCount  = importarDuplicados ? (validCount + dupCount) : validCount;

  return (
    <div className="space-y-5">
      {/* Format info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato ReporteCursos</p>
        <p>Cada fila es un curso o capacitación. Los registros se insertan sin reemplazar los existentes.</p>
        <div className="overflow-x-auto mt-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {["Num Empleado","Empleado","Id Registro","Curso","Fecha Inicio","Fecha Fin","Lugar","Institucion","Documento","Horas Efectivas","Tipo Curso","Evaluacion Final","ID"].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <ul className="text-xs text-blue-600 space-y-0.5 mt-2 list-disc list-inside">
          <li>Tipos reconocidos: Certificación, Competencias, Cursos, Diplomado, Especialidad, Idiomas, Inducción</li>
          <li>La columna <strong>ID</strong> es opcional (Aprobado / No aplica / Reprobado)</li>
          <li>Los <strong>Id Registro</strong> duplicados se detectan y se pregunta si importarlos de todas formas</li>
        </ul>
      </div>

      {/* Upload */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Archivo Excel ReporteCursos (.xlsx / .xls)
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

      {/* Duplicate warning */}
      {preview && hasDuplicates && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            Se detectaron {dupCount} registro{dupCount !== 1 ? "s" : ""} duplicado{dupCount !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-amber-700 mb-3">
            El <strong>Id Registro</strong> de {dupCount === 1 ? "este curso" : "estos cursos"} ya existe en la base de datos o aparece más de una vez en el archivo. ¿Qué deseas hacer?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setImportarDuplicados(false)}
              className={`text-xs px-4 py-2 rounded-lg font-medium border transition-colors ${
                !importarDuplicados
                  ? "bg-amber-700 text-white border-amber-700"
                  : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
              }`}
            >
              Omitir duplicados ({validCount} registros)
            </button>
            <button
              onClick={() => setImportarDuplicados(true)}
              className={`text-xs px-4 py-2 rounded-lg font-medium border transition-colors ${
                importarDuplicados
                  ? "bg-amber-700 text-white border-amber-700"
                  : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
              }`}
            >
              Importar de todas formas ({validCount + dupCount} registros)
            </button>
          </div>
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <StatCard label="Válidos" value={validCount} color="green" />
            {dupCount > 0 && <StatCard label="Duplicados" value={dupCount} color="amber" />}
            {errorCount > 0 && <StatCard label="Errores" value={errorCount} color="red" />}
            <StatCard label="Total" value={preview.length} color="gray" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa — Cursos</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || toImportCount === 0}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : `Importar ${toImportCount} registros`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5">Fila</th>
                    <th className="px-3 py-2.5">No. Emp.</th>
                    <th className="px-3 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5">Curso</th>
                    <th className="px-3 py-2.5">Institución</th>
                    <th className="px-3 py-2.5">Período</th>
                    <th className="px-3 py-2.5 text-right">Horas</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr
                      key={row.fila}
                      className={
                        row.error ? "bg-red-50/50" :
                        row.isDuplicate ? "bg-amber-50/50" : ""
                      }
                    >
                      <td className="px-3 py-2 text-gray-400">{row.fila}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{row.id_empleado || "—"}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px] truncate">{row.nombre_empleado || "—"}</td>
                      <td className="px-3 py-2">
                        {row.tipo_curso && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLORS[row.tipo_curso] ?? "bg-gray-100 text-gray-600"}`}>
                            {row.tipo_curso}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{row.nombre_curso || "—"}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{row.institucion || "—"}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                        {row.fecha_inicio ? row.fecha_inicio.slice(0, 7) : ""}
                        {row.fecha_inicio && row.fecha_fin ? " → " : ""}
                        {row.fecha_fin ? row.fecha_fin.slice(0, 7) : ""}
                        {!row.fecha_inicio && !row.fecha_fin ? "—" : ""}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.horas_efectivas ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {row.error ? (
                          <span className="text-red-500 text-xs">{row.error}</span>
                        ) : row.isDuplicate ? (
                          <span className="text-amber-600 text-xs font-medium">Duplicado</span>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">OK</span>
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
            {result.errors.length ? "Importación completada con advertencias" : "Importación de Cursos exitosa"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas" value={result.total} color="gray" />
            <StatCard label="Insertados" value={result.inserted} color="green" />
            {result.duplicadosOmitidos > 0 && <StatCard label="Duplicados omitidos" value={result.duplicadosOmitidos} color="amber" />}
            <StatCard label="Errores" value={result.errores} color={result.errores > 0 ? "red" : "gray"} />
          </div>
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={reset} className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] transition-colors">
              Nueva importación
            </button>
            <a href="/colaboradores" className="text-sm text-[#1a3a5c] border border-[#1a3a5c] px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              Ver colaboradores →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "green" | "blue" | "red" | "gray" | "amber" }) {
  const cls = {
    green: "border-green-200 bg-green-50 text-green-700",
    blue:  "border-blue-200 bg-blue-50 text-blue-700",
    red:   "border-red-200 bg-red-50 text-red-700",
    gray:  "border-gray-200 bg-white text-gray-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[color];
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
