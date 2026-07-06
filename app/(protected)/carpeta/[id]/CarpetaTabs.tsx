"use client";

import { useState } from "react";
import { ZONA_COLORS } from "@/lib/types";
import PicdEditor from "@/app/(protected)/picd/[id]/PicdEditor";
import EntrevistaThread from "./EntrevistaThread";

type EIP = {
  id: string;
  ciclo_año: number;
  zona_evaluacion: string | null;
  desempeno_logra: number | null;
  evaluacion_potencial_total: number | null;
  tuvo_eal: boolean | null;
  entrego_picd: boolean | null;
  ev_comp: number | null;
  ev_eal: number | null;
  ev_picd: number | null;
  ev_exp: number | null;
  ev_form_acad: number | null;
};

type Desempeno = {
  id: string;
  ciclo_año: number;
  planea: number | null;
  ejecuta: number | null;
  optimiza: number | null;
  trabaja_equipo: number | null;
  atiende_cliente: number | null;
  informa: number | null;
  resultado_logra: number | null;
  estatus_desem: string | null;
};

type Competencia = {
  id: string;
  ciclo_año: number;
  bloque: string | null;
  sub_competencia: string | null;
  evaluacion: number | null;
};

type EAL = {
  id: string;
  ciclo_año: number;
  puntaje_total: number | null;
  nivel_liderazgo: string | null;
};

type PicdAccion = {
  id: string;
  ciclo_año: number;
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
  ciclo_año: number;
  estado: string;
  puesto_futuro_opcion1: string | null;
  puesto_futuro_opcion2: string | null;
  areas_oportunidad: string | null;
  compromisos: string | null;
};

type Entrevista = {
  id: string;
  id_empleado: string;
  ciclo_ano: number;
  notas: string;
  estado: string;
  created_at: string;
  updated_at: string;
};

type Comentario = {
  id: string;
  id_entrevista: string;
  autor_rol: string;
  autor_nombre: string;
  texto: string;
  created_at: string;
};

