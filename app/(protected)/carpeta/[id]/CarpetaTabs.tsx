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
import { actualizarPerfilColaborador } from "@/app/actions/colaborador";
import Comentarios360Modal from "./Comentarios360Modal";

type ColaboradorPerfil = {
  id: string;
  id_empleado: string | null;
  nombre_completo: string;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  organización: string | null;
  departamento: string | null;
  entidad: string | null;
  centro_trabajo: string | null;
  razon_social: string | null;
  jefe_inmediato_nombre: string | null;
  unidad_costo: string | null;
  tipo_plantilla: string | null;
  segmento_organizacional: string | null;
  fecha_antiguedad: string | null;
  fecha_nacimiento: string | null;
  fecha_ingreso_razon_social: string | null;
  fecha_baja: string | null;
  horario: string | null;
  correo: string | null;
  correo_jefe: string | null;
  sexo: string | null;
  edad: number | null;
  nivel_academico: string | null;
};

type EIP = {
  id: string;
  ciclo_año: number;
  zona_evaluacion: string | null;
  desempeno_logra: number | null;
  evaluacion_potencial_total: number | null;
  tuvo_eal: boolean | null;
  entrego_picd: boolean | null;
  ev_años: number | null;
  ev_mov: number | null;
  ev_exp: number | null;
  ev_form_acad: number | null;
  ev_cursos: number | null;
  ev_comp: number | null;
  ev_eal: number | null;
  ev_picd: number | null;
  calif_ponderada: number | null;
  tipo_matriz: string | null;
  años_exp_total: number | null;
  movilidad: number | null;
  num_puestos: number | null;
};

