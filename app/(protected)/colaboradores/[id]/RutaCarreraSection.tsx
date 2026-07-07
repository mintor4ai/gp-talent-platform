"use client";

import { useState, useTransition } from "react";
import { generarRutasCarrera } from "@/app/actions/carrera";
import { SectionHeader } from "@/components/ui/SectionHeader";

type Ruta = {
  id: string;
  tipo_ruta: string | null;
  puesto_objetivo: string | null;
  uen_objetivo: string | null;
  plazo_estimado: string | null;
  habilidades_gap: string | null;
  acciones_recomendadas: string | null;
  generado_con_ia: boolean | null;
};

const TIPO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ascendente:     { bg: "bg-blue-50",   text: "text-blue-700",   label: "Ascendente" },
  lateral:        { bg: "bg-purple-50", text: "text-purple-700", label: "Lateral" },
  especialización:{ bg: "bg-amber-50",  text: "text-amber-700",  label: "Especialización" },
};

export default function RutaCarreraSection({
  colaboradorId,
  isAdmin,
  rutasIniciales,
}: {
  colaboradorId: string;
  isAdmin: boolean;
  rutasIniciales: Ruta[];
}) {
  const [rutas, setRutas] = useState<Ruta[]>(rutasIniciales);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerar() {
    setError(null);
    startTransition(async () => {
      const res = await generarRutasCarrera(colaboradorId);
      if (!res.ok) {
        setError(res.error ?? "Error desconocido");
        return;
      }
      // Reload page to get persisted data with IDs
      window.location.reload();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <SectionHeader label="Rutas de Carrera IA" />
          {rutas.length > 0 && rutas[0].generado_con_ia && (
            <p className="text-xs text-gray-400 mt-0.5">Generado con IA · {new Date().getFullYear()}</p>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={handleGenerar}
            disabled={isPending}
            className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {isPending ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <span>✦</span>
                {rutas.length > 0 ? "Regenerar" : "Generar con IA"}
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {rutas.length === 0 && !isPending && (
        <p className="text-sm text-gray-400 text-center py-6">
          {isAdmin
            ? 'Presiona "Generar con IA" para crear sugerencias de ruta de carrera basadas en el perfil.'
            : "Las rutas de carrera serán generadas por Capital Humano."}
        </p>
      )}

      {isPending && rutas.length === 0 && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-[#1a3a5c] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Analizando perfil y generando rutas…</p>
          <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos segundos</p>
        </div>
      )}

      {rutas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rutas.map((ruta) => {
            const tipoKey = ruta.tipo_ruta?.toLowerCase() ?? "";
            const colors = TIPO_COLORS[tipoKey] ?? {
              bg: "bg-gray-50",
              text: "text-gray-700",
              label: ruta.tipo_ruta ?? "Ruta",
            };
            const acciones = ruta.acciones_recomendadas
              ?.split(";")
              .map((a) => a.trim())
              .filter(Boolean) ?? [];

            return (
              <div
                key={ruta.id}
                className="border border-gray-100 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                  >
                    {colors.label}
                  </span>
                  {ruta.plazo_estimado && (
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {ruta.plazo_estimado}
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">
                    {ruta.puesto_objetivo ?? "—"}
                  </p>
                  {ruta.uen_objetivo && (
                    <p className="text-xs text-gray-500 mt-0.5">{ruta.uen_objetivo}</p>
                  )}
                </div>

                {ruta.habilidades_gap && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Brechas a desarrollar</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{ruta.habilidades_gap}</p>
                  </div>
                )}

                {acciones.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Acciones recomendadas</p>
                    <ul className="space-y-1">
                      {acciones.map((a, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                          <span className="text-[#1a3a5c] font-bold flex-shrink-0 mt-px">·</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
