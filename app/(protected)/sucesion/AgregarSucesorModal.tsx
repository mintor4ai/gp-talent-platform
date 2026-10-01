"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { upsertPlanSucesionManual, descartarPlanSucesion, reactivarPlanSucesion } from "@/app/actions/plan_sucesion_manual";

type ColabOption = { id: string; nombre_completo: string | null; puesto: string | null };

// Unified readiness options — maps to both readiness and tiempo_estimado columns
const READINESS_OPTIONS = [
  { value: "listo_ahora",    label: "Inmediato",     tiempo: "corto"   },
  { value: "uno_dos_anios",  label: "Mediano Plazo", tiempo: "mediano" },
  { value: "tres_mas_anios", label: "Largo Plazo",   tiempo: "largo"   },
];

function ColabSearch({
  label,
  colabs,
  value,
  onChange,
  exclude,
}: {
  label: string;
  colabs: ColabOption[];
  value: ColabOption | null;
  onChange: (c: ColabOption | null) => void;
  exclude?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return colabs
      .filter((c) => c.id !== exclude)
      .filter((c) =>
        !q ||
        (c.nombre_completo ?? "").toLowerCase().includes(q) ||
        (c.puesto ?? "").toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [colabs, query, exclude]);

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {value ? (
        <div className="flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-gray-50">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{value.nombre_completo}</p>
            <p className="text-xs text-gray-500 truncate">{value.puesto}</p>
          </div>
          <button onClick={() => { onChange(null); setQuery(""); }}
            className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0">✕</button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por nombre o puesto..."
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
        />
      )}
      {open && !value && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-y-auto max-h-48">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-3">Sin resultados</p>
          ) : (
            filtered.map((c) => (
              <button key={c.id} type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(c); setQuery(""); setOpen(false); }}>
                <p className="text-sm font-medium text-gray-900">{c.nombre_completo}</p>
                <p className="text-xs text-gray-500">{c.puesto}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type InitialData = {
  planId: string;
  cicloAño: number;
  titularId: string;
  sucesId: string;
  readiness: string;
  tiempoEstimado: string;
  notas: string | null;
  estado: string;
};

export default function AgregarSucesorModal({
  colabs,
  ciclos,
  cicloDefault,
  initialData,
  prefill,
  onClose,
}: {
  colabs: ColabOption[];
  ciclos: number[];
  cicloDefault: number;
  initialData?: InitialData;
  prefill?: { titularId: string; cicloAño: number };
  onClose: () => void;
}) {
  const isEdit = !!initialData;
  const isPrefilled = !isEdit && !!prefill?.titularId;
  const isDescartado = initialData?.estado === "descartado";

  // Normalize incoming readiness: map tiempo_estimado values to canonical readiness values
  function normalizeReadiness(r: string): string {
    if (r === "corto")   return "listo_ahora";
    if (r === "mediano") return "uno_dos_anios";
    if (r === "largo")   return "tres_mas_anios";
    return r;
  }

  const [ciclo, setCiclo]         = useState(initialData?.cicloAño ?? prefill?.cicloAño ?? cicloDefault);
  const [titular, setTitular]     = useState<ColabOption | null>(
    initialData
      ? (colabs.find((c) => c.id === initialData.titularId) ?? null)
      : prefill?.titularId
        ? (colabs.find((c) => c.id === prefill.titularId) ?? null)
        : null
  );
  const [sucesor, setSucesor]     = useState<ColabOption | null>(
    initialData ? (colabs.find((c) => c.id === initialData.sucesId) ?? null) : null
  );
  const [readiness, setReadiness] = useState(
    normalizeReadiness(initialData?.readiness ?? "tres_mas_anios")
  );
  const [notas, setNotas]         = useState(initialData?.notas ?? "");
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Descartar flow
  const [showDescartarForm, setShowDescartarForm] = useState(false);
  const [motivoDescarte, setMotivoDescarte]       = useState("");

  function handleSubmit(validar: boolean) {
    if (!titular) { setError("Selecciona un titular."); return; }
    if (!sucesor) { setError("Selecciona un sucesor."); return; }
    setError(null);
    const tiempoEquiv = READINESS_OPTIONS.find((o) => o.value === readiness)?.tiempo ?? "mediano";
    startTransition(async () => {
      const res = await upsertPlanSucesionManual({
        titularId:             titular.id,
        sucesId:               sucesor.id,
        sucesNombre:           sucesor.nombre_completo ?? "",
        cicloAño:              ciclo,
        readiness,
        tiempoEstimado:        tiempoEquiv,
        notas:                 notas || null,
        validarInmediatamente: validar,
        planId:                initialData?.planId,
      });
      if (!res.ok) { setError(res.error ?? "Error al guardar."); return; }
      onClose();
    });
  }

  function handleDescartar() {
    if (!initialData?.planId) return;
    setError(null);
    startTransition(async () => {
      const res = await descartarPlanSucesion(initialData.planId, motivoDescarte || null);
      if (!res.ok) { setError(res.error ?? "Error al descartar."); return; }
      onClose();
    });
  }

  function handleReactivar() {
    if (!initialData?.planId) return;
    setError(null);
    startTransition(async () => {
      const res = await reactivarPlanSucesion(initialData.planId);
      if (!res.ok) { setError(res.error ?? "Error al reactivar."); return; }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {isEdit ? "Editar sucesor" : "Agregar sucesor"}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">Captura directa · Capital Humano</p>
              {isDescartado && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">
                  Descartado
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none flex-shrink-0">✕</button>
        </div>

        {/* Ciclo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ciclo</label>
          {isEdit || isPrefilled ? (
            <p className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">{ciclo}</p>
          ) : (
            <select value={ciclo} onChange={(e) => setCiclo(Number(e.target.value))}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]">
              {ciclos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Titular — locked in edit or prefill mode */}
        {isEdit || isPrefilled ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Titular (posición a suceder)</label>
            <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">{titular?.nombre_completo ?? "—"}</p>
              <p className="text-xs text-gray-500">{titular?.puesto}</p>
            </div>
          </div>
        ) : (
          <ColabSearch label="Titular (posición a suceder)"
            colabs={colabs} value={titular} onChange={setTitular} exclude={sucesor?.id} />
        )}

        {/* Sucesor */}
        <ColabSearch label="Sucesor propuesto"
          colabs={colabs} value={sucesor} onChange={setSucesor} exclude={titular?.id} />

        {/* Readiness — single unified field */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Disponibilidad</label>
          <select value={readiness} onChange={(e) => setReadiness(e.target.value)}
            disabled={isDescartado}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] disabled:bg-gray-50 disabled:text-gray-400">
            {READINESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)}
            disabled={isDescartado}
            rows={3} placeholder="Justificación, contexto, observaciones..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none disabled:bg-gray-50 disabled:text-gray-400" />
        </div>

        {/* Descartar form */}
        {showDescartarForm && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-xs font-medium text-red-700">Motivo del descarte (opcional)</p>
            <textarea
              value={motivoDescarte}
              onChange={(e) => setMotivoDescarte(e.target.value)}
              rows={2}
              placeholder="Ej: Ya no aplica por cambio de puesto, duplicado, etc."
              className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowDescartarForm(false)} disabled={isPending}
                className="flex-1 text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleDescartar} disabled={isPending}
                className="flex-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                {isPending ? "Descartando..." : "Confirmar descarte"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {/* Actions */}
        {isDescartado ? (
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} disabled={isPending}
              className="flex-1 text-sm border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium">
              Cerrar
            </button>
            <button onClick={handleReactivar} disabled={isPending}
              className="flex-1 text-sm bg-[#1a3a5c] text-white px-4 py-2.5 rounded-xl hover:bg-[#14304f] disabled:opacity-50 transition-colors font-medium">
              {isPending ? "Reactivando..." : "↩ Reactivar"}
            </button>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {/* Primary save actions */}
            <div className="flex gap-2">
              <button onClick={() => handleSubmit(false)} disabled={isPending}
                className="flex-1 text-sm border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium">
                {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Guardar borrador"}
              </button>
              <button onClick={() => handleSubmit(true)} disabled={isPending}
                className="flex-1 text-sm bg-[#1a3a5c] text-white px-4 py-2.5 rounded-xl hover:bg-[#14304f] disabled:opacity-50 transition-colors font-medium">
                {isPending ? "Guardando..." : "Validar ✓"}
              </button>
            </div>
            {/* Descartar — only in edit mode */}
            {isEdit && !showDescartarForm && (
              <button onClick={() => setShowDescartarForm(true)} disabled={isPending}
                className="w-full text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors border border-transparent hover:border-red-200">
                Descartar este plan de sucesión
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
