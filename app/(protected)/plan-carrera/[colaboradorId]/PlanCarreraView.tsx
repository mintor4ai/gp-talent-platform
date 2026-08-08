"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  PlanCarreraFull,
  PlanCarreraObjetivo,
  PlanCarreraAccion,
  PlanCarreraRevision,
} from "@/app/actions/plan_carrera";
import {
  agregarObjetivo,
  actualizarPrioridadObjetivo,
  actualizarNotasObjetivo,
  desactivarObjetivo,
  agregarAccion,
  actualizarAccion,
  actualizarEstadoAccion,
  calificarAccion,
  eliminarAccion,
  generarSugerenciasIA,
  crearRevision,
} from "@/app/actions/plan_carrera";

// ── Types ──────────────────────────────────────────────────────────────────

type ColabInfo = {
  id: string;
  nombre_completo: string;
  puesto: string;
  nivel: string;
  area: string;
  organización: string;
};

type CatalogItem = {
  id: string;
  nombre: string;
  org: string;
  es_critico: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────

const DIMENSION_CONFIG = {
  tecnica: {
    label: "Competencias Técnicas",
    icon: "⚙️",
    color: "bg-blue-50 border-blue-200 text-blue-800",
    badge: "bg-blue-100 text-blue-700",
    accent: "bg-blue-500",
  },
  liderazgo: {
    label: "Liderazgo y Gestión",
    icon: "🧭",
    color: "bg-violet-50 border-violet-200 text-violet-800",
    badge: "bg-violet-100 text-violet-700",
    accent: "bg-violet-500",
  },
  visibilidad: {
    label: "Visibilidad Ejecutiva",
    icon: "📡",
    color: "bg-amber-50 border-amber-200 text-amber-800",
    badge: "bg-amber-100 text-amber-700",
    accent: "bg-amber-500",
  },
  operativa: {
    label: "Experiencia Operativa",
    icon: "🏗️",
    color: "bg-emerald-50 border-emerald-200 text-emerald-800",
    badge: "bg-emerald-100 text-emerald-700",
    accent: "bg-emerald-500",
  },
} as const;

const TIPO_LABELS: Record<PlanCarreraAccion["tipo"], string> = {
  capacitacion: "Capacitación",
  proyecto:     "Proyecto",
  mentoria:     "Mentoría",
  rotacion:     "Rotación",
  visibilidad:  "Visibilidad",
};

const TIPO_COLORS: Record<PlanCarreraAccion["tipo"], string> = {
  capacitacion: "bg-blue-100 text-blue-700",
  proyecto:     "bg-violet-100 text-violet-700",
  mentoria:     "bg-pink-100 text-pink-700",
  rotacion:     "bg-orange-100 text-orange-700",
  visibilidad:  "bg-cyan-100 text-cyan-700",
};

const ESTADO_ACCION_CONFIG = {
  pendiente:   { label: "Pendiente",    icon: "○", color: "text-gray-400" },
  en_progreso: { label: "En progreso",  icon: "◐", color: "text-blue-500" },
  completado:  { label: "Completado",   icon: "✓", color: "text-emerald-600" },
  cancelado:   { label: "Cancelado",    icon: "✕", color: "text-gray-300" },
} as const;

type Dimension = keyof typeof DIMENSION_CONFIG;
type AccionTipo = PlanCarreraAccion["tipo"];
type AccionEstado = PlanCarreraAccion["estado"];

// ── Helpers ────────────────────────────────────────────────────────────────

function dimensionProgress(acciones: PlanCarreraAccion[], dim: Dimension): number {
  const dimAcciones = acciones.filter((a) => a.dimension === dim && a.estado !== "cancelado");
  if (!dimAcciones.length) return 0;
  const completed = dimAcciones.filter((a) => a.estado === "completado").length;
  return Math.round((completed / dimAcciones.length) * 100);
}

function globalProgress(acciones: PlanCarreraAccion[]): number {
  const active = acciones.filter((a) => a.estado !== "cancelado");
  if (!active.length) return 0;
  const completed = active.filter((a) => a.estado === "completado").length;
  return Math.round((completed / active.length) * 100);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PlanCarreraView({
  colab,
  plan: initialPlan,
  catalogo,
}: {
  colab: ColabInfo;
  plan: PlanCarreraFull | null;
  catalogo: CatalogItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [plan, setPlan] = useState<PlanCarreraFull | null>(initialPlan);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expandedDims, setExpandedDims] = useState<Set<Dimension>>(
    new Set(["tecnica", "liderazgo", "visibilidad", "operativa"])
  );

  function showFlash(msg: string, ok = true) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  }

  function toggleDim(d: Dimension) {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  const progress = useMemo(() => globalProgress(plan?.acciones ?? []), [plan]);
  const activeObjetivos = useMemo(
    () => (plan?.objetivos ?? []).filter((o) => o.activo).sort((a, b) => a.prioridad - b.prioridad),
    [plan]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleAccionEstadoChange(accionId: string, nuevoEstado: AccionEstado, comentario?: string) {
    if (!plan) return;
    startTransition(async () => {
      const res = await actualizarEstadoAccion(accionId, nuevoEstado, comentario ?? null);
      if (!res.ok) { showFlash(res.error ?? "Error", false); return; }
      setPlan((prev) => prev ? {
        ...prev,
        acciones: prev.acciones.map((a) =>
          a.id === accionId
            ? { ...a, estado: nuevoEstado, comentario_resultado: comentario ?? a.comentario_resultado }
            : a
        ),
      } : prev);
    });
  }

  function handleAccionUpdate(accionId: string, fields: { titulo?: string; descripcion?: string }) {
    if (!plan) return;
    startTransition(async () => {
      const res = await actualizarAccion(accionId, fields);
      if (!res.ok) { showFlash(res.error ?? "Error al guardar", false); return; }
      setPlan((prev) => prev ? {
        ...prev,
        acciones: prev.acciones.map((a) => a.id === accionId ? { ...a, ...fields } : a),
      } : prev);
    });
  }

  function handleCalificarAccion(accionId: string, cal: number | null) {
    if (!plan) return;
    startTransition(async () => {
      const res = await calificarAccion(accionId, cal);
      if (!res.ok) { showFlash(res.error ?? "Error", false); return; }
      setPlan((prev) => prev ? {
        ...prev,
        acciones: prev.acciones.map((a) => a.id === accionId ? { ...a, calificacion: cal } : a),
      } : prev);
    });
  }

  function handleEliminarAccion(accionId: string) {
    if (!plan) return;
    startTransition(async () => {
      const res = await eliminarAccion(accionId);
      if (!res.ok) { showFlash(res.error ?? "Error", false); return; }
      setPlan((prev) => prev ? {
        ...prev,
        acciones: prev.acciones.filter((a) => a.id !== accionId),
      } : prev);
    });
  }

  function handleDesactivarObjetivo(objetivoId: string) {
    if (!plan || activeObjetivos.length <= 1) {
      showFlash("No puedes eliminar el único objetivo activo", false);
      return;
    }
    startTransition(async () => {
      const res = await desactivarObjetivo(objetivoId);
      if (!res.ok) { showFlash(res.error ?? "Error", false); return; }
      setPlan((prev) => prev ? {
        ...prev,
        objetivos: prev.objetivos.map((o) =>
          o.id === objetivoId ? { ...o, activo: false } : o
        ),
      } : prev);
      showFlash("Objetivo removido");
    });
  }

  function handlePrioridadChange(objetivoId: string, delta: -1 | 1) {
    if (!plan) return;
    const sorted = [...activeObjetivos];
    const idx = sorted.findIndex((o) => o.id === objetivoId);
    if (idx < 0) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const current = sorted[idx];
    const target = sorted[targetIdx];

    startTransition(async () => {
      await Promise.all([
        actualizarPrioridadObjetivo(current.id, target.prioridad),
        actualizarPrioridadObjetivo(target.id, current.prioridad),
      ]);
      setPlan((prev) => prev ? {
        ...prev,
        objetivos: prev.objetivos.map((o) => {
          if (o.id === current.id) return { ...o, prioridad: target.prioridad };
          if (o.id === target.id)  return { ...o, prioridad: current.prioridad };
          return o;
        }),
      } : prev);
    });
  }

  function handleAccionAdded(accion: PlanCarreraAccion) {
    setPlan((prev) => prev ? { ...prev, acciones: [...prev.acciones, accion] } : prev);
  }

  function handleObjetivoAdded(objetivo: PlanCarreraObjetivo) {
    setPlan((prev) => prev ? { ...prev, objetivos: [...prev.objetivos, objetivo] } : prev);
  }

  function handleSugerenciasGeneradas(nuevasAcciones: PlanCarreraAccion[]) {
    setPlan((prev) => prev ? { ...prev, acciones: [...prev.acciones, ...nuevasAcciones] } : prev);
  }

  // ── No plan state ─────────────────────────────────────────────────────────

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">📐</div>
          <h1 className="text-xl font-bold text-gray-900">Sin Plano de Carrera</h1>
          <p className="text-sm text-gray-500">
            {colab.nombre_completo} no tiene un Plano de Carrera aún.
            Se genera automáticamente al validar un match de sucesión.
          </p>
          <Link
            href="/sucesion"
            className="inline-block text-sm font-medium text-[#1a3a5c] hover:underline"
          >
            ← Ir al Motor de Matching
          </Link>
        </div>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Flash */}
      {flash && (
        <div className={`fixed top-4 right-4 z-50 text-sm px-4 py-2.5 rounded-lg shadow-lg border font-medium transition-all ${
          flash.ok
            ? "bg-green-50 text-green-800 border-green-200"
            : "bg-red-50 text-red-800 border-red-200"
        }`}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a3a5c] text-white">
        {/* Blueprint grid overlay */}
        <div
          className="relative px-6 py-8 md:px-10"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "32px 32px",
          }}
        >
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-5 text-xs text-white/50">
              <Link href="/sucesion" className="hover:text-white/80 transition-colors">
                Motor de Matching
              </Link>
              <span>/</span>
              <span className="text-white/70">Plano de Carrera</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{colab.nombre_completo}</h1>
                <p className="text-white/70 text-sm mt-1">
                  {colab.puesto} · {colab.nivel} · {colab.organización}
                </p>

                {/* Snapshot chips */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {[
                    { label: "UEN", value: (plan.snapshot_json["organización"] as string) ?? colab.organización },
                    { label: "Área", value: (plan.snapshot_json["area"] as string) ?? colab.area },
                    { label: "Ciclo", value: String(plan.ciclo_año) },
                    { label: "Nivel", value: (plan.snapshot_json["nivel"] as string) ?? colab.nivel },
                  ].map(({ label, value }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/20 text-white/80"
                    >
                      <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-white/50">{label}:</span>
                      <span className="font-medium text-white">{value || "—"}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Global progress */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-6 py-4 border border-white/20 min-w-[180px]">
                <p className="text-xs text-white/60 mb-1.5 font-medium uppercase tracking-wider">Progreso global</p>
                <div className="text-3xl font-bold tabular-nums">{progress}%</div>
                <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-white/40">
                  {[0, 25, 50, 75, 100].map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Objectives row */}
        <ObjetivosSection
          objetivos={activeObjetivos}
          planId={plan.id}
          catalogo={catalogo}
          isPending={isPending}
          onPrioridad={handlePrioridadChange}
          onDesactivar={handleDesactivarObjetivo}
          onAdded={handleObjetivoAdded}
          onFlash={showFlash}
        />

        {/* Dimensions */}
        <div className="space-y-4">
          {(Object.keys(DIMENSION_CONFIG) as Dimension[]).map((dim) => {
            const cfg = DIMENSION_CONFIG[dim];
            const dimAcciones = plan.acciones.filter((a) => a.dimension === dim);
            const prog = dimensionProgress(plan.acciones, dim);
            const expanded = expandedDims.has(dim);

            return (
              <div key={dim} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Dimension header */}
                <button
                  onClick={() => toggleDim(dim)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cfg.icon}</span>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{cfg.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {dimAcciones.filter((a) => a.estado === "completado").length} / {dimAcciones.filter((a) => a.estado !== "cancelado").length} acciones completadas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-right">
                      <div className="text-right">
                        <span className="text-lg font-bold tabular-nums text-gray-800">{prog}%</span>
                      </div>
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${cfg.accent}`}
                          style={{ width: `${prog}%` }}
                        />
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100">
                    {/* Actions list */}
                    {dimAcciones.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {dimAcciones.map((accion) => (
                          <AccionRow
                            key={accion.id}
                            accion={accion}
                            dimConfig={cfg}
                            onEstadoChange={handleAccionEstadoChange}
                            onUpdate={handleAccionUpdate}
                            onCalificar={handleCalificarAccion}
                            onEliminar={handleEliminarAccion}
                            isPending={isPending}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-5 py-6 text-center text-sm text-gray-400">
                        Sin acciones aún. Agrega una manualmente o usa las Sugerencias IA.
                      </div>
                    )}

                    {/* Add action + AI buttons */}
                    <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                      <AddAccionInline
                        planId={plan.id}
                        dimension={dim}
                        objetivos={activeObjetivos}
                        onAdded={handleAccionAdded}
                        onFlash={showFlash}
                      />
                      <IAButton
                        planId={plan.id}
                        colaboradorId={plan.colaborador_id}
                        matchId={activeObjetivos[0]?.match_id ?? null}
                        dimension={dim}
                        puestoObjetivo={activeObjetivos[0]?.puesto_nombre ?? ""}
                        objetivoId={activeObjetivos[0]?.id ?? null}
                        onGeneradas={handleSugerenciasGeneradas}
                        onFlash={showFlash}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Revisiones section */}
        <RevisionesSection
          planId={plan.id}
          revisiones={plan.revisiones}
          onFlash={showFlash}
        />
      </div>
    </div>
  );
}

// ── ObjetivosSection ───────────────────────────────────────────────────────

function ObjetivosSection({
  objetivos,
  planId,
  catalogo,
  isPending,
  onPrioridad,
  onDesactivar,
  onAdded,
  onFlash,
}: {
  objetivos: PlanCarreraObjetivo[];
  planId: string;
  catalogo: CatalogItem[];
  isPending: boolean;
  onPrioridad: (id: string, delta: -1 | 1) => void;
  onDesactivar: (id: string) => void;
  onAdded: (o: PlanCarreraObjetivo) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPuestoId, setSelectedPuestoId] = useState("");
  const [notas, setNotas] = useState("");
  const [isPendingLocal, startTransition] = useTransition();
  const existingIds = new Set(objetivos.map((o) => o.puesto_catalogo_id));

  function handleAgregarObjetivo() {
    if (!selectedPuestoId) return;
    startTransition(async () => {
      const res = await agregarObjetivo({ planId, puestoCatalogoId: selectedPuestoId, notas: notas.trim() || null });
      if (!res.ok) { onFlash(res.error ?? "Error", false); return; }
      // Reload page to get the joined data
      window.location.reload();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Posiciones objetivo</p>
          <p className="text-xs text-gray-400 mt-0.5">Prioridad 1 = objetivo principal. Arrastra para reordenar.</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] transition-colors"
        >
          + Agregar alternativa
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {objetivos.map((obj, idx) => (
          <div key={obj.id} className="flex items-center gap-3 px-5 py-3">
            {/* Priority badge */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              idx === 0 ? "bg-[#1a3a5c] text-white" : "bg-gray-100 text-gray-500"
            }`}>
              {obj.prioridad}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{obj.puesto_nombre ?? obj.puesto_catalogo_id}</p>
              {obj.puesto_org && <p className="text-xs text-gray-400">{obj.puesto_org}</p>}
              {obj.notas && <p className="text-xs text-gray-500 italic mt-0.5">{obj.notas}</p>}
            </div>

            {idx === 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a3a5c]/10 text-[#1a3a5c] font-medium flex-shrink-0">
                Principal
              </span>
            )}

            {/* Move up/down */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                onClick={() => onPrioridad(obj.id, -1)}
                disabled={idx === 0 || isPending}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none"
                title="Subir prioridad"
              >
                ▲
              </button>
              <button
                onClick={() => onPrioridad(obj.id, 1)}
                disabled={idx === objetivos.length - 1 || isPending}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none"
                title="Bajar prioridad"
              >
                ▼
              </button>
            </div>

            {/* Remove */}
            <button
              onClick={() => onDesactivar(obj.id)}
              disabled={isPending}
              className="text-gray-200 hover:text-red-400 disabled:opacity-20 transition-colors flex-shrink-0 text-xs"
              title="Remover objetivo"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/60 space-y-3">
          <select
            value={selectedPuestoId}
            onChange={(e) => setSelectedPuestoId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          >
            <option value="">Selecciona un puesto...</option>
            {catalogo
              .filter((c) => !existingIds.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.org ? ` — ${c.org}` : ""}
                </option>
              ))}
          </select>
          <input
            type="text"
            placeholder="Notas / justificación (opcional)"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAgregarObjetivo}
              disabled={!selectedPuestoId || isPendingLocal}
              className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
            >
              {isPendingLocal ? "Agregando…" : "Agregar objetivo"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setSelectedPuestoId(""); setNotas(""); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AccionRow ──────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (hovered ?? value ?? 0) >= star;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === star ? null : star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className={`text-base leading-none transition-colors disabled:cursor-default ${
              filled ? "text-amber-400" : "text-gray-200 hover:text-amber-300"
            }`}
            title={`${star} estrella${star > 1 ? "s" : ""}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function AccionRow({
  accion,
  dimConfig,
  onEstadoChange,
  onUpdate,
  onCalificar,
  onEliminar,
  isPending,
}: {
  accion: PlanCarreraAccion;
  dimConfig: (typeof DIMENSION_CONFIG)[Dimension];
  onEstadoChange: (id: string, estado: AccionEstado, comentario?: string) => void;
  onUpdate: (id: string, fields: { titulo?: string; descripcion?: string }) => void;
  onCalificar: (id: string, cal: number | null) => void;
  onEliminar: (id: string) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitulo, setEditTitulo] = useState(accion.titulo);
  const [editDesc, setEditDesc] = useState(accion.descripcion ?? "");
  const [showComentario, setShowComentario] = useState(false);
  const [comentario, setComentario] = useState(accion.comentario_resultado ?? "");
  const [pendingEstado, setPendingEstado] = useState<AccionEstado | null>(null);

  const estadoCfg = ESTADO_ACCION_CONFIG[accion.estado];
  const estadoOptions: AccionEstado[] = ["pendiente", "en_progreso", "completado", "cancelado"];
  const needsComentario = (e: string) => e === "completado" || e === "cancelado";

  function handleEstadoChange(nuevoEstado: AccionEstado) {
    if (needsComentario(nuevoEstado)) {
      setPendingEstado(nuevoEstado);
      setShowComentario(true);
    } else {
      onEstadoChange(accion.id, nuevoEstado);
    }
  }

  function handleConfirmComentario() {
    if (!pendingEstado) return;
    onEstadoChange(accion.id, pendingEstado, comentario.trim() || undefined);
    setShowComentario(false);
    setPendingEstado(null);
  }

  function handleSaveEdit() {
    if (!editTitulo.trim()) return;
    onUpdate(accion.id, {
      titulo: editTitulo.trim(),
      descripcion: editDesc.trim() || undefined,
    });
    setEditing(false);
  }

  return (
    <div className={`px-5 py-3 ${accion.estado === "cancelado" ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Estado select */}
        <select
          value={accion.estado}
          onChange={(e) => handleEstadoChange(e.target.value as AccionEstado)}
          disabled={isPending}
          className={`text-sm border-0 bg-transparent cursor-pointer focus:outline-none pt-0.5 flex-shrink-0 ${estadoCfg.color}`}
          title="Cambiar estado"
        >
          {estadoOptions.map((e) => (
            <option key={e} value={e}>{ESTADO_ACCION_CONFIG[e].icon} {ESTADO_ACCION_CONFIG[e].label}</option>
          ))}
        </select>

        <div className="flex-1 min-w-0">
          {editing ? (
            /* ── Edit mode ── */
            <div className="space-y-2">
              <input
                autoFocus
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
              />
              <textarea
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={isPending}
                  className="text-xs bg-[#1a3a5c] text-white px-3 py-1 rounded-lg hover:bg-[#152e4d] disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  onClick={() => { setEditing(false); setEditTitulo(accion.titulo); setEditDesc(accion.descripcion ?? ""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <>
              <div className="flex items-start gap-2 flex-wrap">
                <p
                  className={`text-sm font-medium cursor-pointer hover:text-[#1a3a5c] transition-colors ${
                    accion.estado === "completado" ? "line-through text-gray-400" : "text-gray-900"
                  }`}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {accion.titulo}
                </p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLORS[accion.tipo]}`}>
                  {TIPO_LABELS[accion.tipo]}
                </span>
                {accion.origen === "ia" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600">
                    ✨ IA
                  </span>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
                  title="Editar acción"
                >
                  ✎
                </button>
              </div>

              {expanded && (
                <div className="mt-1 space-y-1.5">
                  {accion.descripcion && (
                    <p className="text-xs text-gray-500 leading-relaxed">{accion.descripcion}</p>
                  )}
                  {accion.fecha_fin_estimada && (
                    <p className="text-[10px] text-gray-400">
                      Estimado: {new Date(accion.fecha_fin_estimada + "T12:00:00").toLocaleDateString("es-MX", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  )}
                  {accion.comentario_resultado && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                        {accion.estado === "completado" ? "Aprendizaje / Resultado" : "Motivo / Comentario"}
                      </p>
                      <p className="text-xs text-gray-700 leading-relaxed">{accion.comentario_resultado}</p>
                    </div>
                  )}
                  {/* Star rating — always visible in expanded view */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">Calificación CH:</span>
                    <StarRating
                      value={accion.calificacion}
                      onChange={(v) => onCalificar(accion.id, v)}
                      disabled={isPending}
                    />
                    {accion.calificacion && (
                      <span className="text-[10px] text-amber-500 font-medium">{accion.calificacion}/5</span>
                    )}
                  </div>
                </div>
              )}

              {!expanded && accion.calificacion && (
                <div className="flex items-center gap-1 mt-0.5">
                  {"★".repeat(accion.calificacion).split("").map((_, i) => (
                    <span key={i} className="text-[10px] text-amber-400">★</span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Comentario modal on estado change */}
          {showComentario && (
            <div className="mt-2 bg-blue-50 rounded-lg p-3 border border-blue-200 space-y-2">
              <p className="text-xs font-medium text-blue-700">
                {pendingEstado === "completado"
                  ? "¿Qué se aprendió o logró con esta acción?"
                  : "¿Por qué se cancela esta acción?"}
              </p>
              <textarea
                rows={2}
                autoFocus
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario (opcional, pero ayuda al historial)"
                className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmComentario}
                  disabled={isPending}
                  className="text-xs bg-[#1a3a5c] text-white px-3 py-1 rounded-lg hover:bg-[#152e4d] disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => { setShowComentario(false); setPendingEstado(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => onEliminar(accion.id)}
          disabled={isPending}
          className="text-gray-200 hover:text-red-400 disabled:opacity-20 transition-colors text-xs flex-shrink-0 pt-0.5"
          title="Eliminar acción"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── AddAccionInline ────────────────────────────────────────────────────────

function AddAccionInline({
  planId,
  dimension,
  objetivos,
  onAdded,
  onFlash,
}: {
  planId: string;
  dimension: Dimension;
  objetivos: PlanCarreraObjetivo[];
  onAdded: (a: PlanCarreraAccion) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<AccionTipo>("capacitacion");
  const [objetivoId, setObjetivoId] = useState<string>("");
  const [fechaFin, setFechaFin] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!titulo.trim()) return;
    startTransition(async () => {
      const res = await agregarAccion({
        planId,
        dimension,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        tipo,
        objetivoId: objetivoId || null,
        fechaFinEstimada: fechaFin || null,
      });
      if (!res.ok) { onFlash(res.error ?? "Error", false); return; }
      if (res.data) onAdded(res.data);
      setTitulo(""); setDescripcion(""); setTipo("capacitacion"); setObjetivoId(""); setFechaFin("");
      setOpen(false);
      onFlash("Acción agregada");
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-[#1a3a5c] transition-colors flex items-center gap-1"
      >
        + Agregar acción
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
      <input
        type="text"
        placeholder="Título de la acción *"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        autoFocus
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
      />
      <textarea
        placeholder="Descripción (opcional)"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        rows={2}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none"
      />
      <div className="flex gap-3 flex-wrap">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as AccionTipo)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
        >
          {(Object.keys(TIPO_LABELS) as AccionTipo[]).map((t) => (
            <option key={t} value={t}>{TIPO_LABELS[t]}</option>
          ))}
        </select>
        {objetivos.length > 1 && (
          <select
            value={objetivoId}
            onChange={(e) => setObjetivoId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            <option value="">Todos los objetivos</option>
            {objetivos.map((o) => (
              <option key={o.id} value={o.id}>{o.puesto_nombre ?? o.puesto_catalogo_id}</option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          title="Fecha estimada de finalización"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!titulo.trim() || isPending}
          className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── IAButton ───────────────────────────────────────────────────────────────

function IAButton({
  planId,
  colaboradorId,
  matchId,
  dimension,
  puestoObjetivo,
  objetivoId,
  onGeneradas,
  onFlash,
}: {
  planId: string;
  colaboradorId: string;
  matchId: string | null;
  dimension: Dimension;
  puestoObjetivo: string;
  objetivoId: string | null;
  onGeneradas: (acciones: PlanCarreraAccion[]) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [brecha, setBrecha] = useState("");
  const [showBrechaInput, setShowBrechaInput] = useState(false);

  async function handleGenerar() {
    setLoading(true);
    const res = await generarSugerenciasIA({
      planId,
      colaboradorId,
      matchId,
      objetivoId,
      dimension,
      puestoObjetivo,
      brecha: brecha.trim() || null,
    });
    setLoading(false);
    if (!res.ok) { onFlash(res.error ?? "Error al generar sugerencias", false); return; }
    // Build PlanCarreraAccion-compatible objects from suggestions for optimistic update
    // The actual saved actions come from the server; trigger a page reload for accuracy
    onFlash(`${res.sugerencias?.length ?? 0} sugerencias generadas ✨`);
    window.location.reload();
  }

  if (!showBrechaInput) {
    return (
      <button
        onClick={() => setShowBrechaInput(true)}
        className="text-xs text-purple-600 hover:text-purple-800 transition-colors flex items-center gap-1 font-medium"
      >
        ✨ Sugerencias IA
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 bg-purple-50 rounded-lg p-3 border border-purple-200">
      <p className="text-xs font-medium text-purple-700">
        ✨ Generar sugerencias IA — {DIMENSION_CONFIG[dimension].label}
      </p>
      <input
        type="text"
        placeholder="Brecha identificada (opcional, mejora la calidad)"
        value={brecha}
        onChange={(e) => setBrecha(e.target.value)}
        className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
      />
      <div className="flex gap-2">
        <button
          onClick={handleGenerar}
          disabled={loading}
          className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Generando…
            </>
          ) : "Generar"}
        </button>
        <button
          onClick={() => { setShowBrechaInput(false); setBrecha(""); }}
          className="text-sm text-purple-500 hover:text-purple-700 px-3 py-1.5 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── RevisionesSection ──────────────────────────────────────────────────────

function RevisionesSection({
  planId,
  revisiones,
  onFlash,
}: {
  planId: string;
  revisiones: PlanCarreraRevision[];
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const currentYear = new Date().getFullYear();
  const hasCurrentYear = revisiones.some((r) => r.ciclo_año === currentYear);

  function handleCrearRevision() {
    startTransition(async () => {
      const res = await crearRevision(planId, currentYear);
      if (!res.ok) { onFlash(res.error ?? "Error", false); return; }
      onFlash("Revisión creada");
      window.location.reload();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Revisiones anuales</p>
          <p className="text-xs text-gray-400 mt-0.5">Seguimiento co-gestionado por CH y jefe directo</p>
        </div>
        {!hasCurrentYear && (
          <button
            onClick={handleCrearRevision}
            disabled={isPending}
            className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
          >
            + Revisión {currentYear}
          </button>
        )}
      </div>

      {revisiones.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          Sin revisiones registradas. Crea la primera para {currentYear}.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {revisiones.map((rev) => (
            <div key={rev.id} className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">Revisión {rev.ciclo_año}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    rev.estado === "completada"
                      ? "bg-green-100 text-green-700"
                      : rev.estado === "en_proceso"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {rev.estado === "completada" ? "Completada" : rev.estado === "en_proceso" ? "En proceso" : "Pendiente"}
                  </span>
                </div>
                {rev.fecha_revision && (
                  <span className="text-xs text-gray-400">
                    {new Date(rev.fecha_revision + "T12:00:00").toLocaleDateString("es-MX", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Capital Humano", value: rev.notas_ch },
                  { label: "Jefe directo", value: rev.notas_jefe },
                  { label: "Colaborador", value: rev.notas_colaborador },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {value ?? <span className="text-gray-300 italic">Sin notas</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
