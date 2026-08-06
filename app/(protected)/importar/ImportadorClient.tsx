"use client";

import { useState, useRef } from "react";
import ImportadorColaboradores from "./ImportadorColaboradores";
import ImportadorUsuarios from "./ImportadorUsuarios";
import ImportadorCatalogoPuestos from "./ImportadorCatalogoPuestos";
import ImportadorHrCorp from "./ImportadorHrCorp";
import ImportadorEstudios from "./ImportadorEstudios";
import ImportadorCursos from "./ImportadorCursos";
import ImportadorCompetencias from "./ImportadorCompetencias";
import ImportadorDesempeno from "./ImportadorDesempeno";
import ImportadorEAL from "./ImportadorEAL";
import CalculadorEIP from "./CalculadorEIP";
import ImportadorPicd from "./ImportadorPicd";
import ImportadorSucesion from "./ImportadorSucesion";

const ZONA_COLORS: Record<string, string> = {
  Sobresaliente: "bg-purple-100 text-purple-800",
  Desarrollo:    "bg-blue-100 text-blue-800",
  Estabilidad:   "bg-green-100 text-green-800",
  "Revisión":    "bg-orange-100 text-orange-800",
  Inicio:        "bg-yellow-100 text-yellow-800",
};

type PreviewRow = {
  fila: number;
  id_empleado_num: string;
  nombre: string;
  matched: boolean;
  uen: string | null;
  segmento_organizacional: string | null;
  desempeno_logra: number | null;
  evaluacion_potencial_total: number | null;
  zona_evaluacion: string | null;
  tuvo_eal: boolean | null;
  entrego_picd: boolean | null;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  total: number;
  matched: number;
  unmatched: number;
  upserted: number;
  errors: string[];
};

export default function ImportadorClient() {
  const [tab, setTab] = useState<"catalogo" | "colaboradores" | "usuarios" | "evaluaciones" | "hrcorp" | "estudios" | "cursos" | "competencias" | "desempeno" | "eal" | "picd" | "calcular_eip" | "sucesion">("catalogo");
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
          { id: "hrcorp",        label: "HrCorp (semanal)" },
          { id: "estudios",      label: "Estudios" },
          { id: "cursos",        label: "Cursos" },
          { id: "catalogo",      label: "Catálogo de Puestos" },
          { id: "colaboradores", label: "Colaboradores (genérico)" },
          { id: "usuarios",      label: "Usuarios de Acceso" },
          { id: "evaluaciones",  label: "Evaluaciones EIP / Desempeño" },
          { id: "competencias",  label: "Competencias 360°" },
          { id: "desempeno",     label: "Desempeño" },
          { id: "eal",           label: "EAL" },
          { id: "picd",          label: "PICD" },
          { id: "calcular_eip",  label: "Calcular EIP" },
          { id: "sucesion",      label: "Plan de Sucesión" },
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

      {tab === "hrcorp" && <ImportadorHrCorp />}

      {tab === "estudios" && <ImportadorEstudios />}

      {tab === "cursos" && <ImportadorCursos />}

      {tab === "competencias" && <ImportadorCompetencias />}

      {tab === "desempeno" && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500">
              Importa resultados de Evaluación de Desempeño (escala 80–120) por ciclo.
            </p>
          </div>
          <ImportadorDesempeno />
        </div>
      )}

      {tab === "eal"          && <ImportadorEAL />}
      {tab === "picd"         && <ImportadorPicd />}
      {tab === "calcular_eip" && <CalculadorEIP />}
      {tab === "sucesion"     && <ImportadorSucesion />}

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
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato del archivo Excel (reporte EIP)</p>
        <p className="text-xs">El sistema acepta el reporte EIP directamente. Las columnas clave son:</p>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {["Id","Nombre completo","UEN","DESEMPEÑO","Tablero de Gestión","Puesto",
                  "Segmento Organizacional de Ciclo","Años de experiencia","#Puestos","Movilidad",
                  "Escolaridad","Horas Cursos","Competencias","Percentil Competencias",
                  "EAL","Percentil EAL","Cumplimiento PICD",
                  "Ev. Años","Ev. Movilidad","Ev. Experiencia","Ev. Escolaridad","Ev. Cursos",
                  "Ev. Competencias","Ev. de EAL","Ev. PICD",
                  "Tuvo EAL","Entregó PICD","POTENCIAL","DESEMPEÑO + POTENCIAL","Zona Promocional"].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-blue-600">
                {["412","JOSE MANUEL MANZANO MORENO","101 GP CONSTRUCCIÓN","106","","SUPERVISOR…","11 ANALISTA",
                  "31.4","2","15.70","Profesional","","9.6","91%","NA","NA","100.0",
                  "100","80","80","100","","117","NA","120","0","1","102.5","208","Estabilidad"].map((v, i) => (
                  <td key={i} className="border border-blue-100 px-2 py-1 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-blue-600">
          • <code>Tuvo EAL</code> / <code>Entregó PICD</code>: 0 = No, 1 = Sí · Valores "NA" se guardan como nulos · El sistema identifica colaboradores por <code>Id</code> (número de empleado).
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
                    <th className="px-3 py-2.5">No.Emp</th>
                    <th className="px-3 py-2.5">Colaborador</th>
                    <th className="px-3 py-2.5 text-center">BD</th>
                    <th className="px-3 py-2.5">UEN</th>
                    <th className="px-3 py-2.5">Segmento</th>
                    <th className="px-3 py-2.5 text-right">Desempeño</th>
                    <th className="px-3 py-2.5 text-right">Potencial</th>
                    <th className="px-3 py-2.5">Zona</th>
                    <th className="px-3 py-2.5 text-center">EAL</th>
                    <th className="px-3 py-2.5 text-center">PICD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr key={row.fila} className={row.matched ? "" : "bg-red-50/50"}>
                      <td className="px-3 py-2 text-gray-400">{row.fila}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono">{row.id_empleado_num || "—"}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{row.nombre}</td>
                      <td className="px-3 py-2 text-center">
                        {row.matched
                          ? <span className="text-green-600 font-bold">✓</span>
                          : <span className="text-red-500 text-xs" title={row.error}>✗</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.uen ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.segmento_organizacional ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-700 font-mono">{row.desempeno_logra?.toFixed(0) ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-700 font-mono">{row.evaluacion_potencial_total?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.zona_evaluacion
                          ? <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${ZONA_COLORS[row.zona_evaluacion] ?? "bg-gray-100 text-gray-600"}`}>{row.zona_evaluacion}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-center text-gray-500">{row.tuvo_eal == null ? "—" : row.tuvo_eal ? "Sí" : "No"}</td>
                      <td className="px-3 py-2 text-center text-gray-500">{row.entrego_picd == null ? "—" : row.entrego_picd ? "Sí" : "No"}</td>
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
            <Stat label="Insertados / actualizados" value={result.upserted} />
            <Stat label="No encontrados" value={result.unmatched} />
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
