"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { upsertPlanSucesionManual } from "@/app/actions/plan_sucesion_manual";

type ColabOption = { id: string; nombre_completo: string | null; puesto: string | null };

const READINESS_OPTIONS = [
  { value: "listo_ahora",    label: "Listo ahora (< 1 año)" },
  { value: "uno_dos_anios",  label: "1-2 años" },
  { value: "tres_mas_anios", label: "3+ años" },
];

const TIEMPO_OPTIONS = [
  { value: "corto",   label: "Corto plazo" },
  { value: "mediano", label: "Mediano plazo" },
  { value: "largo",   label: "Largo plazo" },
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

export default function AgregarSucesorModal({
  colabs,
  ciclos,
  cicloDefault,
  onClose,
}: {
  colabs: ColabOption[];
  ciclos: number[];
  cicloDefault: number;
  onClose: () => void;
}) {
  const [ciclo, setCiclo]         = useState(cicloDefault);
  const [titular, setTitular]     = useState<ColabOption | null>(null);
  const [sucesor, setSucesor]     = useState<ColabOption | null>(null);
  const [readiness, setReadiness] = useState("tres_mas_anios");
  const [tiempo, setTiempo]       = useState("mediano");
  const [notas, setNotas]         = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(validar: boolean) {
    if (!titular) { setError("Selecciona un titular."); return; }
    if (!sucesor) { setError("Selecciona un sucesor."); return; }
    setError(null);
    startTransition(async () => {
      const res = await upsertPlanSucesionManual({
        titularId:             titular.id,
        sucesId:               sucesor.id,
        sucesNombre:           sucesor.nombre_completo ?? "",
        cicloAño:              ciclo,
        readiness,
        tiempoEstimado:        tiempo,
        notas:                 notas || null,
        validarInmediatamente: validar,
      });
      if (!res.ok) { setError(res.error ?? "Error al guardar."); return; }
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
            <h2 className="text-base font-bold text-gray-900">Agregar sucesor</h2>
            <p className="text-xs text-gray-400 mt-0.5">Captura directa · Capital Humano</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none flex-shrink-0">✕</button>
        </div>

        {/* Ciclo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ciclo</label>
          <select value={ciclo} onChange={(e) => setCiclo(Number(e.target.value))}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]">
            {ciclos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Titular */}
        <ColabSearch label="Titular (posición a suceder)"
          colabs={colabs} value={titular} onChange={setTitular} exclude={sucesor?.id} />

        {/* Sucesor */}
        <ColabSearch label="Sucesor propuesto"
          colabs={colabs} value={sucesor} onChange={setSucesor} exclude={titular?.id} />

        {/* Readiness */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Readiness</label>
          <select value={readiness} onChange={(e) => setReadiness(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]">
            {READINESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Tiempo estimado */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tiempo estimado</label>
          <select value={tiempo} onChange={(e) => setTiempo(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]">
            {TIEMPO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)}
            rows={3} placeholder="Justificación, contexto, observaciones..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none" />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={() => handleSubmit(false)} disabled={isPending}
            className="flex-1 text-sm border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium">
            {isPending ? "Guardando..." : "Guardar borrador"}
          </button>
          <button onClick={() => handleSubmit(true)} disabled={isPending}
            className="flex-1 text-sm bg-[#1a3a5c] text-white px-4 py-2.5 rounded-xl hover:bg-[#14304f] disabled:opacity-50 transition-colors font-medium">
            {isPending ? "Guardando..." : "Guardar y validar"}
          </button>
        </div>
      </div>
    </div>
  );
}
