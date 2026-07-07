"use client";

import { useState, useTransition } from "react";
import { upsertRutaCarrera, deleteRutaCarrera, generarRutasCarreraIA } from "@/app/actions/carrera";
import type { AccionRuta } from "@/app/actions/carrera";
import { SectionHeader } from "@/components/ui/SectionHeader";

type Ruta = {
  id: string;
  tipo_ruta: string;
  puesto_objetivo: string | null;
  uen_objetivo: string | null;
  plazo_estimado: string | null;
  habilidades_gap: string | null;
  acciones_recomendadas: string | null;
  acciones: AccionRuta[];
  aspiracion: string | null;
  generado_con_ia: boolean;
  activa: boolean;
};

const TIPO_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  ascendente:      { label: "Ascendente",      icon: "↑", color: "bg-purple-50 border-purple-200 text-purple-800" },
  lateral:         { label: "Lateral",          icon: "→", color: "bg-blue-50 border-blue-200 text-blue-800" },
  especializacion: { label: "Especialización",  icon: "◎", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
};

const VELOCIDAD_OPTIONS = [
  { value: "corto",   label: "Corto plazo",   sub: "1-2 años" },
  { value: "mediano", label: "Mediano plazo",  sub: "2-3 años" },
  { value: "largo",   label: "Largo plazo",    sub: "3-5 años" },
];

const ASPIRACION_OPTIONS = [
  { value: "tecnico",       label: "Técnico",            icon: "⚙️",  sub: "Especialización profunda" },
  { value: "directivo",     label: "Directivo",           icon: "👔",  sub: "Liderazgo y gestión" },
  { value: "emprendedor",   label: "Emprendedor interno", icon: "💡",  sub: "Innovación en GP" },
];

const EMPTY_ACCION: AccionRuta = { quien: "", que: "", para_cuando: "" };

