"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import EmpleadoAvatar from "@/components/ui/EmpleadoAvatar";
import type {
  CartaNode, CartaEip, CartaTalentoClave, CartaSucesor, CartaPicd, CartaCatalogoPuesto,
} from "./types";

// ── Layout constants ──────────────────────────────────────────────────────────

const CARD_W = 272;
const CARD_H = 236;
const H_GAP  = 24;
const V_GAP  = 80;
const PAD    = 32;

// ── Tree layout (pure calculation) ───────────────────────────────────────────

function subW(id: string, cm: Map<string, string[]>, ex: Set<string>): number {
  const kids = ex.has(id) ? (cm.get(id) ?? []) : [];
  if (!kids.length) return CARD_W;
  return Math.max(CARD_W, kids.reduce((a, k) => a + subW(k, cm, ex), 0) + (kids.length - 1) * H_GAP);
}

function calcLayout(
  id: string, ox: number, oy: number,
  cm: Map<string, string[]>, ex: Set<string>,
  out: Map<string, { x: number; y: number }>
) {
  const w = subW(id, cm, ex);
  out.set(id, { x: ox + Math.round((w - CARD_W) / 2), y: oy });
  const kids = ex.has(id) ? (cm.get(id) ?? []) : [];
  let cx = ox;
  for (const kid of kids) {
    const kw = subW(kid, cm, ex);
    calcLayout(kid, cx, oy + CARD_H + V_GAP, cm, ex, out);
    cx += kw + H_GAP;
  }
}

function treeH(id: string, cm: Map<string, string[]>, ex: Set<string>): number {
  const kids = ex.has(id) ? (cm.get(id) ?? []) : [];
  if (!kids.length) return CARD_H;
  return CARD_H + V_GAP + Math.max(...kids.map(k => treeH(k, cm, ex)));
}

// Prevent duplicates (circular refs or data anomalies)
function allVisible(id: string, cm: Map<string, string[]>, ex: Set<string>, visited = new Set<string>()): string[] {
  if (visited.has(id)) return [];
  visited.add(id);
  const r = [id];
  if (ex.has(id)) for (const k of cm.get(id) ?? []) r.push(...allVisible(k, cm, ex, visited));
  return r;
}

// ── Name shortener: primer nombre + primer apellido ───────────────────────────

function nombreCorto(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  const toTitle = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (parts.length <= 2) return parts.map(toTitle).join(" ");
  // Mexican format: nombre1 [nombre2] apellido1 [apellido2]
  // second-to-last = primer apellido
  return `${toTitle(parts[0])} ${toTitle(parts[parts.length - 2])}`;
}

// ── Cobertura ─────────────────────────────────────────────────────────────────

type Cob = "verde" | "amarillo" | "rojo" | "negro";

// plan_sucesion.id_empleado_titular = colaboradores.id (UUID)
// verde   = ≥1 aprobado con readiness inmediato/mediano
// amarillo= tiene sucesores pero solo borrador o solo largo plazo
// rojo    = sin sucesor declarado o todos externos (sucesor_id null)
// negro   = this person is already assigned as sucesor in another plan (yaAsignado)
function getCob(colabUuid: string, isYaAsignado: boolean, suc: CartaSucesor[]): Cob {
  if (isYaAsignado) return "negro";
  const mine = suc.filter(s => s.id_empleado_titular === colabUuid);
  if (!mine.length) return "rojo";
  // All external (no link to a colaborador)?
  const hasInternal = mine.some(s => s.sucesor_id !== null);
  if (!hasInternal) return "rojo";
  // Has validado (aprobado) with corto/inmediato/mediano readiness?
  const hasValidado = mine.some(s =>
    s.estado === "aprobado" &&
    (s.readiness === "listo_ahora" || s.readiness === "uno_dos_anios" ||
     s.tiempo_estimado === "corto" || s.tiempo_estimado === "mediano")
  );
  if (hasValidado) return "verde";
  return "amarillo";
}

const COB_LEFT: Record<Cob, string> = {
  verde:    "border-l-green-500",
  amarillo: "border-l-amber-400",
  rojo:     "border-l-red-500",
  negro:    "border-l-gray-700",
};

