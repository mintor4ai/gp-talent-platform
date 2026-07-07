"use client";

import { useState, useTransition } from "react";
import { upsertSucesor, deleteSucesor, submitSucesion } from "@/app/actions/sucesion";

export type SucesionItem = {
  id: string;
  id_empleado: string;
  ciclo_año: number;
  sucesor_nombre: string;
  sucesor_id: string | null;
  tiempo_estimado: string;
  readiness: string | null;
  brechas: string | null;
  acciones_desarrollo: string | null;
  fecha_objetivo: string | null;
  desarrollo_necesario: string | null;
  notas: string | null;
  estado: string;
  informar_sucesor: boolean;
  requiere_v2: boolean;
  validado_v1_nombre: string | null;
  validado_v1_at: string | null;
  comentario_v1: string | null;
  validado_v2_nombre: string | null;
  validado_v2_at: string | null;
  comentario_v2: string | null;
  sucesor_aspiracion: boolean | null;
  sucesor_aspiracion_at: string | null;
  created_at: string;
};

type ColabOption = { id: string; nombre_completo: string | null; puesto: string | null };

export const READINESS_OPTIONS = [
  { value: "listo_ahora",    label: "Listo ahora",  sub: "< 1 año",               color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { value: "uno_dos_anios",  label: "1-2 años",     sub: "corto plazo",            color: "bg-blue-100 text-blue-800 border-blue-300"           },
  { value: "tres_mas_anios", label: "3+ años",      sub: "largo plazo",            color: "bg-amber-100 text-amber-800 border-amber-300"        },
];

export const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  borrador:     { label: "Borrador",        color: "bg-gray-100 text-gray-500"    },
  pendiente_v1: { label: "En revisión",     color: "bg-yellow-100 text-yellow-700" },
  pendiente_v2: { label: "Validación Dir.", color: "bg-orange-100 text-orange-700" },
  aprobado:     { label: "Aprobado",        color: "bg-green-100 text-green-700"  },
  rechazado:    { label: "Rechazado",       color: "bg-red-100 text-red-600"      },
};