export default function RutaCarreraEditor({
  colaboradorId,
  cicloAño,
  rutasIniciales,
  canEdit,
}: {
  colaboradorId: string;
  cicloAño: number;
  rutasIniciales: Ruta[];
  canEdit: boolean;
}) {
  const [rutas, setRutas] = useState<Ruta[]>(rutasIniciales);
  const [mode, setMode] = useState<"list" | "manual" | "ia">("list");
  const [editingRuta, setEditingRuta] = useState<Ruta | null>(null);
  const [isPending, startTransition] = useTransition();
  const [iaError, setIaError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Manual form state
  const [tipoForm, setTipoForm] = useState("ascendente");
  const [puestoForm, setPuestoForm] = useState("");
  const [plazoForm, setPlazoForm] = useState("2-3 años");
  const [gapForm, setGapForm] = useState("");
  const [accionesForm, setAccionesForm] = useState<AccionRuta[]>([{ ...EMPTY_ACCION }]);

  // IA preferences
  const [iaTipos, setIaTipos] = useState<string[]>(["ascendente", "lateral", "especializacion"]);
  const [iaVelocidad, setIaVelocidad] = useState("mediano");
  const [iaAspiracion, setIaAspiracion] = useState("directivo");

  function loadForEdit(r: Ruta) {
    setEditingRuta(r);
    setTipoForm(r.tipo_ruta);
    setPuestoForm(r.puesto_objetivo ?? "");
    setPlazoForm(r.plazo_estimado ?? "2-3 años");
    setGapForm(r.habilidades_gap ?? "");
    setAccionesForm(r.acciones?.length > 0 ? r.acciones : [{ ...EMPTY_ACCION }]);
    setMode("manual");
  }

  function resetManual() {
    setEditingRuta(null);
    setTipoForm("ascendente");
    setPuestoForm("");
    setPlazoForm("2-3 años");
    setGapForm("");
    setAccionesForm([{ ...EMPTY_ACCION }]);
  }

  function toggleIaTipo(t: string) {
    setIaTipos((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]
    );
  }

  function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertRutaCarrera(fd);
      if (res.ok) {
        setSavedMsg("Ruta guardada");
        setTimeout(() => setSavedMsg(null), 3000);
        setMode("list");
        resetManual();
        // Refresh — simple reload of route data without full page reload
        window.location.reload();
      }
    });
  }

  function handleDelete(rutaId: string) {
    startTransition(async () => {
      await deleteRutaCarrera(rutaId, colaboradorId);
      setRutas((prev) => prev.filter((r) => r.id !== rutaId));
    });
  }

  function handleGenerarIA() {
    setIaError(null);
    startTransition(async () => {
      const res = await generarRutasCarreraIA(colaboradorId, {
        tipos: iaTipos,
        velocidad: iaVelocidad,
        aspiracion: iaAspiracion,
      });
      if (res.ok) {
        setSavedMsg("Rutas generadas por IA");
        setTimeout(() => setSavedMsg(null), 3000);
        setMode("list");
        window.location.reload();
      } else {
        setIaError(res.error ?? "Error al generar rutas");
      }
    });
  }

  const activeRutas = rutas.filter((r) => r.activa);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionHeader label={`Rutas de Carrera — ${cicloAño}`} />
          {savedMsg && <p className="text-xs text-green-600 font-medium mt-0.5">{savedMsg}</p>}
        </div>
        {canEdit && mode === "list" && (
          <div className="flex gap-2">
            <button
              onClick={() => { resetManual(); setMode("ia"); }}
              className="flex items-center gap-1.5 text-xs bg-gradient-to-r from-[#1a3a5c] to-purple-700 text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
            >
              <span>✦</span> Generar con IA
            </button>
            <button
              onClick={() => { resetManual(); setMode("manual"); }}
              className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              + Nueva ruta
            </button>
          </div>
        )}
        {mode !== "list" && (
          <button
            onClick={() => { setMode("list"); resetManual(); setIaError(null); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ← Volver
          </button>
        )}
      </div>

      {/* LIST MODE */}
      {mode === "list" && (
        <div className="space-y-3">
          {activeRutas.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No hay rutas de carrera definidas para este ciclo.</p>
              {canEdit && (
                <p className="text-xs text-gray-400 mt-1">
                  Usa "Generar con IA" para obtener sugerencias personalizadas o crea una ruta manual.
                </p>
              )}
            </div>
          )}
          {activeRutas.map((r) => {
            const tc = TIPO_CONFIG[r.tipo_ruta] ?? { label: r.tipo_ruta, icon: "→", color: "bg-gray-50 border-gray-200 text-gray-700" };
            const acciones: AccionRuta[] = Array.isArray(r.acciones) ? r.acciones : [];
            return (
              <div key={r.id} className={`rounded-xl border p-5 ${tc.color.split(" ")[0]} ${tc.color.split(" ")[1]}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${tc.color}`}>
                      {tc.icon} {tc.label}
                    </span>
                    {r.generado_con_ia && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/60 text-gray-500">✦ IA</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button onClick={() => loadForEdit(r)} className="text-xs text-gray-400 hover:text-gray-700">Editar</button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                    </div>
                  )}
                </div>

                <p className="text-sm font-semibold text-gray-900">{r.puesto_objetivo ?? "—"}</p>
                {r.uen_objetivo && <p className="text-xs text-gray-500 mt-0.5">{r.uen_objetivo}</p>}

                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  {r.plazo_estimado && <span>⏱ {r.plazo_estimado}</span>}
                  {r.aspiracion && <span>🎯 {ASPIRACION_OPTIONS.find(a => a.value === r.aspiracion)?.label ?? r.aspiracion}</span>}
                </div>

                {r.habilidades_gap && (
                  <p className="text-xs text-gray-600 mt-2 italic">{r.habilidades_gap}</p>
                )}

                {acciones.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</p>
                    {acciones.map((a, idx) => (
                      <div key={idx} className="flex gap-2 text-xs bg-white/50 rounded-lg px-3 py-2">
                        <span className="text-gray-400 font-medium w-4 flex-shrink-0">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-700">{a.quien}</span>
                          <span className="text-gray-500"> — {a.que}</span>
                        </div>
                        {a.para_cuando && (
                          <span className="text-gray-400 flex-shrink-0">{a.para_cuando}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MANUAL FORM */}
      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
          <input type="hidden" name="colaborador_id" value={colaboradorId} />
          <input type="hidden" name="ciclo_año" value={cicloAño} />
          {editingRuta && <input type="hidden" name="ruta_id" value={editingRuta.id} />}

          <SectionHeader label={editingRuta ? "Editar ruta" : "Nueva ruta de carrera"} />

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Tipo de ruta</label>
            <input type="hidden" name="tipo_ruta" value={tipoForm} />
            <div className="flex gap-2 flex-wrap">
              {Object.entries(TIPO_CONFIG).map(([val, cfg]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTipoForm(val)}
                  className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    tipoForm === val
                      ? `${cfg.color} border-current`
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Puesto objetivo + plazo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Puesto objetivo</label>
              <input
                name="puesto_objetivo"
                type="text"
                required
                value={puestoForm}
                onChange={(e) => setPuestoForm(e.target.value)}
                placeholder="Ej. Gerente de Proyectos"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Plazo estimado</label>
              <select
                name="plazo_estimado"
                value={plazoForm}
                onChange={(e) => setPlazoForm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
              >
                <option value="1-2 años">1-2 años (corto plazo)</option>
                <option value="2-3 años">2-3 años (mediano plazo)</option>
                <option value="3-5 años">3-5 años (largo plazo)</option>
              </select>
            </div>
          </div>

          {/* Brecha de habilidades */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Brecha de habilidades (opcional)</label>
            <textarea
              name="habilidades_gap"
              value={gapForm}
              onChange={(e) => setGapForm(e.target.value)}
              rows={2}
              placeholder="¿Qué necesitas desarrollar para llegar ahí?"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none"
            />
          </div>

          {/* Acciones estructuradas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                Acciones ({accionesForm.length}/5)
              </label>
              {accionesForm.length < 5 && (
                <button
                  type="button"
                  onClick={() => setAccionesForm((p) => [...p, { ...EMPTY_ACCION }])}
                  className="text-xs text-[#1a3a5c] hover:underline"
                >
                  + Agregar acción
                </button>
              )}
            </div>
            <div className="space-y-2">
              {accionesForm.map((a, idx) => (
                <div key={idx} className="flex gap-2 items-start bg-gray-50 rounded-lg p-3">
                  <span className="text-xs text-gray-400 font-medium mt-2 w-5 flex-shrink-0">{idx + 1}.</span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      name={`accion_quien_${idx}`}
                      type="text"
                      value={a.quien}
                      onChange={(e) => setAccionesForm((p) => p.map((x, i) => i === idx ? { ...x, quien: e.target.value } : x))}
                      placeholder="¿Quién?"
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                    />
                    <input
                      name={`accion_que_${idx}`}
                      type="text"
                      value={a.que}
                      onChange={(e) => setAccionesForm((p) => p.map((x, i) => i === idx ? { ...x, que: e.target.value } : x))}
                      placeholder="¿Hace qué?"
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                    />
                    <input
                      name={`accion_cuando_${idx}`}
                      type="text"
                      value={a.para_cuando}
                      onChange={(e) => setAccionesForm((p) => p.map((x, i) => i === idx ? { ...x, para_cuando: e.target.value } : x))}
                      placeholder="¿Para cuándo?"
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                    />
                  </div>
                  {accionesForm.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setAccionesForm((p) => p.filter((_, i) => i !== idx))}
                      className="text-red-300 hover:text-red-500 mt-1.5 flex-shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setMode("list"); resetManual(); }}
              className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !puestoForm.trim()}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando..." : editingRuta ? "Actualizar ruta" : "Guardar ruta"}
            </button>
          </div>
        </form>
      )}

      {/* IA MODE */}
      {mode === "ia" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-base">✦</span>
            <p className="text-sm font-semibold text-gray-800">Generar rutas de carrera con IA</p>
          </div>
          <p className="text-xs text-gray-500 -mt-4">
            La IA analizará tu perfil, evaluaciones y PICD para generar alternativas personalizadas.
          </p>

          {/* Switch 1: Tipos de ruta */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">¿Qué tipo(s) de ruta quieres explorar?</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(TIPO_CONFIG).map(([val, cfg]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleIaTipo(val)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                    iaTipos.includes(val)
                      ? `${cfg.color} border-current shadow-sm`
                      : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"
                  }`}
                >
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Switch 2: Velocidad */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">¿En qué plazo quieres lograrlo?</p>
            <div className="flex gap-2 flex-wrap">
              {VELOCIDAD_OPTIONS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setIaVelocidad(v.value)}
                  className={`px-3 py-2 text-xs rounded-lg border transition-all text-left ${
                    iaVelocidad === v.value
                      ? "bg-[#1a3a5c] text-white border-[#1a3a5c] shadow-sm"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <div className="font-medium">{v.label}</div>
                  <div className={`text-xs mt-0.5 ${iaVelocidad === v.value ? "text-blue-200" : "text-gray-400"}`}>{v.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Switch 3: Aspiración */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">¿Hacia dónde quieres orientar tu desarrollo?</p>
            <div className="flex gap-2 flex-wrap">
              {ASPIRACION_OPTIONS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setIaAspiracion(a.value)}
                  className={`px-3 py-2.5 text-xs rounded-lg border transition-all text-left min-w-32 ${
                    iaAspiracion === a.value
                      ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <div className="text-base mb-0.5">{a.icon}</div>
                  <div className="font-medium">{a.label}</div>
                  <div className={`text-xs mt-0.5 ${iaAspiracion === a.value ? "text-purple-200" : "text-gray-400"}`}>{a.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {iaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {iaError}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">
              Se generarán {iaTipos.length} ruta{iaTipos.length !== 1 ? "s" : ""} · {
                VELOCIDAD_OPTIONS.find(v => v.value === iaVelocidad)?.sub
              } · {ASPIRACION_OPTIONS.find(a => a.value === iaAspiracion)?.label}
            </p>
            <button
              type="button"
              onClick={handleGenerarIA}
              disabled={isPending || iaTipos.length === 0}
              className="flex items-center gap-2 text-sm bg-gradient-to-r from-[#1a3a5c] to-purple-700 text-white px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generando...
                </>
              ) : (
                <><span>✦</span> Generar rutas</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
