"use client";

import { useState, useRef } from "react";

type CampoDetalle = { campo: string; anterior: string | null; nuevo: string | null };

type PreviewRow = {
  fila: number;
  id_empleado: string;
  nombre_completo: string;
  activo: boolean;
  sexo: string | null;
  fecha_nacimiento: string | null;
  fecha_antiguedad: string | null;
  fecha_ingreso_razon_social: string | null;
  fecha_baja: string | null;
  organización: string | null;
  puesto: string | null;
  departamento: string | null;
  segmento_organizacional: string | null;
  jefe_inmediato_nombre: string | null;
  correo: string | null;
  esNuevo: boolean;
  cambios: string[];
  cambiosDetalle: CampoDetalle[];
  error?: string;
};

type PreviewSummary = {
  rows: PreviewRow[];
  total: number;
  nuevos: number;
  actualizaciones: number;
  conCambios: number;
  sinCambios: number;
  errores: number;
};

type ImportResult = {
  ok: boolean;
  total: number;
  upserted: number;
  jefeLinked: number;
  conCambios: number;
  errores: number;
  errors: string[];
};

export default function ImportadorHrCorp() {
  const [file, setFile]           = useState<File | null>(null);
  const [preview, setPreview]     = useState<PreviewSummary | null>(null);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showAll, setShowAll]     = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    setShowAll(false);
    setExpandedId(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "preview");
      const res = await fetch("/api/importar/hrcorp", { method: "POST", body: fd });
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
    const validos = preview.rows.filter((r) => !r.error).length;
    if (!confirm(`¿Importar ${validos} colaboradores desde HrCorp? Los registros existentes se actualizarán y se guardará historial de cambios.`)) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "import");
      const res = await fetch("/api/importar/hrcorp", { method: "POST", body: fd });
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
    setShowAll(false);
    setExpandedId(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const validCount  = preview?.rows.filter((r) => !r.error).length ?? 0;
  const visibleRows = preview
    ? (showAll ? preview.rows : preview.rows.filter((r) => r.esNuevo || r.cambios.length > 0 || r.error))
    : [];

  return (
    <div className="space-y-5">

      {/* Format info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato HrCorp — Exportación semanal</p>
        <p>Sube el archivo Excel que exportas de HrCorp. Se detectan automáticamente las columnas por nombre.</p>
        <ul className="text-xs text-blue-600 space-y-0.5 mt-1 list-disc list-inside">
          <li><strong>CURP y RFC nunca se importan</strong> — quedan fuera aunque estén en el archivo</li>
          <li>Registros existentes se actualizan; se guarda historial inmutable de cada campo que cambió</li>
          <li>Los jefes se vinculan por UUID automáticamente si el nombre coincide</li>
        </ul>
      </div>

      {/* Upload */}
      {!result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Archivo Excel HrCorp (.xlsx / .xls)
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
            <StatCard label="Nuevos"         value={preview.nuevos}     color="green" />
            <StatCard label="Con cambios"     value={preview.conCambios} color="amber" />
            <StatCard label="Sin cambios"     value={preview.sinCambios} color="gray"  />
            {preview.errores > 0 && <StatCard label="Errores" value={preview.errores} color="red" />}
            <StatCard label="Total"           value={preview.total}      color="gray"  />
          </div>

          {preview.conCambios === 0 && preview.nuevos === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-sm text-gray-600">
              El archivo no contiene registros nuevos ni cambios respecto a la base de datos actual.
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-700">Vista previa — HrCorp</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {showAll
                    ? `Mostrando todos los ${preview.total} registros`
                    : `Solo registros nuevos y con cambios (${visibleRows.length} de ${preview.total})`}
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    className="ml-2 text-[#1a3a5c] underline hover:no-underline"
                  >
                    {showAll ? "Ver solo cambios" : "Ver todos"}
                  </button>
                </p>
              </div>
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
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2.5 w-20">No. Emp.</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Nombre</th>
                    <th className="px-3 py-2.5 w-16">Estatus</th>
                    <th className="px-3 py-2.5 min-w-[160px]">Puesto</th>
                    <th className="px-3 py-2.5 min-w-[160px]">Organización</th>
                    <th className="px-3 py-2.5 min-w-[120px]">Segmento</th>
                    <th className="px-3 py-2.5 min-w-[150px]">Jefe</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isExpanded = expandedId === row.id_empleado;
                    const hasDetail  = !row.esNuevo && row.cambiosDetalle.length > 0;
                    const rowBg =
                      row.error           ? "bg-red-50/50"   :
                      row.esNuevo         ? "bg-green-50/40" :
                      row.cambios.length  ? "bg-amber-50/30" : "";

                    return (
                      <>
                        <tr
                          key={row.fila}
                          className={`border-t border-gray-50 ${rowBg} ${hasDetail ? "cursor-pointer hover:brightness-95" : ""}`}
                          onClick={() => hasDetail && setExpandedId(isExpanded ? null : row.id_empleado)}
                        >
                          <td className="px-3 py-2.5 font-mono text-gray-500 whitespace-nowrap">{row.id_empleado || "—"}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-normal leading-snug">
                            <div className="flex items-start gap-1.5">
                              {hasDetail && (
                                <span className="mt-0.5 text-amber-400 flex-shrink-0 text-[10px]">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              )}
                              <span>{row.nombre_completo || "—"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {row.error ? null : (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${row.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {row.activo ? "Activo" : "Baja"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-normal leading-snug">{row.puesto || "—"}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-normal leading-snug">
                            {[row.organización, row.departamento].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-normal leading-snug">{row.segmento_organizacional || "—"}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-normal leading-snug">{row.jefe_inmediato_nombre || "—"}</td>
                          <td className="px-3 py-2.5">
                            {row.error ? (
                              <span className="text-red-500">{row.error}</span>
                            ) : row.esNuevo ? (
                              <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                Nuevo
                              </span>
                            ) : row.cambios.length === 0 ? (
                              <span className="text-gray-300">Sin cambios</span>
                            ) : (
                              <ChangeBadges cambios={row.cambios} />
                            )}
                          </td>
                        </tr>

                        {/* Expandable detail row */}
                        {isExpanded && hasDetail && (
                          <tr key={`${row.fila}-detail`} className="bg-amber-50/60 border-t border-amber-100">
                            <td colSpan={8} className="px-6 py-4">
                              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide mb-2">
                                Detalle de cambios — {row.nombre_completo}
                              </p>
                              <table className="text-xs w-full max-w-2xl border-collapse">
                                <thead>
                                  <tr className="text-gray-400">
                                    <th className="text-left pb-1.5 pr-6 font-medium w-32">Campo</th>
                                    <th className="text-left pb-1.5 pr-6 font-medium">Valor anterior</th>
                                    <th className="text-left pb-1.5 font-medium">Valor nuevo</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100">
                                  {row.cambiosDetalle.map((d) => (
                                    <tr key={d.campo}>
                                      <td className="py-1.5 pr-6 font-semibold text-gray-600 whitespace-nowrap">{d.campo}</td>
                                      <td className="py-1.5 pr-6">
                                        <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded line-through decoration-red-300">
                                          {d.anterior ?? <span className="italic text-gray-400 no-underline" style={{textDecoration:"none"}}>vacío</span>}
                                        </span>
                                      </td>
                                      <td className="py-1.5">
                                        <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium">
                                          {d.nuevo ?? <span className="italic text-gray-400 font-normal">vacío</span>}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
                        No hay registros nuevos ni con cambios en este archivo.
                      </td>
                    </tr>
                  )}
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
            {result.errors.length ? "Importación completada con advertencias" : "Importación HrCorp exitosa"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas"               value={result.total}      color="gray"  />
            <StatCard label="Insertados / actualizados" value={result.upserted}   color="green" />
            <StatCard label="Registros con cambios"     value={result.conCambios} color="amber" />
            <StatCard label="Jefes vinculados"          value={result.jefeLinked} color="blue"  />
            {result.errores > 0 && <StatCard label="Errores" value={result.errores} color="red" />}
          </div>
          {result.conCambios > 0 && (
            <p className="text-sm text-green-700">
              Se guardó historial inmutable de cambios para {result.conCambios} colaborador(es).
            </p>
          )}
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

function ChangeBadges({ cambios }: { cambios: string[] }) {
  const visible = cambios.slice(0, 3);
  const rest    = cambios.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((c) => (
        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium whitespace-nowrap">
          {c}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">+{rest} más</span>
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
