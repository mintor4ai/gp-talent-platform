"use client";

import { useState, useTransition, useMemo } from "react";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";
import {
  reabrirCiclosMultiples,
  activarCiclosPicd,
  enviarRecordatorioEntrevista,
} from "@/app/actions/picd_ciclo";
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
  abierto:          { label: "Abierto",       cls: "bg-gray-100 text-gray-600" },
  enviado_revision: { label: "En revisión",   cls: "bg-amber-100 text-amber-700" },
  aprobado:         { label: "Aprobado",      cls: "bg-green-100 text-green-700" },
  rechazado:        { label: "Con ajustes",   cls: "bg-red-100 text-red-600" },
  sin_actividad:    { label: "Sin actividad", cls: "bg-gray-50 text-gray-400 border border-gray-200" },
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
  const [msg, setMsg] = useState<{ texto: string; tipo: "ok" | "info" } | null>(null);
  const { sortKey, sortDir, handleSort } = useSortState<"nombre_completo" | "puesto" | "estado" | "cerrado_at">("nombre_completo");

  const filtrados = useMemo(() => {
    const base = filtro === "todos"
      ? rows
      : rows.filter((r) => (r.estado ?? "sin_actividad") === filtro);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "nombre_completo": return dir * a.nombre_completo.localeCompare(b.nombre_completo, "es");
        case "puesto":          return dir * (a.puesto ?? "").localeCompare(b.puesto ?? "", "es");
        case "estado":          return dir * (a.estado ?? "").localeCompare(b.estado ?? "", "es");
        case "cerrado_at":      return dir * (a.cerrado_at ?? "").localeCompare(b.cerrado_at ?? "");
        default: return 0;
      }
    });
  }, [rows, filtro, sortKey, sortDir]);

  // Sub-grupos según estado de los seleccionados
  const rowMap = new Map(rows.map((r) => [r.id_empleado, r]));
  const selectedArr = [...selected];

  const selectedActivables = selectedArr.filter((id) => {
    const r = rowMap.get(id);
    return !r?.estado; // sin_actividad = sin registro aún
  });

  const selectedReaveribles = selectedArr.filter((id) => {
    const r = rowMap.get(id);
    return r?.estado === "enviado_revision" || r?.estado === "aprobado";
  });

  // Select/deselect todo lo visible en el filtro actual
  const allFiltradosIds = filtrados.map((r) => r.id_empleado);
  const allFiltradosSelected = allFiltradosIds.length > 0 &&
    allFiltradosIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allFiltradosSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allFiltradosIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        allFiltradosIds.forEach((id) => next.add(id));
        return next;
      });
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

  function showMsg(texto: string, tipo: "ok" | "info" = "ok") {
    setMsg({ texto, tipo });
    setTimeout(() => setMsg(null), 4000);
  }

  function handleActivar() {
    if (!selectedActivables.length) return;
    if (!confirm(`¿Activar ciclo ${cicloAño} para ${selectedActivables.length} colaborador(es) sin actividad?`)) return;
    startTransition(async () => {
      await activarCiclosPicd(selectedActivables, cicloAño);
      setSelected(new Set());
      showMsg(`Ciclo activado y notificado a ${selectedActivables.length} colaborador(es).`);
    });
  }

  function handleReabrir() {
    if (!selectedReaveribles.length) return;
    if (!confirm(`¿Reabrir ciclo ${cicloAño} para ${selectedReaveribles.length} colaborador(es)?`)) return;
    startTransition(async () => {
      await reabrirCiclosMultiples(
        selectedReaveribles.map((id) => ({ id_empleado: id, ciclo_año: cicloAño }))
      );
      setSelected(new Set());
      showMsg(`Ciclo reabierto para ${selectedReaveribles.length} colaborador(es).`);
    });
  }

  function handleRecordatorio() {
    if (!selectedArr.length) return;
    if (!confirm(`¿Enviar recordatorio de entrevista a ${selectedArr.length} colaborador(es)?`)) return;
    startTransition(async () => {
      await enviarRecordatorioEntrevista(selectedArr, cicloAño);
      setSelected(new Set());
      showMsg(`Recordatorio enviado a ${selectedArr.length} colaborador(es).`, "info");
    });
  }

  const countByEstado = {
    todos:            rows.length,
    enviado_revision: rows.filter((r) => r.estado === "enviado_revision").length,
    aprobado:         rows.filter((r) => r.estado === "aprobado").length,
    abierto:          rows.filter((r) => r.estado === "abierto").length,
    sin_actividad:    rows.filter((r) => !r.estado).length,
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
                onClick={() => { setFiltro(e); }}
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

          {/* Acciones */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {msg && (
              <span className={`text-xs font-medium ${msg.tipo === "ok" ? "text-green-600" : "text-blue-600"}`}>
                {msg.texto}
              </span>
            )}

            {selectedActivables.length > 0 && (
              <button
                onClick={handleActivar}
                disabled={isPending}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold transition-colors"
              >
                Activar ciclo ({selectedActivables.length})
              </button>
            )}

            {selectedReaveribles.length > 0 && (
              <button
                onClick={handleReabrir}
                disabled={isPending}
                className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 font-semibold transition-colors"
              >
                Reabrir ciclo ({selectedReaveribles.length})
              </button>
            )}

            {selectedArr.length > 0 && (
              <button
                onClick={handleRecordatorio}
                disabled={isPending}
                className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50 font-semibold transition-colors"
              >
                Recordatorio entrevista ({selectedArr.length})
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
                    checked={allFiltradosSelected}
                    onChange={toggleAll}
                    className="rounded"
                    title="Seleccionar todos los visibles"
                  />
                </th>
                <SortableTh label="Colaborador" sortKey="nombre_completo" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                <SortableTh label="Puesto" sortKey="puesto" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 hidden md:table-cell" />
                <SortableTh label="Estado ciclo" sortKey="estado" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                <SortableTh label="Cerrado" sortKey="cerrado_at" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3 hidden lg:table-cell" />
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Decisión</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((r) => {
                const estado = r.estado ?? "sin_actividad";
                const info = ESTADO_LABEL[estado] ?? ESTADO_LABEL.sin_actividad;
                return (
                  <tr
                    key={r.id_empleado}
                    className={`hover:bg-gray-50 transition-colors ${selected.has(r.id_empleado) ? "bg-blue-50/40" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id_empleado)}
                        onChange={() => toggle(r.id_empleado)}
                        className="rounded"
                      />
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
                      <div className="flex gap-3">
                        <a
                          href={`/picd/${r.id_empleado}`}
                          className="text-[#1a3a5c] hover:underline text-xs font-medium"
                        >
                          PICD →
                        </a>
                        <a
                          href={`/carpeta/${r.id_empleado}`}
                          className="text-gray-400 hover:underline text-xs font-medium"
                        >
                          Carpeta
                        </a>
                      </div>
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

        {/* Leyenda de acciones */}
        {selected.size === 0 && (
          <div className="px-5 py-3 border-t border-gray-50 flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />
              Activar ciclo — colaboradores Sin actividad
            </span>
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-[#1a3a5c] mr-1.5" />
              Reabrir ciclo — En revisión o Aprobados
            </span>
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
              Recordatorio de entrevista — cualquier selección
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
