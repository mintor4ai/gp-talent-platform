"use client";

import { useState, useMemo } from "react";
import type { PicdDiscrepancia } from "@/app/actions/higiene_picd";

const CAMPO_LABEL: Record<string, string> = {
  opcion1: "Opción 1",
  opcion2: "Opción 2",
};

export default function HigienePicdClient({
  discrepancias,
}: {
  discrepancias: PicdDiscrepancia[];
}) {
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<"todos" | "borrador" | "publicado">("todos");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return discrepancias.filter((d) => {
      if (filterEstado === "borrador" && d.estado !== "borrador") return false;
      if (filterEstado === "publicado" && d.estado === "borrador") return false;
      if (!q) return true;
      return (
        d.colaboradorNombre.toLowerCase().includes(q) ||
        d.textoEscrito.toLowerCase().includes(q) ||
        d.nombreEnCatalogo.toLowerCase().includes(q)
      );
    });
  }, [discrepancias, search, filterEstado]);

  const borradorCount = discrepancias.filter((d) => d.estado === "borrador").length;
  const ciclosUnicos = [...new Set(discrepancias.map((d) => d.cicloAño))].sort((a, b) => b - a);

  if (discrepancias.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <p className="text-green-700 font-medium">Sin inconsistencias detectadas</p>
        <p className="text-sm text-green-600 mt-1">
          Todos los registros PICD con catálogo vinculado coinciden con el texto registrado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">
            {discrepancias.length} registro{discrepancias.length !== 1 ? "s" : ""} con diferencia entre texto y catálogo
          </p>
          <p className="text-xs text-amber-700 mt-1">
            El texto que el colaborador escribió en su PICD no coincide exactamente con el nombre del puesto al que está vinculado el catálogo.
            Esto puede ocurrir por ajustes manuales posteriores o por importaciones donde el vínculo y el texto no se actualizaron en conjunto.
            {borradorCount > 0 && (
              <span className="ml-1">
                <strong>{borradorCount}</strong> de estos están en borrador (no publicados).
              </span>
            )}
          </p>
          <p className="text-xs text-amber-600 mt-2">
            Para corregir: accede al expediente del colaborador → sección PICD → edita la aspiración correspondiente.
            No se requiere ninguna acción masiva; cada caso debe revisarse individualmente con el colaborador o su líder.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o puesto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] w-64"
        />
        <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
          {(["todos", "publicado", "borrador"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterEstado(v)}
              className={`text-xs px-3 py-1 rounded-md transition-colors font-medium ${
                filterEstado === v
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {v === "todos" ? "Todos" : v === "publicado" ? "Publicados" : "Borradores"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} de {discrepancias.length} registros · {ciclosUnicos.length} ciclo{ciclosUnicos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Colaborador</th>
                <th className="text-left px-4 py-3 font-medium w-20">Ciclo</th>
                <th className="text-left px-4 py-3 font-medium w-24">Estado</th>
                <th className="text-left px-4 py-3 font-medium w-24">Campo</th>
                <th className="text-left px-4 py-3 font-medium">Texto escrito</th>
                <th className="text-left px-4 py-3 font-medium">Nombre en catálogo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((d, i) => (
                <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {d.colaboradorNombre}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 tabular-nums">
                    {d.cicloAño}
                  </td>
                  <td className="px-4 py-3">
                    {d.estado === "borrador" ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Borrador
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Publicado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {CAMPO_LABEL[d.campo] ?? d.campo}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="font-mono text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                      {d.textoEscrito}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {d.nombreEnCatalogo}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-gray-400">
                    Sin registros que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Esta vista es de solo lectura. No realiza ningún cambio en la base de datos.
        Los datos se actualizan al recargar la página.
      </p>
    </div>
  );
}