type PonderacionRow = {
  ciclo_año: number; calif_ponderada: number;
  w_exp: number; w_form_acad: number; w_cursos: number;
  w_comp: number; w_eal: number; w_picd: number;
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

type CompetenciasPercentil = {
  ciclo_año: number;
  promedio_general: number;
  segmento: string | null;
  percentil_empresa: number;
  percentil_segmento: number | null;
  num_evaluadores: number | null;
  fecha_calculo: string;
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
  puesto_futuro_id1?: string | null;
  puesto_futuro_id2?: string | null;
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

type FormacionAcademica = {
  id: string;
  nivel_estudio: string | null;
  nombre_carrera: string | null;
  institucion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  cedula: string | null;
  estado_cedula: string | null;
};

type CursoFormacion = {
  id: string;
  nombre_curso: string | null;
  tipo_curso: string | null;
  institucion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  horas_efectivas: number | null;
  documento: string | null;
  estado_completitud: string | null;
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
  ponderacionesMap,
  perfil,
  catalogoPuestos = [],
  historialCarrera = [],
  formacionAcademica = [],
  cursosFormacion = [],
  competenciasPercentiles = [],
}: {
  colaboradorId: string;
  ciclos: number[];
  eips: EIP[];
  desempenos: Desempeno[];
  competencias: Competencia[];
  competenciasPercentiles?: CompetenciasPercentil[];
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
  ponderacionesMap: Record<number, Record<number, PonderacionRow>>;
  perfil: ColaboradorPerfil;
  catalogoPuestos?: Array<{ id: string; nombre: string; razon_social: string | null; area: string | null }>;
  historialCarrera?: Array<{ id: string; puesto: string | null; empresa: string | null; tipo: string | null; años: number | null; fecha_inicio: string | null; fecha_fin: string | null }>;
  formacionAcademica?: FormacionAcademica[];
  cursosFormacion?: CursoFormacion[];
}) {
  const defaultTab = "perfil";
  const [mainTab, setMainTab] = useState<"perfil" | "evaluacion" | "picd" | "sucesion">(defaultTab);
  const [cicloActual, setCicloActual] = useState<number>(ciclos[0] ?? new Date().getFullYear());
  const [sucesionItems, setSucesionItems] = useState<SucesionItem[]>(sucesion);
  const [candidaturas, setCandidaturas]   = useState<SucesionItem[]>(candidaturasComoSuccesor);

  const eip = eips.find((e) => e.ciclo_año === cicloActual) ?? null;
  const desemp = desempenos.find((d) => d.ciclo_año === cicloActual) ?? null;
  const comp360 = competencias.filter((c) => c.ciclo_año === cicloActual);
  const percentilComp = competenciasPercentiles.find((p) => p.ciclo_año === cicloActual) ?? null;
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
        puesto_futuro_id1: (picdRecord as any).puesto_futuro_id1 ?? null,
        puesto_futuro_id2: (picdRecord as any).puesto_futuro_id2 ?? null,
        areas_oportunidad: picdRecord.areas_oportunidad,
        compromisos: picdRecord.compromisos,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Main tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setMainTab("perfil")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
            mainTab === "perfil"
              ? "border-[#1a3a5c] text-[#1a3a5c]"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Perfil
        </button>
        <button
          onClick={() => setMainTab("evaluacion")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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

      {mainTab === "perfil" && (
        <PerfilTab
          perfil={perfil}
          eips={eips}
          desempenos={desempenos}
          eals={eals}
          isAdmin={isAdmin}
          historialCarrera={historialCarrera}
          formacionAcademica={formacionAcademica}
          cursosFormacion={cursosFormacion}
        />
      )}

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

          {/* EIP + Desempeño + Potencial */}
          <SectionHeader label={`Evaluación Integral de Potencial — ${cicloActual}`} />
          {(eip || desemp || percentilComp) ? (
            <EIPCard
              eip={eip}
              desemp={desemp}
              eal={eal}
              percentilComp={percentilComp}
              ponderaciones={ponderacionesMap[cicloActual] ?? {}}
              zonaColors={zonaColors}
              cicloActual={cicloActual}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-sm text-gray-400">Sin evaluación registrada para {cicloActual}.</p>
            </div>
          )}

          {/* Section 3: Competencias 360 */}
          {(comp360.length > 0 || percentilComp) && (
            <>
              <SectionHeader label={`Competencias 360 — ${cicloActual}`} />

              {/* Percentiles — shown whenever percentil data exists */}
              {percentilComp && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Evaluación de Competencias · Ciclo {cicloActual}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {/* Calificación General */}
                    <div className="flex-1 min-w-[160px] bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
                      <p className="text-xs font-medium text-teal-600 mb-1">Competencias</p>
                      <p className="text-4xl font-bold text-teal-700">{Number(percentilComp.promedio_general).toFixed(2)}</p>
                      <p className="text-xs text-teal-400 mt-1">Calificación General (1–10)</p>
                    </div>
                    {/* Empresa */}
                    <div className="flex-1 min-w-[160px] bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                      <p className="text-xs font-medium text-indigo-500 mb-1">Percentil Total Empresa</p>
                      <p className="text-4xl font-bold text-indigo-700">{Math.round(percentilComp.percentil_empresa)}</p>
                      <p className="text-xs text-indigo-400 mt-1">de 0 a 99</p>
                    </div>
                    {/* Segmento */}
                    {percentilComp.percentil_segmento != null ? (
                      <div className="flex-1 min-w-[160px] bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
                        <p className="text-xs font-medium text-violet-500 mb-1">Percentil Segmento Organizacional</p>
                        <p className="text-4xl font-bold text-violet-700">{Math.round(percentilComp.percentil_segmento)}</p>
                        <p className="text-xs text-violet-400 mt-1">{percentilComp.segmento ?? "—"}</p>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-[160px] bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-xs font-medium text-gray-400 mb-1">Percentil Segmento Organizacional</p>
                        <p className="text-2xl font-bold text-gray-300">—</p>
                        <p className="text-xs text-gray-300 mt-1">Sin segmento asignado</p>
                      </div>
                    )}
                    {/* Supporting stats */}
                    <div className="flex flex-col justify-center gap-2 text-xs text-gray-500">
                      {percentilComp.num_evaluadores != null && (
                        <div>
                          <span className="font-medium text-gray-700">{percentilComp.num_evaluadores}</span>
                          <span className="ml-1">evaluadores</span>
                        </div>
                      )}
                      <div className="text-gray-400">
                        Calculado: {new Date(percentilComp.fecha_calculo).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <Comentarios360Modal
                    colaboradorId={colaboradorId}
                    cicloAño={cicloActual}
                    nombreColaborador={nombreColaborador}
                  />
                </div>
              )}

              {/* Competencia detail bars — only when aggregated data exists */}
              {comp360.length > 0 && (
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
              )}
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
                    <a href="/mapa-talento" className="text-xs text-[#1a3a5c] hover:underline self-end mb-1">
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
              catalogoPuestos={catalogoPuestos}
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

const NIVEL_ORDER = [
  "No Especificado","Primaria","Secundaria","Preparatoria",
  "Carrera Técnica","Profesional","Especialidad","Maestría","Doctorado",
];

const TIPO_CURSO_COLORS: Record<string, string> = {
  "Certificación": "bg-purple-100 text-purple-700",
  "Competencias":  "bg-indigo-100 text-indigo-700",
  "Cursos":        "bg-blue-100 text-blue-700",
  "Diplomado":     "bg-cyan-100 text-cyan-700",
  "Especialidad":  "bg-teal-100 text-teal-700",
  "Idiomas":       "bg-orange-100 text-orange-700",
  "Inducción":     "bg-gray-100 text-gray-600",
};

function PerfilTab({
  perfil,
  eips,
  desempenos,
  eals,
  isAdmin,
  historialCarrera = [],
  formacionAcademica = [],
  cursosFormacion = [],
}: {
  perfil: ColaboradorPerfil;
  eips: EIP[];
  desempenos: Desempeno[];
  eals: EAL[];
  isAdmin: boolean;
  historialCarrera?: Array<{ id: string; puesto: string | null; empresa: string | null; tipo: string | null; años: number | null; fecha_inicio: string | null; fecha_fin: string | null }>;
  formacionAcademica?: FormacionAcademica[];
  cursosFormacion?: CursoFormacion[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    puesto: perfil.puesto ?? "",
    nivel: perfil.nivel ?? "",
    area: perfil.area ?? "",
    jefe_inmediato_nombre: perfil.jefe_inmediato_nombre ?? "",
    segmento_organizacional: perfil.segmento_organizacional ?? "",
    nivel_academico: perfil.nivel_academico ?? "",
    correo: perfil.correo ?? "",
    tipo_plantilla: perfil.tipo_plantilla ?? "",
    unidad_costo: perfil.unidad_costo ?? "",
    departamento: perfil.departamento ?? "",
  });

  const antiguedad = perfil.fecha_antiguedad
    ? Math.floor((Date.now() - new Date(perfil.fecha_antiguedad).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const result = await actualizarPerfilColaborador(perfil.id, {
      puesto: form.puesto || null,
      nivel: form.nivel || null,
      area: form.area || null,
      jefe_inmediato_nombre: form.jefe_inmediato_nombre || null,
      segmento_organizacional: form.segmento_organizacional || null,
      nivel_academico: form.nivel_academico || null,
      correo: form.correo || null,
      tipo_plantilla: form.tipo_plantilla || null,
      unidad_costo: form.unidad_costo || null,
      departamento: form.departamento || null,
    });
    setSaving(false);
    if (result.error) { setSaveError(result.error); return; }
    setEditing(false);
  }

  const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || "—"}</p>
    </div>
  );

  const Input = ({ label, field }: { label: string; field: keyof typeof form }) => (
    <div>
      <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-0.5">{label}</label>
      <input
        type="text"
        value={form[field]}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c]"
      />
    </div>
  );

  // All cycles available across eips + desempenos
  const allCiclos = Array.from(new Set([...eips.map((e) => e.ciclo_año), ...desempenos.map((d) => d.ciclo_año)])).sort((a, b) => b - a);

  return (
    <div className="space-y-5">
      {/* Identification block — always read-only */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Identificación</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="No. Empleado" value={perfil.id_empleado} />
          <Field label="Sexo" value={perfil.sexo} />
          <Field label="Edad" value={perfil.edad != null ? `${perfil.edad} años` : null} />
          <Field label="Fecha Nacimiento" value={perfil.fecha_nacimiento
            ? new Date(perfil.fecha_nacimiento + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })
            : null} />
          <Field label="Antigüedad" value={antiguedad != null ? `${antiguedad} año${antiguedad !== 1 ? "s" : ""}` : null} />
          <Field label="Fecha Ingreso (Grupo)" value={perfil.fecha_antiguedad
            ? new Date(perfil.fecha_antiguedad + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })
            : null} />
          <Field label="Fecha Ingreso (Razón Social)" value={perfil.fecha_ingreso_razon_social
            ? new Date(perfil.fecha_ingreso_razon_social + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })
            : null} />
          <Field label="Entidad" value={perfil.entidad} />
          {perfil.fecha_baja && (
            <Field label="Fecha Baja" value={new Date(perfil.fecha_baja + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })} />
          )}
        </div>
      </div>

      {/* Editable labour block */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Datos Laborales</p>
          {isAdmin && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-[#1a3a5c] hover:underline font-medium"
            >
              Editar
            </button>
          )}
        </div>

        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{saveError}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {editing ? (
            <>
              <Input label="Puesto" field="puesto" />
              <Input label="Nivel" field="nivel" />
              <Input label="Área" field="area" />
              <Input label="Departamento" field="departamento" />
              <Input label="UEN / Organización" field="unidad_costo" />
              <Input label="Tipo Plantilla" field="tipo_plantilla" />
              <Input label="Jefe Inmediato" field="jefe_inmediato_nombre" />
              <Input label="Segmento" field="segmento_organizacional" />
              <Input label="Correo" field="correo" />
              <Input label="Escolaridad" field="nivel_academico" />
            </>
          ) : (
            <>
              <Field label="Puesto" value={perfil.puesto} />
              <Field label="Nivel" value={perfil.nivel} />
              <Field label="Área" value={perfil.area} />
              <Field label="Departamento" value={perfil.departamento} />
              <Field label="UEN / Organización" value={perfil.organización} />
              <Field label="Tipo Nómina" value={perfil.tipo_plantilla} />
              <Field label="Horario" value={perfil.horario} />
              <Field label="Jefe Inmediato" value={perfil.jefe_inmediato_nombre} />
              <Field label="Correo Jefe" value={perfil.correo_jefe} />
              <Field label="Segmento" value={perfil.segmento_organizacional} />
              <Field label="Correo" value={perfil.correo} />
              <Field label="Escolaridad" value={perfil.nivel_academico} />
            </>
          )}
        </div>

        {editing && (
          <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-[#1a3a5c] text-white rounded-lg hover:bg-[#1a3a5c]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setSaveError(null); }}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Career history */}
      {historialCarrera.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Historial de Carrera</p>
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />
            <div className="space-y-4">
              {historialCarrera.map((h) => (
                <div key={h.id} className="flex gap-4 relative">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex-shrink-0 relative z-10 mt-0.5" />
                  <div className="flex-1 pb-2">
                    <p className="text-sm font-medium text-gray-900">{h.puesto ?? "—"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {h.empresa ?? (h.tipo === "interno" ? "Grupo GP" : "Externo")}
                      {h.años != null && ` · ${h.años} año${h.años !== 1 ? "s" : ""}`}
                    </p>
                    {(h.fecha_inicio || h.fecha_fin) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {h.fecha_inicio ?? ""}
                        {h.fecha_inicio && h.fecha_fin && " → "}
                        {h.fecha_fin ?? (h.fecha_inicio ? " → actual" : "")}
                      </p>
                    )}
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${h.tipo === "interno" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600"}`}>
                      {h.tipo === "interno" ? "Interno" : "Externo"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Formación Académica */}
      {formacionAcademica.length > 0 && (
        <FormacionSection
          estudios={[...formacionAcademica].sort((a, b) => {
            const fa = a.fecha_fin ?? a.fecha_inicio ?? "";
            const fb = b.fecha_fin ?? b.fecha_inicio ?? "";
            return fb.localeCompare(fa);
          })}
        />
      )}

      {/* Cursos y Capacitación */}
      {cursosFormacion.length > 0 && (
        <CursosSection
          cursos={[...cursosFormacion].sort((a, b) => {
            const fa = a.fecha_fin ?? a.fecha_inicio ?? "";
            const fb = b.fecha_fin ?? b.fecha_inicio ?? "";
            return fb.localeCompare(fa);
          })}
        />
      )}

      {/* Evaluation history summary */}
      {allCiclos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Historial de Evaluaciones</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Ciclo</th>
                  <th className="px-5 py-3 font-medium">Zona EIP</th>
                  <th className="px-5 py-3 font-medium">Potencial</th>
                  <th className="px-5 py-3 font-medium">Desempeño</th>
                  <th className="px-5 py-3 font-medium">Tuvo EAL</th>
                  <th className="px-5 py-3 font-medium">Entregó PICD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allCiclos.map((ciclo) => {
                  const eip = eips.find((e) => e.ciclo_año === ciclo);
                  const desemp = desempenos.find((d) => d.ciclo_año === ciclo);
                  const eal = eals.find((e) => e.ciclo_año === ciclo);
                  const zona = eip?.zona_evaluacion ?? null;
                  const zonaColors = zona ? (ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-600" }) : null;
                  return (
                    <tr key={ciclo} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-gray-800">{ciclo}</td>
                      <td className="px-5 py-3">
                        {zona && zonaColors ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${zonaColors.bg} ${zonaColors.text}`}>{zona}</span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-700">{eip?.evaluacion_potencial_total?.toFixed(1) ?? "—"}</td>
                      <td className="px-5 py-3 text-gray-700">{desemp?.resultado_logra?.toFixed(1) ?? eip?.desempeno_logra?.toFixed(1) ?? "—"}</td>
                      <td className="px-5 py-3">
                        {eip?.tuvo_eal != null ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${eip.tuvo_eal || eal ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {eip.tuvo_eal || eal ? "Sí" : "No"}
                          </span>
                        ) : eal ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Sí</span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {eip?.entrego_picd != null ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${eip.entrego_picd ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {eip.entrego_picd ? "Sí" : "No"}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FormacionSection({ estudios }: { estudios: FormacionAcademica[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Formación Académica
          <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">({estudios.length} registro{estudios.length !== 1 ? "s" : ""})</span>
        </p>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          <div className="relative px-5 py-4">
            <div className="absolute left-8 top-4 bottom-4 w-px bg-gray-100" />
            <div className="space-y-5">
              {estudios.map((e) => {
                const idx = NIVEL_ORDER.indexOf(e.nivel_estudio ?? "");
                const isProfesional = idx >= 5;
                const badgeCls = isProfesional
                  ? "bg-blue-100 text-blue-700"
                  : idx >= 3
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-500";
                return (
                  <div key={e.id} className="flex gap-4 relative">
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex-shrink-0 relative z-10 mt-0.5" />
                    <div className="flex-1 pb-1">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        {e.nivel_estudio && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeCls}`}>
                            {e.nivel_estudio}
                          </span>
                        )}
                        {e.nombre_carrera && (
                          <p className="text-sm font-medium text-gray-900">{e.nombre_carrera}</p>
                        )}
                      </div>
                      {e.institucion && (
                        <p className="text-xs text-gray-500 mt-0.5">{e.institucion}</p>
                      )}
                      {(e.fecha_inicio || e.fecha_fin) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {e.fecha_inicio ? e.fecha_inicio.slice(0, 7) : ""}
                          {e.fecha_inicio && e.fecha_fin ? " → " : ""}
                          {e.fecha_fin ? e.fecha_fin.slice(0, 7) : (e.fecha_inicio ? " → en curso" : "")}
                        </p>
                      )}
                      {e.cedula && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Cédula: <span className="font-mono">{e.cedula}</span>
                          {e.estado_cedula && ` · ${e.estado_cedula}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CursosSection({ cursos }: { cursos: CursoFormacion[] }) {
  const [open, setOpen] = useState(true);
  const totalHoras = cursos.reduce((s, c) => s + (c.horas_efectivas ?? 0), 0);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Cursos y Capacitación
          <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">
            ({cursos.length} curso{cursos.length !== 1 ? "s" : ""}
            {totalHoras > 0 ? ` · ${totalHoras} hrs` : ""})
          </span>
        </p>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {cursos.map((c) => (
            <div key={c.id} className="px-5 py-3 flex gap-3 items-start">
              <div className="flex-shrink-0 mt-0.5">
                {c.tipo_curso && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${TIPO_CURSO_COLORS[c.tipo_curso] ?? "bg-gray-100 text-gray-600"}`}>
                    {c.tipo_curso}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.nombre_curso ?? "—"}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {c.institucion && (
                    <span className="text-xs text-gray-500">{c.institucion}</span>
                  )}
                  {(c.fecha_inicio || c.fecha_fin) && (
                    <span className="text-xs text-gray-400">
                      {c.fecha_inicio ? c.fecha_inicio.slice(0, 7) : ""}
                      {c.fecha_inicio && c.fecha_fin ? " → " : ""}
                      {c.fecha_fin ? c.fecha_fin.slice(0, 7) : ""}
                    </span>
                  )}
                  {c.horas_efectivas != null && c.horas_efectivas > 0 && (
                    <span className="text-xs text-gray-400">{c.horas_efectivas} hrs</span>
                  )}
                  {c.documento && (
                    <span className="text-xs text-gray-400">{c.documento}</span>
                  )}
                  {c.estado_completitud && (
                    <span className={`text-xs font-medium ${
                      c.estado_completitud === "Aprobado" ? "text-green-600" :
                      c.estado_completitud === "Reprobado" ? "text-red-500" : "text-gray-400"
                    }`}>{c.estado_completitud}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
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

function EIPCard({
  eip,
  desemp,
  eal,
  percentilComp,
  ponderaciones,
  zonaColors,
  cicloActual,
  isAdmin,
}: {
  eip: EIP | null;
  desemp: Desempeno | null;
  eal: EAL | null;
  percentilComp: CompetenciasPercentil | null;
  ponderaciones: Record<number, PonderacionRow>;
  zonaColors: { bg: string; text: string } | null;
  cicloActual: number;
  isAdmin: boolean;
}) {
  const [expandedDesemp, setExpandedDesemp] = useState(true);
  const [expandedPotencial, setExpandedPotencial] = useState(false);

  const cp = eip?.calif_ponderada;
  const pond = cp != null ? ponderaciones[cp] : null;

  const lograNota = desemp?.resultado_logra ?? eip?.desempeno_logra;
  const potencialNota = eip?.evaluacion_potencial_total;
  const zona = eip?.zona_evaluacion;

  const gaugePercent = (v: number) =>
    Math.min(100, Math.max(0, ((v - 80) / 40) * 100));

  const desempSubItems: [string, number | null | undefined][] = [
    ["Planea",             desemp?.planea],
    ["Ejecuta",            desemp?.ejecuta],
    ["Optimiza",           desemp?.optimiza],
    ["Trabaja en Equipo",  desemp?.trabaja_equipo],
    ["Atiende al Cliente", desemp?.atiende_cliente],
    ["Informa",            desemp?.informa],
  ];

  const evComp = eip?.ev_comp ?? null;
  const rawComp = percentilComp?.promedio_general ?? null;

  const potencialItems: {
    label: string;
    value: number | null;
    color: string;
    weight: number | null;
    show: boolean;
    rawNote?: string | null;
  }[] = [
    { label: "Experiencia",         value: eip?.ev_exp ?? null,       color: "bg-blue-500",   weight: pond?.w_exp ?? null,       show: true },
    { label: "Formación Académica", value: eip?.ev_form_acad ?? null, color: "bg-blue-500",   weight: pond?.w_form_acad ?? null, show: true },
    { label: "Cursos",              value: eip?.ev_cursos ?? null,    color: "bg-blue-400",   weight: pond?.w_cursos ?? null,    show: true },
    {
      label: "Competencias 360°",
      value: evComp,
      color: "bg-teal-500",
      weight: pond?.w_comp ?? null,
      show: true,
      rawNote: evComp == null && rawComp != null
        ? `Calif. ${rawComp.toFixed(2)} / 10 · escala 80–120 pendiente`
        : null,
    },
    { label: "EAL",  value: eip?.ev_eal ?? null,  color: "bg-violet-500", weight: pond?.w_eal ?? null,  show: eip?.tuvo_eal === true || eal != null },
    { label: "PICD", value: eip?.ev_picd ?? null, color: "bg-[#1a3a5c]", weight: pond?.w_picd ?? null, show: eip?.entrego_picd === true },
  ];

  const ESTATUS_STYLE: Record<string, string> = {
    APROBADA:  "bg-green-100 text-green-700 border-green-200",
    TERMINADA: "bg-blue-100 text-blue-700 border-blue-200",
    PENDIENTE: "bg-amber-100 text-amber-700 border-amber-200",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Summary strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 bg-[#f0f4f8] border-b border-gray-200">
        <div className="p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Desempeño</p>
          <p className="text-3xl font-bold text-[#1a3a5c] leading-none">
            {lograNota != null ? Math.round(lograNota) : "—"}
          </p>
          <p className="text-[10px] text-gray-400 mt-1.5">LOGRA — Resultados del trabajo</p>
        </div>
        <div className="p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Potencial</p>
          <p className="text-3xl font-bold text-[#1a3a5c] leading-none">
            {potencialNota != null ? Math.round(potencialNota) : "—"}
          </p>
          <p className="text-[10px] text-gray-400 mt-1.5">Evaluación integral · Ciclo {cicloActual}</p>
        </div>
        <div className="p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Zona de Evaluación</p>
          {zona && zonaColors ? (
            <>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${zonaColors.bg} ${zonaColors.text}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
                {zona}
              </span>
              {eip?.tipo_matriz && (
                <p className="text-[10px] text-gray-400 mt-1.5">{eip.tipo_matriz.replace(/_/g, " ")}</p>
              )}
            </>
          ) : (
            <span className="text-sm font-bold text-gray-300">—</span>
          )}
        </div>
      </div>

      {/* ── Desempeño — Resultados del Trabajo ────────────────────────── */}
      <div className="border-b border-gray-100">
        <button
          className="w-full flex items-center justify-between px-5 py-3 bg-gray-50/70 hover:bg-gray-50 transition-colors text-left"
          onClick={() => setExpandedDesemp((v) => !v)}
          aria-expanded={expandedDesemp}
        >
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-[#1a3a5c] uppercase tracking-wider">
              Desempeño — Resultados del Trabajo
            </span>
            {isAdmin && desemp?.estatus_desem && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${ESTATUS_STYLE[desemp.estatus_desem.toUpperCase()] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {desemp.estatus_desem}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lograNota != null && (
              <span className="text-xs font-bold text-[#1a3a5c]">
                LOGRA&nbsp;&nbsp;<span className="text-base">{Math.round(lograNota)}</span>
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedDesemp ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {expandedDesemp && (
          <div>
            {desemp ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Descripción</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Evaluación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {desempSubItems.map(([label, val]) => (
                    <tr key={label} className="hover:bg-gray-50/40">
                      <td className="px-5 py-3 text-sm text-gray-700">{label}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {val != null
                          ? <span className="text-sm font-semibold text-[#1a3a5c]">{Math.round(val)}</span>
                          : <span className="text-sm text-gray-300">ND</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide">LOGRA</td>
                    <td className="px-5 py-3 text-right">
                      {desemp.resultado_logra != null
                        ? <span className="text-lg font-bold text-[#1a3a5c]">{Math.round(desemp.resultado_logra)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-400">Sin evaluación de desempeño para este ciclo.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Potencial — Desarrollo Profesional ────────────────────────── */}
      <div>
        <button
          className="w-full flex items-center justify-between px-5 py-3 bg-gray-50/70 hover:bg-gray-50 transition-colors text-left"
          onClick={() => setExpandedPotencial((v) => !v)}
          aria-expanded={expandedPotencial}
        >
          <span className="text-[11px] font-bold text-[#1a3a5c] uppercase tracking-wider">
            Potencial — Desarrollo Profesional
          </span>
          <div className="flex items-center gap-2">
            {potencialNota != null && (
              <span className="text-xs font-bold text-[#1a3a5c]">
                Evaluación&nbsp;&nbsp;<span className="text-base">{Math.round(potencialNota)}</span>
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedPotencial ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {expandedPotencial && (
          <div className="px-5 py-4 space-y-4">
            {potencialItems.filter((item) => item.show).map((item) => {
              const val = item.value ?? null;
              const hasValue = val != null;
              const pct = hasValue ? gaugePercent(val) : null;
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-xs text-gray-600 font-medium">{item.label}</span>
                      {item.rawNote && (
                        <p className="text-[10px] text-teal-600 font-medium mt-0.5">{item.rawNote}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.weight != null && (
                        <span className="text-[10px] font-semibold text-gray-400 tabular-nums">
                          {(item.weight * 100).toFixed(0)}%
                        </span>
                      )}
                      {hasValue ? (
                        <span className="text-xs font-bold text-[#1a3a5c] tabular-nums w-10 text-right">
                          {val.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                          {item.rawNote ? "Calculando…" : "Pendiente"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                    {hasValue && pct != null && (
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${item.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  <div className="relative h-1">
                    <div className="absolute top-0 w-px h-2 -mt-2 bg-gray-400 opacity-50" style={{ left: "50%" }} />
                  </div>
                </div>
              );
            })}
            <p className="flex items-center gap-1.5 text-[10px] text-gray-400 pt-1">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
              La escala 80–120 normaliza cada componente. El punto de referencia (100) es el promedio organizacional del ciclo.
            </p>
            {!pond && eip && (
              <p className="text-[10px] text-amber-600">
                Ponderaciones del ciclo {eip.ciclo_año} no configuradas.
              </p>
            )}
          </div>
        )}
      </div>
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
