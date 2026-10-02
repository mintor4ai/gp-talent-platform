"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import EmpleadoAvatar from "@/components/ui/EmpleadoAvatar";
import type {
  CartaNode, CartaEip, CartaTalentoClave, CartaSucesor, CartaPicd, CartaCatalogoPuesto,
} from "./types";
import { validateMatch, discardMatch } from "./actions";

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

// ── Name shortener: hasta 2 nombres + primer apellido ────────────────────────
// Format: nombre1 [nombre2] apellido1 [DE [LA]] apellido2
// e.g. KARLA VERONICA VARGAS BARBOSA → Karla Veronica Vargas
//      ARANTXA ITZEL ZEPEDA DE LEON  → Arantxa Itzel Zepeda

const NAME_CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von']);

function nombreCorto(nombre: string): string {
  const toTitle = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const raw = nombre.trim().split(/\s+/);
  if (raw.length <= 3) return raw.map(toTitle).join(' ');

  // Find segundo apellido: last word, then consume any connectors immediately before it
  let segundoStart = raw.length - 1;
  while (segundoStart > 1 && NAME_CONNECTORS.has(raw[segundoStart - 1].toLowerCase())) {
    segundoStart--;
  }

  // primer apellido: word just before segundo apellido, skipping stray connectors
  let primerIdx = segundoStart - 1;
  while (primerIdx > 0 && NAME_CONNECTORS.has(raw[primerIdx].toLowerCase())) primerIdx--;

  // first names: everything before primer apellido, capped at 2
  const names = raw.slice(0, primerIdx).slice(0, 2);
  return [...names, raw[primerIdx]].map(toTitle).join(' ');
}

// ── Cobertura ─────────────────────────────────────────────────────────────────

type Cob = "verde" | "amarillo" | "rojo" | "negro";

// plan_sucesion.id_empleado_titular = colaboradores.id (UUID)
// verde   = ≥1 sucesor (no descartado) con readiness inmediato/mediano AND motor match validated
// amarillo= tiene sucesores pero sin match validado activo
// rojo    = sin sucesor o todos descartados/externos
// negro   = this person is already assigned as sucesor in another plan (yaAsignado)
// coveredByValidatedMatch: titulares con ≥1 sucesor validado + readiness ok
// validatedMatchMap + titularCatId: used to gate amarillo — only show yellow if at
// least one sucesor has an active validated match (same gate as buildEntries display),
// so the border always matches what is actually shown on the card.
function getCob(
  colabUuid: string,
  isYaAsignado: boolean,
  suc: CartaSucesor[],
  coveredByValidatedMatch: Set<string>,
  validatedMatchMap: Map<string, number>,
  titularCatId: string | null | undefined,
  validatedMatchesByPuesto: Map<string, { id: string; nombre: string }[]>,
  pendingCatIds: Set<string>
): Cob {
  const mine = suc.filter(s => s.id_empleado_titular === colabUuid);
  // Coverage status takes priority over yaAsignado — the badge already shows that info.
  // Border color reflects how well THIS position is covered, not where the person is assigned.
  if (coveredByValidatedMatch.has(colabUuid)) return "verde";
  // Amarillo: validated motor match, manual plan entry, or pending motor match for the position
  const hasValidatedSuccessor = titularCatId
    ? mine.some(s => s.sucesor_id !== null && validatedMatchMap.has(`${s.sucesor_id}:${titularCatId}`))
      || (validatedMatchesByPuesto.get(titularCatId) ?? []).length > 0
    : false;
  const hasAnyPlanEntry = mine.some(s => s.sucesor_id !== null);
  const hasPendingMatch = titularCatId ? pendingCatIds.has(titularCatId) : false;
  if (!hasValidatedSuccessor && !hasAnyPlanEntry && !hasPendingMatch) {
    return isYaAsignado ? "negro" : "rojo";
  }
  return "amarillo";
}

const COB_LEFT: Record<Cob, string> = {
  verde:    "border-l-green-500",
  amarillo: "border-l-amber-400",
  rojo:     "border-l-red-500",
  negro:    "border-l-gray-700",
};

