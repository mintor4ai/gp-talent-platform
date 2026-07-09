"use client";

import { useState, useRef } from "react";

const ROL_LABELS: Record<string, string> = {
  colaborador:    "Colaborador",
  jefe:           "Jefe / Líder",
  capital_humano: "Capital Humano",
};

const ROL_COLORS: Record<string, string> = {
  colaborador:    "bg-blue-100 text-blue-800",
  jefe:           "bg-purple-100 text-purple-800",
  capital_humano: "bg-orange-100 text-orange-800",
};

type PreviewRow = {
  fila: number;
  no_empleado: string;
  nombre_completo: string | null;
  colaborador_id: string | null;
  correo: string;
  rol: string | null;
  coach_habilitado: boolean;
  usuario_existe: boolean;
  usuarios_app_existe: boolean;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  total: number;
  creados: number;
  actualizados: number;
  invitados: number;
  errores: number;
  errors: string[];
};

export default function ImportadorUsuarios() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviarInvitacion, setEnviarInvitacion] = useState(true);
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
      const res = await fetch("/api/importar/usuarios", { method: "POST", body: fd });
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
    const nuevos = preview.filter((r) => !r.error && !r.usuario_existe).length;
    const msg = enviarInvitacion
      ? `¿Crear ${validos} usuarios? Se enviará invitación por correo a ${nuevos} usuario(s) nuevo(s).`
      : `¿Crear ${validos} usuarios? Los nuevos (${nuevos}) necesitarán usar "Olvidé mi contraseña" para ingresar.`;
    if (!confirm(msg)) return;

    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      fd.set("modo", "import");
      fd.set("enviar_invitacion", String(enviarInvitacion));
      const res = await fetch("/api/importar/usuarios", { method: "POST", body: fd });
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
  const nuevosCount   = preview?.filter((r) => !r.error && !r.usuario_existe).length ?? 0;
  const existenCount  = preview?.filter((r) => !r.error && r.usuario_existe).length ?? 0;

  return (
    <div className="space-y-5">

      {/* Format hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Formato del archivo Excel — Usuarios de Acceso</p>
        <p>Una hoja con las siguientes columnas:</p>
        <div className="overflow-x-auto mt-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="text-blue-700">
                {["no_empleado", "correo", "rol", "coach_habilitado"].map((h) => (
                  <th key={h} className="border border-blue-200 px-2 py-1 bg-blue-100 font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="text-blue-600">
                {["4001", "juan.perez@empresa.com", "colaborador", "NO"].map((v, i) => (
                  <td key={i} className="border border-blue-100 px-2 py-1 whitespace-nowrap">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-blue-600 space-y-0.5 mt-2 list-disc list-inside">
          <li><strong>no_empleado</strong> y <strong>correo</strong> son obligatorios</li>
          <li><strong>rol</strong>: <code>colaborador</code>, <code>jefe</code> o <code>capital_humano</code></li>
          <li><strong>coach_habilitado</strong>: SI / NO (default NO)</li>
          <li>El colaborador debe existir previamente en el sistema (importado o creado)</li>
          <li>Si el correo ya tiene cuenta, solo se actualiza su perfil en la app</li>
          <li>No se puede asignar el rol <code>superadmin</code> desde importación</li>
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

          {/* Invite option */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enviarInvitacion}
              onChange={(e) => setEnviarInvitacion(e.target.checked)}
              className="w-4 h-4 accent-[#1a3a5c]"
            />
            <span className="text-sm text-gray-700">
              Enviar invitación por correo a usuarios nuevos
              <span className="text-xs text-gray-400 ml-1">(el usuario recibirá un link para establecer su contraseña)</span>
            </span>
          </label>

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
            <StatCard label="Cuentas nuevas" value={nuevosCount} color="green" />
            <StatCard label="Ya existentes" value={existenCount} color="blue" />
            {errorCount > 0 && <StatCard label="Errores" value={errorCount} color="red" />}
            <StatCard label="Total" value={preview.length} color="gray" />
          </div>

          {enviarInvitacion && nuevosCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              Se enviarán <strong>{nuevosCount} invitación(es)</strong> por correo al confirmar la importación.
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Vista previa de usuarios</p>
              <div className="flex gap-2">
                <button onClick={reset} className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || validCount === 0}
                  className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {loading ? "Procesando..." : `Crear ${validCount} usuarios`}
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
                    <th className="px-3 py-2.5">Correo</th>
                    <th className="px-3 py-2.5">Rol</th>
                    <th className="px-3 py-2.5 text-center">Coach</th>
                    <th className="px-3 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr key={row.fila} className={row.error ? "bg-red-50/50" : row.usuario_existe ? "" : "bg-green-50/30"}>
                      <td className="px-3 py-2 text-gray-400">{row.fila}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{row.no_empleado || "—"}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px] truncate">{row.nombre_completo || "—"}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">{row.correo || "—"}</td>
                      <td className="px-3 py-2">
                        {row.rol
                          ? <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${ROL_COLORS[row.rol] ?? "bg-gray-100 text-gray-700"}`}>
                              {ROL_LABELS[row.rol] ?? row.rol}
                            </span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.coach_habilitado
                          ? <span className="text-green-600 font-bold text-xs">SI</span>
                          : <span className="text-gray-300 text-xs">NO</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.error
                          ? <span className="text-red-500 text-xs">{row.error}</span>
                          : row.usuario_existe
                            ? <span className="text-blue-500 text-xs">Actualizar</span>
                            : <span className="text-green-600 font-semibold text-xs">Nueva cuenta</span>
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
            {result.errors.length ? "Importación completada con advertencias" : "Usuarios creados exitosamente"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total filas" value={result.total} color="gray" />
            <StatCard label="Cuentas nuevas" value={result.creados + result.invitados} color="green" />
            <StatCard label="Actualizados" value={result.actualizados} color="blue" />
            <StatCard label="Errores" value={result.errores} color={result.errores > 0 ? "red" : "gray"} />
          </div>
          {result.invitados > 0 && (
            <p className="text-sm text-green-700">
              Se enviaron <strong>{result.invitados}</strong> invitación(es) por correo. Los usuarios deben hacer clic en el link para establecer su contraseña.
            </p>
          )}
          {result.creados > 0 && (
            <p className="text-sm text-green-700">
              <strong>{result.creados}</strong> cuenta(s) creada(s) sin invitación. Los usuarios deben usar "Olvidé mi contraseña" para acceder.
            </p>
          )}
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