export function readinessBadge(value: string | null) {
  return READINESS_OPTIONS.find((r) => r.value === value) ?? READINESS_OPTIONS[2];
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
    sucesor_id:          initial?.sucesor_id ?? "",
    sucesor_nombre:      initial?.sucesor_nombre ?? "",
    readiness:           initial?.readiness ?? "tres_mas_anios",
    brechas:             initial?.brechas ?? initial?.desarrollo_necesario ?? "",
    acciones_desarrollo: initial?.acciones_desarrollo ?? "",
    fecha_objetivo:      initial?.fecha_objetivo ?? "",
    notas:               initial?.notas ?? "",
    useSelector:         !!initial?.sucesor_id,
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
          id:                  initial?.id,
          id_empleado:         colaboradorId,
          ciclo_año:           cicloAño,
          sucesor_nombre:      nombre,
          sucesor_id:          form.useSelector ? form.sucesor_id || null : null,
          readiness:           form.readiness,
          brechas:             form.brechas,
          acciones_desarrollo: form.acciones_desarrollo,
          fecha_objetivo:      form.fecha_objetivo || null,
          notas:               form.notas,
        });
        onDone({
          id:                   initial?.id ?? "new-" + Date.now(),
          id_empleado:          colaboradorId,
          ciclo_año:            cicloAño,
          sucesor_nombre:       nombre,
          sucesor_id:           form.useSelector ? form.sucesor_id || null : null,
          tiempo_estimado:      form.readiness,
          readiness:            form.readiness,
          brechas:              form.brechas || null,
          acciones_desarrollo:  form.acciones_desarrollo || null,
          fecha_objetivo:       form.fecha_objetivo || null,
          desarrollo_necesario: form.brechas || null,
          notas:                form.notas || null,
          estado:               "borrador",
          informar_sucesor:     false,
          requiere_v2:          false,
          validado_v1_nombre:   null,
          validado_v1_at:       null,
          comentario_v1:        null,
          validado_v2_nombre:   null,
          validado_v2_at:       null,
          comentario_v2:        null,
          sucesor_aspiracion:   null,
          sucesor_aspiracion_at: null,
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

      {/* Sucesor */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600">Sucesor</label>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
            <button type="button" onClick={() => set("useSelector", true)}
              className={`px-3 py-1 transition-colors ${form.useSelector ? "bg-[#1a3a5c] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              Buscar colaborador
            </button>
            <button type="button" onClick={() => set("useSelector", false)}
              className={`px-3 py-1 transition-colors ${!form.useSelector ? "bg-[#1a3a5c] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              Nombre libre
            </button>
          </div>
        </div>
        {form.useSelector ? (
          <select value={form.sucesor_id} onChange={(e) => handleColabSelect(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white">
            <option value="">— Seleccionar colaborador —</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}{c.puesto ? ` · ${c.puesto}` : ""}</option>
            ))}
          </select>
        ) : (
          <input type="text" value={form.sucesor_nombre} onChange={(e) => set("sucesor_nombre", e.target.value)}
            placeholder="Nombre del sucesor potencial"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
        )}
      </div>

      {/* Readiness */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Nivel de Readiness</label>
        <div className="flex flex-wrap gap-2">
          {READINESS_OPTIONS.map((r) => (
            <button key={r.value} type="button" onClick={() => set("readiness", r.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                form.readiness === r.value
                  ? r.color + " shadow-sm scale-105"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}>
              {r.label}
              <span className="ml-1 opacity-60 font-normal">({r.sub})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Brechas */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Brechas identificadas *</label>
        <textarea value={form.brechas} onChange={(e) => set("brechas", e.target.value)}
          rows={3} required
          placeholder="Ej. Gestión de equipos grandes, experiencia en finanzas, habilidades de negociación..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none" />
      </div>

      {/* Acciones */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Acciones de desarrollo *</label>
        <textarea value={form.acciones_desarrollo} onChange={(e) => set("acciones_desarrollo", e.target.value)}
          rows={3} required
          placeholder="Ej. Rotación en área de finanzas, mentoría con Director, capacitación en liderazgo..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none" />
      </div>

      {/* Fecha objetivo */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Fecha objetivo de preparación <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <input type="date" value={form.fecha_objetivo} onChange={(e) => set("fecha_objetivo", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white" />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Notas adicionales <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <textarea value={form.notas} onChange={(e) => set("notas", e.target.value)}
          rows={2} placeholder="Contexto adicional, riesgos, dependencias..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none" />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={isPending}
          className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors">
          {isPending ? "Guardando..." : initial ? "Guardar cambios" : "Agregar sucesor"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
    </form>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function SucesorCard({
  item,
  colaboradorId,
  canEdit,
  onEdit,
  onDelete,
  onSubmitted,
  isDeleting,
}: {
  item: SucesionItem;
  colaboradorId: string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSubmitted: (item: SucesionItem) => void;
  isDeleting: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const readiness = readinessBadge(item.readiness);
  const estado = ESTADO_CONFIG[item.estado] ?? ESTADO_CONFIG.borrador;
  const isBorrador = item.estado === "borrador";
  const canSend = isBorrador && !!(item.brechas && item.acciones_desarrollo);

  function handleSubmit() {
    if (!confirm("¿Enviar este sucesor a revisión del jefe?")) return;
    startTransition(async () => {
      try {
        await submitSucesion(item.id, colaboradorId);
        onSubmitted({ ...item, estado: "pendiente_v1" });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error al enviar");
      }
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow"
      style={{ animation: "sucesionCardIn 0.35s cubic-bezier(0.22,1,0.36,1) both" }}>
      <style>{`@keyframes sucesionCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">{item.sucesor_nombre.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{item.sucesor_nombre}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${readiness.color}`}>
                {readiness.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estado.color}`}>
                {estado.label}
              </span>
              {item.requiere_v2 && item.estado !== "borrador" && (
                <span className="text-xs text-orange-600 font-medium">· Req. V2</span>
              )}
            </div>
          </div>
        </div>
        {canEdit && isBorrador && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onEdit} className="text-xs text-gray-400 hover:text-[#1a3a5c] transition-colors">Editar</button>
            <span className="text-gray-200">|</span>
            <button onClick={onDelete} disabled={isDeleting}
              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors">Eliminar</button>
          </div>
        )}
      </div>

      {/* Plan fields */}
      <div className="space-y-2">
        {item.brechas && (
          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Brechas identificadas</p>
            <p className="text-sm text-gray-700 leading-relaxed">{item.brechas}</p>
          </div>
        )}
        {item.acciones_desarrollo && (
          <div className="bg-blue-50/60 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Acciones de desarrollo</p>
            <p className="text-sm text-gray-700 leading-relaxed">{item.acciones_desarrollo}</p>
          </div>
        )}
        {/* Legacy fallback */}
        {!item.brechas && !item.acciones_desarrollo && item.desarrollo_necesario && (
          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Desarrollo necesario</p>
            <p className="text-sm text-gray-700 leading-relaxed">{item.desarrollo_necesario}</p>
          </div>
        )}
      </div>

      {item.fecha_objetivo && (
        <p className="text-xs text-gray-500">
          Fecha objetivo:{" "}
          <span className="font-medium text-gray-700">
            {new Date(item.fecha_objetivo + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
          </span>
        </p>
      )}

      {item.notas && <p className="text-xs text-gray-400 italic pl-1">{item.notas}</p>}

      {/* Validation trail */}
      {item.validado_v1_at && (
        <div className={`rounded-lg px-3 py-2 text-xs space-y-0.5 ${item.estado === "rechazado" ? "bg-red-50 border border-red-100" : "bg-green-50 border border-green-100"}`}>
          <p className="font-semibold text-gray-600">
            V1 · {item.validado_v1_nombre ?? "Jefe"} · {new Date(item.validado_v1_at).toLocaleDateString("es-MX")}
            {item.informar_sucesor && item.estado !== "rechazado" && (
              <span className="ml-2 text-blue-600 font-medium">· Sucesor informado</span>
            )}
          </p>
          {item.comentario_v1 && <p className="text-gray-600 italic">{item.comentario_v1}</p>}
        </div>
      )}
      {item.validado_v2_at && (
        <div className="rounded-lg px-3 py-2 text-xs space-y-0.5 bg-blue-50 border border-blue-100">
          <p className="font-semibold text-gray-600">
            V2 · {item.validado_v2_nombre ?? "Capital Humano"} · {new Date(item.validado_v2_at).toLocaleDateString("es-MX")}
          </p>
          {item.comentario_v2 && <p className="text-gray-600 italic">{item.comentario_v2}</p>}
        </div>
      )}
      {item.sucesor_aspiracion !== null && (
        <p className={`text-xs font-medium ${item.sucesor_aspiracion ? "text-green-600" : "text-gray-400"}`}>
          {item.sucesor_aspiracion ? "✓ Sucesor tiene aspiración de tomar esta ruta" : "Sucesor no tiene aspiración por ahora"}
        </p>
      )}

      {/* Submit button */}
      {canEdit && isBorrador && (
        canSend ? (
          <button onClick={handleSubmit} disabled={isPending}
            className="w-full text-xs bg-[#1a3a5c]/5 border border-[#1a3a5c]/20 text-[#1a3a5c] font-medium py-2 rounded-lg hover:bg-[#1a3a5c]/10 disabled:opacity-40 transition-colors">
            {isPending ? "Enviando..." : "Enviar a revisión del jefe →"}
          </button>
        ) : (
          <p className="text-xs text-gray-400 text-center py-1">Completa brechas y acciones para enviar a revisión</p>
        )
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

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(null), 3000); }

  function handleAdded(item: SucesionItem) { setItems((p) => [...p, item]); setAdding(false); flash("Sucesor agregado"); }
  function handleEdited(item: SucesionItem) { setItems((p) => p.map((i) => i.id === item.id ? item : i)); setEditingId(null); flash("Cambios guardados"); }
  function handleSubmitted(item: SucesionItem) { setItems((p) => p.map((i) => i.id === item.id ? item : i)); flash("Plan enviado a revisión del jefe"); }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este sucesor potencial?")) return;
    startTransition(async () => {
      try {
        await deleteSucesor(id, colaboradorId);
        setItems((p) => p.filter((i) => i.id !== id));
        flash("Sucesor eliminado");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al eliminar");
      }
    });
  }

  const readinessCounts = READINESS_OPTIONS.filter((r) =>
    items.some((i) => (i.readiness ?? i.tiempo_estimado) === r.value)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Plan de Sucesión — {cicloAño}
          </p>
          <p className="text-xs text-gray-500">
            Identifica sucesores potenciales, nivel de readiness y plan de desarrollo. El jefe debe validar cada propuesta.
          </p>
        </div>
        {canEdit && !adding && !editingId && (
          <button onClick={() => setAdding(true)}
            className="flex-shrink-0 text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] transition-colors">
            + Agregar sucesor
          </button>
        )}
      </div>

      {msg && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{msg}</p>
      )}

      {adding && (
        <SucesorForm colaboradorId={colaboradorId} cicloAño={cicloAño} colaboradores={colaboradores}
          onDone={handleAdded} onCancel={() => setAdding(false)} />
      )}

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) =>
            editingId === item.id ? (
              <SucesorForm key={item.id} colaboradorId={colaboradorId} cicloAño={cicloAño}
                colaboradores={colaboradores} initial={item}
                onDone={handleEdited} onCancel={() => setEditingId(null)} />
            ) : (
              <SucesorCard key={item.id} item={item} colaboradorId={colaboradorId}
                canEdit={canEdit}
                onEdit={() => { setEditingId(item.id); setAdding(false); }}
                onDelete={() => handleDelete(item.id)}
                onSubmitted={handleSubmitted}
                isDeleting={isPending}
              />
            )
          )}
        </div>
      ) : !adding ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-sm text-gray-500">Sin sucesores registrados para este ciclo</p>
          {canEdit && (
            <button onClick={() => setAdding(true)} className="text-sm text-[#1a3a5c] font-medium hover:underline">
              + Agregar primer sucesor potencial
            </button>
          )}
        </div>
      ) : null}

      {readinessCounts.length > 1 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-xs text-gray-400">Readiness:</span>
          {readinessCounts.map((r) => {
            const count = items.filter((i) => (i.readiness ?? i.tiempo_estimado) === r.value).length;
            return (
              <span key={r.value} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${r.color}`}>
                {count} {r.label.toLowerCase()}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
