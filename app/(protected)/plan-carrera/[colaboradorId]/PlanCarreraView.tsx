"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { PlanCarreraFull, PlanCarreraObjetivo } from "@/app/actions/plan_carrera";
import { agregarObjetivo, actualizarPrioridadObjetivo, desactivarObjetivo } from "@/app/actions/plan_carrera";
import type { PlanCarreraNota } from "@/app/actions/plan_carrera_notas";
import { agregarNota, editarNota } from "@/app/actions/plan_carrera_notas";

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

const SECCIONES = [
  { key: "fortalezas",              label: "Fortalezas observadas y por consolidar",          placeholder: "Describe las fortalezas que se identificaron en la conversación…" },
  { key: "areas_desarrollo",        label: "Áreas de desarrollo / comportamientos esperados", placeholder: "Comportamientos, habilidades o competencias a desarrollar…" },
  { key: "logros_experiencias",     label: "Logros o experiencias observadas",                placeholder: "Logros relevantes o experiencias que destacaron…" },
  { key: "experiencias_requeridas", label: "Experiencias requeridas o sugeridas",              placeholder: "Qué tipo de experiencias recomienda el director o CH para este rol…" },
  { key: "observaciones",           label: "Observaciones generales",                          placeholder: "Cualquier comentario adicional, contexto o acuerdo…" },
] as const;

