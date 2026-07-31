"use client";

import { useState, useEffect, useCallback } from "react";

type Comentario = {
  calificacion_general: number | null;
  comentarios: string | null;
};

type Data = {
  comentarios: Comentario[];
};

type Props = {
  colaboradorId: string;
  cicloAño: number;
  nombreColaborador: string;
};

export default function Comentarios360Modal({ colaboradorId, cicloAño, nombreColaborador }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/carpeta/comentarios-360?colaborador_id=${colaboradorId}&ciclo_año=${cicloAño}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Error al cargar");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [colaboradorId, cicloAño, data]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const textComentarios = data?.comentarios.filter((c) => c.comentarios) ?? [];
  const totalEvaluadores = data?.comentarios.length ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg py-2 transition-colors font-medium"
      >
        Ver retroalimentación 360°
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Retroalimentación 360°</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {nombreColaborador} · Ciclo {cicloAño}
                  {totalEvaluadores > 0 && ` · ${totalEvaluadores} evaluador${totalEvaluadores !== 1 ? "es" : ""}`}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mt-0.5"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              {loading && (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  Cargando…
                </div>
              )}
              {error && (
                <div className="text-sm text-red-500 bg-red-50 rounded-lg p-3">{error}</div>
              )}

              {data && (
                <div className="space-y-3">
                  {textComentarios.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No hay comentarios escritos para este ciclo.
                    </p>
                  ) : (
                    textComentarios.map((c, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        {c.calificacion_general != null && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-gray-500">Calificación general:</span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                c.calificacion_general >= 8
                                  ? "bg-teal-100 text-teal-700"
                                  : c.calificacion_general >= 6
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {c.calificacion_general.toFixed(1)} / 10
                            </span>
                          </div>
                        )}
                        <p className="text-sm text-gray-700 leading-relaxed">{c.comentarios}</p>
                      </div>
                    ))
                  )}
                  {totalEvaluadores > textComentarios.length && (
                    <p className="text-xs text-gray-400 text-center pt-1">
                      {totalEvaluadores - textComentarios.length} evaluador
                      {totalEvaluadores - textComentarios.length !== 1 ? "es" : ""} no dejaron comentario escrito.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Confidentiality notice */}
            <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Los comentarios son confidenciales. No se revela la identidad de los evaluadores.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
