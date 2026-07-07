"use client";

import { useState, useTransition } from "react";
import { upsertSucesor, deleteSucesor } from "@/app/actions/sucesion";

export type SucesionItem = {
  id: string;
  id_empleado: string;
  ciclo_año: number;
  sucesor_nombre: string;
  sucesor_id: string | null;
  tiempo_estimado: string;
  desarrollo_necesario: string | null;
  notas: string | null;
  created_at: string;
};

type ColabOption = { id: string; nombre_completo: string | null; puesto: string | null };

const PLAZO_OPTIONS = [
  { value: "inmediato",   label: "Inmediato",  sub: "< 6 meses",   color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { value: "corto",       label: "Corto",      sub: "6 m – 1 año", color: "bg-green-100 text-green-800 border-green-300"   },
  { value: "mediano",     label: "Mediano",    sub: "1 – 2 años",  color: "bg-blue-100 text-blue-800 border-blue-300"     },
  { value: "largo",       label: "Largo",      sub: "2 – 3 años",  color: "bg-amber-100 text-amber-800 border-amber-300"  },
  { value: "largo_plazo", label: "Largo plazo",sub: "3+ años",     color: "bg-orange-100 text-orange-800 border-orange-300"},
];

function plazoBadge(value: string) {
  return PLAZO_OPTIONS.find((p) => p.value === value) ?? PLAZO_OPTIONS[2];
}

// ── Form ──────────────────────────────────────────────────────────────────────

function SucesorForm({
  colaboradorId,
  cicloAño,
  colaboradores,
  initial,
  onDone,
  onCancel,
}: {
  colaboradorId: string;
  cicloAño: number;
  colaboradores: ColabOption[];
  initial?: SucesionItem;
  onDone: (item: SucesionItem) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    sucesor_id:           initial?.sucesor_id ?? "",
    sucesor_nombre:       initial?.sucesor_nombre ?? "",
    tiempo_estimado:      initial?.tiempo_estimado ?? "mediano",
    desarrollo_necesario: initial?.desarrollo_necesario ?? "",
    notas:                initial?.notas ?? "",
    useSelector:          !!initial?.sucesor_id,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleColabSelect(id: string) {
    const colab = colaboradores.find((c) => c.id === id);
    set("sucesor_id", id);
    if (colab?.nombre_completo) set("sucesor_nombre", colab.nombre_completo);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const nombre = form.useSelector
      ? (colaboradores.find((c) => c.id === form.sucesor_id)?.nombre_completo ?? "")
      : form.sucesor_nombre;
    if (!nombre.trim()) { setErr("El nombre del sucesor es obligatorio"); return; }

    startTransition(async () => {
      try {
        await upsertSucesor({
          id:                   initial?.id,
          id_empleado:          colaboradorId,
          ciclo_año:            cicloAño,
          sucesor_nombre:       nombre,
          sucesor_id:           form.useSelector ? form.sucesor_id || null : null,
          tiempo_estimado:      form.tiempo_estimado,
          desarrollo_necesario: form.desarrollo_necesario,
          notas:                form.notas,
        });
        onDone({
          id:                   initial?.id ?? "new-" + Date.now(),
          id_empleado:          colaboradorId,
          ciclo_año:            cicloAño,
          sucesor_nombre:       nombre,
          sucesor_id:           form.useSelector ? form.sucesor_id || null : null,
          tiempo_estimado:      form.tiempo_estimado,
          desarrollo_necesario: form.desarrollo_necesario || null,
          notas:                form.notas || null,
          created_at:           initial?.created_at ?? new Date().toISOString(),
        });
      } catch (err) {
        setErr(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50/40 border border-blue-200 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-gray-700">
        {initial ? "Editar sucesor" : "Agregar sucesor potencial"}
      </p>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      {/* Sucesor selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600">Sucesor</label>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => set("useSelector", true)}
              className={`px-3 py-1 transition-colors ${form.useSelector ? "bg-[#1a3a5c] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              Buscar colaborador
            </button>
            <button
              type="button"
              onClick={() => set("useSelector", false)}
              className={`px-3 py-1 transition-colors ${!form.useSelector ? "bg-[#1a3a5c] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              Nombre libre
            </button>
          </div>
        </div>

        {form.useSelector ? (
          <select
            value={form.sucesor_id}
            onChange={(e) => handleColabSelect(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            <option value="">— Seleccionar colaborador —</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_completo}{c.puesto ? ` · ${c.puesto}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={form.sucesor_nombre}
            onChange={(e) => set("sucesor_nombre", e.target.value)}
            placeholder="Nombre del sucesor potencial"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
        )}
      </div>

      {/* Plazo */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Tiempo estimado para estar listo</label>
        <div className="flex flex-wrap gap-2">
          {PLAZO_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => set("tiempo_estimado", p.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                form.tiempo_estimado === p.value
                  ? p.color + " shadow-sm scale-105"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {p.label}
              <span className="ml-1 opacity-70 font-normal">({p.sub})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desarrollo */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Desarrollo necesario *
        </label>
        <textarea
          value={form.desarrollo_necesario}
          onChange={(e) => set("desarrollo_necesario", e.target.value)}
          rows={3}
          required
          placeholder="Ej. Fortalecer habilidades de liderazgo, experiencia en gestión de presupuestos, rotación en área de operaciones..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none"
        />
      </div>

      {/* Notas opcionales */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Notas adicionales <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <textarea
          value={form.notas}
          onChange={(e) => set("notas", e.target.value)}
          rows={2}
          placeholder="Contexto adicional, riesgos, dependencias..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
        >
          {isPending ? "Guardando..." : initial ? "Guardar cambios" : "Agregar sucesor"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function SucesorCard({
  item,
  canEdit,
  onEdit,
  onDelete,
  isPending,
}: {
  item: SucesionItem;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const plazo = plazoBadge(item.tiempo_estimado);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow"
      style={{ animation: "sucesionCardIn 0.35s cubic-bezier(0.22,1,0.36,1) both" }}>
      <style>{`
        @keyframes sucesionCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar initial */}
          <div className="w-9 h-9 rounded-full bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">
              {item.sucesor_nombre.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{item.sucesor_nombre}</p>
            <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full border font-medium ${plazo.color}`}>
              {plazo.label} · {plazo.sub}
            </span>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onEdit} className="text-xs text-gray-400 hover:text-[#1a3a5c] transition-colors">
              Editar
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={onDelete}
              disabled={isPending}
              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {item.desarrollo_necesario && (
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Desarrollo necesario</p>
          <p className="text-sm text-gray-700 leading-relaxed">{item.desarrollo_necesario}</p>
        </div>
      )}

      {item.notas && (
        <p className="text-xs text-gray-400 italic pl-1">{item.notas}</p>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SucesionEditor({
  colaboradorId,
  cicloAño,
  itemsIniciales,
  colaboradores,
  canEdit,
}: {
  colaboradorId: string;
  cicloAño: number;
  itemsIniciales: SucesionItem[];
  colaboradores: ColabOption[];
  canEdit: boolean;
}) {
  const [items, setItems]         = useState<SucesionItem[]>(
    itemsIniciales.filter((i) => i.ciclo_año === cicloAño)
  );
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg]             = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  }

  function handleAdded(item: SucesionItem) {
    setItems((prev) => [...prev, item]);
    setAdding(false);
    flash("Sucesor agregado");
  }

  function handleEdited(item: SucesionItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    setEditingId(null);
    flash("Cambios guardados");
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este sucesor potencial?")) return;
    startTransition(async () => {
      try {
        await deleteSucesor(id, colaboradorId);
        setItems((prev) => prev.filter((i) => i.id !== id));
        flash("Sucesor eliminado");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al eliminar");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Plan de Sucesión — {cicloAño}
          </p>
          <p className="text-xs text-gray-500">
            Identifica quién podría ocupar tu posición, en qué tiempo estarán listos y qué desarrollo necesitan.
          </p>
        </div>
        {canEdit && !adding && !editingId && (
          <button
            onClick={() => setAdding(true)}
            className="flex-shrink-0 text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] transition-colors"
          >
            + Agregar sucesor
          </button>
        )}
      </div>

      {msg && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}

      {/* Form */}
      {adding && (
        <SucesorForm
          colaboradorId={colaboradorId}
          cicloAño={cicloAño}
          colaboradores={colaboradores}
          onDone={handleAdded}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Cards */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) =>
            editingId === item.id ? (
              <SucesorForm
                key={item.id}
                colaboradorId={colaboradorId}
                cicloAño={cicloAño}
                colaboradores={colaboradores}
                initial={item}
                onDone={handleEdited}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <SucesorCard
                key={item.id}
                item={item}
                canEdit={canEdit}
                onEdit={() => { setEditingId(item.id); setAdding(false); }}
                onDelete={() => handleDelete(item.id)}
                isPending={isPending}
              />
            )
          )}
        </div>
      ) : !adding ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-gray-500">Sin sucesores registrados para este ciclo</p>
          {canEdit && (
            <button
              onClick={() => setAdding(true)}
              className="text-sm text-[#1a3a5c] font-medium hover:underline"
            >
              + Agregar primer sucesor potencial
            </button>
          )}
        </div>
      ) : null}

      {/* Summary strip when multiple items */}
      {items.length > 1 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-xs text-gray-400">Resumen:</span>
          {PLAZO_OPTIONS.filter((p) => items.some((i) => i.tiempo_estimado === p.value)).map((p) => {
            const count = items.filter((i) => i.tiempo_estimado === p.value).length;
            return (
              <span key={p.value} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${p.color}`}>
                {count} {p.label.toLowerCase()}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