const RSHORT: Record<string, string> = {
  listo_ahora: "Inm.", uno_dos_anios: "Med.", tres_mas_anios: "Lrg.",
  corto: "Inm.", mediano: "Med.", largo: "Lrg.",
};
const RCOLOR_BADGE: Record<string, string> = {
  listo_ahora: "bg-green-100 text-green-700",
  uno_dos_anios: "bg-blue-100 text-blue-700",
  tres_mas_anios: "bg-gray-100 text-gray-500",
  corto: "bg-green-100 text-green-700",
  mediano: "bg-blue-100 text-blue-700",
  largo: "bg-gray-100 text-gray-500",
};

// ── Unified successor entry type ──────────────────────────────────────────────

type SucEntry = {
  nombre: string;
  tipo: "validado" | "borrador" | "externo" | "aspiracion";
  readiness: string | null;
  id: string | null; // colaboradores.id for carpeta link
};

// ── OrgCard ───────────────────────────────────────────────────────────────────

// Hire status derived from data
function hireStatus(node: CartaNode, isYaAsignado: boolean): "leaving" | "already_assigned" | "employee" {
  if (isYaAsignado) return "already_assigned";
  if (node.fecha_baja) return "leaving";
  return "employee";
}

const HIRE_BADGE: Record<string, { label: string; cls: string }> = {
  leaving:          { label: "Leaving",          cls: "bg-yellow-100 text-yellow-800 border border-yellow-300" },
  already_assigned: { label: "Already Assigned", cls: "bg-gray-100 text-gray-600 border border-gray-300" },
  employee:         { label: "Employee",          cls: "bg-green-100 text-green-700 border border-green-300" },
};

