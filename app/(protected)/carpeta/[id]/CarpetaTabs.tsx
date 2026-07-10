"use client";

import { useState, useTransition } from "react";
import { ZONA_COLORS } from "@/lib/types";

const ZONA_ORDER: Record<string, number> = {
  Inicio: 1,
  "Revisión": 2,
  Estabilidad: 3,
  Desarrollo: 4,
  Sobresaliente: 5,
};
import type { ZonaBand } from "@/lib/types";
import PicdEditor from "@/app/(protected)/picd/[id]/PicdEditor";
import EntrevistaThread from "./EntrevistaThread";
import RutaCarreraEditor from "./RutaCarreraEditor";
import SucesionEditor, { type SucesionItem, readinessBadge } from "./SucesionEditor";
import SucesionValidacion from "./SucesionValidacion";
import { TalentMatrixSVG } from "@/app/(protected)/evaluaciones/EIPScatterChart";
import { registrarAspiracion } from "@/app/actions/sucesion";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { aprobarCicloPicd, rechazarCicloPicd } from "@/app/actions/picd_ciclo";

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
  fecha_entrevista: string | null;
  participantes: string;
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
  rutas,
  sucesion,
  colaboradores,
  candidaturasComoSuccesor,
  zonasMap,
  canEdit,
  isOwn,
  isJefe,
  isAdmin,
  nombreColaborador,
  ciclosEstadoMap,
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
  rutas: any[];
  sucesion: SucesionItem[];
  colaboradores: { id: string; nombre_completo: string | null; puesto: string | null }[];
  candidaturasComoSuccesor: SucesionItem[];
  zonasMap: Record<number, ZonaBand[]>;
  canEdit: boolean;
  isOwn: boolean;
  isJefe: boolean;
  isAdmin: boolean;
  nombreColaborador: string;
  ciclosEstadoMap: Record<number, {
    ciclo_año: number; estado: string; cerrado_at: string | null;
    decision_at: string | null; decision_nombre: string | null;
    comentario_jefe: string | null; reabierto_at: string | null; reabierto_nombre: string | null;
  }>;
}) {
  const defaultTab = isOwn ? "evaluacion" : "evaluacion";
  const [mainTab, setMainTab] = useState<"evaluacion" | "picd" | "sucesion">(defaultTab);
  const [cicloActual, setCicloActual] = useState<number>(ciclos[0] ?? new Date().getFullYear());
  const [sucesionItems, setSucesionItems] = useState<SucesionItem[]>(sucesion);
  const [candidaturas, setCandidaturas]   = useState<SucesionItem[]>(candidaturasComoSuccesor);

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

  const cicloEstado = ciclosEstadoMap[cicloActual] ?? null;
  const isCycleLocked = cicloEstado?.estado === "enviado_revision" || cicloEstado?.estado === "aprobado";
  const picdCanEdit = canEdit && !isCycleLocked;

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
              : "border-transparent text-gray-500 hover:text-gray-800"
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
                : "border-transparent text-gray-500 hover:text-gray-800"
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
        {(isOwn || isJefe || isAdmin) && (
          <button
            onClick={() => setMainTab("sucesion")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              mainTab === "sucesion"
                ? "border-[#1a3a5c] text-[#1a3a5c]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            Sucesión
            {(() => {
              const pendingV1 = !isOwn && isJefe
                ? sucesionItems.filter((s) => s.estado === "pendiente_v1").length
                : 0;
              const pendingV2 = isAdmin
                ? sucesionItems.filter((s) => s.estado === "pendiente_v2").length
                : 0;
              const total = pendingV1 + pendingV2;
              if (total > 0) return (
                <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">
                  {total}
                </span>
              );
              const count = sucesionItems.filter((s) => s.ciclo_año === cicloActual).length;
              if (count > 0) return (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#1a3a5c]/10 text-[#1a3a5c] font-semibold">
                  {count}
                </span>
              );
              return null;
            })()}
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

          {/* Zone history timeline — shown when 2+ EIP records with zone */}
          {(() => {
            const withZone = [...eips]
              .filter((e) => e.zona_evaluacion)
              .sort((a, b) => a.ciclo_año - b.ciclo_año);
            if (withZone.length < 2) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Evolución por Ciclo
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  {withZone.map((e, idx) => {
                    const zona = e.zona_evaluacion!;
                    const colors = ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-700" };
                    const prev = idx > 0 ? withZone[idx - 1].zona_evaluacion : null;
                    const prevRank = prev ? (ZONA_ORDER[prev] ?? 0) : null;
                    const curRank = ZONA_ORDER[zona] ?? 0;
                    let arrow: { icon: string; color: string } | null = null;
                    if (prevRank !== null) {
                      if (curRank > prevRank)       arrow = { icon: "↑", color: "text-green-600" };
                      else if (curRank < prevRank)  arrow = { icon: "↓", color: "text-red-500" };
                      else                          arrow = { icon: "=", color: "text-gray-400" };
                    }
                    const isCurrent = e.ciclo_año === cicloActual;
                    return (
                      <div key={e.id} className="flex items-center gap-1">
                        {arrow && (
                          <span className={`text-sm font-bold ${arrow.color}`}>{arrow.icon}</span>
                        )}
                        <button
                          onClick={() => setCicloActual(e.ciclo_año)}
                          className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border transition-all ${
                            isCurrent
                              ? "border-[#1a3a5c] ring-1 ring-[#1a3a5c]/30 shadow-sm"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <span className="text-[10px] text-gray-400 font-medium mb-0.5">{e.ciclo_año}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                            {zona}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Section 1: Datos personales / posición */}
          <SectionHeader label={`Datos del Ciclo ${cicloActual}`} />
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {eip && (
                <>
                  <Stat label="Potencial EIP" value={eip.evaluacion_potencial_total?.toFixed(1) ?? "—"} />
                  <Stat label="Desempeño" value={eip.desempeno_logra?.toFixed(1) ?? "—"} />
                  {eip.zona_evaluacion && zonaColors && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Zona</p>
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
            <>
              <SectionHeader label={`Evaluación del Desempeño ${cicloActual}`} />
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
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
                      <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">{label as string}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-[#1a3a5c] h-2 rounded-full"
                            style={{ width: `${Math.min(100, ((val as number) / 5) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-[#1a3a5c] w-10 text-right">
                          {(val as number).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              {desemp.resultado_logra != null && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Resultado Logra</span>
                  <span className="text-2xl font-bold text-[#1a3a5c]">{desemp.resultado_logra.toFixed(1)}</span>
                </div>
              )}
            </div>
            </>
          )}

          {/* Section 3: Competencias 360 */}
          {comp360.length > 0 && (
            <>
              <SectionHeader label={`Competencias 360 — ${cicloActual}`} />
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
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
            </>
          )}

          {/* Section 4: EAL (only when applicable) */}
          {hasEal && (
            <>
              <SectionHeader label={`EAL — Aptitudes de Liderazgo ${cicloActual}`} />
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
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
                <p className="text-sm text-gray-500">Tuvo EAL en este ciclo. Datos detallados no disponibles.</p>
              )}
            </div>
            </>
          )}

          {/* Section 5: Candidaturas como sucesor (only when person has approved nominations) */}
          {candidaturas.length > 0 && (
            <CandidaturasPanel
              candidaturas={candidaturas}
              colaboradores={colaboradores}
              isOwn={isOwn}
              onAspiracionChange={(id, val) =>
                setCandidaturas((p) => p.map((c) => c.id === id ? { ...c, sucesor_aspiracion: val, sucesor_aspiracion_at: new Date().toISOString() } : c))
              }
            />
          )}

          {/* Section 6: Talent Matrix */}
          {eip?.zona_evaluacion && eip.desempeno_logra != null && eip.evaluacion_potencial_total != null && (() => {
            const zonaBands = zonasMap[cicloActual] ?? [];
            const point = {
              id: eip.id,
              id_empleado: colaboradorId,
              nombre: nombreColaborador,
              puesto: "",
              area: null,
              uen: null,
              jefe: null,
              desempeno: eip.desempeno_logra,
              potencial: eip.evaluacion_potencial_total,
              zona: eip.zona_evaluacion,
            };
            return (
              <div
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                style={{ animation: "carpetaMatrixIn 0.55s cubic-bezier(0.22,1,0.36,1) both" }}
              >
                <style>{`
                  @keyframes carpetaMatrixIn {
                    from { opacity: 0; transform: translateY(16px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0)     scale(1);    }
                  }
                `}</style>

                {/* Header */}
                <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">
                      Posición en Mapa de Talento — {cicloActual}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Desempeño</p>
                        <p className="text-2xl font-bold text-gray-900">{eip.desempeno_logra.toFixed(1)}</p>
                      </div>
                      <div className="w-px h-8 bg-gray-200" />
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-0.5">Potencial</p>
                        <p className="text-2xl font-bold text-gray-900">{eip.evaluacion_potencial_total.toFixed(1)}</p>
                      </div>
                      <div className="w-px h-8 bg-gray-200" />
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Zona</p>
                        <span className={`text-sm font-bold px-3 py-1 rounded-full ${zonaColors?.bg ?? "bg-gray-100"} ${zonaColors?.text ?? "text-gray-700"}`}>
                          {eip.zona_evaluacion}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <a href="/evaluaciones" className="text-xs text-[#1a3a5c] hover:underline self-end mb-1">
                      Ver mapa completo →
                    </a>
                  )}
                </div>

                {/* Matrix */}
                <div className="flex justify-center px-4 pb-5">
                  <div style={{ maxWidth: 560, width: "100%" }}>
                    <TalentMatrixSVG
                      zonaBands={zonaBands}
                      points={[point]}
                      width={560}
                      height={480}
                      showTitle={false}
                      highlightPoint
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {mainTab === "sucesion" && (isOwn || isJefe || isAdmin) && (
        <div className="space-y-5">
          {/* Validation panel — jefe sees V1 pending, admin sees V2 pending */}
          {(isJefe && !isOwn) && (
            <div className="bg-white rounded-xl border border-orange-200 p-5">
              <SucesionValidacion
                items={sucesionItems}
                idEmpleado={colaboradorId}
                isV2={false}
                onValidated={(updated) => setSucesionItems((p) => p.map((i) => i.id === updated.id ? updated : i))}
              />
              {sucesionItems.filter((s) => s.estado === "pendiente_v1").length === 0 && (
                <p className="text-sm text-gray-400">Sin propuestas pendientes de revisión.</p>
              )}
            </div>
          )}
          {isAdmin && sucesionItems.some((s) => s.estado === "pendiente_v2") && (
            <div className="bg-white rounded-xl border border-orange-200 p-5">
              <SucesionValidacion
                items={sucesionItems}
                idEmpleado={colaboradorId}
                isV2={true}
                onValidated={(updated) => setSucesionItems((p) => p.map((i) => i.id === updated.id ? updated : i))}
              />
            </div>
          )}

          {/* Cycle selector */}
          {ciclos.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Ciclo:</span>
              <div className="flex gap-1.5 flex-wrap">
                {ciclos.map((c) => (
                  <button key={c} onClick={() => setCicloActual(c)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      c === cicloActual ? "bg-[#1a3a5c] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor — titular and admin can edit/add; jefe reads */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <SucesionEditor
              colaboradorId={colaboradorId}
              cicloAño={cicloActual}
              itemsIniciales={sucesionItems}
              colaboradores={colaboradores}
              canEdit={isOwn || isAdmin}
            />
          </div>
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

          {/* Banner de aprobación — visible solo para jefe/admin cuando hay ciclo enviado_revision */}
          {(isJefe || isAdmin) && cicloEstado?.estado === "enviado_revision" && (
            <PicdAprobacionBanner
              colaboradorId={colaboradorId}
              cicloAño={cicloActual}
              nombreColaborador={nombreColaborador}
              cerradoAt={cicloEstado.cerrado_at}
            />
          )}

          {(isOwn || isJefe || isAdmin) && (
            <PicdEditor
              colaboradorId={colaboradorId}
              cicloAño={cicloActual}
              picd={picdEditorRecord}
              acciones={picdAccionesCiclo}
              canEdit={picdCanEdit}
              isOwn={isOwn}
              isAdmin={isAdmin}
              cicloEstado={cicloEstado}
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

          {(isOwn || isJefe || isAdmin) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <RutaCarreraEditor
                colaboradorId={colaboradorId}
                cicloAño={cicloActual}
                rutasIniciales={rutas.filter((r) => r.activa)}
                canEdit={canEdit}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CandidaturasPanel({
  candidaturas,
  colaboradores,
  isOwn,
  onAspiracionChange,
}: {
  candidaturas: SucesionItem[];
  colaboradores: { id: string; nombre_completo: string | null; puesto: string | null }[];
  isOwn: boolean;
  onAspiracionChange: (id: string, val: boolean) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);

  async function handleAspiracion(id: string, aspiracion: boolean) {
    setPending(id);
    setErr(null);
    try {
      await registrarAspiracion({ id, aspiracion });
      onAspiracionChange(id, aspiracion);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5"
      style={{ animation: "carpetaMatrixIn 0.45s cubic-bezier(0.22,1,0.36,1) both" }}>
      <SectionHeader label="Oportunidades de Sucesión Identificadas" />
      <p className="text-xs text-gray-500 mt-2 mb-4">
        Has sido considerado como sucesor potencial para las siguientes posiciones.
      </p>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</p>}

      <div className="space-y-3">
        {candidaturas.map((cand) => {
          const titular = colaboradores.find((c) => c.id === cand.id_empleado);
          const readiness = readinessBadge(cand.readiness);
          return (
            <div key={cand.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#1a3a5c]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#1a3a5c] text-sm font-bold">
                      {(titular?.nombre_completo ?? "?").charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{titular?.nombre_completo ?? "Colaborador"}</p>
                    <p className="text-xs text-gray-500">{titular?.puesto ?? "—"}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${readiness.color}`}>
                  Readiness: {readiness.label}
                </span>
              </div>

              {cand.brechas && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Plan de desarrollo para ti</p>
                  <p className="text-xs text-gray-700">{cand.brechas}</p>
                </div>
              )}
              {cand.acciones_desarrollo && (
                <div className="bg-blue-50/60 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Acciones</p>
                  <p className="text-xs text-gray-700">{cand.acciones_desarrollo}</p>
                </div>
              )}
              {cand.fecha_objetivo && (
                <p className="text-xs text-gray-500">
                  Fecha objetivo:{" "}
                  {new Date(cand.fecha_objetivo + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}

              {isOwn && (
                <div className="pt-1">
                  {cand.sucesor_aspiracion === null ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">
                        ¿Tienes aspiración de tomar esta ruta de carrera?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAspiracion(cand.id, true)}
                          disabled={pending === cand.id}
                          className="flex-1 text-xs bg-[#1a3a5c] text-white py-2 rounded-lg hover:bg-[#152e4d] font-medium transition-colors disabled:opacity-40"
                        >
                          Sí, me interesa
                        </button>
                        <button
                          onClick={() => handleAspiracion(cand.id, false)}
                          disabled={pending === cand.id}
                          className="flex-1 text-xs bg-white border border-gray-300 text-gray-600 py-2 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-40"
                        >
                          No por ahora
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-xs font-medium ${cand.sucesor_aspiracion ? "text-green-600" : "text-gray-400"}`}>
                        {cand.sucesor_aspiracion
                          ? "✓ Tienes aspiración de tomar esta ruta"
                          : "Sin aspiración por ahora"}
                      </p>
                      {isOwn && (
                        <button
                          onClick={() => handleAspiracion(cand.id, !cand.sucesor_aspiracion)}
                          disabled={pending === cand.id}
                          className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-40"
                        >
                          Cambiar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!isOwn && cand.sucesor_aspiracion !== null && (
                <p className={`text-xs font-medium pt-1 ${cand.sucesor_aspiracion ? "text-green-600" : "text-gray-400"}`}>
                  {cand.sucesor_aspiracion ? "✓ El colaborador tiene aspiración de tomar esta ruta" : "Sin aspiración por ahora"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PicdAprobacionBanner({
  colaboradorId,
  cicloAño,
  nombreColaborador,
  cerradoAt,
}: {
  colaboradorId: string;
  cicloAño: number;
  nombreColaborador: string;
  cerradoAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [showRechazo, setShowRechazo] = useState(false);
  const [comentario, setComentario] = useState("");

  function handleAprobar() {
    if (!confirm(`¿Confirmas que apruebas el PICD ${cicloAño} de ${nombreColaborador}?`)) return;
    startTransition(() => {
      aprobarCicloPicd(colaboradorId, cicloAño);
    });
  }

  function handleRechazar() {
    if (!comentario.trim()) return;
    startTransition(() => {
      rechazarCicloPicd(colaboradorId, cicloAño, comentario).then(() => {
        setShowRechazo(false);
        setComentario("");
      });
    });
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-800">
            PICD {cicloAño} pendiente de tu aprobación
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {nombreColaborador} cerró su ciclo
            {cerradoAt ? ` el ${new Date(cerradoAt).toLocaleDateString("es-MX")}` : ""} y está esperando tu revisión.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleAprobar}
            disabled={isPending}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
          >
            Aprobar
          </button>
          <button
            onClick={() => setShowRechazo(!showRechazo)}
            disabled={isPending}
            className="text-xs bg-white border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 font-semibold transition-colors"
          >
            Solicitar ajustes
          </button>
        </div>
      </div>
      {showRechazo && (
        <div className="flex gap-2 items-end">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Indica qué debe ajustar el colaborador..."
            rows={2}
            className="flex-1 text-sm border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />
          <button
            onClick={handleRechazar}
            disabled={isPending || !comentario.trim()}
            className="text-xs bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold transition-colors h-fit"
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-[#1a3a5c]">{value}</p>
    </div>
  );
}
