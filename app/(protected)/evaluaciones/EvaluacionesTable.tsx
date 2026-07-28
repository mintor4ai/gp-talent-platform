"use client";

import { useMemo } from "react";
import { ZONA_COLORS } from "@/lib/types";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";

type EIPRow = {
  id: string;
  id_empleado: string;
  zona_evaluacion: string | null;
  evaluacion_potencial_total: number | null;
  desempeno_logra: number | null;
  colaboradores: {
    nombre_completo: string;
    puesto: string;
    nivel: string;
    area: string;
  } | null;
};

export default function EvaluacionesTable({ eips }: { eips: EIPRow[] }) {
  const { sortKey, sortDir, handleSort } = useSortState<"nombre" | "puesto" | "nivel" | "zona" | "potencial" | "desempeno">("nombre");

  const ZONA_ORDER: Record<string, number> = {
    Sobresaliente: 0, Desarrollo: 1, Estabilidad: 2, Revisión: 3, Inicio: 4,
  };

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...eips].sort((a, b) => {
      const ac = a.colaboradores;
      const bc = b.colaboradores;
      switch (sortKey) {
        case "nombre":    return dir * (ac?.nombre_completo ?? "").localeCompare(bc?.nombre_completo ?? "", "es");
        case "puesto":    return dir * (ac?.puesto ?? "").localeCompare(bc?.puesto ?? "", "es");
        case "nivel":     return dir * (ac?.nivel ?? "").localeCompare(bc?.nivel ?? "", "es");
        case "zona":      return dir * ((ZONA_ORDER[a.zona_evaluacion ?? ""] ?? 9) - (ZONA_ORDER[b.zona_evaluacion ?? ""] ?? 9));
        case "potencial": return dir * ((Number(a.evaluacion_potencial_total) ?? 0) - (Number(b.evaluacion_potencial_total) ?? 0));
        case "desempeno": return dir * ((Number(a.desempeno_logra) ?? 0) - (Number(b.desempeno_logra) ?? 0));
        default:          return 0;
      }
    });
  }, [eips, sortKey, sortDir]);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
          <SortableTh label="Colaborador" sortKey="nombre" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
          <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
          <SortableTh label="Nivel" sortKey="nivel" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
          <SortableTh label="Zona" sortKey="zona" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 text-center" />
          <SortableTh label="Potencial" sortKey="potencial" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 text-right" />
          <SortableTh label="Desempeño" sortKey="desempeno" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 text-right" />
          <th className="px-5 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {sorted.map((e) => {
          const colab = e.colaboradores;
          const zona  = e.zona_evaluacion;
          const colors = zona ? ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-700" } : null;
          return (
            <tr key={e.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3 font-medium text-gray-900">{colab?.nombre_completo ?? "—"}</td>
              <td className="px-5 py-3 text-gray-600 text-xs">{colab?.puesto ?? "—"}</td>
              <td className="px-5 py-3 text-gray-500 text-xs">{colab?.nivel ?? "—"}</td>
              <td className="px-5 py-3 text-center">
                {zona && colors
                  ? <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{zona}</span>
                  : <span className="text-xs text-gray-400">—</span>}
              </td>
              <td className="px-5 py-3 text-right font-semibold text-gray-900">
                {e.evaluacion_potencial_total != null ? Number(e.evaluacion_potencial_total).toFixed(1) : "—"}
              </td>
              <td className="px-5 py-3 text-right font-semibold text-gray-900">
                {e.desempeno_logra != null ? Number(e.desempeno_logra).toFixed(1) : "—"}
              </td>
              <td className="px-5 py-3 text-right">
                <a href={`/carpeta/${e.id_empleado}`} className="text-xs text-[#1a3a5c] hover:underline">Ver carpeta →</a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