function OrgCard({
  node, pos, cob, talentoClave, concentracion, esCritico, isYaAsignado,
  entries, isSelected, hasKids, isExpanded, onSelect, onToggle,
}: {
  node: CartaNode;
  pos: { x: number; y: number };
  cob: Cob;
  talentoClave: boolean;
  concentracion: boolean;
  esCritico: boolean;
  isYaAsignado: boolean;
  entries: SucEntry[];
  isSelected: boolean;
  hasKids: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const nombre = nombreCorto(node.nombre_completo);
  const hs = hireStatus(node, isYaAsignado);
  const hb = HIRE_BADGE[hs];

  return (
    <div
      className={`absolute bg-white rounded-xl shadow-md border border-gray-200 border-l-[5px] overflow-hidden cursor-pointer transition-shadow hover:shadow-lg
        ${COB_LEFT[cob]}
        ${isSelected ? "ring-2 ring-offset-1 ring-[#1a3a5c] shadow-lg" : ""}
      `}
      style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="px-3.5 pt-3 pb-2.5">
        {/* Name row */}
        <div className="flex items-start justify-between gap-1">
          <p className="font-bold text-gray-900 leading-snug" style={{ fontSize: 13.5 }}>
            {talentoClave && <span className="text-amber-400 mr-0.5">⭐</span>}
            {nombre}
          </p>
          {concentracion && (
            <span className="text-orange-500 text-base flex-shrink-0 mt-0.5" title="Riesgo de concentración: sucesor en 2+ planes">⚠️</span>
          )}
        </div>

        {/* Position + critical dot */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[11px] text-gray-500 leading-tight truncate flex-1">{node.puesto ?? "—"}</p>
          {esCritico && (
            <span
              className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"
              title="Puesto crítico"
            />
          )}
        </div>

        {/* ID */}
        <p className="text-[10px] text-gray-400 mt-0.5">
          {node.id_empleado ? `#${node.id_empleado}` : ""}
        </p>

        {/* Hire Status */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">Hire Status:</span>
          <span className={`text-[9.5px] px-2 py-0.5 rounded-md font-semibold leading-none ${hb.cls}`}>{hb.label}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Succession */}
      <div className="px-3.5 pt-2 pb-1">
        <p className="text-[8.5px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-1.5">Sucesión</p>
        {entries.length === 0 ? (
          <p className="text-[10.5px] text-red-400 italic">Sin sucesor declarado</p>
        ) : (
          <div className="space-y-[5px]">
            {entries.slice(0, 3).map((e, i) => <SucRow key={i} entry={e} />)}
            {entries.length > 3 && (
              <p className="text-[9.5px] text-gray-400">+{entries.length - 3} más</p>
            )}
          </div>
        )}
      </div>

      {/* Expand / collapse */}
      {hasKids && (
        <button
          onClick={onToggle}
          className="absolute bottom-2 right-2.5 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-[9px] font-bold transition-colors"
          title={isExpanded ? "Colapsar" : "Ver subordinados"}
        >
          {isExpanded ? "▲" : "▼"}
        </button>
      )}
    </div>
  );
}

function SucRow({ entry }: { entry: SucEntry }) {
  const r = entry.readiness;
  const rShort = r ? (RSHORT[r] ?? r) : null;
  const rColor = r ? (RCOLOR_BADGE[r] ?? "bg-gray-100 text-gray-500") : null;

  const nameClass =
    entry.tipo === "validado"   ? "text-gray-900 font-medium" :
    entry.tipo === "borrador"   ? "text-gray-700" :
    entry.tipo === "externo"    ? "text-gray-500 italic" :
    /* aspiracion */              "text-gray-400";

  const badge =
    entry.tipo === "validado" && rShort
      ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none ${rColor}`}>{rShort}</span>
    : entry.tipo === "borrador"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-amber-50 text-amber-600 border border-amber-300">{rShort ?? "Pend."}</span>
    : entry.tipo === "externo"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-gray-100 text-gray-500">Ext.</span>
    : <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none border border-gray-300 text-gray-400">Asp.</span>;

  return (
    <div className="flex items-center gap-1">
      <span className={`text-[11px] flex-1 truncate leading-none ${nameClass}`}>
        {entry.tipo === "externo" ? entry.nombre : nombreCorto(entry.nombre)}
      </span>
      {badge}
    </div>
  );
}

// ── SVG connector lines ───────────────────────────────────────────────────────

function ConnectorLines({
  rootId, positions, childrenMap, expanded,
}: {
  rootId: string;
  positions: Map<string, { x: number; y: number }>;
  childrenMap: Map<string, string[]>;
  expanded: Set<string>;
}) {
  const paths: string[] = [];

  function collect(id: string) {
    if (!expanded.has(id)) return;
    for (const kid of (childrenMap.get(id) ?? [])) {
      const pp = positions.get(id);
      const cp = positions.get(kid);
      if (pp && cp) {
        const x1 = pp.x + CARD_W / 2;
        const y1 = pp.y + CARD_H;
        const x2 = cp.x + CARD_W / 2;
        const y2 = cp.y;
        const ym = (y1 + y2) / 2;
        paths.push(`M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`);
      }
      collect(kid);
    }
  }
  collect(rootId);

  if (!paths.length) return null;

  return (
    <>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
      ))}
    </>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

const ZONA_STYLE: Record<string, string> = {
  Sobresaliente: "bg-purple-100 text-purple-800",
  Desarrollo:    "bg-blue-100 text-blue-800",
  Estabilidad:   "bg-green-100 text-green-800",
  "Revisión":    "bg-yellow-100 text-yellow-800",
  Inicio:        "bg-red-100 text-red-800",
};

function DetailPanel({
  nodeId, colabMap, sucesores, tcByColab, eipByEmpleado, picdByEmpleado,
  catalogoById, colabToCatalog, aspirantesByPuesto, yaAsignadoIds,
  concentracionMap, onClose,
}: {
  nodeId: string;
  colabMap: Map<string, CartaNode>;
  sucesores: CartaSucesor[];
  tcByColab: Map<string, CartaTalentoClave>;
  eipByEmpleado: Map<string, CartaEip>;
  picdByEmpleado: Map<string, CartaPicd>;
  catalogoById: Map<string, CartaCatalogoPuesto>;
  colabToCatalog: Map<string, string>;
  aspirantesByPuesto: Map<string, { nombre: string; id: string }[]>;
  yaAsignadoIds: Set<string>;
  concentracionMap: Map<string, number>;
  onClose: () => void;
}) {
  const node = colabMap.get(nodeId);
  if (!node) return null;

  const eip        = eipByEmpleado.get(node.id);
  const tc         = tcByColab.get(node.id);
  const picd       = picdByEmpleado.get(node.id);
  const catId      = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
  const cat        = catId ? catalogoById.get(catId) : undefined;
  const isYa       = yaAsignadoIds.has(node.id);
  const cob        = getCob(node.id, isYa, sucesores);
  const mySuc      = sucesores.filter(s => s.id_empleado_titular === node.id);
  const aspirantes = catId ? (aspirantesByPuesto.get(catId) ?? []) : [];
  const sucIds     = new Set(mySuc.filter(s => s.sucesor_id).map(s => s.sucesor_id!));
  const entries    = buildEntries(mySuc, aspirantes.filter(a => !sucIds.has(a.id)));
  const conc       = concentracionMap.get(node.id) ?? 0;

  // Who has this person listed as their successor?
  const plansDondeEsSucesor = sucesores.filter(s => s.sucesor_id === node.id);
  const titularesTooltip = plansDondeEsSucesor.length
    ? plansDondeEsSucesor.map(s => {
        const t = colabMap.get(s.id_empleado_titular);
        return t ? `${t.nombre_completo}\n${t.puesto ?? "—"}` : "—";
      }).join("\n\n")
    : "";

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[460px] max-w-[96vw] bg-white shadow-2xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-100 flex-shrink-0">
          <EmpleadoAvatar idEmpleado={node.id_empleado} nombre={node.nombre_completo} size={48} rounded="full" className="mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 leading-tight">{node.nombre_completo}</h2>
            <p className="text-sm text-gray-600 mt-0.5">{node.puesto ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {[node.organización, node.area, node.nivel].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 mt-0.5 flex-shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status chips */}
          <div className="flex gap-2 flex-wrap">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                cob === "verde"    ? "bg-green-100 text-green-800" :
                cob === "amarillo" ? "bg-amber-100 text-amber-800" :
                cob === "negro"    ? "bg-gray-200 text-gray-800 cursor-help" :
                "bg-red-100 text-red-800"
              }`}
              title={cob === "negro" && titularesTooltip
                ? `Designado como sucesor de:\n\n${titularesTooltip}`
                : undefined}
            >
              {cob === "verde" ? "🟢 Cubierto" :
               cob === "amarillo" ? "🟡 En desarrollo" :
               cob === "negro" ? "⚫ Ya asignado" :
               "🔴 En riesgo"}
            </span>
            {tc?.es_talento_clave && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 cursor-help"
                title={`Fuente: ${tc.fuente} · Ciclo ${tc.ciclo_año}`}>
                ⭐ Talento Clave
              </span>
            )}
            {cat?.es_critico && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 cursor-help"
                title="Puesto marcado como crítico en el catálogo">
                ⚠ Puesto Crítico
              </span>
            )}
            {conc >= 2 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 cursor-help"
                title={titularesTooltip
                  ? `Designado como sucesor en ${conc} planes:\n\n${titularesTooltip}`
                  : `Está asignado como sucesor en ${conc} planes simultáneamente`}>
                ⚠️ Concentración ({conc} planes)
              </span>
            )}
          </div>

          {/* EIP */}
          {eip && (
            <section>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                EIP · Ciclo {eip.ciclo_año}
              </h3>
              {eip.zona_evaluacion && (
                <div className="mb-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ZONA_STYLE[eip.zona_evaluacion] ?? "bg-gray-100 text-gray-700"}`}>
                    {eip.zona_evaluacion}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {eip.evaluacion_potencial_total != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 tabular-nums">{eip.evaluacion_potencial_total.toFixed(1)}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Potencial</p>
                  </div>
                )}
                {eip.desempeno_logra != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 tabular-nums">{eip.desempeno_logra.toFixed(1)}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Desempeño</p>
                  </div>
                )}
                {eip.años_en_puesto != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 tabular-nums">{eip.años_en_puesto}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Años en puesto</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Unified succession list */}
          <section>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Sucesión ({entries.length})
            </h3>
            {entries.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin sucesores identificados</p>
            ) : (
              <div className="space-y-2">
                {entries.map((e, i) => <DetailSucRow key={i} entry={e} />)}
              </div>
            )}
          </section>

          {/* PICD */}
          {picd && (picd.puesto_futuro_opcion1 || picd.puesto_futuro_opcion2) && (
            <section>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Puestos Futuros PICD · Ciclo {picd.ciclo_año}
              </h3>
              <div className="space-y-2">
                {[
                  { label: "Op. 1", texto: picd.puesto_futuro_opcion1, vinc: picd.puesto_futuro_id1 },
                  { label: "Op. 2", texto: picd.puesto_futuro_opcion2, vinc: picd.puesto_futuro_id2 },
                ].filter(o => o.texto).map((o, i) => (
                  <div key={i} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
                    <span className="text-[10px] font-bold text-gray-400 w-9 flex-shrink-0">{o.label}</span>
                    <span className="flex-1 text-sm text-gray-800">{o.texto}</span>
                    {o.vinc && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full flex-shrink-0">Vinculado</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Links */}
          <section>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Accesos rápidos</h3>
            <div className="flex flex-wrap gap-2">
              <a href={`/carpeta/${node.id}`}
                className="px-3 py-2 bg-[#1a3a5c] text-white rounded-lg text-sm font-medium hover:bg-[#14304d] transition-colors">
                📁 Carpeta
              </a>
              <a href={`/plan-carrera/${node.id}`}
                className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                📐 Plano de Carrera
              </a>
              <a href={`/carpeta/${node.id}?tab=sucesion`}
                className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                🔄 Sucesión
              </a>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function DetailSucRow({ entry }: { entry: SucEntry }) {
  const r = entry.readiness;
  const rShort = r ? (RSHORT[r] ?? r) : null;
  const rColor = r ? (RCOLOR_BADGE[r] ?? "bg-gray-100 text-gray-500") : null;

  const tipoLabel: Record<SucEntry["tipo"], string> = {
    validado: "Validado", borrador: "Propuesto", externo: "Externo", aspiracion: "Aspiración",
  };
  const tipoBadge: Record<SucEntry["tipo"], string> = {
    validado: "bg-green-50 text-green-700 border-green-200",
    borrador: "bg-amber-50 text-amber-700 border-amber-200",
    externo:  "bg-gray-100 text-gray-500 border-gray-200",
    aspiracion: "bg-blue-50 text-blue-600 border-blue-200",
  };

  return (
    <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          entry.tipo === "externo" ? "italic text-gray-500" :
          entry.tipo === "aspiracion" ? "text-gray-500" :
          "text-gray-800"
        }`}>{entry.tipo === "externo" ? entry.nombre : entry.nombre}</p>
        <div className="flex gap-1.5 mt-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${tipoBadge[entry.tipo]}`}>
            {tipoLabel[entry.tipo]}
          </span>
          {rShort && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${rColor}`}>{rShort}</span>}
        </div>
      </div>
      {entry.id && (
        <a href={`/carpeta/${entry.id}`} onClick={e => e.stopPropagation()}
          className="text-[11px] text-[#1a3a5c] font-medium hover:underline flex-shrink-0">
          Carpeta →
        </a>
      )}
    </div>
  );
}

// ── Build unified entries ─────────────────────────────────────────────────────

function buildEntries(
  mySuc: CartaSucesor[],
  aspirantesFiltrados: { nombre: string; id: string }[]
): SucEntry[] {
  // Deduplicate plan_sucesion rows by sucesor_id (or name for externals)
  // Rows arrive ordered desc by ciclo_año — keep the first (most recent) per person
  const seen = new Set<string>();
  const dedupedSuc = mySuc.filter(s => {
    const key = s.sucesor_id ?? `ext:${s.sucesor_nombre.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const entries: SucEntry[] = dedupedSuc.map(s => {
    const tipo: SucEntry["tipo"] =
      s.sucesor_id === null ? "externo" :
      s.estado === "aprobado" ? "validado" : "borrador";
    return {
      nombre: s.sucesor_nombre,
      tipo,
      readiness: s.readiness ?? s.tiempo_estimado ?? null,
      id: s.sucesor_id,
    };
  });

  // Aspiraciones: skip if already a sucesor (covered by sucIds filter before calling this)
  for (const a of aspirantesFiltrados) {
    entries.push({ nombre: a.nombre, tipo: "aspiracion", readiness: null, id: a.id });
  }

  // Sort: validado, borrador, aspiracion, externo
  const order: Record<SucEntry["tipo"], number> = { validado: 0, borrador: 1, aspiracion: 2, externo: 3 };
  return entries.sort((a, b) => order[a.tipo] - order[b.tipo]);
}

// ── Root selector ─────────────────────────────────────────────────────────────

function RootSelector({
  colabs, childrenMap, initialLabel, onSelect, onClear,
}: {
  colabs: CartaNode[];
  childrenMap: Map<string, string[]>;
  initialLabel: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState(initialLabel);
  const [open, setOpen] = useState(false);

  // Sync if initialLabel changes (e.g. on mount with restored value)
  useEffect(() => { setQ(initialLabel); }, [initialLabel]);

  const hits = useMemo(() => {
    if (q.trim().length < 2) return [];
    const lower = q.toLowerCase();
    return colabs.filter(c => {
      const hasKids = (childrenMap.get(c.id)?.length ?? 0) > 0;
      const idHit = (c.id_empleado ?? "").includes(q.trim());
      if (!hasKids && !idHit) return false;
      return (
        c.nombre_completo.toLowerCase().includes(lower) ||
        (c.puesto ?? "").toLowerCase().includes(lower) ||
        (c.id_empleado ?? "").includes(q.trim()) ||
        (c.organización ?? "").toLowerCase().includes(lower)
      );
    }).slice(0, 12);
  }, [q, colabs, childrenMap]);

  return (
    <div className="relative max-w-lg">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Posición de inicio
      </label>
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          placeholder="Nombre, puesto, ID de empleado o UEN…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
        />
        {q && (
          <button
            onMouseDown={() => { setQ(""); onClear(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            title="Limpiar selección"
          >×</button>
        )}
      </div>
      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {hits.map(c => (
            <button
              key={c.id}
              onMouseDown={() => { onSelect(c.id); setQ(c.nombre_completo); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2.5"
            >
              <EmpleadoAvatar idEmpleado={c.id_empleado} nombre={c.nombre_completo} size={28} rounded="full" />
              <div>
                <p className="text-sm font-medium text-gray-900">{c.nombre_completo}</p>
                <p className="text-xs text-gray-500">{c.puesto ?? "—"} · {c.organización ?? "—"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Executive summary bar ─────────────────────────────────────────────────────

function ExecSummary({
  rootId, childrenMap, colabMap, sucesores, yaAsignadoIds,
}: {
  rootId: string;
  childrenMap: Map<string, string[]>;
  colabMap: Map<string, CartaNode>;
  sucesores: CartaSucesor[];
  yaAsignadoIds: Set<string>;
}) {
  const directKids = childrenMap.get(rootId) ?? [];
  const counts = { verde: 0, amarillo: 0, rojo: 0, negro: 0 };
  for (const id of directKids) {
    const n = colabMap.get(id);
    if (n) counts[getCob(n.id, yaAsignadoIds.has(n.id), sucesores)]++;
  }

  if (directKids.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap text-sm">
      <span className="text-gray-500 font-medium">{directKids.length} reportes directos ·</span>
      {counts.verde > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-800 font-semibold border border-green-200">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          {counts.verde} Cubiertos
        </span>
      )}
      {counts.amarillo > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 font-semibold border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          {counts.amarillo} En desarrollo
        </span>
      )}
      {counts.rojo > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-800 font-semibold border border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          {counts.rojo} En riesgo
        </span>
      )}
      {counts.negro > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold border border-gray-200">
          <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
          {counts.negro} Ya asignados
        </span>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-xs text-gray-500">
      <span>● <span className="text-green-600 font-medium">Cubierto</span> — Backup validado Inm./Med.</span>
      <span>● <span className="text-amber-500 font-medium">En desarrollo</span> — Propuesto o solo Largo Plazo</span>
      <span>● <span className="text-red-500 font-medium">En riesgo</span> — Sin sucesor o todos externos</span>
      <span>⚫ <span className="text-gray-600 font-medium">Ya asignado</span> — En proceso de sucesión</span>
      <span className="ml-2">⭐ Talento Clave · ⚠️ Concentración</span>
      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> <span className="font-medium text-orange-700">Puesto Crítico</span></span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CartasClient({
  colabs, eipLatest, talentoClaveLatest, sucesores, picdLatest,
  catalogo, yaAsignadoIds: yaArr, rol, jefeColabId,
}: {
  colabs: CartaNode[];
  eipLatest: CartaEip[];
  talentoClaveLatest: CartaTalentoClave[];
  sucesores: CartaSucesor[];
  picdLatest: CartaPicd[];
  catalogo: CartaCatalogoPuesto[];
  yaAsignadoIds: string[];
  rol: string;
  jefeColabId: string | null;
}) {
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  const STORAGE_KEY = "cartas-rootId";

  // Restore persisted rootId for admins; jefes always start from their own position
  const [rootId, setRootId] = useState<string | null>(() => {
    if (!isAdmin) return jefeColabId ?? null;
    try { return localStorage.getItem(STORAGE_KEY) ?? jefeColabId ?? null; } catch { return jefeColabId ?? null; }
  });

  const [selectedId, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<Set<string>>(
    () => new Set(rootId ? [rootId] : [])
  );

  // Persist rootId whenever it changes
  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (rootId) localStorage.setItem(STORAGE_KEY, rootId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
  }, [rootId, isAdmin]);

  // Lookup maps (all keyed by colaboradores.id UUID)
  const colabMap     = useMemo(() => new Map(colabs.map(c => [c.id, c])), [colabs]);
  const eipMap       = useMemo(() => new Map(eipLatest.map(e => [e.id_empleado, e])), [eipLatest]);
  const tcMap        = useMemo(() => new Map(talentoClaveLatest.map(t => [t.colaborador_id, t])), [talentoClaveLatest]);
  const picdMap      = useMemo(() => new Map(picdLatest.map(p => [p.id_empleado, p])), [picdLatest]);
  const catalogoById = useMemo(() => new Map(catalogo.map(c => [c.id, c])), [catalogo]);
  const yaIds        = useMemo(() => new Set(yaArr), [yaArr]);

  const childrenMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of colabs) {
      if (c.jefe_inmediato_id) {
        if (!m.has(c.jefe_inmediato_id)) m.set(c.jefe_inmediato_id, []);
        m.get(c.jefe_inmediato_id)!.push(c.id);
      }
    }
    return m;
  }, [colabs]);

  const colabToCatalog = useMemo(() => {
    const byName = new Map<string, string>();
    for (const c of catalogo) byName.set(c.nombre.trim().toUpperCase(), c.id);
    const m = new Map<string, string>();
    for (const c of colabs) {
      if (c.puesto_catalogo_id) { m.set(c.id, c.puesto_catalogo_id); continue; }
      if (c.puesto) { const id = byName.get(c.puesto.trim().toUpperCase()); if (id) m.set(c.id, id); }
    }
    return m;
  }, [colabs, catalogo]);

  // Aspirantes: puestoCatalogId → [{nombre, id}] — keyed by UUID
  const aspirantesByPuesto = useMemo(() => {
    const uuidToColab = new Map<string, CartaNode>();
    for (const c of colabs) uuidToColab.set(c.id, c);

    const m = new Map<string, { nombre: string; id: string }[]>();
    for (const p of picdLatest) {
      const colab = uuidToColab.get(p.id_empleado);
      if (!colab) continue;
      for (const catId of [p.puesto_futuro_id1, p.puesto_futuro_id2]) {
        if (!catId) continue;
        if (!m.has(catId)) m.set(catId, []);
        m.get(catId)!.push({ nombre: colab.nombre_completo, id: colab.id });
      }
    }
    return m;
  }, [colabs, picdLatest]);

  // Concentración: sucesor UUID → count of plans they appear in as sucesor_id
  const concentracionMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sucesores) {
      if (!s.sucesor_id) continue;
      m.set(s.sucesor_id, (m.get(s.sucesor_id) ?? 0) + 1);
    }
    return m;
  }, [sucesores]);

  // Layout calculation
  const { positions, canvasW, canvasH } = useMemo(() => {
    if (!rootId) return { positions: new Map<string, {x:number;y:number}>(), canvasW: 0, canvasH: 0 };
    const pos = new Map<string, { x: number; y: number }>();
    const totalW = subW(rootId, childrenMap, expanded);
    const totalH = treeH(rootId, childrenMap, expanded);
    calcLayout(rootId, 0, 0, childrenMap, expanded, pos);
    return { positions: pos, canvasW: totalW + PAD * 2, canvasH: totalH + PAD * 2 };
  }, [rootId, childrenMap, expanded]);

  const shiftedPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [id, p] of positions) m.set(id, { x: p.x + PAD, y: p.y + PAD });
    return m;
  }, [positions]);

  const visibleNodes = useMemo(
    () => rootId ? allVisible(rootId, childrenMap, expanded) : [],
    [rootId, childrenMap, expanded]
  );

  // Pan / zoom state
  const [vp, setVp] = useState({ x: 0, y: 0, scale: 1 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setVp(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setVp(prev => ({ ...prev, scale: Math.max(0.25, Math.min(2.5, prev.scale * factor)) }));
  }, []);

  const resetVp = () => setVp({ x: 0, y: 0, scale: 1 });
  const zoomIn  = () => setVp(prev => ({ ...prev, scale: Math.min(2.5, prev.scale * 1.2) }));
  const zoomOut = () => setVp(prev => ({ ...prev, scale: Math.max(0.25, prev.scale / 1.2) }));

  const [fullscreen, setFullscreen] = useState(false);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleSetRoot = (id: string) => {
    setRootId(id);
    setSelected(null);
    setExpanded(new Set([id]));
    setVp({ x: 0, y: 0, scale: 1 });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cartas de Reemplazo</h1>
        <p className="text-sm text-gray-500 mt-1">Cobertura de sucesión · Reportes directos · {new Date().getFullYear()}</p>
      </div>

      {isAdmin && (
        <RootSelector
          colabs={colabs}
          childrenMap={childrenMap}
          initialLabel={rootId ? (colabMap.get(rootId)?.nombre_completo ?? "") : ""}
          onSelect={handleSetRoot}
          onClear={() => { setRootId(null); setSelected(null); setExpanded(new Set()); }}
        />
      )}

      {rootId && (
        <>
          <ExecSummary rootId={rootId} childrenMap={childrenMap} colabMap={colabMap} sucesores={sucesores} yaAsignadoIds={yaIds} />
          <Legend />
        </>
      )}

      {rootId ? (
        <div
          className={fullscreen
            ? "fixed inset-0 z-50 bg-gray-50 overflow-hidden"
            : "relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"}
          style={{ height: fullscreen ? "100dvh" : 600, cursor: dragging.current ? "grabbing" : "grab" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          {/* Zoom + fullscreen controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 select-none">
            <button onClick={zoomIn}  className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow text-gray-600 hover:bg-gray-50 text-lg font-light flex items-center justify-center">+</button>
            <button onClick={zoomOut} className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow text-gray-600 hover:bg-gray-50 text-lg font-light flex items-center justify-center">−</button>
            <button onClick={resetVp} className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow text-gray-600 hover:bg-gray-50 text-[10px] font-medium flex items-center justify-center" title="Restablecer vista">⊙</button>
            <button
              onClick={e => { e.stopPropagation(); setFullscreen(f => !f); }}
              className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow text-gray-600 hover:bg-gray-50 text-[13px] flex items-center justify-center"
              title={fullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
            >
              {fullscreen ? "✕" : "⛶"}
            </button>
          </div>
          <div className="absolute bottom-3 left-3 z-10 text-[10px] text-gray-400 select-none">
            {Math.round(vp.scale * 100)}% · Arrastra para mover · Scroll para zoom{fullscreen ? " · Esc para salir" : ""}
          </div>

          {/* Transformable canvas */}
          <div
            style={{
              transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`,
              transformOrigin: "0 0",
              position: "absolute",
              width: canvasW,
              height: canvasH,
            }}
          >
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasW}
              height={canvasH}
              style={{ overflow: "visible" }}
            >
              <ConnectorLines
                rootId={rootId}
                positions={shiftedPos}
                childrenMap={childrenMap}
                expanded={expanded}
              />
            </svg>

            {visibleNodes.map(id => {
              const node = colabMap.get(id);
              const pos  = shiftedPos.get(id);
              if (!node || !pos) return null;

              const isYa      = yaIds.has(id);
              const cob       = getCob(node.id, isYa, sucesores);
              const tc        = tcMap.get(node.id);
              const catId     = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
              const cat       = catId ? catalogoById.get(catId) : undefined;
              const mySuc     = sucesores.filter(s => s.id_empleado_titular === node.id);
              const sucIds    = new Set(mySuc.filter(s => s.sucesor_id).map(s => s.sucesor_id!));
              const aspirantes = catId
                ? (aspirantesByPuesto.get(catId) ?? []).filter(a => !sucIds.has(a.id))
                : [];
              const entries   = buildEntries(mySuc, aspirantes);
              const conc      = concentracionMap.get(node.id) ?? 0;

              return (
                <OrgCard
                  key={id}
                  node={node}
                  pos={pos}
                  cob={cob}
                  talentoClave={tc?.es_talento_clave ?? false}
                  concentracion={conc >= 2}
                  esCritico={cat?.es_critico ?? false}
                  isYaAsignado={isYa}
                  entries={entries}
                  isSelected={selectedId === id}
                  hasKids={(childrenMap.get(id)?.length ?? 0) > 0}
                  isExpanded={expanded.has(id)}
                  onSelect={() => setSelected(prev => prev === id ? null : id)}
                  onToggle={e => { e.stopPropagation(); toggle(id); }}
                />
              );
            })}
          </div>
          {/* end transformable canvas */}
        </div>
        /* end viewport */
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-20 text-center bg-gray-50">
          <p className="text-gray-400 text-base">
            {isAdmin
              ? "Busca y selecciona un director o posición para explorar el árbol de sucesión"
              : "No se encontró tu posición en el organigrama"}
          </p>
        </div>
      )}

      {selectedId && (
        <DetailPanel
          nodeId={selectedId}
          colabMap={colabMap}
          sucesores={sucesores}
          tcByColab={tcMap}
          eipByEmpleado={eipMap}
          picdByEmpleado={picdMap}
          catalogoById={catalogoById}
          colabToCatalog={colabToCatalog}
          aspirantesByPuesto={aspirantesByPuesto}
          yaAsignadoIds={yaIds}
          concentracionMap={concentracionMap}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
