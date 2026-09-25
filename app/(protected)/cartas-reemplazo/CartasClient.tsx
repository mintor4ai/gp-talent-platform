"use client";

import { useState, useMemo } from "react";
import EmpleadoAvatar from "@/components/ui/EmpleadoAvatar";
import type {
  CartaNode, CartaEip, CartaTalentoClave, CartaSucesor, CartaPicd, CartaCatalogoPuesto,
} from "./types";

// ── Layout constants ──────────────────────────────────────────────────────────

const CARD_W = 240;
const CARD_H = 200;
const H_GAP  = 24;   // gap between sibling subtrees
const V_GAP  = 72;   // vertical gap: bottom of parent → top of child
const PAD    = 32;   // canvas padding

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

function allVisible(id: string, cm: Map<string, string[]>, ex: Set<string>): string[] {
  const r = [id];
  if (ex.has(id)) for (const k of cm.get(id) ?? []) r.push(...allVisible(k, cm, ex));
  return r;
}

// ── Cobertura ─────────────────────────────────────────────────────────────────

type Cob = "verde" | "amarillo" | "rojo";

// idColabUuid = colaboradores.id (UUID) — plan_sucesion.id_empleado is UUID FK to colaboradores.id
function getCob(idColabUuid: string | null, suc: CartaSucesor[]): Cob {
  if (!idColabUuid) return "rojo";
  const mine = suc.filter(s => s.id_empleado_titular === idColabUuid);
  if (!mine.length) return "rojo";
  return mine.some(s => {
    const r = s.readiness ?? s.tiempo_estimado ?? "";
    return r === "listo_ahora" || r === "uno_dos_anios" || r === "corto" || r === "mediano";
  }) ? "verde" : "amarillo";
}

const RSHORT: Record<string, string> = {
  listo_ahora: "Inm.", uno_dos_anios: "Med.", tres_mas_anios: "Lrg.",
};
const RCOLOR: Record<string, string> = {
  listo_ahora: "bg-green-100 text-green-700",
  uno_dos_anios: "bg-blue-100 text-blue-700",
  tres_mas_anios: "bg-gray-100 text-gray-500",
};

// ── OrgCard ───────────────────────────────────────────────────────────────────

const COB_LEFT: Record<Cob, string> = {
  verde: "border-l-green-500", amarillo: "border-l-amber-400", rojo: "border-l-red-500",
};

