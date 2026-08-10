"use client";

import { useState, useMemo, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ColabRaw = Record<string, unknown>;

interface OrgNode {
  id: string;
  nombre: string;
  puesto: string;
  area: string;
  org: string;
  fechaAntiguedad: string | null;
  jefe_inmediato_id: string | null;
  children: OrgNode[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function calcAntiguedad(fecha: string | null): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  const totalMonths =
    years * 12 + (m < 0 ? 12 + m : m);
  if (totalMonths < 1) return "< 1 mes";
  if (totalMonths < 12)
    return `${totalMonths} mes${totalMonths !== 1 ? "es" : ""}`;
  return `${years} año${years !== 1 ? "s" : ""}`;
}

function buildTree(
  colaboradores: ColabRaw[],
  filterFn?: (c: ColabRaw) => boolean
): { roots: OrgNode[]; nodeMap: Map<string, OrgNode> } {
  const filtered = filterFn ? colaboradores.filter(filterFn) : colaboradores;
  const filteredIds = new Set(filtered.map((c) => c["id"] as string));

  const nodeMap = new Map<string, OrgNode>();
  for (const c of filtered) {
    nodeMap.set(c["id"] as string, {
      id: c["id"] as string,
      nombre: (c["nombre_completo"] as string) ?? "",
      puesto: (c["puesto"] as string) ?? "",
      area: (c["area"] as string) ?? "",
      org: (c["organización"] as string) ?? "",
      fechaAntiguedad:
        (c["fecha_antiguedad"] as string | null) ??
        (c["fecha_ingreso_grupo"] as string | null),
      jefe_inmediato_id: c["jefe_inmediato_id"] as string | null,
      children: [],
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodeMap.values()) {
    const pid = node.jefe_inmediato_id;
    if (pid && filteredIds.has(pid) && nodeMap.has(pid)) {
      nodeMap.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sort(node: OrgNode) {
    node.children.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    node.children.forEach(sort);
  }
  roots.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  roots.forEach(sort);

  return { roots, nodeMap };
}

/** Returns the set of node IDs whose children should start collapsed (depth >= maxDepth). */
function computeCollapsed(roots: OrgNode[], maxDepth: number): Set<string> {
  const set = new Set<string>();
  function walk(node: OrgNode, depth: number) {
    if (depth >= maxDepth - 1) set.add(node.id);
    for (const child of node.children) walk(child, depth + 1);
  }
  for (const root of roots) walk(root, 0);
  return set;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ id, nombre, size = 52 }: { id: string; nombre: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/colaboradores/fotos/${id}.jpg`;

  if (!err && SUPABASE_URL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={nombre}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
        }}
        onError={() => setErr(true)}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #1a3a5c 0%, #2d6a9f 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: 700,
        fontSize: Math.round(size * 0.34),
        letterSpacing: "0.03em",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function OrgCard({
  node,
  hasChildren,
  isCollapsed,
  onToggle,
}: {
  node: OrgNode;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const antig = calcAntiguedad(node.fechaAntiguedad);

  return (
    <div className="org-card">
      <a
        href={`/carpeta/${node.id}`}
        className="org-avatar-link"
        title={`Ver carpeta de ${node.nombre}`}
      >
        <Avatar id={node.id} nombre={node.nombre} size={52} />
      </a>
      <div className="org-card-body">
        <p className="org-name">{node.nombre}</p>
        <p className="org-puesto">{node.puesto}</p>
        {antig && <p className="org-meta">{antig}</p>}
        {node.area && <p className="org-meta org-area">{node.area}</p>}
      </div>
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="org-toggle-btn no-print"
          title={isCollapsed ? "Expandir" : "Colapsar"}
          aria-label={isCollapsed ? "Expandir hijos" : "Colapsar hijos"}
        >
          {isCollapsed ? "+" : "−"}
        </button>
      )}
    </div>
  );
}

// ─── Recursive Tree Node ──────────────────────────────────────────────────────

function OrgTreeNode({
  node,
  collapsed,
  onToggle,
  isRoot,
}: {
  node: OrgNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  isRoot?: boolean;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;
  const showChildren = hasChildren && !isCollapsed;

  return (
    <li>
      <div className={isRoot ? "org-node-inner org-node-root" : "org-node-inner"}>
        <OrgCard
          node={node}
          hasChildren={hasChildren}
          isCollapsed={isCollapsed}
          onToggle={() => onToggle(node.id)}
        />
      </div>
      {showChildren && (
        <ul className="org-level">
          {node.children.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const ORG_CHART_CSS = `
/* ── Org Chart Connector Lines ───────────────────────────────── */

.org-tree {
  min-width: max-content;
  padding: 8px 24px 32px;
}

.org-root-list {
  display: flex;
  flex-direction: row;
  justify-content: center;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 20px;
}

/* Children level */
.org-level {
  display: flex;
  flex-direction: row;
  justify-content: center;
  list-style: none;
  margin: 0;
  padding: 0;
  padding-top: 24px;
  position: relative;
}

/* Vertical connector from parent card down to the horizontal bar */
.org-level::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 24px;
  background: #e2e8f0;
}

/* Each child list item */
.org-level > li {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 8px;
  position: relative;
}

/* Left half of horizontal bar */
.org-level > li::before {
  content: '';
  position: absolute;
  top: 0;
  right: 50%;
  width: 50%;
  height: 2px;
  background: #e2e8f0;
}

/* Right half of horizontal bar */
.org-level > li::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 50%;
  height: 2px;
  background: #e2e8f0;
}

/* Trim outer edges of the horizontal bar */
.org-level > li:first-child::before { background: transparent; }
.org-level > li:last-child::after  { background: transparent; }
.org-level > li:only-child::before,
.org-level > li:only-child::after  { background: transparent; }

/* Wrapper that drops the card below the horizontal bar */
.org-node-inner {
  padding-top: 16px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Short vertical from horizontal bar to card */
.org-node-inner::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 16px;
  background: #e2e8f0;
}

/* Root nodes: no top connector */
.org-node-root {
  padding-top: 0;
}
.org-node-root::before {
  display: none;
}

/* ── Card Styles ────────────────────────────────────────────────── */

.org-card {
  width: 172px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px 12px 14px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  transition: box-shadow 0.18s, border-color 0.18s;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.org-card:hover {
  box-shadow: 0 4px 14px rgba(26,58,92,0.12);
  border-color: #b6c8e0;
}

.org-avatar-link {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
  text-decoration: none;
  transition: opacity 0.15s;
  border-radius: 50%;
  outline-offset: 3px;
}
.org-avatar-link:hover { opacity: 0.82; }
.org-avatar-link:focus-visible { outline: 2px solid #1a3a5c; }

.org-card-body { width: 100%; }

.org-name {
  font-weight: 700;
  font-size: 11.5px;
  color: #1e293b;
  line-height: 1.35;
  margin-bottom: 3px;
}
.org-puesto {
  font-size: 10.5px;
  color: #4f6b8a;
  line-height: 1.3;
  margin-bottom: 4px;
}
.org-meta {
  font-size: 9.5px;
  color: #94a3b8;
  line-height: 1.3;
  margin-bottom: 1px;
}
.org-area {
  font-style: italic;
}

/* Expand/Collapse button */
.org-toggle-btn {
  position: absolute;
  bottom: -11px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  color: #64748b;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.org-toggle-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #1a3a5c;
}

/* ── Drag cursor ──────────────────────────────────────────────── */

.org-chart-scroll {
  cursor: grab;
  user-select: none;
}
.org-chart-scroll.is-dragging {
  cursor: grabbing;
}

/* ── Fullscreen ───────────────────────────────────────────────── */

:fullscreen .org-fullscreen-root,
:-webkit-full-screen .org-fullscreen-root {
  background: #f8fafc;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
  box-sizing: border-box;
}
:fullscreen .org-fullscreen-root .print-chart,
:-webkit-full-screen .org-fullscreen-root .print-chart {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
:fullscreen .org-fullscreen-root h1 {
  font-size: 1.25rem;
}

/* ── Print / PDF ──────────────────────────────────────────────── */

@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
  .print-chart {
    overflow: visible !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
  .org-card {
    break-inside: avoid;
    box-shadow: none;
    border-color: #d1d9e0;
  }
  @page { size: A3 landscape; margin: 12mm; }
}
`;

export default function OrganigramaClient({
  colaboradores,
  uens,
}: {
  colaboradores: ColabRaw[];
  uens: string[];
}) {
  const [modo, setModo] = useState<"uen" | "persona">("uen");
  const [selectedUen, setSelectedUen] = useState<string>(uens[0] ?? "");
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [maxDepth, setMaxDepth] = useState(3);
  // Seed collapsed from initial UEN tree at depth 3
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const { roots } = buildTree(
      colaboradores,
      (c) => (c["organización"] as string) === (uens[0] ?? "")
    );
    return computeCollapsed(roots, 3);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs for fullscreen and drag
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function onDragStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = chartRef.current;
    if (!el) return;
    drag.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
  }

  function onDragMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    // Only activate drag cursor after moving 4px (prevents flicker on click)
    if (!drag.current.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    drag.current.moved = true;
    const el = chartRef.current;
    if (!el) return;
    el.classList.add("is-dragging");
    el.scrollLeft = drag.current.scrollLeft - dx;
    el.scrollTop  = drag.current.scrollTop  - dy;
  }

  function onDragEnd(e: React.MouseEvent<HTMLDivElement>) {
    // If we moved, block the click so links don't fire on drag-release
    if (drag.current.moved) e.preventDefault();
    drag.current.active = false;
    drag.current.moved = false;
    chartRef.current?.classList.remove("is-dragging");
  }

  // Full tree for persona mode
  const { nodeMap: fullNodeMap } = useMemo(
    () => buildTree(colaboradores),
    [colaboradores]
  );

  // UEN-filtered tree
  const { roots: uenRoots } = useMemo(
    () =>
      buildTree(
        colaboradores,
        (c) => (c["organización"] as string) === selectedUen
      ),
    [colaboradores, selectedUen]
  );

  // Display roots
  const displayRoots = useMemo(() => {
    if (modo === "uen") return uenRoots;
    if (modo === "persona" && selectedPersonId) {
      const node = fullNodeMap.get(selectedPersonId);
      return node ? [node] : [];
    }
    return [];
  }, [modo, uenRoots, selectedPersonId, fullNodeMap]);

  // Person search suggestions
  const searchSuggestions = useMemo(() => {
    if (!personSearch || personSearch.length < 2) return [];
    const q = personSearch.toLowerCase();
    return colaboradores
      .filter((c) =>
        (c["nombre_completo"] as string)?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [personSearch, colaboradores]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExpandAll() {
    setCollapsed(new Set());
  }

  function handleCollapseAll() {
    // Collapse everything except the roots themselves (so at least level 1 is visible)
    const all = new Set<string>();
    function collectIds(nodes: OrgNode[]) {
      for (const n of nodes) {
        all.add(n.id);
        collectIds(n.children);
      }
    }
    collectIds(displayRoots);
    setCollapsed(all);
  }

  const totalVisible = useMemo(() => {
    function count(nodes: OrgNode[]): number {
      return nodes.reduce(
        (acc, n) => acc + 1 + (collapsed.has(n.id) ? 0 : count(n.children)),
        0
      );
    }
    return count(displayRoots);
  }, [displayRoots, collapsed]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ORG_CHART_CSS }} />

      <div className="space-y-4 org-fullscreen-root" ref={containerRef}>
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organigrama</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Estructura organizacional · {totalVisible} persona
              {totalVisible !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isFullscreen ? "✕ Salir" : "⤢ Pantalla completa"}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <span>⬇</span> Exportar PDF
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="no-print flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setModo("uen")}
              className={`px-3.5 py-2 transition-colors ${
                modo === "uen"
                  ? "bg-[#1a3a5c] text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Por UEN
            </button>
            <button
              onClick={() => setModo("persona")}
              className={`px-3.5 py-2 transition-colors border-l border-gray-200 ${
                modo === "persona"
                  ? "bg-[#1a3a5c] text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Desde persona
            </button>
          </div>

          {/* UEN selector */}
          {modo === "uen" && (
            <select
              value={selectedUen}
              onChange={(e) => {
                const uen = e.target.value;
                setSelectedUen(uen);
                const { roots } = buildTree(colaboradores, (c) => (c["organización"] as string) === uen);
                setCollapsed(computeCollapsed(roots, maxDepth));
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
            >
              {uens.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}

          {/* Person search */}
          {modo === "persona" && (
            <div className="relative">
              <input
                value={personSearch}
                onChange={(e) => {
                  setPersonSearch(e.target.value);
                  setSelectedPersonId(null);
                  setCollapsed(new Set());
                }}
                placeholder="Buscar colaborador…"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
                autoComplete="off"
              />
              {searchSuggestions.length > 0 && !selectedPersonId && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 w-72 overflow-hidden">
                  {searchSuggestions.map((c) => (
                    <button
                      key={c["id"] as string}
                      onClick={() => {
                        const pid = c["id"] as string;
                        setSelectedPersonId(pid);
                        setPersonSearch(c["nombre_completo"] as string);
                        const personNode = fullNodeMap.get(pid);
                        const newRoots = personNode ? [personNode] : [];
                        setCollapsed(computeCollapsed(newRoots, maxDepth));
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <p className="font-medium text-gray-900 text-sm">
                        {c["nombre_completo"] as string}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c["puesto"] as string}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Depth selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Niveles:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setMaxDepth(n);
                    setCollapsed(computeCollapsed(displayRoots, n));
                  }}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                    maxDepth === n
                      ? "bg-[#1a3a5c] text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Expand/Collapse all */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleExpandAll}
              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Expandir todo
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Colapsar todo
            </button>
          </div>
        </div>

        {/* Chart */}
        <div
          ref={chartRef}
          className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-auto print-chart org-chart-scroll"
          style={{ maxHeight: isFullscreen ? "100%" : "calc(100vh - 260px)", minHeight: 240 }}
          onMouseDown={onDragStart}
          onMouseMove={onDragMove}
          onMouseUp={onDragEnd}
          onMouseLeave={() => { drag.current.active = false; drag.current.moved = false; chartRef.current?.classList.remove("is-dragging"); }}
        >
          <div className="org-tree">
            {displayRoots.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                {modo === "persona"
                  ? "Busca un colaborador para ver su organigrama"
                  : "No hay colaboradores en esta UEN"}
              </div>
            ) : (
              <ul className="org-root-list">
                {displayRoots.map((node) => (
                  <OrgTreeNode
                    key={node.id}
                    node={node}
                    collapsed={collapsed}
                    onToggle={toggleCollapse}
                    isRoot
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
