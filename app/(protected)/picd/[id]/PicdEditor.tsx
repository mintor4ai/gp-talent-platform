"use client";

import { useState, useTransition, useEffect } from "react";
import { upsertPicd, updateAccionProgress, submitPicd } from "@/app/actions/picd";
import { cerrarCicloPicd } from "@/app/actions/picd_ciclo";
import { SectionHeader } from "@/components/ui/SectionHeader";

type PicdAccion = {
  id: string;
  tipo_accion: string;
  accion_descripcion: string;
  institucion_plataforma: string | null;
  fecha_cumplimiento: string | null;
  horas_capacitacion: number | null;
  porcentaje_etapa1: number | null;
  porcentaje_etapa2: number | null;
  objetivo_logrado: string | null;
};

type PicdRecord = {
  id: string;
  estado: string;
  puesto_futuro_opcion1: string | null;
  puesto_futuro_opcion2: string | null;
  areas_oportunidad: string | null;
  compromisos: string | null;
} | null;

type CicloEstado = {
  estado: string;
  cerrado_at: string | null;
  decision_at: string | null;
  decision_nombre: string | null;
  comentario_jefe: string | null;
  reabierto_at: string | null;
  reabierto_nombre: string | null;
} | null;

export default function PicdEditor({
  colaboradorId,
  cicloAño,
  picd,
  acciones,
  canEdit,
  isOwn,
  isAdmin,
  cicloEstado,
}: {
  colaboradorId: string;
  cicloAño: number;
  picd: PicdRecord;
  acciones: PicdAccion[];
  canEdit: boolean;
  isOwn: boolean;
  isAdmin: boolean;
  cicloEstado: CicloEstado;
}) {
  const [isPending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"desarrollo" | "normativo">("desarrollo");
  const [importedSuggestion, setImportedSuggestion] = useState<string | null>(null);
  const [areasValue, setAreasValue] = useState(picd?.areas_oportunidad ?? "");

  useEffect(() => {
    const suggestion = sessionStorage.getItem("coach_picd_import");
    if (suggestion) {
      sessionStorage.removeItem("coach_picd_import");
      setImportedSuggestion(suggestion);
      setAreasValue(suggestion);
    }
  }, []);

  const actionsByType = {
    desarrollo: acciones.filter((a) => a.tipo_accion !== "normativo_sgi"),
    normativo: acciones.filter((a) => a.tipo_accion === "normativo_sgi"),
  };

  const estadoColors: Record<string, string> = {
    borrador: "bg-yellow-100 text-yellow-800",
    enviado: "bg-blue-100 text-blue-800",
    aprobado: "bg-green-100 text-green-800",
  };

  async function handleSavePicd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await upsertPicd(fd);
      setSavedMsg("Guardado correctamente");
      setTimeout(() => setSavedMsg(null), 3000);
    });
  }

  async function handleSaveAccion(e: React.FormEvent<HTMLFormElement>, accionId: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("accion_id", accionId);
    fd.set("id_empleado", colaboradorId);
    startTransition(async () => {
      await updateAccionProgress(fd);
      setSavedMsg("Progreso actualizado");
      setTimeout(() => setSavedMsg(null), 3000);
    });
  }

  async function handleSubmit() {
    if (!picd?.id) return;
    const fd = new FormData();
    fd.set("picd_id", picd.id);
    fd.set("id_empleado", colaboradorId);
    startTransition(async () => {
      await submitPicd(fd);
    });
  }

  async function handleCerrarCiclo() {
    if (!confirm("¿Confirmas que deseas cerrar y enviar tu PICD a revisión? Ya no podrás editarlo hasta que tu jefe lo revise.")) return;
    startTransition(async () => {
      await cerrarCicloPicd(colaboradorId, cicloAño);
      setSavedMsg("Ciclo enviado a revisión");
    });
  }

  const cicloLocked = cicloEstado?.estado === "enviado_revision" || cicloEstado?.estado === "aprobado";
  const showCerrarBtn = (isOwn || isAdmin) && (!cicloEstado || cicloEstado.estado === "abierto");
  const fueRechazado = cicloEstado?.estado === "abierto" && !!cicloEstado.comentario_jefe && !!cicloEstado.decision_at;

  return (
    <div className="space-y-6">

      {/* Banner: ciclo en revisión */}
      {cicloEstado?.estado === "enviado_revision" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-blue-800">PICD enviado a revisión</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Tu ciclo {cicloAño} está bloqueado mientras tu jefe lo revisa.
              {cicloEstado.cerrado_at && ` Enviado el ${new Date(cicloEstado.cerrado_at).toLocaleDateString("es-MX")}.`}
            </p>
          </div>
        </div>
      )}

      {/* Banner: ciclo aprobado */}
      {cicloEstado?.estado === "aprobado" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-green-800">
              PICD {cicloAño} aprobado
              {cicloEstado.decision_nombre && ` por ${cicloEstado.decision_nombre}`}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              El ciclo está cerrado. Contacta a tu administrador si necesitas hacer cambios.
            </p>
          </div>
        </div>
      )}

      {/* Banner: rechazado / requiere ajustes */}
      {fueRechazado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Tu jefe solicitó ajustes</p>
            {cicloEstado?.comentario_jefe && (
              <p className="text-xs text-amber-700 mt-0.5 italic">"{cicloEstado.comentario_jefe}"</p>
            )}
            <p className="text-xs text-amber-600 mt-1">
              Realiza los cambios necesarios y vuelve a enviar a revisión.
            </p>
          </div>
        </div>
      )}

      {/* Banner importación del Coach */}
      {importedSuggestion && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="text-blue-500 text-lg leading-none mt-0.5">✦</span>
            <div>
              <p className="text-sm font-semibold text-blue-800">Sugerencia del Coach IA importada</p>
              <p className="text-xs text-blue-600 mt-0.5">
                El texto ha sido pre-llenado en Áreas de oportunidad. Revísalo, edítalo si lo deseas y
                <span className="font-bold"> guarda el plan para que quede registrado.</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setImportedSuggestion(null)}
            className="text-blue-400 hover:text-blue-600 flex-shrink-0 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Estado y acciones globales */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              estadoColors[picd?.estado ?? "borrador"] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {picd?.estado ?? "Nuevo"}
          </span>
          {savedMsg && (
            <span className="text-xs text-green-600 font-medium">{savedMsg}</span>
          )}
        </div>
        {canEdit && picd?.id && picd.estado === "borrador" && (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="text-sm bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Enviar a Capital Humano
          </button>
        )}
        {showCerrarBtn && picd?.id && (
          <button
            onClick={handleCerrarCiclo}
            disabled={isPending}
            className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Cerrar y enviar a revisión
          </button>
        )}
      </div>

      {/* Formulario principal PICD */}
      <form onSubmit={handleSavePicd} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <input type="hidden" name="id_empleado" value={colaboradorId} />
        <input type="hidden" name="ciclo_año" value={cicloAño} />
        {picd?.id && <input type="hidden" name="picd_id" value={picd.id} />}

        <SectionHeader label={`Plan de Desarrollo — Ciclo ${cicloAño}`} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Puesto futuro — Opción 1
            </label>
            <input
              name="puesto_futuro_opcion1"
              type="text"
              defaultValue={picd?.puesto_futuro_opcion1 ?? ""}
              disabled={!canEdit}
              placeholder="Ej. Gerente de Construcción"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Puesto futuro — Opción 2
            </label>
            <input
              name="puesto_futuro_opcion2"
              type="text"
              defaultValue={picd?.puesto_futuro_opcion2 ?? ""}
              disabled={!canEdit}
              placeholder="Ej. Director de Proyectos"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Áreas de oportunidad
            {importedSuggestion && (
              <span className="ml-2 text-xs font-normal text-blue-500">← importado del Coach IA</span>
            )}
          </label>
          <textarea
            name="areas_oportunidad"
            value={areasValue}
            onChange={(e) => setAreasValue(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder="Describe las áreas en las que trabajarás este ciclo..."
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none disabled:bg-gray-50 disabled:text-gray-500 ${
              importedSuggestion ? "border-blue-300 bg-blue-50/30" : "border-gray-200"
            }`}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Compromisos del colaborador
          </label>
          <textarea
            name="compromisos"
            defaultValue={picd?.compromisos ?? ""}
            disabled={!canEdit}
            rows={3}
            placeholder="¿A qué te comprometes este ciclo?"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors"
            >
              {isPending ? "Guardando..." : "Guardar plan"}
            </button>
          </div>
        )}
      </form>

      {/* Acciones de desarrollo */}
      {acciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-100 px-6 flex gap-0">
            {[
              { key: "desarrollo", label: `Acciones de desarrollo (${actionsByType.desarrollo.length})` },
              { key: "normativo", label: `Normativo SGI (${actionsByType.normativo.length})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "desarrollo" | "normativo")}
                className={`text-xs font-medium py-3 px-4 border-b-2 transition-colors ${
                  activeTab === key
                    ? "border-[#1a3a5c] text-[#1a3a5c]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {actionsByType[activeTab].length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No hay acciones en esta categoría.
              </p>
            ) : (
              actionsByType[activeTab].map((accion) => (
                <AccionCard
                  key={accion.id}
                  accion={accion}
                  colaboradorId={colaboradorId}
                  canEdit={canEdit}
                  isPending={isPending}
                  onSave={handleSaveAccion}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccionCard({
  accion,
  colaboradorId,
  canEdit,
  isPending,
  onSave,
}: {
  accion: PicdAccion;
  colaboradorId: string;
  canEdit: boolean;
  isPending: boolean;
  onSave: (e: React.FormEvent<HTMLFormElement>, id: string) => void;
}) {
  const progreso =
    accion.porcentaje_etapa2 != null
      ? accion.porcentaje_etapa2
      : accion.porcentaje_etapa1 != null
      ? accion.porcentaje_etapa1 / 2
      : 0;

  return (
    <form
      onSubmit={(e) => onSave(e, accion.id)}
      className="border border-gray-100 rounded-xl p-4 space-y-3"
    >
      <input type="hidden" name="id_empleado" value={colaboradorId} />

      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-800 leading-snug flex-1">
          {accion.accion_descripcion}
        </p>
        {accion.tipo_accion === "normativo_sgi" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 flex-shrink-0">
            SGI
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        {accion.institucion_plataforma && <span>{accion.institucion_plataforma}</span>}
        {accion.fecha_cumplimiento && <span>Fecha límite: {accion.fecha_cumplimiento}</span>}
        {accion.horas_capacitacion && <span>{accion.horas_capacitacion}h</span>}
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progreso general</span>
          <span>{progreso.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-[#1a3a5c] h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(100, progreso)}%` }}
          />
        </div>
      </div>

      {canEdit && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Etapa 1 (%)</label>
            <input
              name="porcentaje_etapa1"
              type="number"
              min={0}
              max={100}
              defaultValue={accion.porcentaje_etapa1 ?? ""}
              placeholder="0"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Etapa 2 (%)</label>
            <input
              name="porcentaje_etapa2"
              type="number"
              min={0}
              max={100}
              defaultValue={accion.porcentaje_etapa2 ?? ""}
              placeholder="0"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Objetivo logrado</label>
            <textarea
              name="objetivo_logrado"
              defaultValue={accion.objetivo_logrado ?? ""}
              rows={2}
              placeholder="Describe qué lograste con esta acción..."
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] resize-none"
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="text-xs text-[#1a3a5c] font-medium hover:underline disabled:opacity-50"
            >
              Guardar avance
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
