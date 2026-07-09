"use client";

import { useState, useRef } from "react";
import ImportadorColaboradores from "./ImportadorColaboradores";
import ImportadorUsuarios from "./ImportadorUsuarios";
import ImportadorCatalogoPuestos from "./ImportadorCatalogoPuestos";

const ZONA_COLORS: Record<string, string> = {
  Sobresaliente: "bg-purple-100 text-purple-800",
  Desarrollo:    "bg-blue-100 text-blue-800",
  Estabilidad:   "bg-green-100 text-green-800",
  "Revisión":    "bg-orange-100 text-orange-800",
  Inicio:        "bg-yellow-100 text-yellow-800",
};

type PreviewRow = {
  fila: number;
  nombre: string;
  uuid: string | null;
  matched: boolean;
  resultado_logra: number | null;
  potencial_total: number | null;
  zona: string | null;
  planea: number | null;
  ejecuta: number | null;
  optimiza: number | null;
  trabaja_equipo: number | null;
  atiende_cliente: number | null;
  informa: number | null;
  tuvo_eal: boolean | null;
  entrego_picd: boolean | null;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  total: number;
  matched: number;
  unmatched: number;
  insertedDesemp: number;
  insertedEip: number;
  errors: string[];
};

export default function ImportadorClient() {
  const [tab, setTab] = useState<"catalogo" | "colaboradores" | "usuarios" | "evaluaciones">("catalogo");
  const [cicloAño, setCicloAño] = useState<number>(new Date().getFullYear());
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
      fd.set("ciclo_año", String(cicloAño));
      fd.set("modo", "preview");
      const res = await fetch("/api/importar", { method: "POST", body: fd });
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
    const matched = preview.filter((r) => r.matched).length;
    if (!confirm(`¿Confirmar importación de ${matched} colaboradores para el ciclo ${cicloAño}? Esta acción sobreescribirá datos existentes del ciclo.`)) return;

    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("ciclo_año", String(cicloAño));
      fd.set("modo", "import");
      const res = await fetch("/api/importar", { method: "POST", body: fd });
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

  const matchedCount = preview?.filter((r) => r.matched).length ?? 0;
  const unmatchedCount = preview?.filter((r) => !r.matched).length ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importación de Datos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carga archivos Excel para importar colaboradores o evaluaciones.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "catalogo",      label: "Catálogo de Puestos" },
          { id: "colaboradores", label: "Colaboradores" },
          { id: "usuarios",      label: "Usuarios de Acceso" },
          { id: "evaluaciones",  label: "Evaluaciones EIP / Desempeño" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-[#1a3a5c] text-[#1a3a5c]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "catalogo" && <ImportadorCatalogoPuestos />}

      {tab === "colaboradores" && <ImportadorColaboradores />}

      {tab === "usuarios" && <ImportadorUsuarios />}

      {tab === "evaluaciones" && (<>
      <div>
        <p className="text-sm text-gray-500">
          Importa resultados de evaluación EIP y Desempeño por ciclo.
        </p>
      </div>

      {/* Template download hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Formato del archivo Excel</p>
        <p>El archivo debe tener una hoja con las siguientes columnas (el orden no importa, los nombres son flexibles):</p>
        <div className="mt-2 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {["no_empleado", "nombre", "resultado_logra", "potencial_total", "planea", "ejecuta",
                  "optimiza", "trabaja_equipo", "atiende_cliente", "informa", "tuvo_eal", "entrego_picd"].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-blue-600">
                {["4001", "JUAN PÉREZ", "110", "105", "4.2", "3.8", "4.0", "4.5", "3.5", "4.1", "SI", "NO"].map((v, i) => (
                  <td key={i} className="border border-blue-100 px-2 py-1 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-blue-600 mt-2">
          • <code>tuvo_eal</code> y <code>entrego_picd</code>: SI / NO · Zona se calcula automáticamente (desempeño + potencial) · Columnas de desempeño y potencial son opcionales pero se recomienda incluir ambas.
        </p>
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
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); setError(null); }}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1a3a5c] file:text-white hover:file:bg-[#152e4d] cursor-pointer"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
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

      {/* Preview table */}
      {preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-green-700">{matchedCount}</p>
              <p className="text-xs text-green-600">Identificados</p>
            </div>
            {unmatchedCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-700">{unmatchedCount}</p>
                <p className="text-xs text-red-600">No encontrados</p>
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
              <p className="text-2xl font-bold text-gray-700">{preview.length}</p>
              <p className="text-xs text-gray-500">Total filas</p>
            </div>
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
                  onClick={handleImport}
                  disabled={loading || matchedCount === 0}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Importando..." : `Importar ${matchedCount} registros`}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="px-3 py-2.5">Fila</th>
                    <th className="px-3 py-2.5">Colaborador</th>
                    <th className="px-3 py-2.5 text-center">Encontrado</th>
                    <th className="px-3 py-2.5 text-right">Desempeño</th>
                    <th className="px-3 py-2.5 text-right">Potencial</th>
                    <th className="px-3 py-2.5">Zona calculada</th>
                    <th className="px-3 py-2.5 text-right">Planea</th>
                    <th className="px-3 py-2.5 text-right">Ejecuta</th>
                    <th className="px-3 py-2.5 text-right">Optimiza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr key={row.fila} className={row.matched ? "" : "bg-red-50/50"}>
                      <td className="px-3 py-2 text-gray-400">{row.fila}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.nombre}</td>
                      <td className="px-3 py-2 text-center">
                        {row.matched
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-red-500 text-xs">{row.error ?? "No encontrado"}</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.resultado_logra ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.potencial_total ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.zona
                          ? <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${ZONA_COLORS[row.zona] ?? ""}`}>{row.zona}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.planea ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.ejecuta ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.optimiza ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Import result */}
      {result && (
        <div className={`rounded-xl border p-6 space-y-4 ${result.errors.length ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"}`}>
          <p className={`text-lg font-bold ${result.errors.length ? "text-orange-800" : "text-green-800"}`}>
            {result.errors.length ? "Importación completada con advertencias" : "Importación exitosa"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total filas" value={result.total} />
            <Stat label="Identificados" value={result.matched} />
            <Stat label="Desempeño insertados" value={result.insertedDesemp} />
            <Stat label="EIP insertados" value={result.insertedEip} />
          </div>
          {result.unmatched > 0 && (
            <p className="text-sm text-orange-700">{result.unmatched} fila(s) no se importaron porque el colaborador no fue encontrado.</p>
          )}
          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg p-3 space-y-1">
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
      </>)}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
