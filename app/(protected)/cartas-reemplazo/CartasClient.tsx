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
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start gap-2">
          {/* Avatar */}
          <div className="flex-shrink-0 mt-0.5">
            <EmpleadoAvatar idEmpleado={node.id_empleado} nombre={node.nombre_completo} size={34} rounded="full" />
          </div>

          {/* Name / position / ID */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <p className="font-bold text-gray-900 leading-snug text-[12.5px]">
                {talentoClave && <span className="text-amber-400 mr-0.5">⭐</span>}
                {nombre}
              </p>
              {concentracion && (
                <span className="text-orange-500 text-sm flex-shrink-0" title="Riesgo de concentración: sucesor en 2+ planes">⚠️</span>
              )}
            </div>

            {/* Position + critical dot */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[10px] text-gray-500 leading-tight truncate flex-1">{node.puesto ?? "—"}</p>
              {esCritico && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" title="Puesto crítico" />
              )}
            </div>

            {/* ID + Hire Status inline */}
            <div className="flex items-center gap-1.5 mt-1">
              {node.id_empleado && (
                <span className="text-[9.5px] text-gray-400">#{node.id_empleado}</span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none ${hb.cls}`}>{hb.label}</span>
            </div>
          </div>
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

// ── Hover tooltip ────────────────────────────────────────────────────────────

function HoverTooltip({ label, cls, children }: {
  label: React.ReactNode;
  cls: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-help ${cls}`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {label}
      </span>
      {show && (
        <div className="absolute left-0 top-full mt-1.5 z-[80] w-64 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl p-3 space-y-2.5 pointer-events-none">
          {children}
        </div>
      )}
    </span>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

const ZONA_STYLE: Record<string, string> = {
  Sobresaliente: "bg-purple-50 text-purple-700 border-purple-200",
  Desarrollo:    "bg-blue-50 text-blue-700 border-blue-200",
  Estabilidad:   "bg-green-50 text-green-700 border-green-200",
  "Revisión":    "bg-yellow-50 text-yellow-700 border-yellow-200",
  Inicio:        "bg-red-50 text-red-700 border-red-200",
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

  // Who has this person listed as their successor? (deduplicated by titular, most recent ciclo first)
  const seenTitulares = new Set<string>();
  const plansDondeEsSucesor = sucesores
    .filter(s => s.sucesor_id === node.id)
    .filter(s => {
      if (seenTitulares.has(s.id_empleado_titular)) return false;
      seenTitulares.add(s.id_empleado_titular);
      return true;
    })
    .map(s => ({
      titular: colabMap.get(s.id_empleado_titular),
      tipo: s.estado === "aprobado" ? "Validado" : "Propuesto",
    }))
    .filter(p => p.titular != null) as { titular: CartaNode; tipo: string }[];

  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[60]" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[460px] max-w-[96vw] bg-white shadow-2xl z-[70] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => setPhotoOpen(true)}
            className="flex-shrink-0 rounded-full overflow-hidden hover:ring-2 hover:ring-[#1a3a5c] transition-all mt-0.5"
            title="Ver foto"
          >
            <EmpleadoAvatar idEmpleado={node.id_empleado} nombre={node.nombre_completo} size={44} rounded="full" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-[13px] text-gray-900 leading-tight">{nombreCorto(node.nombre_completo)}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{node.puesto ?? "—"}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {[node.organización, node.area].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0">✕</button>
        </div>

        {/* Photo lightbox */}
        {photoOpen && (
          <div className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center" onClick={() => setPhotoOpen(false)}>
            <div className="relative" onClick={e => e.stopPropagation()}>
              <EmpleadoAvatar idEmpleado={node.id_empleado} nombre={node.nombre_completo} size={240} rounded="full" />
              <button onClick={() => setPhotoOpen(false)}
                className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-white text-gray-700 shadow-lg flex items-center justify-center text-sm font-bold hover:bg-gray-100">
                ✕
              </button>
            </div>
          </div>
        )}


        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status chips */}
          <div className="flex gap-2 flex-wrap">
            {cob === "negro" && plansDondeEsSucesor.length > 0 ? (
              <HoverTooltip label="⚫ Ya asignado" cls="bg-gray-100 text-gray-700 border border-gray-300 text-[10px] px-2 py-0.5 rounded-full font-semibold leading-none">
                <p className="font-semibold text-gray-300 uppercase tracking-wider text-[9px] mb-1">Designado sucesor de:</p>
                {plansDondeEsSucesor.map((p, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold leading-tight truncate">{p.titular.nombre_completo}</p>
                      <p className="text-gray-400 text-[10px] leading-tight truncate">{p.titular.puesto ?? "—"}</p>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 mt-0.5 ${
                      p.tipo === "Validado" ? "bg-green-700 text-green-100" : "bg-amber-700 text-amber-100"
                    }`}>{p.tipo}</span>
                  </div>
                ))}
              </HoverTooltip>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold leading-none ${
                cob === "verde"    ? "bg-green-50 text-green-700 border-green-200" :
                cob === "amarillo" ? "bg-amber-50 text-amber-700 border-amber-200" :
                cob === "negro"    ? "bg-gray-100 text-gray-700 border-gray-300" :
                "bg-red-50 text-red-700 border-red-200"
              }`}>
                {cob === "verde" ? "🟢 Cubierto" :
                 cob === "amarillo" ? "🟡 En desarrollo" :
                 cob === "negro" ? "⚫ Ya asignado" :
                 "🔴 En riesgo"}
              </span>
            )}
            {tc?.es_talento_clave && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold leading-none bg-amber-50 text-amber-700 border-amber-200 cursor-help"
                title={`Fuente: ${tc.fuente} · Ciclo ${tc.ciclo_año}`}>
                ⭐ Talento Clave
              </span>
            )}
            {cat?.es_critico && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold leading-none bg-orange-50 text-orange-700 border-orange-200 cursor-help"
                title="Puesto marcado como crítico en el catálogo">
                ⚠ Puesto Crítico
              </span>
            )}
            {conc >= 2 && plansDondeEsSucesor.length > 0 && (
              <HoverTooltip label={`⚠️ Concentración (${plansDondeEsSucesor.length} planes)`} cls="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] px-2 py-0.5 rounded-full font-semibold leading-none">
                <p className="font-semibold text-gray-300 uppercase tracking-wider text-[9px] mb-1">Sucesor en {plansDondeEsSucesor.length} planes:</p>
                {plansDondeEsSucesor.map((p, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold leading-tight truncate">{p.titular.nombre_completo}</p>
                      <p className="text-gray-400 text-[10px] leading-tight truncate">{p.titular.puesto ?? "—"}</p>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 mt-0.5 ${
                      p.tipo === "Validado" ? "bg-green-700 text-green-100" : "bg-amber-700 text-amber-100"
                    }`}>{p.tipo}</span>
                  </div>
                ))}
              </HoverTooltip>
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
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold leading-none ${ZONA_STYLE[eip.zona_evaluacion] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
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
              <p className="text-xs text-gray-400 italic">Sin sucesores identificados</p>
            ) : (
              <div className="space-y-2">
                {entries.map((e, i) => (
                  <DetailSucRow
                    key={i}
                    entry={e}
                    colabMap={colabMap}
                    titularCatId={catId}
                    picdByEmpleado={picdByEmpleado}
                  />
                ))}
              </div>
            )}
          </section>

          {/* PICD */}
          {picd && (picd.puesto_futuro_opcion1 || picd.puesto_futuro_opcion2) && (
            <section>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Puestos Futuros PICD · Ciclo {picd.ciclo_año}
              </h3>
              <div className="space-y-1">
                {[
                  { label: "Op. 1", texto: picd.puesto_futuro_opcion1, vinc: picd.puesto_futuro_id1 },
                  { label: "Op. 2", texto: picd.puesto_futuro_opcion2, vinc: picd.puesto_futuro_id2 },
                ].filter(o => o.texto).map((o, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg">
                    <span className="text-[9px] font-bold text-gray-400 w-8 flex-shrink-0">{o.label}</span>
                    <span className="flex-1 text-[11px] text-gray-700 leading-tight">{o.texto}</span>
                    {o.vinc && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full font-semibold flex-shrink-0 leading-none">Vinculado</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Links */}
          <section>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Accesos rápidos</h3>
            <div className="flex flex-wrap gap-1.5">
              <a href={`/carpeta/${node.id}`}
                className="text-[10px] px-2.5 py-1 bg-[#1a3a5c] text-white rounded-lg font-medium hover:bg-[#14304d] transition-colors leading-none">
                📁 Carpeta
              </a>
              <a href={`/plan-carrera/${node.id}`}
                className="text-[10px] px-2.5 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors leading-none">
                📐 Plano de Carrera
              </a>
              <a href={`/carpeta/${node.id}?tab=sucesion`}
                className="text-[10px] px-2.5 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors leading-none">
                🔄 Sucesión
              </a>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function DetailSucRow({ entry, colabMap, titularCatId, picdByEmpleado }: {
  entry: SucEntry;
  colabMap: Map<string, CartaNode>;
  titularCatId: string | null | undefined;
  picdByEmpleado: Map<string, CartaPicd>;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);

  const r = entry.readiness;
  const rShort = r ? (RSHORT[r] ?? r) : null;
  const rColor = r ? (RCOLOR_BADGE[r] ?? "bg-gray-100 text-gray-500") : null;

  const colab = entry.id ? colabMap.get(entry.id) : null;
  const displayName = entry.tipo === "externo" ? entry.nombre : nombreCorto(entry.nombre);

  // Match type: Bidireccional > Propuesto > Aspiración (engine rules)
  const sucPicd = entry.id ? picdByEmpleado.get(entry.id) : null;
  const isBidireccional = !!(titularCatId && sucPicd &&
    (sucPicd.puesto_futuro_id1 === titularCatId || sucPicd.puesto_futuro_id2 === titularCatId));

  const matchLabel = entry.tipo === "externo"    ? "Externo" :
                     entry.tipo === "aspiracion" ? "Aspiración" :
                     isBidireccional             ? "⇄ Bidireccional" :
                                                   "Propuesto";
  const matchCls   = entry.tipo === "externo"    ? "bg-gray-100 text-gray-500 border-gray-200" :
                     entry.tipo === "aspiracion" ? "bg-blue-50 text-blue-600 border-blue-200" :
                     isBidireccional             ? "bg-teal-50 text-teal-700 border-teal-200" :
                                                   "bg-amber-50 text-amber-700 border-amber-200";

  const hasCareerPlan = entry.tipo === "validado" || (entry.tipo === "borrador" && isBidireccional);

  return (
    <div className="p-2.5 bg-gray-50 rounded-xl space-y-1.5">
      {/* Photo lightbox */}
      {photoOpen && colab && (
        <div className="fixed inset-0 bg-black/80 z-[90] flex items-center justify-center" onClick={() => setPhotoOpen(false)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <EmpleadoAvatar idEmpleado={colab.id_empleado} nombre={colab.nombre_completo} size={200} rounded="full" />
            <button onClick={() => setPhotoOpen(false)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-white text-gray-700 shadow-lg flex items-center justify-center text-sm font-bold hover:bg-gray-100">✕</button>
          </div>
        </div>
      )}

      {/* Name + avatar row */}
      <div className="flex items-center gap-2">
        {entry.tipo !== "externo" && (
          <button
            onClick={e => { e.stopPropagation(); if (colab) setPhotoOpen(true); }}
            className="flex-shrink-0 rounded-full overflow-hidden hover:ring-2 hover:ring-[#1a3a5c] transition-all"
            title="Ver foto"
          >
            <EmpleadoAvatar idEmpleado={colab?.id_empleado ?? null} nombre={entry.nombre} size={28} rounded="full" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-[11.5px] font-semibold truncate leading-tight ${
            entry.tipo === "externo"    ? "italic text-gray-500" :
            entry.tipo === "aspiracion" ? "text-gray-600" : "text-gray-800"
          }`}>{displayName}</p>
          {colab?.puesto && (
            <p className="text-[9.5px] text-gray-400 truncate leading-tight">{colab.puesto}</p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none ${matchCls}`}>
            {matchLabel}
          </span>
          {rShort && entry.tipo !== "aspiracion" && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${rColor}`}>{rShort}</span>
          )}
        </div>
      </div>

      {/* Quick links */}
      {entry.id && (
        <div className="flex gap-1 pl-9">
          <a href={`/carpeta/${entry.id}`} onClick={e => e.stopPropagation()}
            className="text-[9px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500 font-medium hover:bg-gray-100 transition-colors leading-none">
            📁 Carpeta
          </a>
          <a href={`/plan-carrera/${entry.id}`} onClick={e => e.stopPropagation()}
            className={`text-[9px] px-1.5 py-0.5 rounded border font-medium transition-colors leading-none ${
              hasCareerPlan
                ? "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                : "bg-white border-dashed border-gray-300 text-gray-400 hover:bg-gray-50"
            }`}>
            {hasCareerPlan ? "📐 Plano de Carrera" : "＋ Crear Plano"}
          </a>
        </div>
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
