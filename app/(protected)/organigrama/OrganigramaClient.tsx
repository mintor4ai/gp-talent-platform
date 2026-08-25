"use client";

import { useState, useMemo, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ColabRaw = Record<string, unknown>;

interface OrgNode {
  id: string;
  id_empleado: string | null;
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
      id_empleado: (c["id_empleado"] as string | null) ?? null,
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

/** Returns the list of node IDs from the root down to targetId (inclusive), or null if not found. */
function findPathToNode(roots: OrgNode[], targetId: string): string[] | null {
  function walk(node: OrgNode, path: string[]): string[] | null {
    const current = [...path, node.id];
    if (node.id === targetId) return current;
    for (const child of node.children) {
      const found = walk(child, current);
      if (found) return found;
    }
    return null;
  }
  for (const root of roots) {
    const found = walk(root, []);
    if (found) return found;
  }
  return null;
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
  isHighlighted,
}: {
  node: OrgNode;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  isHighlighted?: boolean;
}) {
  const antig = calcAntiguedad(node.fechaAntiguedad);

  return (
    <div
      className={`org-card${isHighlighted ? " org-card-highlighted" : ""}`}
      data-node-id={node.id}
    >
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
  highlightedId,
  isRoot,
}: {
  node: OrgNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  highlightedId?: string | null;
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
          isHighlighted={highlightedId === node.id}
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
              highlightedId={highlightedId}
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

/* Highlighted card — search result */
.org-card-highlighted {
  border-color: #f59e0b !important;
  box-shadow: 0 0 0 3px rgba(245,158,11,0.3), 0 4px 18px rgba(26,58,92,0.14) !important;
  background: #fffbeb !important;
}
.org-card-highlighted .org-name { color: #92400e; }

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

  // Global search state
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalOpen, setGlobalOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Refs for fullscreen and drag
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Close global search dropdown on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setGlobalOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  // Scroll highlighted card into view after tree re-renders
  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => {
      const el = chartRef.current?.querySelector(`[data-node-id="${highlightedId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, [highlightedId, collapsed]);

  // Global search suggestions — name OR employee number, all colaboradores
  const globalSuggestions = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (q.length < 1) return [];
    return colaboradores
      .filter((c) => {
        const nombre = ((c["nombre_completo"] as string) ?? "").toLowerCase();
        const empId  = String(c["id_empleado"] ?? "").toLowerCase();
        return nombre.includes(q) || empId.includes(q);
      })
      .slice(0, 8);
  }, [globalSearch, colaboradores]);

  function handleNavigateTo(colab: ColabRaw) {
    const targetId  = colab["id"] as string;
    const targetOrg = (colab["organización"] as string) ?? "";
    const targetEmpId = colab["id_empleado"] ? String(colab["id_empleado"]) : "";
    const label = targetEmpId
      ? `${colab["nombre_completo"]} (${targetEmpId})`
      : (colab["nombre_completo"] as string);

    // Switch to UEN mode for the person's UEN
    setModo("uen");
    setSelectedUen(targetOrg);
    setGlobalSearch(label);
    setGlobalOpen(false);
    setHighlightedId(targetId);

    // Build the UEN tree and find the path to the person
    const { roots: uenTree } = buildTree(
      colaboradores,
      (c) => (c["organización"] as string) === targetOrg
    );
    const path = findPathToNode(uenTree, targetId);

    // Start from collapsed-at-maxDepth, then open every ancestor
    const newCollapsed = computeCollapsed(uenTree, maxDepth);
    if (path) {
      // Remove all nodes on the path from collapsed so they're visible
      for (const id of path) newCollapsed.delete(id);
    }
    setCollapsed(newCollapsed);
  }

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

  // Split roots: those with children (real hierarchy) vs. leaf orphans (no jefe assigned)
  const { treeRoots, orphanRoots } = useMemo(() => {
    if (modo !== "uen") return { treeRoots: displayRoots, orphanRoots: [] };
    return {
      treeRoots:   displayRoots.filter((n) => n.children.length > 0),
      orphanRoots: displayRoots.filter((n) => n.children.length === 0),
    };
  }, [displayRoots, modo]);

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
    return count(treeRoots) + orphanRoots.length;
  }, [treeRoots, orphanRoots, collapsed]);

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

          {/* ── Global search ── */}
          <div ref={searchRef} className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </span>
            <input
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setGlobalOpen(true);
                setHighlightedId(null);
              }}
              onFocus={() => { if (globalSuggestions.length > 0) setGlobalOpen(true); }}
              placeholder="Buscar por nombre o No. empleado…"
              autoComplete="off"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
            />
            {globalSearch && (
              <button
                onClick={() => { setGlobalSearch(""); setHighlightedId(null); setGlobalOpen(false); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                tabIndex={-1}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {globalOpen && globalSuggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 w-80 overflow-hidden">
                {globalSuggestions.map((c) => {
                  const empId = c["id_empleado"] ? String(c["id_empleado"]) : null;
                  return (
                    <button
                      key={c["id"] as string}
                      onMouseDown={(e) => { e.preventDefault(); handleNavigateTo(c); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#1a3a5c] hover:text-white transition-colors border-b border-gray-50 last:border-0 group"
                    >
                      <p className="font-semibold text-sm text-gray-900 group-hover:text-white leading-snug">
                        {c["nombre_completo"] as string}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {empId && (
                          <span className="font-mono text-[10px] text-gray-400 group-hover:text-blue-200">{empId}</span>
                        )}
                        <span className="text-xs text-gray-400 group-hover:text-blue-100 truncate">
                          {c["puesto"] as string}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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

        {/* Chart + orphan panel wrapper */}
        <div className="relative">
          {/* Orphan panel — top right, only in UEN mode when there are orphans */}
          {modo === "uen" && orphanRoots.length > 0 && (
            <div className="no-print absolute top-3 right-3 z-10 bg-amber-50 border border-amber-200 rounded-xl shadow-md p-3 max-w-[220px]">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <span>⚠</span> Sin jefe asignado ({orphanRoots.length})
              </p>
              <div className="space-y-1.5">
                {orphanRoots.map((n) => (
                  <a
                    key={n.id}
                    href={`/carpeta/${n.id}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-amber-100 hover:border-amber-300 transition-colors group"
                  >
                    <Avatar id={n.id} nombre={n.nombre} size={28} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-gray-800 truncate leading-snug group-hover:text-[#1a3a5c]">
                        {n.nombre}
                      </p>
                      <p className="text-[9px] text-gray-400 truncate">{n.puesto}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

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
              {treeRoots.length === 0 && orphanRoots.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  {modo === "persona"
                    ? "Busca un colaborador para ver su organigrama"
                    : "No hay colaboradores en esta UEN"}
                </div>
              ) : treeRoots.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">
                  Todos los colaboradores de esta UEN están sin jefe asignado
                </div>
              ) : (
                <ul className="org-root-list">
                  {treeRoots.map((node) => (
                    <OrgTreeNode
                      key={node.id}
                      node={node}
                      collapsed={collapsed}
                      onToggle={toggleCollapse}
                      highlightedId={highlightedId}
                      isRoot
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