type SeccionKey = (typeof SECCIONES)[number]["key"];

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PlanCarreraView({
  colab,
  plan: initialPlan,
  notas: initialNotas,
  catalogo,
}: {
  colab: ColabInfo;
  plan: PlanCarreraFull | null;
  notas: PlanCarreraNota[];
  catalogo: CatalogItem[];
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [notas, setNotas] = useState<PlanCarreraNota[]>(initialNotas);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function showFlash(msg: string, ok = true) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  }

  const activeObjetivos = (plan?.objetivos ?? [])
    .filter((o) => o.activo)
    .sort((a, b) => a.prioridad - b.prioridad);

  function handleNotaAdded(nota: PlanCarreraNota) {
    setNotas((prev) => [...prev, nota]);
  }

  function handleNotaEdited(notaId: string, updated: Partial<PlanCarreraNota>) {
    setNotas((prev) => prev.map((n) => n.id === notaId ? { ...n, ...updated } : n));
  }

  function handleDesactivarObjetivo(objetivoId: string) {
    if (activeObjetivos.length <= 1) { showFlash("No puedes eliminar el único objetivo activo", false); return; }
    startTransition(async () => {
      const res = await desactivarObjetivo(objetivoId);
      if (!res.ok) { showFlash(res.error ?? "Error", false); return; }
      setPlan((prev) => prev ? { ...prev, objetivos: prev.objetivos.map((o) => o.id === objetivoId ? { ...o, activo: false } : o) } : prev);
      showFlash("Objetivo removido");
    });
  }

  function handlePrioridadChange(objetivoId: string, delta: -1 | 1) {
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

  function handleObjetivoAdded(objetivo: PlanCarreraObjetivo) {
    setPlan((prev) => prev ? { ...prev, objetivos: [...prev.objetivos, objetivo] } : prev);
  }

  // ── No plan ────────────────────────────────────────────────────────────────

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">📋</div>
          <h1 className="text-xl font-bold text-gray-900">Sin Expediente de Talento</h1>
          <p className="text-sm text-gray-500">
            {colab.nombre_completo} no tiene un expediente aún.
            Se genera automáticamente al validar un match de sucesión.
          </p>
          <Link href="/sucesion" className="inline-block text-sm font-medium text-[#1a3a5c] hover:underline">
            ← Ir al Motor de Matching
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {flash && (
        <div className={`fixed top-4 right-4 z-50 text-sm px-4 py-2.5 rounded-lg shadow-lg border font-medium ${
          flash.ok ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"
        }`}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a3a5c] text-white">
        <div className="relative px-6 py-8 md:px-10"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "32px 32px",
          }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-5 text-xs text-white/50">
              <Link href="/sucesion" className="hover:text-white/80 transition-colors">Motor de Matching</Link>
              <span>/</span>
              <Link href="/plan-carrera" className="hover:text-white/80 transition-colors">Expedientes</Link>
              <span>/</span>
              <span className="text-white/70">{colab.nombre_completo}</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Expediente de Talento</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{colab.nombre_completo}</h1>
                <p className="text-white/70 text-sm mt-1">{colab.puesto} · {colab.nivel} · {colab.organización}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    { label: "Área", value: colab.area },
                    { label: "Ciclo", value: String(plan.ciclo_año) },
                    { label: "Entradas", value: String(notas.length) },
                  ].map(({ label, value }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/20 text-white/80">
                      <span className="text-white/50">{label}:</span>
                      <span className="font-medium text-white">{value || "—"}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Posiciones objetivo */}
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

        {/* Hilo de notas */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Hilo de entradas</h2>
            <span className="text-xs text-gray-400">{notas.length} entrada{notas.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-4">
            {notas.map((nota) => (
              <NotaCard
                key={nota.id}
                nota={nota}
                onEdited={handleNotaEdited}
                onFlash={showFlash}
              />
            ))}

            {/* Nueva entrada */}
            <NuevaNotaForm
              planId={plan.id}
              onAdded={handleNotaAdded}
              onFlash={showFlash}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NotaCard ───────────────────────────────────────────────────────────────

function NotaCard({
  nota,
  onEdited,
  onFlash,
}: {
  nota: PlanCarreraNota;
  onEdited: (id: string, updated: Partial<PlanCarreraNota>) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<SeccionKey, string>>({
    fortalezas:              nota.fortalezas ?? "",
    areas_desarrollo:        nota.areas_desarrollo ?? "",
    logros_experiencias:     nota.logros_experiencias ?? "",
    experiencias_requeridas: nota.experiencias_requeridas ?? "",
    observaciones:           nota.observaciones ?? "",
  });
  const [isPending, startTransition] = useTransition();

  const isCreacion = nota.tipo === "creacion";

  function handleSave() {
    startTransition(async () => {
      const res = await editarNota(nota.id, {
        fortalezas:              form.fortalezas || null,
        areas_desarrollo:        form.areas_desarrollo || null,
        logros_experiencias:     form.logros_experiencias || null,
        experiencias_requeridas: form.experiencias_requeridas || null,
        observaciones:           form.observaciones || null,
      });
      if (!res.ok) { onFlash(res.error ?? "Error al guardar", false); return; }
      onEdited(nota.id, {
        ...form,
        fortalezas:              form.fortalezas || null,
        areas_desarrollo:        form.areas_desarrollo || null,
        logros_experiencias:     form.logros_experiencias || null,
        experiencias_requeridas: form.experiencias_requeridas || null,
        observaciones:           form.observaciones || null,
        editado_en:              new Date().toISOString(),
      });
      setEditing(false);
      onFlash("Entrada actualizada");
    });
  }

  const seccionesConContenido = SECCIONES.filter((s) => nota[s.key]);

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isCreacion ? "border-[#1a3a5c]/20" : "border-gray-200"}`}>
      {/* Card header */}
      <div className={`px-5 py-3 flex items-center justify-between ${isCreacion ? "bg-[#1a3a5c]/5" : "bg-gray-50"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isCreacion ? "bg-[#1a3a5c]" : "bg-emerald-500"}`} />
          <div>
            <span className="text-xs font-semibold text-gray-700">
              {isCreacion ? "Expediente creado" : "Sesión documentada"}
            </span>
            <span className="text-xs text-gray-400 ml-2">{formatFecha(nota.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {nota.autor_nombre && (
            <span className="text-xs text-gray-400">{nota.autor_nombre}</span>
          )}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-[#1a3a5c] transition-colors"
            >
              Editar
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4">
        {editing ? (
          /* ── Edit mode ── */
          <div className="space-y-4">
            {SECCIONES.map((s) => (
              <div key={s.key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {s.label}
                </label>
                <textarea
                  rows={3}
                  value={form[s.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  placeholder={s.placeholder}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none leading-relaxed"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
              >
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm({
                    fortalezas:              nota.fortalezas ?? "",
                    areas_desarrollo:        nota.areas_desarrollo ?? "",
                    logros_experiencias:     nota.logros_experiencias ?? "",
                    experiencias_requeridas: nota.experiencias_requeridas ?? "",
                    observaciones:           nota.observaciones ?? "",
                  });
                }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <div className="space-y-4">
            {seccionesConContenido.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {isCreacion ? nota.observaciones : "Sin contenido registrado."}
              </p>
            ) : (
              seccionesConContenido.map((s) => (
                <div key={s.key}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{nota[s.key]}</p>
                </div>
              ))
            )}

            {nota.editado_en && (
              <p className="text-[10px] text-gray-300 pt-2 border-t border-gray-50">
                Editado el {formatFecha(nota.editado_en)}{nota.editado_por_nombre ? ` por ${nota.editado_por_nombre}` : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NuevaNotaForm ──────────────────────────────────────────────────────────

function NuevaNotaForm({
  planId,
  onAdded,
  onFlash,
}: {
  planId: string;
  onAdded: (nota: PlanCarreraNota) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<SeccionKey, string>>({
    fortalezas: "", areas_desarrollo: "", logros_experiencias: "",
    experiencias_requeridas: "", observaciones: "",
  });
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const hasContent = Object.values(form).some((v) => v.trim());
    if (!hasContent) { onFlash("Agrega contenido en al menos una sección", false); return; }

    startTransition(async () => {
      const res = await agregarNota({
        planId,
        fortalezas:              form.fortalezas || null,
        areas_desarrollo:        form.areas_desarrollo || null,
        logros_experiencias:     form.logros_experiencias || null,
        experiencias_requeridas: form.experiencias_requeridas || null,
        observaciones:           form.observaciones || null,
      });
      if (!res.ok) { onFlash(res.error ?? "Error al guardar", false); return; }
      if (res.data) onAdded(res.data);
      setForm({ fortalezas: "", areas_desarrollo: "", logros_experiencias: "", experiencias_requeridas: "", observaciones: "" });
      setOpen(false);
      onFlash("Entrada agregada al expediente");
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1a3a5c]/30 hover:text-[#1a3a5c] transition-colors"
      >
        + Documentar nueva sesión
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#1a3a5c]/20 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-[#1a3a5c]/5 border-b border-[#1a3a5c]/10">
        <p className="text-sm font-semibold text-[#1a3a5c]">Nueva entrada — Sesión documentada</p>
        <p className="text-xs text-gray-500 mt-0.5">Llena las secciones que apliquen. No es necesario completar todas.</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {SECCIONES.map((s) => (
          <div key={s.key}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {s.label}
            </label>
            <textarea
              rows={3}
              value={form[s.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={s.placeholder}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none leading-relaxed"
            />
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar entrada"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
          >
            Cancelar
          </button>
        </div>
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
      window.location.reload();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Posiciones objetivo</p>
          <p className="text-xs text-gray-400 mt-0.5">Prioridad 1 = objetivo principal</p>
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
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button onClick={() => onPrioridad(obj.id, -1)} disabled={idx === 0 || isPending}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none">▲</button>
              <button onClick={() => onPrioridad(obj.id, 1)} disabled={idx === objetivos.length - 1 || isPending}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none">▼</button>
            </div>
            <button onClick={() => onDesactivar(obj.id)} disabled={isPending}
              className="text-gray-200 hover:text-red-400 disabled:opacity-20 transition-colors flex-shrink-0 text-xs"
              title="Remover objetivo">✕</button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/60 space-y-3">
          <select value={selectedPuestoId} onChange={(e) => setSelectedPuestoId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]">
            <option value="">Selecciona un puesto...</option>
            {catalogo.filter((c) => !existingIds.has(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.org ? ` — ${c.org}` : ""}</option>
            ))}
          </select>
          <input type="text" placeholder="Notas / justificación (opcional)" value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
          <div className="flex gap-2">
            <button onClick={handleAgregarObjetivo} disabled={!selectedPuestoId || isPendingLocal}
              className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors">
              {isPendingLocal ? "Agregando…" : "Agregar objetivo"}
            </button>
            <button onClick={() => { setShowAdd(false); setSelectedPuestoId(""); setNotas(""); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
