"use client";

import { useState, useTransition } from "react";
import { upsertZonaBands } from "@/app/actions/zonas";
import type { ZonaBand } from "@/lib/types";

const ZONA_ORDER = ["Inicio", "Revisión", "Estabilidad", "Desarrollo", "Sobresaliente"];

const ZONA_DOT_COLORS: Record<string, string> = {
  Sobresaliente: "#8b5cf6",
  Desarrollo: "#3b82f6",
  Estabilidad: "#10b981",
  Revisión: "#f97316",
  Inicio: "#eab308",
};

export default function ZonaConfigEditor({
  cicloAño,
  zonaBands,
}: {
  cicloAño: number;
  zonaBands: ZonaBand[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const bandMap: Record<string, ZonaBand> = {};
  for (const z of zonaBands) bandMap[z.zona] = z;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await upsertZonaBands(fd);
      setSavedMsg("Configuración guardada");
      setTimeout(() => setSavedMsg(null), 3000);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Configuración de zonas — Ciclo {cicloAño}
          </span>
          <span className="text-xs text-gray-400">(solo superadmin)</span>
        </div>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          <input type="hidden" name="ciclo_año" value={cicloAño} />

          <p className="text-xs text-gray-500">
            Define los umbrales de cada zona como la <strong>suma de Desempeño + Potencial</strong>.
            Las líneas diagonales del mapa separan las zonas según estos valores.
          </p>

          <div className="space-y-2">
            {ZONA_ORDER.map((zona) => {
              const band = bandMap[zona];
              return (
                <div key={zona} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-28 flex-shrink-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ZONA_DOT_COLORS[zona] ?? "#9ca3af" }}
                    />
                    <span className="text-xs font-medium text-gray-700">{zona}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-14 text-right">desde</label>
                    <input
                      name={`umbral_inferior_${zona}`}
                      type="number"
                      step="0.5"
                      min={160}
                      max={240}
                      defaultValue={band?.umbral_inferior ?? ""}
                      required
                      className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                    />
                    <label className="text-xs text-gray-400">hasta</label>
                    <input
                      name={`umbral_superior_${zona}`}
                      type="number"
                      step="0.5"
                      min={160}
                      max={240}
                      defaultValue={band?.umbral_superior ?? ""}
                      required
                      className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                    />
                    <span className="text-xs text-gray-400">
                      (suma D+P)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            {savedMsg && <span className="text-xs text-green-600 font-medium">{savedMsg}</span>}
            <div className="flex gap-3 ml-auto">
              <button
                type="submit"
                disabled={isPending}
                className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors"
              >
                {isPending ? "Guardando..." : "Guardar zonas"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
