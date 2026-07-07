"use client";

import { useState, useTransition } from "react";
import { reabrirCiclosMultiples } from "@/app/actions/picd_ciclo";
import { SectionHeader } from "@/components/ui/SectionHeader";

type CicloRow = {
  id_empleado: string;
  nombre_completo: string;
  puesto: string | null;
  ciclo_año: number;
  estado: string | null;
  cerrado_at: string | null;
  decision_at: string | null;
  decision_nombre: string | null;
  comentario_jefe: string | null;
  reabierto_at: string | null;
};

const ESTADO_LABEL: Record<string, { label: string; cls: string }> = {
  abierto:          { label: "Abierto",           cls: "bg-gray-100 text-gray-600" },
  enviado_revision: { label: "En revisión",        cls: "bg-amber-100 text-amber-700" },
  aprobado:         { label: "Aprobado",           cls: "bg-green-100 text-green-700" },
  rechazado:        { label: "Con ajustes",        cls: "bg-red-100 text-red-600" },
  sin_actividad:    { label: "Sin actividad",      cls: "bg-gray-50 text-gray-400 border border-gray-200" },
};

export default function PicdCiclosAdmin({
  rows,
  cicloAño,
}: {
  rows: CicloRow[];
  cicloAño: number;
}) {
  const [filtro, setFiltro] = useState<string>("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const filtrados = filtro === "todos"
    ? rows
    : rows.filter((r) => (r.estado ?? "sin_actividad") === filtro);

  const idsReaveribles = filtrados.filter(
    (r) => r.estado === "enviado_revision" || r.estado === "aprobado"
  ).map((r) => r.id_empleado);

  const selectedReaveribles = [...selected].filter(
    (id) => idsReaveribles.includes(id)
  );

  function toggleAll() {
    if (selectedReaveribles.length === idsReaveribles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(idsReaveribles));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleReabrir() {
    const pares = selectedReaveribles.map((id) => ({ id_empleado: id, ciclo_año: cicloAño }));
    if (!pares.length) return;
    if (!confirm(`¿Reabrir ciclo ${cicloAño} para ${pares.length} colaborador(es)?`)) return;
    startTransition(async () => {
      await reabrirCiclosMultiples(pares);
      setSelected(new Set());
      setMsg(`Ciclo reabierto para ${pares.length} colaborador(es).`);
      setTimeout(() => setMsg(null), 4000);
    });
  }

  const countByEstado = {
    todos: rows.length,
    enviado_revision: rows.filter((r) => r.estado === "enviado_revision").length,
    aprobado: rows.filter((r) => r.estado === "aprobado").length,
    abierto: rows.filter((r) => r.estado === "abierto").length,
    sin_actividad: rows.filter((r) => !r.estado).length,
  };

  return (
    <div className="space-y-4">
      <SectionHeader label={`Gestión de Ciclos PICD — ${cicloAño}`} />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
          {/* Filtros */}
          <div className="flex gap-1 flex-wrap">
            {(["todos", "enviado_revision", "aprobado", "abierto", "sin_actividad"] as const).map((e) => (
              <button
                key={e}
                onClick={() => { setFiltro(e); setSelected(new Set()); }}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filtro === e
                    ? "bg-[#1a3a5c] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {e === "todos" ? "Todos" : ESTADO_LABEL[e]?.label ?? e}
                <span className="ml-1 opacity-70">
                  ({e === "todos" ? countByEstado.todos : countByEstado[e as keyof typeof countByEstado] ?? 0})
                </span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {msg && <span className="text-xs text-green-600 font-medium">{msg}</span>}
            {selectedReaveribles.length > 0 && (
              <button
                onClick={handleReabrir}
                disabled={isPending}
                className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 font-semibold transition-colors"
              >
                Reabrir ciclo ({selectedReaveribles.length})
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selectedReaveribles.length > 0 && selectedReaveribles.length === idsReaveribles.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Colaborador</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Puesto</th>
                <th className="px-4 py-3 font-medium">Estado ciclo</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Cerrado</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Decisión</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((r) => {
                const estado = r.estado ?? "sin_actividad";
                const info = ESTADO_LABEL[estado] ?? ESTADO_LABEL.sin_actividad;
                const canSelect = estado === "enviado_revision" || estado === "aprobado";
                return (
                  <tr key={r.id_empleado} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {canSelect && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id_empleado)}
                          onChange={() => toggle(r.id_empleado)}
                          className="rounded"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.nombre_completo}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{r.puesto ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${info.cls}`}>
                        {info.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {r.cerrado_at ? new Date(r.cerrado_at).toLocaleDateString("es-MX") : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {r.decision_at
                        ? `${r.decision_nombre ?? ""} · ${new Date(r.decision_at).toLocaleDateString("es-MX")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/carpeta/${r.id_empleado}`}
                        className="text-[#1a3a5c] hover:underline text-xs font-medium"
                      >
                        Ver →
                      </a>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                    Sin colaboradores con este estado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
