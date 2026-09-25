"use client";

import { useState, useMemo } from "react";
import EmpleadoAvatar from "@/components/ui/EmpleadoAvatar";
import type {
  CartaNode,
  CartaEip,
  CartaTalentoClave,
  CartaSucesor,
  CartaPicd,
  CartaCatalogoPuesto,
} from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const READINESS_LABEL: Record<string, string> = {
  listo_ahora: "Inmediato",
  uno_dos_anios: "1–2 años",
  tres_mas_anios: "3+ años",
};

const READINESS_COLOR: Record<string, string> = {
  listo_ahora:   "bg-green-100 text-green-700",
  uno_dos_anios: "bg-blue-100 text-blue-700",
  tres_mas_anios: "bg-gray-100 text-gray-600",
};

const ZONA_CONFIG: Record<string, { color: string }> = {
  Sobresaliente: { color: "bg-purple-100 text-purple-800" },
  Desarrollo:    { color: "bg-blue-100 text-blue-800" },
  Estabilidad:   { color: "bg-green-100 text-green-800" },
  "Revisión":    { color: "bg-yellow-100 text-yellow-800" },
  Inicio:        { color: "bg-red-100 text-red-800" },
};

type Cobertura = "verde" | "amarillo" | "rojo";

function getCobertura(idEmpleado: string | null, sucesores: CartaSucesor[]): Cobertura {
  if (!idEmpleado) return "rojo";
  const mine = sucesores.filter((s) => s.id_empleado_titular === idEmpleado);
  if (mine.length === 0) return "rojo";
  const hasReady = mine.some((s) => {
    const r = s.readiness ?? s.tiempo_estimado ?? "";
    return r === "listo_ahora" || r === "uno_dos_anios";
  });
  return hasReady ? "verde" : "amarillo";
}

const COB_STYLE: Record<Cobertura, { border: string; label: string }> = {
  verde:    { border: "border-l-green-500",  label: "Con sucesor listo" },
  amarillo: { border: "border-l-amber-400",  label: "Sucesor sin validar" },
  rojo:     { border: "border-l-red-500",    label: "Sin sucesor" },
};

const COB_DOT: Record<Cobertura, string> = {
  verde: "🟢",
  amarillo: "🟡",
  rojo: "🔴",
};

// ── Card ──────────────────────────────────────────────────────────────────────