const READINESS_PRIORITY: Record<string, number> = {
  listo_ahora: 0, corto: 0, uno_dos_anios: 1, mediano: 1, tres_mas_anios: 2, largo: 2,
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
  tipo: "validado" | "borrador" | "externo" | "aspiracion" | "descartado";
  readiness: string | null;
  id: string | null; // colaboradores.id for carpeta link
  ciclo: number | null;
  motorValidated: boolean; // true if has a validated sucesion_match row
  isManual: boolean; // plan_sucesion entry with no motor match (validated or pending)
  pendingMatchCiclo: number | null; // non-null if there is a pending motor match to validate
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
        ${!esCritico ? "opacity-60 hover:opacity-90" : ""}
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
    entry.pendingMatchCiclo !== null
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-blue-50 text-blue-600 border border-blue-200">Match:{String(entry.pendingMatchCiclo).slice(-2)}</span>
    : entry.isManual && entry.tipo === "validado"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-gray-100 text-gray-500 border border-gray-300">CH</span>
    : entry.isManual && entry.tipo === "borrador"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-amber-50 text-amber-600 border border-amber-300">Pend.&apos;{entry.ciclo ? String(entry.ciclo).slice(-2) : "?"}</span>
    : entry.tipo === "validado" && rShort
      ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none ${rColor}`}>{rShort}</span>
    : entry.tipo === "borrador"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-amber-50 text-amber-600 border border-amber-300">{rShort ?? "Pend."}</span>
    : entry.tipo === "externo"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-gray-100 text-gray-500">Ext.</span>
    : entry.tipo === "descartado"
      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none bg-red-50 text-red-500 border border-red-200 line-through">✗</span>
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
  planCarreraIds, concentracionMap, validatedMatchMap, discardedByCatId, coveredByValidatedMatch,
  validatedMatchesByPuesto, bestReadinessBySuccesor, pendingMatchMap, pendingMatchesByPuesto,
  pendingCatIds, sucByPositionAndSuc, pendingMatchByPerson, onClose,
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
  planCarreraIds: Set<string>;
  concentracionMap: Map<string, number>;
  validatedMatchMap: Map<string, number>;
  discardedByCatId: Map<string, { id: string; nombre: string; ciclo: number }[]>;
  coveredByValidatedMatch: Set<string>;
  validatedMatchesByPuesto: Map<string, { id: string; nombre: string }[]>;
  bestReadinessBySuccesor: Map<string, string>;
  pendingMatchMap: Map<string, number>;
  pendingMatchesByPuesto: Map<string, { id: string; nombre: string; ciclo: number }[]>;
  pendingCatIds: Set<string>;
  sucByPositionAndSuc: Map<string, CartaSucesor>;
  pendingMatchByPerson: Map<string, number>;
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
  const cob        = getCob(node.id, isYa, sucesores, coveredByValidatedMatch, validatedMatchMap, catId, validatedMatchesByPuesto, pendingCatIds);
  const mySuc      = sucesores.filter(s => s.id_empleado_titular === node.id && s.sucesor_id !== node.id);
  const aspirantes = catId ? (aspirantesByPuesto.get(catId) ?? []).filter(a => a.id !== node.id) : [];
  const sucIds     = new Set(mySuc.filter(s => s.sucesor_id).map(s => s.sucesor_id!));
  const discartados = catId ? (discardedByCatId.get(catId) ?? []).filter(d => d.id !== node.id) : [];
  const motorMatches = catId
    ? (validatedMatchesByPuesto.get(catId) ?? [])
      .filter(m => m.id !== node.id && !sucIds.has(m.id) && !aspirantes.some(a => a.id === m.id))
      .map(m => ({ id: m.id, nombre: m.nombre, readiness: bestReadinessBySuccesor.get(m.id) ?? null, fromMotor: true as const }))
    : [];
  const allAspirantes = [...aspirantes.map(a => ({ ...a, readiness: bestReadinessBySuccesor.get(a.id) ?? null })), ...motorMatches];
  const pendingOnlyMatchesForPanel = catId
    ? (pendingMatchesByPuesto.get(catId) ?? []).filter(m => m.id !== node.id)
    : [];
  const entries    = buildEntries(mySuc, allAspirantes.filter(a => !sucIds.has(a.id)), discartados, validatedMatchMap, catId, pendingMatchMap, pendingOnlyMatchesForPanel, sucByPositionAndSuc, pendingMatchByPerson);
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
                    planCarreraIds={planCarreraIds}
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

function DetailSucRow({ entry, colabMap, titularCatId, picdByEmpleado, planCarreraIds }: {
  entry: SucEntry;
  colabMap: Map<string, CartaNode>;
  titularCatId: string | null | undefined;
  picdByEmpleado: Map<string, CartaPicd>;
  planCarreraIds: Set<string>;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const r = entry.readiness;
  const rShort = r ? (RSHORT[r] ?? r) : null;
  const rColor = r ? (RCOLOR_BADGE[r] ?? "bg-gray-100 text-gray-500") : null;

  const colab = entry.id ? colabMap.get(entry.id) : null;
  const displayName = entry.tipo === "externo" ? entry.nombre : nombreCorto(entry.nombre);

  // Match type: Bidireccional > Propuesto > Aspiración (engine rules)
  const sucPicd = entry.id ? picdByEmpleado.get(entry.id) : null;
  const isBidireccional = !!(titularCatId && sucPicd &&
    (sucPicd.puesto_futuro_id1 === titularCatId || sucPicd.puesto_futuro_id2 === titularCatId));

  const matchLabel = entry.tipo === "externo"     ? "Externo" :
                     entry.tipo === "aspiracion"  ? "Aspiración" :
                     entry.tipo === "descartado"  ? "Descartado" :
                     isBidireccional              ? "⇄ Bidireccional" :
                                                    "Propuesto";
  const matchCls   = entry.tipo === "externo"     ? "bg-gray-100 text-gray-500 border-gray-200" :
                     entry.tipo === "aspiracion"  ? "bg-blue-50 text-blue-600 border-blue-200" :
                     entry.tipo === "descartado"  ? "bg-red-50 text-red-500 border-red-200" :
                     isBidireccional              ? "bg-teal-50 text-teal-700 border-teal-200" :
                                                    "bg-amber-50 text-amber-700 border-amber-200";

  const hasCareerPlan = !!(entry.id && planCarreraIds.has(entry.id));

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
        <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end items-center">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none ${matchCls}`}>
            {matchLabel}
          </span>
          {rShort && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${rColor}`}>{rShort}</span>
          )}
          {entry.ciclo && entry.tipo === "descartado" && (
            <span className="text-[8.5px] px-1.5 py-0.5 rounded font-bold leading-none tracking-wide bg-red-100 text-red-600 border border-red-200">
              ✗{String(entry.ciclo).slice(-2)}
            </span>
          )}
          {entry.ciclo && (entry.motorValidated || (entry.isManual && entry.tipo === "validado")) && entry.tipo !== "descartado" && (
            <span className="text-[8.5px] px-1.5 py-0.5 rounded font-bold leading-none tracking-wide bg-green-100 text-green-700 border border-green-300">
              ✓{String(entry.ciclo).slice(-2)}
            </span>
          )}
          {entry.isManual && entry.tipo === "validado" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none bg-gray-100 text-gray-500 border-gray-300">
              CH
            </span>
          )}
          {entry.isManual && entry.tipo === "borrador" && entry.ciclo && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none bg-amber-50 text-amber-600 border-amber-300">
              Pend.&nbsp;&apos;{String(entry.ciclo).slice(-2)}
            </span>
          )}
          {entry.pendingMatchCiclo !== null && (
            <>
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none bg-blue-50 text-blue-600 border-blue-200">
                Match:{String(entry.pendingMatchCiclo).slice(-2)}
              </span>
              <button
                disabled={pending}
                onClick={async e => {
                  e.stopPropagation();
                  if (!entry.id || !titularCatId || entry.pendingMatchCiclo === null) return;
                  setPending(true);
                  await validateMatch(entry.id, titularCatId, entry.pendingMatchCiclo);
                  router.refresh();
                }}
                className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-300 font-bold leading-none hover:bg-green-200 transition-colors disabled:opacity-50"
                title="Validar match"
              >✓</button>
              <button
                disabled={pending}
                onClick={async e => {
                  e.stopPropagation();
                  if (!entry.id || !titularCatId || entry.pendingMatchCiclo === null) return;
                  setPending(true);
                  await discardMatch(entry.id, titularCatId, entry.pendingMatchCiclo);
                  router.refresh();
                }}
                className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200 font-bold leading-none hover:bg-red-200 transition-colors disabled:opacity-50"
                title="Descartar match"
              >✗</button>
            </>
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

// validatedMatchMap key: "colabId:catId" → ciclo_año of the validated match
// pendingMatchMap key: "colabId:catId" → ciclo_año of the pending match
function buildEntries(
  mySuc: CartaSucesor[],
  aspirantesFiltrados: { nombre: string; id: string; readiness?: string | null; fromMotor?: boolean }[],
  discartadosFiltrados: { id: string; nombre: string; ciclo: number }[],
  validatedMatchMap: Map<string, number>,
  titularCatId: string | null | undefined,
  pendingMatchMap: Map<string, number>,
  pendingOnlyMatches: { id: string; nombre: string; ciclo: number }[],
  sucByPositionAndSuc: Map<string, CartaSucesor>,
  pendingMatchByPerson: Map<string, number>
): SucEntry[] {
  // Deduplicate by sucesor_id: prefer aprobado over borrador regardless of ciclo_año,
  // then prefer more recent ciclo_año. This prevents a 2026 borrador from overriding
  // a 2025 aprobado.
  const sorted = [...mySuc].sort((a, b) => {
    const estadoScore = (s: CartaSucesor) => s.estado === "aprobado" ? 0 : 1;
    const esDiff = estadoScore(a) - estadoScore(b);
    if (esDiff !== 0) return esDiff;
    return (b.ciclo_año ?? 0) - (a.ciclo_año ?? 0);
  });
  const seen = new Set<string>();
  const dedupedSuc = sorted.filter(s => {
    const key = s.sucesor_id ?? `ext:${s.sucesor_nombre.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Most recent discarded ciclo per person — used to suppress older pending matches
  const discardedCicloByPerson = new Map<string, number>();
  for (const d of discartadosFiltrados) {
    const existing = discardedCicloByPerson.get(d.id);
    if (existing === undefined || d.ciclo > existing) discardedCicloByPerson.set(d.id, d.ciclo);
  }

  const entries: SucEntry[] = [];
  for (const s of dedupedSuc) {
    const tipo: SucEntry["tipo"] =
      s.sucesor_id === null ? "externo" :
      s.estado === "aprobado" ? "validado" : "borrador";

    // For internal successors, check validated and pending motor matches
    let motorValidated = false;
    let matchCiclo: number | null = s.ciclo_año ?? null;
    let pendingMatchCiclo: number | null = null;
    // Use the titular's catId when available; fall back to the plan's own puesto_catalogo_id
    // Use the titular's catId when available; fall back to the plan's own puesto_catalogo_id
    const effectiveCatId = titularCatId ?? s.puesto_catalogo_id;
    if (s.sucesor_id && effectiveCatId) {
      const matchKey = `${s.sucesor_id}:${effectiveCatId}`;
      const mc = validatedMatchMap.get(matchKey);
      if (mc !== undefined) {
        motorValidated = true;
        matchCiclo = mc;
      } else {
        const pmc = pendingMatchMap.get(matchKey);
        if (pmc !== undefined) pendingMatchCiclo = pmc;
      }
    }
    // Last-resort fallback: if no catId is available, check if this person has any pending match
    if (s.sucesor_id && !motorValidated && pendingMatchCiclo === null && !effectiveCatId) {
      const pmc = pendingMatchByPerson.get(s.sucesor_id);
      if (pmc !== undefined) pendingMatchCiclo = pmc;
    }
    // If the pending match is from an older cycle than a discarded one, suppress it
    if (pendingMatchCiclo !== null && s.sucesor_id) {
      const dCiclo = discardedCicloByPerson.get(s.sucesor_id);
      if (dCiclo !== undefined && dCiclo >= pendingMatchCiclo) pendingMatchCiclo = null;
    }
    const isManual = s.sucesor_id !== null && !motorValidated && pendingMatchCiclo === null;

    entries.push({
      nombre: s.sucesor_nombre,
      tipo,
      readiness: s.readiness ?? s.tiempo_estimado ?? null,
      id: s.sucesor_id,
      ciclo: matchCiclo,
      motorValidated,
      isManual,
      pendingMatchCiclo,
    });
  }

  // Aspiraciones: only include if they have a validated motor match for the titular's catId
  for (const a of aspirantesFiltrados) {
    if (!titularCatId) continue;
    const matchKey = `${a.id}:${titularCatId}`;
    const mc = validatedMatchMap.get(matchKey);
    if (mc === undefined) continue; // no validated match → skip
    // fromMotor = validated motor match for the position (no plan_sucesion for current titular) → show as "validado"
    const tipoAsp: SucEntry["tipo"] = a.fromMotor ? "validado" : "aspiracion";
    entries.push({ nombre: a.nombre, tipo: tipoAsp, readiness: a.readiness ?? null, id: a.id, ciclo: mc, motorValidated: true, isManual: false, pendingMatchCiclo: null });
  }

  // Pending-only motor matches: in pendingMatchMap for this catId but not already in a plan_sucesion row
  for (const p of pendingOnlyMatches) {
    // If this person is already in entries as isManual (plan without a detected motor match),
    // upgrade them: the pending match is now known, so clear isManual and set pendingMatchCiclo.
    const manualIdx = entries.findIndex(e => e.id === p.id && e.isManual);
    if (manualIdx >= 0) {
      entries[manualIdx] = { ...entries[manualIdx], isManual: false, pendingMatchCiclo: p.ciclo };
      continue;
    }
    if (entries.some(e => e.id === p.id)) continue; // already added via mySuc (non-manual)
    // If a discarded entry for this person is from the same or a newer cycle, don't show the pending
    const dCiclo = discardedCicloByPerson.get(p.id);
    if (dCiclo !== undefined && dCiclo >= p.ciclo) continue;
    // If there's a historical plan_sucesion for this sucesor+position (from any prior titular),
    // show as "Propuesto" (borrador/validado) instead of "Aspiración".
    const histPlan = titularCatId ? sucByPositionAndSuc.get(`${p.id}:${titularCatId}`) : undefined;
    if (histPlan) {
      const tipo: SucEntry["tipo"] = histPlan.estado === "aprobado" ? "validado" : "borrador";
      const readiness = histPlan.readiness ?? histPlan.tiempo_estimado ?? null;
      entries.push({ nombre: p.nombre, tipo, readiness, id: p.id, ciclo: p.ciclo, motorValidated: false, isManual: false, pendingMatchCiclo: p.ciclo });
    } else {
      entries.push({ nombre: p.nombre, tipo: "aspiracion", readiness: null, id: p.id, ciclo: null, motorValidated: false, isManual: false, pendingMatchCiclo: p.ciclo });
    }
  }

  // Descartados: motor matches that were discarded — show only if person has no other entry yet
  // Plan entries (mySuc) take display precedence; the plan already shows their match status (Manual/pending chip).
  const alreadyShown = new Set(entries.filter(e => e.tipo !== "descartado").map(e => e.id).filter(Boolean) as string[]);
  for (const d of discartadosFiltrados) {
    if (alreadyShown.has(d.id)) continue; // plan or validated entry already covers this person
    if (entries.some(e => e.id === d.id && e.ciclo === d.ciclo)) continue; // exact duplicate
    entries.push({ nombre: d.nombre, tipo: "descartado", readiness: null, id: d.id, ciclo: d.ciclo, motorValidated: false, isManual: false, pendingMatchCiclo: null });
  }

  // Sort hierarchy:
  // T1 Manual validado (deliberate CH decision) → T2 Motor validado → T3 Pending action
  // → T4 Aspiraciones → T5 Descartados → T6 Externos
  // Within each tier: newer ciclo first
  function entryTier(e: SucEntry): number {
    if (e.tipo === "externo")    return 6;
    if (e.tipo === "descartado") return 5;
    if (e.tipo === "aspiracion") return 4;
    if (e.pendingMatchCiclo !== null || (e.isManual && e.tipo === "borrador")) return 3;
    if (e.motorValidated)        return 2;
    if (e.isManual)              return 1; // isManual + tipo=validado
    return 2; // fallback: treat other validado as motor tier
  }
  return entries.sort((a, b) => {
    const td = entryTier(a) - entryTier(b);
    if (td !== 0) return td;
    return (b.ciclo ?? 0) - (a.ciclo ?? 0); // newer cycle first within same tier
  });
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
  rootId, childrenMap, colabMap, sucesores, yaAsignadoIds, coveredByValidatedMatch,
  validatedMatchMap, colabToCatalog, validatedMatchesByPuesto, pendingCatIds,
}: {
  rootId: string;
  childrenMap: Map<string, string[]>;
  colabMap: Map<string, CartaNode>;
  sucesores: CartaSucesor[];
  yaAsignadoIds: Set<string>;
  coveredByValidatedMatch: Set<string>;
  validatedMatchMap: Map<string, number>;
  colabToCatalog: Map<string, string>;
  validatedMatchesByPuesto: Map<string, { id: string; nombre: string }[]>;
  pendingCatIds: Set<string>;
}) {
  const directKids = childrenMap.get(rootId) ?? [];
  const counts = { verde: 0, amarillo: 0, rojo: 0, negro: 0 };
  for (const id of directKids) {
    const n = colabMap.get(id);
    if (n) {
      const catId = n.puesto_catalogo_id ?? colabToCatalog.get(n.id);
      counts[getCob(n.id, yaAsignadoIds.has(n.id), sucesores, coveredByValidatedMatch, validatedMatchMap, catId, validatedMatchesByPuesto, pendingCatIds)]++;
    }
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
    <div className="rounded-lg border border-gray-100 bg-white px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
      {/* Card border colors */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mr-1">Borde</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 flex-shrink-0" />
          <span className="font-semibold text-green-700">Cubierto</span>
          <span className="text-gray-400">match validado + Inm./Med.</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 flex-shrink-0" />
          <span className="font-semibold text-amber-700">En desarrollo</span>
          <span className="text-gray-400">sucesor sin match validado</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 flex-shrink-0" />
          <span className="font-semibold text-red-700">En riesgo</span>
          <span className="text-gray-400">sin sucesor interno</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-600 flex-shrink-0" />
          <span className="font-semibold text-gray-600">Ya asignado</span>
          <span className="text-gray-400">es sucesor en otro plan</span>
        </span>
      </div>

      <div className="w-px bg-gray-200 self-stretch hidden sm:block" />

      {/* Successor chips */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mr-1">Chips</span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-green-100 text-green-700 border border-green-300">✓25</span>
          <span className="text-gray-500">Match validado</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded border font-semibold bg-amber-50 text-amber-700 border-amber-300">Propuesto</span>
          <span className="text-gray-500">Plan sin validar</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded border font-semibold bg-blue-50 text-blue-600 border-blue-200">Aspiración</span>
          <span className="text-gray-500">PICD vinculado</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-red-100 text-red-600 border border-red-200">✗26</span>
          <span className="text-gray-500">Match descartado</span>
        </span>
        <span className="inline-flex items-center gap-1 text-gray-400">
          <span>⭐</span><span>Talento Clave</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
          <span className="text-orange-700 font-medium">Puesto Crítico</span>
        </span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CartasClient({
  colabs, eipLatest, talentoClaveLatest, sucesores, picdLatest,
  catalogo, yaAsignadoIds: yaArr, planCarreraIds: pcArr, validatedMatches, discardedMatches, pendingMatches, rol, jefeColabId,
}: {
  colabs: CartaNode[];
  eipLatest: CartaEip[];
  talentoClaveLatest: CartaTalentoClave[];
  sucesores: CartaSucesor[];
  picdLatest: CartaPicd[];
  catalogo: CartaCatalogoPuesto[];
  yaAsignadoIds: string[];
  planCarreraIds: string[];
  validatedMatches: { colaborador_id: string; puesto_catalogo_id: string; ciclo_año: number }[];
  discardedMatches: { colaborador_id: string; puesto_catalogo_id: string; ciclo_año: number }[];
  pendingMatches: { colaborador_id: string; puesto_catalogo_id: string; ciclo_año: number }[];
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
  const yaIds           = useMemo(() => new Set(yaArr), [yaArr]);
  const planCarreraSet  = useMemo(() => new Set(pcArr), [pcArr]);
  // validatedMatchMap: "colabId:catId" → ciclo_año (prefer most recent if duplicates)
  const validatedMatchMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const vm of validatedMatches) {
      const key = `${vm.colaborador_id}:${vm.puesto_catalogo_id}`;
      const existing = m.get(key);
      if (existing === undefined || vm.ciclo_año > existing) m.set(key, vm.ciclo_año);
    }
    return m;
  }, [validatedMatches]);

  // discardedByCatId: catId → [{id, nombre, ciclo}] — discarded motor matches by catalog position
  const discardedByCatId = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; ciclo: number }[]>();
    for (const dm of discardedMatches) {
      const { colaborador_id, puesto_catalogo_id, ciclo_año } = dm;
      if (!colaborador_id || !puesto_catalogo_id) continue;
      const colab = colabMap.get(colaborador_id);
      if (!colab) continue;
      if (!m.has(puesto_catalogo_id)) m.set(puesto_catalogo_id, []);
      const list = m.get(puesto_catalogo_id)!;
      if (!list.find(e => e.id === colaborador_id && e.ciclo === ciclo_año)) {
        list.push({ id: colaborador_id, nombre: colab.nombre_completo, ciclo: ciclo_año });
      }
    }
    return m;
  }, [discardedMatches, colabMap]);

  // pendingMatchMap: "colabId:catId" → ciclo_año (unvalidated, non-discarded motor matches)
  const pendingMatchMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const pm of pendingMatches) {
      const key = `${pm.colaborador_id}:${pm.puesto_catalogo_id}`;
      const existing = m.get(key);
      if (existing === undefined || pm.ciclo_año > existing) m.set(key, pm.ciclo_año);
    }
    return m;
  }, [pendingMatches]);

  // pendingMatchByPerson: colabId → ciclo_año — most recent pending match for a person, regardless of position
  // Used as a fallback when the titular has no catId mapping.
  const pendingMatchByPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const pm of pendingMatches) {
      if (!pm.colaborador_id) continue;
      const existing = m.get(pm.colaborador_id);
      if (existing === undefined || pm.ciclo_año > existing) m.set(pm.colaborador_id, pm.ciclo_año);
    }
    return m;
  }, [pendingMatches]);

  // pendingMatchesByPuesto: catId → [{id, nombre, ciclo}] — pending motor matches by catalog position
  const pendingMatchesByPuesto = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; ciclo: number }[]>();
    const seen = new Map<string, Set<string>>();
    for (const pm of pendingMatches) {
      const { colaborador_id, puesto_catalogo_id, ciclo_año } = pm;
      if (!colaborador_id || !puesto_catalogo_id) continue;
      const colab = colabMap.get(colaborador_id);
      if (!colab) continue;
      if (!m.has(puesto_catalogo_id)) { m.set(puesto_catalogo_id, []); seen.set(puesto_catalogo_id, new Set()); }
      if (seen.get(puesto_catalogo_id)!.has(colaborador_id)) continue;
      seen.get(puesto_catalogo_id)!.add(colaborador_id);
      m.get(puesto_catalogo_id)!.push({ id: colaborador_id, nombre: colab.nombre_completo, ciclo: ciclo_año });
    }
    return m;
  }, [pendingMatches, colabMap]);

  // pendingCatIds: set of catIds that have ≥1 pending motor match
  const pendingCatIds = useMemo(() => new Set(pendingMatchesByPuesto.keys()), [pendingMatchesByPuesto]);

  // validatedMatchesByPuesto: catId → [{id, nombre}] — motor match successors by position (position-based, survives titular changes)
  const validatedMatchesByPuesto = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string }[]>();
    const seen = new Map<string, Set<string>>();
    for (const vm of validatedMatches) {
      const { colaborador_id, puesto_catalogo_id } = vm;
      if (!colaborador_id || !puesto_catalogo_id) continue;
      const colab = colabMap.get(colaborador_id);
      if (!colab) continue;
      if (!m.has(puesto_catalogo_id)) { m.set(puesto_catalogo_id, []); seen.set(puesto_catalogo_id, new Set()); }
      if (seen.get(puesto_catalogo_id)!.has(colaborador_id)) continue;
      seen.get(puesto_catalogo_id)!.add(colaborador_id);
      m.get(puesto_catalogo_id)!.push({ id: colaborador_id, nombre: colab.nombre_completo });
    }
    return m;
  }, [validatedMatches, colabMap]);

  // bestReadinessBySuccesor: sucesorId → best readiness across ALL plan_sucesion rows (not filtered by titular)
  // Used for DISPLAY of motor match successors where there is no plan for the current titular.
  const bestReadinessBySuccesor = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sucesores) {
      if (!s.sucesor_id || s.estado === "descartado") continue;
      const r = s.readiness ?? s.tiempo_estimado;
      if (!r) continue;
      const current = m.get(s.sucesor_id);
      const rP = READINESS_PRIORITY[r] ?? 99;
      const cP = current !== undefined ? (READINESS_PRIORITY[current] ?? 99) : 100;
      if (rP < cP) m.set(s.sucesor_id, r);
    }
    return m;
  }, [sucesores]);

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

  // readinessBySucAndTitular: "sucId:titularId" → best readiness scoped to that specific plan pair.
  // Used for verde gate in coveredByValidatedMatch Source 2. Keying by titular UUID (not catId)
  // prevents historical plans for the same position from bleeding into the current titular's gate.
  const readinessBySucAndTitular = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sucesores) {
      if (!s.sucesor_id || s.estado === "descartado") continue;
      const r = s.readiness ?? s.tiempo_estimado;
      if (!r) continue;
      const key = `${s.sucesor_id}:${s.id_empleado_titular}`;
      const current = m.get(key);
      const rP = READINESS_PRIORITY[r] ?? 99;
      const cP = current !== undefined ? (READINESS_PRIORITY[current] ?? 99) : 100;
      if (rP < cP) m.set(key, r);
    }
    return m;
  }, [sucesores]);

  // currentHolderByCatId: catId → colaboradores.id of the person currently holding that catalog position
  const currentHolderByCatId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of colabs) {
      const catId = c.puesto_catalogo_id ?? colabToCatalog.get(c.id);
      if (catId) m.set(catId, c.id);
    }
    return m;
  }, [colabs, colabToCatalog]);

  // coveredByValidatedMatch: titular UUIDs where ≥1 sucesor has a validated match + good readiness.
  // Two sources: (1) plan_sucesion for the current titular, (2) position-based motor matches reusing
  // readiness from any historical plan (survives titular role changes).
  const coveredByValidatedMatch = useMemo(() => {
    const covered = new Set<string>();
    // Source 1: plan_sucesion for the current titular
    for (const s of sucesores) {
      if (s.estado === "descartado" || !s.sucesor_id) continue;
      const r = s.readiness ?? s.tiempo_estimado;
      const readOk = r === "listo_ahora" || r === "uno_dos_anios" || r === "corto" || r === "mediano";
      if (!readOk) continue;
      const titularNode = colabMap.get(s.id_empleado_titular);
      const catId = titularNode?.puesto_catalogo_id ?? colabToCatalog.get(s.id_empleado_titular);
      if (!catId) continue;
      if (validatedMatchMap.has(`${s.sucesor_id}:${catId}`)) covered.add(s.id_empleado_titular);
    }
    // Source 2: position-based motor matches — covers titulares whose predecessor had a plan.
    // Readiness is looked up by (sucesor, currentHolder) so only the current titular's plan counts.
    for (const [catId, matches] of validatedMatchesByPuesto) {
      const currentHolder = currentHolderByCatId.get(catId);
      if (!currentHolder || covered.has(currentHolder)) continue;
      for (const match of matches) {
        const r = readinessBySucAndTitular.get(`${match.id}:${currentHolder}`);
        if (!r) continue;
        const readOk = r === "listo_ahora" || r === "uno_dos_anios" || r === "corto" || r === "mediano";
        if (readOk) { covered.add(currentHolder); break; }
      }
    }
    return covered;
  }, [sucesores, validatedMatchMap, colabMap, colabToCatalog, validatedMatchesByPuesto, currentHolderByCatId, readinessBySucAndTitular]);

  // Historical cross-titular plans: "sucId:catId" → best CartaSucesor (aprobado > otros, más reciente)
  // Used to show "Propuesto" instead of "Aspiración" for pending motor matches that have a prior plan
  // from a different titular of the same position.
  const sucByPositionAndSuc = useMemo(() => {
    const m = new Map<string, CartaSucesor>();
    for (const s of sucesores) {
      if (!s.sucesor_id || !s.puesto_catalogo_id) continue;
      const key = `${s.sucesor_id}:${s.puesto_catalogo_id}`;
      const existing = m.get(key);
      if (!existing) { m.set(key, s); continue; }
      const betterEstado = s.estado === "aprobado" && existing.estado !== "aprobado";
      const sameEstado   = s.estado === existing.estado;
      if (betterEstado || (sameEstado && (s.ciclo_año ?? 0) > (existing.ciclo_año ?? 0))) {
        m.set(key, s);
      }
    }
    return m;
  }, [sucesores]);

  // Aspirantes: puestoCatalogId → [{nombre, id}] — keyed by UUID
  // Deduplicate: a person with the same catId in both PICD slots must appear only once
  const aspirantesByPuesto = useMemo(() => {
    const uuidToColab = new Map<string, CartaNode>();
    for (const c of colabs) uuidToColab.set(c.id, c);

    const m = new Map<string, { nombre: string; id: string }[]>();
    const seenPerCat = new Map<string, Set<string>>();
    for (const p of picdLatest) {
      const colab = uuidToColab.get(p.id_empleado);
      if (!colab) continue;
      for (const catId of [p.puesto_futuro_id1, p.puesto_futuro_id2]) {
        if (!catId) continue;
        if (!m.has(catId)) { m.set(catId, []); seenPerCat.set(catId, new Set()); }
        if (seenPerCat.get(catId)!.has(colab.id)) continue;
        seenPerCat.get(catId)!.add(colab.id);
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
          <ExecSummary rootId={rootId} childrenMap={childrenMap} colabMap={colabMap} sucesores={sucesores} yaAsignadoIds={yaIds} coveredByValidatedMatch={coveredByValidatedMatch} validatedMatchMap={validatedMatchMap} colabToCatalog={colabToCatalog} validatedMatchesByPuesto={validatedMatchesByPuesto} pendingCatIds={pendingCatIds} />
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
              const catId     = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
              const cob       = getCob(node.id, isYa, sucesores, coveredByValidatedMatch, validatedMatchMap, catId, validatedMatchesByPuesto, pendingCatIds);
              const tc        = tcMap.get(node.id);
              const cat       = catId ? catalogoById.get(catId) : undefined;
              const mySuc     = sucesores.filter(s => s.id_empleado_titular === node.id && s.sucesor_id !== node.id);
              const sucIds    = new Set(mySuc.filter(s => s.sucesor_id).map(s => s.sucesor_id!));
              const aspirantes = catId
                ? (aspirantesByPuesto.get(catId) ?? []).filter(a => !sucIds.has(a.id) && a.id !== node.id)
                : [];
              const motorMatches = catId
                ? (validatedMatchesByPuesto.get(catId) ?? [])
                  .filter(m => m.id !== node.id && !sucIds.has(m.id) && !aspirantes.some(a => a.id === m.id))
                  .map(m => ({ id: m.id, nombre: m.nombre, readiness: bestReadinessBySuccesor.get(m.id) ?? null, fromMotor: true as const }))
                : [];
              const allAspirantes = [...aspirantes.map(a => ({ ...a, readiness: bestReadinessBySuccesor.get(a.id) ?? null })), ...motorMatches];
              const discartados = catId ? (discardedByCatId.get(catId) ?? []).filter(d => d.id !== node.id) : [];
              const pendingOnly = catId ? (pendingMatchesByPuesto.get(catId) ?? []).filter(m => m.id !== node.id) : [];
              const entries   = buildEntries(mySuc, allAspirantes, discartados, validatedMatchMap, catId, pendingMatchMap, pendingOnly, sucByPositionAndSuc, pendingMatchByPerson);
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
          planCarreraIds={planCarreraSet}
          concentracionMap={concentracionMap}
          validatedMatchMap={validatedMatchMap}
          discardedByCatId={discardedByCatId}
          coveredByValidatedMatch={coveredByValidatedMatch}
          validatedMatchesByPuesto={validatedMatchesByPuesto}
          bestReadinessBySuccesor={bestReadinessBySuccesor}
          pendingMatchMap={pendingMatchMap}
          pendingMatchesByPuesto={pendingMatchesByPuesto}
          pendingCatIds={pendingCatIds}
          sucByPositionAndSuc={sucByPositionAndSuc}
          pendingMatchByPerson={pendingMatchByPerson}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