export default function CarpetaTabs({
  colaboradorId,
  ciclos,
  eips,
  desempenos,
  competencias,
  eals,
  picdAcciones,
  picdRecords,
  entrevistas,
  comentarios,
  canEdit,
  isOwn,
  isJefe,
  isAdmin,
  nombreColaborador,
}: {
  colaboradorId: string;
  ciclos: number[];
  eips: EIP[];
  desempenos: Desempeno[];
  competencias: Competencia[];
  eals: EAL[];
  picdAcciones: PicdAccion[];
  picdRecords: PicdRecord[];
  entrevistas: Entrevista[];
  comentarios: Comentario[];
  canEdit: boolean;
  isOwn: boolean;
  isJefe: boolean;
  isAdmin: boolean;
  nombreColaborador: string;
}) {
  const defaultTab = isOwn ? "evaluacion" : "evaluacion";
  const [mainTab, setMainTab] = useState<"evaluacion" | "picd">(defaultTab);
  const [cicloActual, setCicloActual] = useState<number>(ciclos[0] ?? new Date().getFullYear());

  const eip = eips.find((e) => e.ciclo_año === cicloActual) ?? null;
  const desemp = desempenos.find((d) => d.ciclo_año === cicloActual) ?? null;
  const comp360 = competencias.filter((c) => c.ciclo_año === cicloActual);
  const eal = eals.find((e) => e.ciclo_año === cicloActual) ?? null;
  const hasEal = eip?.tuvo_eal === true || eal !== null;

  const picdRecord = picdRecords.find((p) => p.ciclo_año === cicloActual) ?? null;
  const picdAccionesCiclo = picdAcciones.filter((a) => a.ciclo_año === cicloActual);

  const entrevistaCiclo = entrevistas.find((e) => e.ciclo_ano === cicloActual) ?? null;
  const comentariosCiclo = comentarios.filter((c) => c.id_entrevista === entrevistaCiclo?.id);

  // Badge: pending reviews for jefe
  const pendingEntrevistas = entrevistas.filter(
    (e) => e.estado === "pendiente_revision" || e.estado === "ajustes_solicitados"
  );

  const zonaColors = eip?.zona_evaluacion
    ? ZONA_COLORS[eip.zona_evaluacion] ?? { bg: "bg-gray-100", text: "text-gray-700" }
    : null;

  // Group competencias by block
  const bloques: Record<string, Competencia[]> = {};
  for (const c of comp360) {
    const b = c.bloque ?? "General";
    if (!bloques[b]) bloques[b] = [];
    bloques[b].push(c);
  }

  const picdEditorRecord = picdRecord
    ? {
        id: picdRecord.id,
        estado: picdRecord.estado,
        puesto_futuro_opcion1: picdRecord.puesto_futuro_opcion1,
        puesto_futuro_opcion2: picdRecord.puesto_futuro_opcion2,
        areas_oportunidad: picdRecord.areas_oportunidad,
        compromisos: picdRecord.compromisos,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Main tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setMainTab("evaluacion")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            mainTab === "evaluacion"
              ? "border-[#1a3a5c] text-[#1a3a5c]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Carpeta Individual
        </button>
        {(isOwn || isJefe || isAdmin) && (
          <button
            onClick={() => setMainTab("picd")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              mainTab === "picd"
                ? "border-[#1a3a5c] text-[#1a3a5c]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            PICD
            {picdRecord && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  picdRecord.estado === "aprobado"
                    ? "bg-green-100 text-green-700"
                    : picdRecord.estado === "enviado"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {picdRecord.estado}
              </span>
            )}
            {(isJefe || isAdmin) && pendingEntrevistas.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">
                {pendingEntrevistas.length}
              </span>
            )}
          </button>
        )}
      </div>

      {mainTab === "evaluacion" && (
        <div className="space-y-5">
          {/* Cycle selector */}
          {ciclos.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Ciclo:</span>
              <div className="flex gap-1.5 flex-wrap">
                {ciclos.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCicloActual(c)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      c === cicloActual
                        ? "bg-[#1a3a5c] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 1: Datos personales / posición */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Datos del Ciclo {cicloActual}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {eip && (
                <>
                  <Stat label="Potencial EIP" value={eip.evaluacion_potencial_total?.toFixed(1) ?? "—"} />
                  <Stat label="Desempeño" value={eip.desempeno_logra?.toFixed(1) ?? "—"} />
                  {eip.zona_evaluacion && zonaColors && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Zona</p>
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${zonaColors.bg} ${zonaColors.text}`}>
                        {eip.zona_evaluacion}
                      </span>
                    </div>
                  )}
                  {eip.ev_exp != null && <Stat label="Experiencia" value={eip.ev_exp.toFixed(1)} />}
                  {eip.ev_form_acad != null && <Stat label="Formación" value={eip.ev_form_acad.toFixed(1)} />}
                  {eip.ev_comp != null && <Stat label="Competencias" value={eip.ev_comp.toFixed(1)} />}
                  {eip.tuvo_eal != null && (
                    <Stat label="Tuvo EAL" value={eip.tuvo_eal ? "Sí" : "No"} />
                  )}
                  {eip.entrego_picd != null && (
                    <Stat label="Entregó PICD" value={eip.entrego_picd ? "Sí" : "No"} />
                  )}
                </>
              )}
              {!eip && (
                <p className="text-sm text-gray-400 col-span-3">Sin evaluación registrada para {cicloActual}.</p>
              )}
            </div>
          </div>

          {/* Section 2: Evaluación del Desempeño */}
          {desemp && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Evaluación del Desempeño {cicloActual}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  ["Planea", desemp.planea],
                  ["Ejecuta", desemp.ejecuta],
                  ["Optimiza", desemp.optimiza],
                  ["Trabaja en equipo", desemp.trabaja_equipo],
                  ["Atiende cliente", desemp.atiende_cliente],
                  ["Informa", desemp.informa],
                ].map(([label, val]) =>
                  val != null ? (
                    <div key={label as string}>
                      <p className="text-xs text-gray-400 mb-0.5">{label as string}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-[#1a3a5c] h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, ((val as number) / 5) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-8 text-right">
                          {(val as number).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              {desemp.resultado_logra != null && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Resultado Logra</span>
                  <span className="text-xl font-bold text-gray-900">{desemp.resultado_logra.toFixed(1)}</span>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Competencias 360 */}
          {comp360.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Competencias 360 — {cicloActual}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(bloques).map(([bloque, items]) => (
                  <div key={bloque}>
                    <p className="text-xs font-semibold text-gray-600 mb-2">{bloque}</p>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id}>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-xs text-gray-500 truncate pr-2">
                              {item.sub_competencia ?? "General"}
                            </span>
                            <span className="text-xs font-semibold text-gray-800 flex-shrink-0">
                              {item.evaluacion?.toFixed(1) ?? "—"}
                            </span>
                          </div>
                          {item.evaluacion != null && (
                            <div className="w-full bg-gray-100 rounded-full h-1">
                              <div
                                className="bg-[#1a3a5c] h-1 rounded-full"
                                style={{ width: `${Math.min(100, (item.evaluacion / 5) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: EAL (only when applicable) */}
          {hasEal && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Evaluación de Aptitudes de Liderazgo (EAL) — {cicloActual}
              </p>
              {eal ? (
                <div className="flex gap-6">
                  {eal.puntaje_total != null && (
                    <Stat label="Puntaje total" value={eal.puntaje_total.toFixed(1)} />
                  )}
                  {eal.nivel_liderazgo && (
                    <Stat label="Nivel de liderazgo" value={eal.nivel_liderazgo} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Tuvo EAL en este ciclo. Datos detallados no disponibles.</p>
              )}
            </div>
          )}

          {/* Section 5: EIP 9-box position */}
          {eip?.zona_evaluacion && eip.desempeno_logra != null && eip.evaluacion_potencial_total != null && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Posición en Mapa de Talento — {cicloActual}
              </p>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex gap-8">
                  <Stat label="Desempeño" value={eip.desempeno_logra.toFixed(1)} />
                  <Stat label="Potencial" value={eip.evaluacion_potencial_total.toFixed(1)} />
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Zona</p>
                  <span className={`inline-flex items-center text-sm font-semibold px-3 py-1.5 rounded-full ${zonaColors?.bg ?? "bg-gray-100"} ${zonaColors?.text ?? "text-gray-700"}`}>
                    {eip.zona_evaluacion}
                  </span>
                </div>
                {isAdmin && (
                  <a
                    href="/evaluaciones"
                    className="text-xs text-[#1a3a5c] hover:underline ml-auto"
                  >
                    Ver mapa completo →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mainTab === "picd" && (isOwn || isJefe || isAdmin) && (
        <div className="space-y-5">
          {/* PICD cycle selector */}
          {ciclos.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Ciclo:</span>
              <div className="flex gap-1.5 flex-wrap">
                {ciclos.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCicloActual(c)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      c === cicloActual
                        ? "bg-[#1a3a5c] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(isOwn || isAdmin) && (
            <PicdEditor
              colaboradorId={colaboradorId}
              cicloAño={cicloActual}
              picd={picdEditorRecord}
              acciones={picdAccionesCiclo}
              canEdit={canEdit}
            />
          )}

          <EntrevistaThread
            colaboradorId={colaboradorId}
            cicloAno={cicloActual}
            entrevista={entrevistaCiclo}
            comentarios={comentariosCiclo}
            isOwn={isOwn}
            isJefe={isJefe}
            isAdmin={isAdmin}
            nombreColaborador={nombreColaborador}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