function CartaCard({
  node,
  cobertura,
  yaAsignado,
  talentoClave,
  esCritico,
  hasChildren,
  isExpanded,
  isSelected,
  onExpand,
  onSelect,
}: {
  node: CartaNode;
  cobertura: Cobertura;
  yaAsignado: boolean;
  talentoClave: boolean;
  esCritico: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onExpand: () => void;
  onSelect: () => void;
}) {
  const style = COB_STYLE[cobertura];
  return (
    <div className="flex items-start gap-1.5">
      {/* Expand toggle */}
      <button
        onClick={onExpand}
        className={`mt-2.5 w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${
          hasChildren
            ? "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            : "invisible pointer-events-none"
        }`}
        aria-label={isExpanded ? "Colapsar" : "Expandir"}
      >
        {isExpanded ? "▼" : "▶"}
      </button>

      {/* Card */}
      <button
        onClick={onSelect}
        className={`flex-1 text-left border-l-4 ${style.border} bg-white rounded-lg shadow-sm px-3 py-2.5 transition-all hover:shadow-md ${
          isSelected ? "ring-2 ring-[#1a3a5c] ring-offset-1" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <EmpleadoAvatar
              idEmpleado={node.id_empleado}
              nombre={node.nombre_completo}
              size={32}
              rounded="full"
              className="flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-tight truncate max-w-[200px]">
                {node.nombre_completo}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">
                {node.puesto ?? "—"}
              </p>
              {node.organización && (
                <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]">
                  {node.organización}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-0.5">
            <span className="text-sm" title={style.label}>
              {COB_DOT[cobertura]}
            </span>
            {yaAsignado && (
              <span className="text-sm" title="Ya asignado como sucesor en otro plan">
                ⚫
              </span>
            )}
          </div>
        </div>
        {(talentoClave || esCritico) && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {talentoClave && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700 font-medium">
                Talento Clave
              </span>
            )}
            {esCritico && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700 font-medium">
                Puesto Crítico
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

// ── Tree node (recursive) ─────────────────────────────────────────────────────

type TreeProps = {
  nodeId: string;
  colabMap: Map<string, CartaNode>;
  childrenMap: Map<string, string[]>;
  sucesores: CartaSucesor[];
  tcByColab: Map<string, CartaTalentoClave>;
  catalogoById: Map<string, CartaCatalogoPuesto>;
  colabToCatalog: Map<string, string>;
  yaAsignadoIds: Set<string>;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

function TreeNode({ nodeId, colabMap, childrenMap, sucesores, tcByColab, catalogoById, colabToCatalog, yaAsignadoIds, expanded, selectedId, onToggle, onSelect }: TreeProps) {
  const node = colabMap.get(nodeId);
  if (!node) return null;

  const children = childrenMap.get(nodeId) ?? [];
  const isExpanded = expanded.has(nodeId);
  const cobertura = getCobertura(node.id_empleado, sucesores);
  const tc = tcByColab.get(node.id);
  const catalogoId = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
  const esCritico = catalogoId ? (catalogoById.get(catalogoId)?.es_critico ?? false) : false;

  return (
    <div>
      <CartaCard
        node={node}
        cobertura={cobertura}
        yaAsignado={yaAsignadoIds.has(node.id)}
        talentoClave={tc?.es_talento_clave ?? false}
        esCritico={esCritico}
        hasChildren={children.length > 0}
        isExpanded={isExpanded}
        isSelected={selectedId === nodeId}
        onExpand={() => onToggle(nodeId)}
        onSelect={() => onSelect(nodeId)}
      />

      {isExpanded && children.length > 0 && (
        <div className="ml-6 mt-1.5 border-l-2 border-gray-200 pl-4 space-y-2">
          {children.map((childId) => (
            <TreeNode
              key={childId}
              nodeId={childId}
              colabMap={colabMap}
              childrenMap={childrenMap}
              sucesores={sucesores}
              tcByColab={tcByColab}
              catalogoById={catalogoById}
              colabToCatalog={colabToCatalog}
              yaAsignadoIds={yaAsignadoIds}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  nodeId,
  colabMap,
  sucesores,
  tcByColab,
  eipByEmpleado,
  picdByEmpleado,
  catalogoById,
  colabToCatalog,
  yaAsignadoIds,
  onClose,
}: {
  nodeId: string;
  colabMap: Map<string, CartaNode>;
  sucesores: CartaSucesor[];
  tcByColab: Map<string, CartaTalentoClave>;
  eipByEmpleado: Map<string, CartaEip>;
  picdByEmpleado: Map<string, CartaPicd>;
  catalogoById: Map<string, CartaCatalogoPuesto>;
  colabToCatalog: Map<string, string>;
  yaAsignadoIds: Set<string>;
  onClose: () => void;
}) {
  const node = colabMap.get(nodeId);
  if (!node) return null;

  const eip = node.id_empleado ? eipByEmpleado.get(node.id_empleado) : undefined;
  const tc = tcByColab.get(node.id);
  const picd = node.id_empleado ? picdByEmpleado.get(node.id_empleado) : undefined;
  const catalogoId = node.puesto_catalogo_id ?? colabToCatalog.get(node.id);
  const catalogo = catalogoId ? catalogoById.get(catalogoId) : undefined;
  const cobertura = getCobertura(node.id_empleado, sucesores);
  const mySucesores = node.id_empleado
    ? sucesores.filter((s) => s.id_empleado_titular === node.id_empleado)
    : [];

  const zona = eip?.zona_evaluacion ?? null;
  const zonaStyle = zona ? ZONA_CONFIG[zona] : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[480px] max-w-[95vw] bg-white shadow-2xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-100 flex-shrink-0">
          <EmpleadoAvatar
            idEmpleado={node.id_empleado}
            nombre={node.nombre_completo}
            size={48}
            rounded="full"
            className="flex-shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 leading-tight">{node.nombre_completo}</h2>
            <p className="text-sm text-gray-600 mt-0.5">{node.puesto ?? "—"}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {node.organización && <span className="text-xs text-gray-400">{node.organización}</span>}
              {node.area && <span className="text-xs text-gray-400">· {node.area}</span>}
              {node.nivel && <span className="text-xs text-gray-400">· {node.nivel}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Status chips */}
          <div className="flex gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              cobertura === "verde" ? "bg-green-100 text-green-800" :
              cobertura === "amarillo" ? "bg-amber-100 text-amber-800" :
              "bg-red-100 text-red-800"
            }`}>
              {COB_DOT[cobertura]} {COB_STYLE[cobertura].label}
            </span>
            {tc?.es_talento_clave && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-800 cursor-help"
                title={`Fuente: ${tc.fuente === "auto" ? "EIP automático" : tc.fuente === "manual_ch" ? "Capital Humano" : "Persona Clave"} · Ciclo ${tc.ciclo_año}`}
              >
                ✦ Talento Clave
              </span>
            )}
            {catalogo?.es_critico && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 cursor-help"
                title="Puesto marcado como crítico en el catálogo de puestos"
              >
                ⚠ Puesto Crítico
              </span>
            )}
            {yaAsignadoIds.has(node.id) && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 cursor-help"
                title="Este colaborador ya está asignado como sucesor en otro plan de sucesión"
              >
                ⚫ Ya asignado
              </span>
            )}
          </div>

          {/* EIP */}
          {eip && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Evaluación Integral · Ciclo {eip.ciclo_año}
              </h3>
              {zona && zonaStyle && (
                <div className="mb-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${zonaStyle.color}`}>
                    {zona}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {eip.evaluacion_potencial_total != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 tabular-nums">
                      {eip.evaluacion_potencial_total.toFixed(1)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">Potencial</p>
                  </div>
                )}
                {eip.desempeno_logra != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 tabular-nums">
                      {eip.desempeno_logra.toFixed(1)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">Desempeño</p>
                  </div>
                )}
                {eip.años_en_puesto != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 tabular-nums">
                      {eip.años_en_puesto}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">Años en puesto</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Sucesores */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Sucesores identificados ({mySucesores.length})
            </h3>
            {mySucesores.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin sucesores identificados en planes activos</p>
            ) : (
              <div className="space-y-2">
                {mySucesores.map((s, i) => {
                  const r = s.readiness ?? s.tiempo_estimado ?? null;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.sucesor_nombre}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Ciclo {s.ciclo_año}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {r && (
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${READINESS_COLOR[r] ?? "bg-gray-100 text-gray-600"}`}
                            title="Readiness estimado"
                          >
                            {READINESS_LABEL[r] ?? r}
                          </span>
                        )}
                        {s.sucesor_id && (
                          <a
                            href={`/carpeta/${s.sucesor_id}`}
                            className="text-[11px] text-[#1a3a5c] font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Carpeta →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Puestos futuros PICD */}
          {picd && (picd.puesto_futuro_opcion1 || picd.puesto_futuro_opcion2) && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Puestos Futuros PICD · Ciclo {picd.ciclo_año}
              </h3>
              <div className="space-y-2">
                {picd.puesto_futuro_opcion1 && (
                  <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
                    <span className="text-[11px] font-semibold text-gray-400 w-10 flex-shrink-0">Op. 1</span>
                    <span className="flex-1 text-sm text-gray-800">{picd.puesto_futuro_opcion1}</span>
                    {picd.puesto_futuro_id1 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full flex-shrink-0 cursor-help"
                        title="Vinculado al catálogo de puestos por Capital Humano"
                      >
                        Vinculado
                      </span>
                    )}
                  </div>
                )}
                {picd.puesto_futuro_opcion2 && (
                  <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
                    <span className="text-[11px] font-semibold text-gray-400 w-10 flex-shrink-0">Op. 2</span>
                    <span className="flex-1 text-sm text-gray-800">{picd.puesto_futuro_opcion2}</span>
                    {picd.puesto_futuro_id2 && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full flex-shrink-0 cursor-help"
                        title="Vinculado al catálogo de puestos por Capital Humano"
                      >
                        Vinculado
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Quick links */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Accesos rápidos
            </h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/carpeta/${node.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1a3a5c] text-white rounded-lg text-sm font-medium hover:bg-[#14304d] transition-colors"
              >
                📁 Carpeta Individual
              </a>
              <a
                href={`/plan-carrera/${node.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                📐 Plano de Carrera
              </a>
              <a
                href={`/carpeta/${node.id}?tab=sucesion`}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                🔄 Plan de Sucesión
              </a>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

// ── Root selector (admin) ─────────────────────────────────────────────────────

function RootSelector({
  colabs,
  childrenMap,
  onSelect,
}: {
  colabs: CartaNode[];
  childrenMap: Map<string, string[]>;
  onSelect: (id: string, nombre: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return colabs
      .filter((c) => {
        // Show people with subordinates (directors/managers) plus exact ID match
        const hasChildren = (childrenMap.get(c.id)?.length ?? 0) > 0;
        const idMatch = (c.id_empleado ?? "").includes(query.trim());
        if (!hasChildren && !idMatch) return false;
        return (
          c.nombre_completo.toLowerCase().includes(q) ||
          (c.puesto ?? "").toLowerCase().includes(q) ||
          (c.id_empleado ?? "").includes(query.trim()) ||
          (c.organización ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [query, colabs, childrenMap]);

  return (
    <div className="relative max-w-lg">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Seleccionar posición de inicio
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Nombre, puesto, ID de empleado o UEN…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] focus:border-transparent"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {filtered.map((c) => (
            <button
              key={c.id}
              onMouseDown={() => {
                onSelect(c.id, c.nombre_completo);
                setQuery(c.nombre_completo);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="flex items-center gap-2">
                <EmpleadoAvatar idEmpleado={c.id_empleado} nombre={c.nombre_completo} size={28} rounded="full" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.nombre_completo}</p>
                  <p className="text-xs text-gray-500">{c.puesto ?? "—"} · {c.organización ?? "—"}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap text-xs text-gray-500 py-1">
      <span title="Tiene al menos un sucesor con readiness Inmediato o 1-2 años">🟢 Con sucesor listo</span>
      <span title="Tiene sucesores pero ninguno con readiness corto">🟡 Sucesor parcial</span>
      <span title="No hay planes de sucesión activos">🔴 Sin sucesor</span>
      <span title="Este colaborador aparece como sucesor asignado en otro plan">⚫ Ya asignado</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CartasClient({
  colabs,
  eipLatest,
  talentoClaveLatest,
  sucesores,
  picdLatest,
  catalogo,
  yaAsignadoIds: yaAsignadoIdsArr,
  rol,
  jefeColabId,
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

  const [rootId, setRootId] = useState<string | null>(jefeColabId ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(jefeColabId ? [jefeColabId] : [])
  );

  // Computed lookup maps
  const colabMap = useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of colabs) {
      if (c.jefe_inmediato_id) {
        if (!map.has(c.jefe_inmediato_id)) map.set(c.jefe_inmediato_id, []);
        map.get(c.jefe_inmediato_id)!.push(c.id);
      }
    }
    return map;
  }, [colabs]);

  const eipByEmpleado = useMemo(
    () => new Map(eipLatest.map((e) => [e.id_empleado, e])),
    [eipLatest]
  );

  const tcByColab = useMemo(
    () => new Map(talentoClaveLatest.map((t) => [t.colaborador_id, t])),
    [talentoClaveLatest]
  );

  const picdByEmpleado = useMemo(
    () => new Map(picdLatest.map((p) => [p.id_empleado, p])),
    [picdLatest]
  );

  const catalogoById = useMemo(
    () => new Map(catalogo.map((c) => [c.id, c])),
    [catalogo]
  );

  const yaAsignadoIds = useMemo(() => new Set(yaAsignadoIdsArr), [yaAsignadoIdsArr]);

  const colabToCatalog = useMemo(() => {
    const catByName = new Map<string, string>();
    for (const c of catalogo) catByName.set(c.nombre.trim().toUpperCase(), c.id);
    const map = new Map<string, string>();
    for (const c of colabs) {
      if (c.puesto_catalogo_id) { map.set(c.id, c.puesto_catalogo_id); continue; }
      if (c.puesto) {
        const id = catByName.get(c.puesto.trim().toUpperCase());
        if (id) map.set(c.id, id);
      }
    }
    return map;
  }, [colabs, catalogo]);

  const handleToggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleSelect = (id: string) =>
    setSelectedId((prev) => (prev === id ? null : id));

  const handleSetRoot = (id: string) => {
    setRootId(id);
    setSelectedId(null);
    setExpanded(new Set([id]));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cartas de Reemplazo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cobertura de sucesión por posición · Vista jerárquica
        </p>
      </div>

      {isAdmin && (
        <RootSelector colabs={colabs} childrenMap={childrenMap} onSelect={handleSetRoot} />
      )}

      <Legend />

      {rootId ? (
        <div className="space-y-2 pb-24">
          <TreeNode
            nodeId={rootId}
            colabMap={colabMap}
            childrenMap={childrenMap}
            sucesores={sucesores}
            tcByColab={tcByColab}
            catalogoById={catalogoById}
            colabToCatalog={colabToCatalog}
            yaAsignadoIds={yaAsignadoIds}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={handleToggle}
            onSelect={handleSelect}
          />
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-16 text-center">
          <p className="text-gray-400 text-base">
            Busca y selecciona un director o posición para explorar el árbol de sucesión
          </p>
        </div>
      )}

      {selectedId && (
        <DetailPanel
          nodeId={selectedId}
          colabMap={colabMap}
          sucesores={sucesores}
          tcByColab={tcByColab}
          eipByEmpleado={eipByEmpleado}
          picdByEmpleado={picdByEmpleado}
          catalogoById={catalogoById}
          colabToCatalog={colabToCatalog}
          yaAsignadoIds={yaAsignadoIds}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