function OrgCard({
  node, pos, cob, yaAsignado, talentoClave, esCritico,
  mySuc, aspirantes, isSelected, hasKids, isExpanded, onSelect, onToggle,
}: {
  node: CartaNode;
  pos: { x: number; y: number };
  cob: Cob;
  yaAsignado: boolean;
  talentoClave: boolean;
  esCritico: boolean;
  mySuc: CartaSucesor[];
  aspirantes: string[];
  isSelected: boolean;
  hasKids: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const nombre = node.nombre_completo;
  const shortNombre = nombre.length > 26 ? nombre.slice(0, 25) + "…" : nombre;
  const shortPuesto = (node.puesto ?? "—").length > 30
    ? (node.puesto ?? "").slice(0, 29) + "…"
    : (node.puesto ?? "—");

  return (
    <div
      className={`absolute bg-white rounded-xl shadow-md border border-gray-200 border-l-4 overflow-hidden cursor-pointer transition-shadow hover:shadow-lg
        ${yaAsignado ? "border-l-gray-700" : COB_LEFT[cob]}
        ${isSelected ? "ring-2 ring-offset-1 ring-[#1a3a5c] shadow-lg" : ""}
      `}
      style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
      onClick={onSelect}
    >
      {/* Header: name / position / ID */}
      <div className="px-3 pt-3 pb-2">
        <p className="font-bold text-gray-900 text-[13px] leading-snug">{shortNombre}</p>
        <p className="text-[11.5px] text-gray-500 mt-0.5 leading-tight">{shortPuesto}</p>
        <p className="text-[10.5px] text-gray-400 mt-0.5">
          {node.id_empleado ? `#${node.id_empleado}` : ""}
          {node.id_empleado && node.organización ? " · " : ""}
          {node.organización ?? ""}
        </p>
        {/* Chips row */}
        {(talentoClave || esCritico || yaAsignado) && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {talentoClave && (
              <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full font-semibold leading-none">★ Talento Clave</span>
            )}
            {esCritico && (
              <span className="text-[9px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold leading-none">⚠ Crítico</span>
            )}
            {yaAsignado && (
              <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full font-semibold leading-none">⚫ Ya asig.</span>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-3" />

      {/* Backups */}
      <div className="px-3 pt-2">
        <p className="text-[8.5px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-1">Backups</p>
        {mySuc.length === 0 ? (
          <p className="text-[10.5px] text-red-400 italic">Sin backup declarado</p>
        ) : (
          <div className="space-y-0.5">
            {mySuc.slice(0, 2).map((s, i) => {
              const r = s.readiness ?? s.tiempo_estimado ?? null;
              return (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-800 flex-1 truncate leading-none">{s.sucesor_nombre}</span>
                  {r && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 leading-none ${RCOLOR[r] ?? "bg-gray-100 text-gray-500"}`}>
                      {RSHORT[r] ?? r}
                    </span>
                  )}
                </div>
              );
            })}
            {mySuc.length > 2 && (
              <p className="text-[9.5px] text-gray-400">+{mySuc.length - 2} más</p>
            )}
          </div>
        )}
      </div>

      {/* Aspiraciones (if any) */}
      {aspirantes.length > 0 && (
        <>
          <div className="border-t border-gray-100 mx-3 mt-2" />
          <div className="px-3 pt-1.5">
            <p className="text-[8.5px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-1">Aspiraciones</p>
            <div className="space-y-0.5">
              {aspirantes.slice(0, 2).map((n, i) => (
                <p key={i} className="text-[11px] text-gray-600 truncate leading-none">{n}</p>
              ))}
              {aspirantes.length > 2 && (
                <p className="text-[9.5px] text-gray-400">+{aspirantes.length - 2} más</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Expand / collapse button */}
      {hasKids && (
        <button
          onClick={onToggle}
          className="absolute bottom-1.5 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-[9px] font-bold transition-colors shadow-sm"
          title={isExpanded ? "Colapsar" : "Ver subordinados"}
        >
          {isExpanded ? "▲" : "▼"}
        </button>
      )}
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
  catalogoById, colabToCatalog, aspirantesByPuesto, yaAsignadoIds, onClose,
}: {
  nodeId: string;
  colabMap: Map<string, CartaNode>;
  sucesores: CartaSucesor[];
  tcByColab: Map<string, CartaTalentoClave>;
  eipByEmpleado: Map<string, CartaEip>;
  picdByEmpleado: Map<string, CartaPicd>;
  catalogoById: Map<string, CartaCatalogoPuesto>;
  colabToCatalog: Map<string, string>;
  aspirantesByPuesto: Map<string, string[]>;
  yaAsignadoIds: Set<string>;
  onClose: () => void;
}) {
  const node = colabMap.get(nodeId);
  if (!node) return null;

  // eip/picd/sucesores.id_empleado_titular are all UUID (colaboradores.id)
  const eip        = eipByEmpleado.get(node.id);
  const tc         = tcByColab.get(node.id);
  const picd       = picdByEmpleado.get(node.id);
  const catId      = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
  const cat        = catId ? catalogoById.get(catId) : undefined;
  const cob        = getCob(node.id, sucesores);
  const mySuc      = sucesores.filter(s => s.id_empleado_titular === node.id);
  const aspirantes = catId ? (aspirantesByPuesto.get(catId) ?? []) : [];

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
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              cob === "verde" ? "bg-green-100 text-green-800" :
              cob === "amarillo" ? "bg-amber-100 text-amber-800" :
              "bg-red-100 text-red-800"
            }`}>
              {cob === "verde" ? "🟢 Cubierto" : cob === "amarillo" ? "🟡 En desarrollo" : "🔴 En riesgo"}
            </span>
            {tc?.es_talento_clave && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 cursor-help"
                title={`Fuente: ${tc.fuente === "auto" ? "EIP automático" : tc.fuente === "manual_ch" ? "Capital Humano" : "Persona Clave"} · Ciclo ${tc.ciclo_año}`}>
                ✦ Talento Clave
              </span>
            )}
            {cat?.es_critico && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 cursor-help"
                title="Puesto marcado como crítico en el catálogo">
                ⚠ Puesto Crítico
              </span>
            )}
            {yaAsignadoIds.has(node.id) && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700 cursor-help"
                title="Ya está asignado como sucesor en otro plan">
                ⚫ Ya asignado
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

          {/* Backups (sucesores) */}
          <section>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Backups ({mySuc.length})
            </h3>
            {mySuc.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin backup identificado</p>
            ) : (
              <div className="space-y-2">
                {mySuc.map((s, i) => {
                  const r = s.readiness ?? s.tiempo_estimado ?? null;
                  return (
                    <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.sucesor_nombre}</p>
                        <p className="text-[11px] text-gray-400">Ciclo {s.ciclo_año}</p>
                      </div>
                      {r && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${RCOLOR[r] ?? "bg-gray-100 text-gray-500"}`}>
                          {RSHORT[r] ?? r}
                        </span>
                      )}
                      {s.sucesor_id && (
                        <a href={`/carpeta/${s.sucesor_id}`} onClick={e => e.stopPropagation()}
                          className="text-[11px] text-[#1a3a5c] font-medium hover:underline flex-shrink-0">
                          Carpeta →
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Aspiraciones */}
          {aspirantes.length > 0 && (
            <section>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Aspiraciones al puesto ({aspirantes.length})
              </h3>
              <p className="text-[11px] text-gray-400 mb-2 italic">
                Personas que declaran este puesto como su objetivo de carrera en PICD
              </p>
              <div className="space-y-1.5">
                {aspirantes.map((nombre, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl">
                    <span className="text-sm text-gray-800 flex-1 truncate">{nombre}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

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
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full cursor-help flex-shrink-0"
                        title="Vinculado al catálogo de puestos">Vinculado</span>
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
                📁 Carpeta Individual
              </a>
              <a href={`/plan-carrera/${node.id}`}
                className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                📐 Plano de Carrera
              </a>
              <a href={`/carpeta/${node.id}?tab=sucesion`}
                className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                🔄 Plan de Sucesión
              </a>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

// ── Root selector ─────────────────────────────────────────────────────────────

function RootSelector({
  colabs, childrenMap, onSelect,
}: {
  colabs: CartaNode[];
  childrenMap: Map<string, string[]>;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

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
        Seleccionar posición de inicio
      </label>
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder="Nombre, puesto, ID de empleado o UEN…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
      />
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
  const counts = { verde: 0, amarillo: 0, rojo: 0, ya: 0 };
  for (const id of directKids) {
    const n = colabMap.get(id);
    if (n) counts[getCob(n.id, sucesores)]++;
    if (yaAsignadoIds.has(id)) counts.ya++;
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
      {counts.ya > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold border border-gray-200">
          <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
          {counts.ya} Ya asignados
        </span>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-xs text-gray-500">
      <span title="Backup validado con readiness Inmediato o Mediano plazo">● <span className="text-green-600 font-medium">Cubierto</span> (Inmediato / Mediano Plazo)</span>
      <span title="Sucesor identificado pero solo Largo plazo o sin validar">● <span className="text-amber-500 font-medium">En desarrollo</span> (solo Largo Plazo)</span>
      <span title="No hay planes de sucesión activos">● <span className="text-red-500 font-medium">En riesgo</span> (sin sucesor)</span>
      <span title="Aparece como sucesor asignado en otro plan">⚫ Ya asignado</span>
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

  const [rootId, setRootId]     = useState<string | null>(jefeColabId ?? null);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded]  = useState<Set<string>>(
    () => new Set(jefeColabId ? [jefeColabId] : [])
  );

  // Lookup maps
  // eip/picd/sucesores all use UUID FK to colaboradores.id — key maps by UUID
  const colabMap     = useMemo(() => new Map(colabs.map(c => [c.id, c])), [colabs]);
  const eipMap       = useMemo(() => new Map(eipLatest.map(e => [e.id_empleado, e])), [eipLatest]);
  const tcMap        = useMemo(() => new Map(talentoClaveLatest.map(t => [t.colaborador_id, t])), [talentoClaveLatest]);
  const picdMap      = useMemo(() => new Map(picdLatest.map(p => [p.id_empleado, p])), [picdLatest]);
  // All three maps are keyed by UUID (colaboradores.id) — use node.id for all lookups
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

  // Build aspirantes map: puestoCatalogId → [nombre, ...] of people who declared it as puesto futuro in PICD
  // picd.id_empleado is UUID FK to colaboradores.id — key by UUID
  const aspirantesByPuesto = useMemo(() => {
    const uuidToNombre = new Map<string, string>();
    for (const c of colabs) uuidToNombre.set(c.id, c.nombre_completo);

    const m = new Map<string, string[]>();
    for (const p of picdLatest) {
      const nombre = uuidToNombre.get(p.id_empleado);
      if (!nombre) continue;
      for (const catId of [p.puesto_futuro_id1, p.puesto_futuro_id2]) {
        if (!catId) continue;
        if (!m.has(catId)) m.set(catId, []);
        m.get(catId)!.push(nombre);
      }
    }
    return m;
  }, [colabs, picdLatest]);

  // Layout calculation (recomputed on expand/collapse)
  const { positions, canvasW, canvasH } = useMemo(() => {
    if (!rootId) return { positions: new Map<string, {x:number;y:number}>(), canvasW: 0, canvasH: 0 };
    const pos = new Map<string, { x: number; y: number }>();
    const totalW = subW(rootId, childrenMap, expanded);
    const totalH = treeH(rootId, childrenMap, expanded);
    calcLayout(rootId, 0, 0, childrenMap, expanded, pos);
    return { positions: pos, canvasW: totalW + PAD * 2, canvasH: totalH + PAD * 2 };
  }, [rootId, childrenMap, expanded]);

  // Shifted positions (add padding)
  const shiftedPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [id, p] of positions) m.set(id, { x: p.x + PAD, y: p.y + PAD });
    return m;
  }, [positions]);

  const visibleNodes = useMemo(
    () => rootId ? allVisible(rootId, childrenMap, expanded) : [],
    [rootId, childrenMap, expanded]
  );

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
  };

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cartas de Reemplazo</h1>
        <p className="text-sm text-gray-500 mt-1">Cobertura de sucesión · Reportes directos · {new Date().getFullYear()}</p>
      </div>

      {/* Root selector (admin) */}
      {isAdmin && <RootSelector colabs={colabs} childrenMap={childrenMap} onSelect={handleSetRoot} />}

      {rootId && (
        <>
          {/* Executive summary */}
          <ExecSummary
            rootId={rootId}
            childrenMap={childrenMap}
            colabMap={colabMap}
            sucesores={sucesores}
            yaAsignadoIds={yaIds}
          />

          {/* Legend */}
          <Legend />
        </>
      )}

      {/* Tree canvas */}
      {rootId ? (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-gray-50">
          <div className="relative" style={{ width: canvasW, height: canvasH, minWidth: "100%" }}>
            {/* SVG connector lines */}
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

            {/* Cards */}
            {visibleNodes.map(id => {
              const node = colabMap.get(id);
              const pos  = shiftedPos.get(id);
              if (!node || !pos) return null;

              const cob       = getCob(node.id, sucesores);
              const tc        = tcMap.get(node.id);
              const catId     = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
              const cat       = catId ? catalogoById.get(catId) : undefined;
              const mySuc     = sucesores.filter(s => s.id_empleado_titular === node.id);
              const aspirantes = catId ? (aspirantesByPuesto.get(catId) ?? []) : [];

              return (
                <OrgCard
                  key={id}
                  node={node}
                  pos={pos}
                  cob={cob}
                  yaAsignado={yaIds.has(id)}
                  talentoClave={tc?.es_talento_clave ?? false}
                  esCritico={cat?.es_critico ?? false}
                  mySuc={mySuc}
                  aspirantes={aspirantes}
                  isSelected={selectedId === id}
                  hasKids={(childrenMap.get(id)?.length ?? 0) > 0}
                  isExpanded={expanded.has(id)}
                  onSelect={() => setSelected(prev => prev === id ? null : id)}
                  onToggle={e => { e.stopPropagation(); toggle(id); }}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-20 text-center bg-gray-50">
          <p className="text-gray-400 text-base">
            {isAdmin
              ? "Busca y selecciona un director o posición para explorar el árbol de sucesión"
              : "No se encontró tu posición en el organigrama"}
          </p>
        </div>
      )}

      {/* Detail panel */}
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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
