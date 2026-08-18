"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ZONA_COLORS } from "@/lib/types";
import { SortableTh, useSortState } from "@/components/ui/SortableTh";

export type CarpetaRow = {
  id: string;
  id_empleado: string;
  zona_evaluacion: string | null;
  evaluacion_potencial_total: number | null;
  desempeno_logra: number | null;
  colaboradores: {
    nombre_completo: string | null;
    puesto: string | null;
    segmento_organizacional: string | null;
    organización: string | null;
    area: string | null;
    jefe_inmediato_nombre: string | null;
  } | null;
};

const ZONA_ORDER: Record<string, number> = {
  Sobresaliente: 0, Desarrollo: 1, Estabilidad: 2, "Revisión": 3, Inicio: 4,
};

function uniq(arr: (string | null | undefined)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, "es"));
}

export default function CarpetasClient({ eips }: { eips: CarpetaRow[] }) {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();

  // Read filters from URL
  const nombreUrl = sp.get("nombre") ?? "";
  const uen       = sp.get("uen")    ?? "Todos";
  const area     = sp.get("area")     ?? "Todos";
  const segmento = sp.get("segmento") ?? "Todos";
  const jefe     = sp.get("jefe")     ?? "Todos";

  // Local state for the name input — decoupled from URL so typing is instant
  const [nombreLocal, setNombreLocal] = useState(nombreUrl);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync URL → local when URL changes externally (e.g. clearFilters)
  useEffect(() => { setNombreLocal(nombreUrl); }, [nombreUrl]);

  function handleNombreChange(value: string) {
    setNombreLocal(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (value) { params.set("nombre", value); } else { params.delete("nombre"); }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
  }

  // Use local state for filtering (instant) — URL lags 300ms behind for bookmarkability
  const nombre = nombreLocal;

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value === "Todos" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setUen(v: string)      { const p = new URLSearchParams(sp.toString()); if (v === "Todos") { p.delete("uen"); } else { p.set("uen", v); } p.delete("area"); p.delete("jefe"); router.replace(`${pathname}?${p.toString()}`, { scroll: false }); }
  function setArea(v: string)     { const p = new URLSearchParams(sp.toString()); if (v === "Todos") { p.delete("area"); } else { p.set("area", v); } p.delete("jefe"); router.replace(`${pathname}?${p.toString()}`, { scroll: false }); }

  function clearFilters() {
    const params = new URLSearchParams();
    const ciclo = sp.get("ciclo");
    if (ciclo) params.set("ciclo", ciclo);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Cascaded option lists
  const uens = useMemo(() => uniq(eips.map((e) => e.colaboradores?.organización)), [eips]);
  const segmentos = useMemo(() => uniq(eips.map((e) => e.colaboradores?.segmento_organizacional)), [eips]);

  const availableAreas = useMemo(() => {
    const src = uen === "Todos" ? eips : eips.filter((e) => e.colaboradores?.organización === uen);
    return uniq(src.map((e) => e.colaboradores?.area));
  }, [eips, uen]);

  const availableJefes = useMemo(() => {
    let src = eips;
    if (uen      !== "Todos") src = src.filter((e) => e.colaboradores?.organización === uen);
    if (area     !== "Todos") src = src.filter((e) => e.colaboradores?.area === area);
    return uniq(src.map((e) => e.colaboradores?.jefe_inmediato_nombre));
  }, [eips, uen, area]);

  // Filter
  const filtered = useMemo(() => {
    return eips.filter((e) => {
      const c = e.colaboradores;
      if (nombre    && !c?.nombre_completo?.toLowerCase().includes(nombre.toLowerCase())) return false;
      if (uen      !== "Todos" && c?.organización !== uen)             return false;
      if (area     !== "Todos" && c?.area !== area)                    return false;
      if (segmento !== "Todos" && c?.segmento_organizacional !== segmento) return false;
      if (jefe     !== "Todos" && c?.jefe_inmediato_nombre !== jefe)   return false;
      return true;
    });
  }, [eips, nombre, uen, area, segmento, jefe]);

  // Sort
  const { sortKey, sortDir, handleSort } = useSortState<"nombre" | "puesto" | "segmento" | "zona" | "potencial" | "desempeno">("nombre");

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const ac = a.colaboradores, bc = b.colaboradores;
      switch (sortKey) {
        case "nombre":    return dir * (ac?.nombre_completo ?? "").localeCompare(bc?.nombre_completo ?? "", "es");
        case "puesto":    return dir * (ac?.puesto ?? "").localeCompare(bc?.puesto ?? "", "es");
        case "segmento":  return dir * (ac?.segmento_organizacional ?? "").localeCompare(bc?.segmento_organizacional ?? "", "es");
        case "zona":      return dir * ((ZONA_ORDER[a.zona_evaluacion ?? ""] ?? 9) - (ZONA_ORDER[b.zona_evaluacion ?? ""] ?? 9));
        case "potencial": return dir * ((Number(a.evaluacion_potencial_total) || 0) - (Number(b.evaluacion_potencial_total) || 0));
        case "desempeno": return dir * ((Number(a.desempeno_logra) || 0) - (Number(b.desempeno_logra) || 0));
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const hasFilter = nombre || uen !== "Todos" || area !== "Todos" || segmento !== "Todos" || jefe !== "Todos";

  const selectCls = "text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] bg-white";

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
        <input
          type="text"
          placeholder="Buscar persona…"
          value={nombreLocal}
          onChange={(e) => handleNombreChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] w-40"
        />
        {uens.length > 0 && (
          <select value={uen} onChange={(e) => setUen(e.target.value)} className={selectCls}>
            <option value="Todos">Todas las UEN</option>
            {uens.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {availableAreas.length > 0 && (
          <select value={area} onChange={(e) => setArea(e.target.value)} className={selectCls}>
            <option value="Todos">Todas las áreas</option>
            {availableAreas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {segmentos.length > 0 && (
          <select value={segmento} onChange={(e) => setParam("segmento", e.target.value)} className={selectCls}>
            <option value="Todos">Todos los segmentos</option>
            {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {availableJefes.length > 0 && (
          <select value={jefe} onChange={(e) => setParam("jefe", e.target.value)} className={selectCls}>
            <option value="Todos">Todos los jefes</option>
            {availableJefes.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        )}
        {hasFilter && (
          <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-700 underline">Limpiar</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{sorted.length} colaboradores</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
              <SortableTh label="Colaborador"  sortKey="nombre"    currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
              <SortableTh label="Puesto"       sortKey="puesto"    currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
              <SortableTh label="Segmento"     sortKey="segmento"  currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3" />
              <SortableTh label="Zona"         sortKey="zona"      currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 text-center" />
              <SortableTh label="Potencial"    sortKey="potencial" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 text-right" />
              <SortableTh label="Desempeño"    sortKey="desempeno" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-5 py-3 text-right" />
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((e) => {
              const c     = e.colaboradores;
              const zona  = e.zona_evaluacion;
              const colors = zona ? (ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-700" }) : null;
              return (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{c?.nombre_completo ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{c?.puesto ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{c?.segmento_organizacional ?? "—"}</td>
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
                    <a href={`/carpeta/${e.id_empleado}`} className="text-xs text-[#1a3a5c] hover:underline whitespace-nowrap">Ver carpeta →</a>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">Sin resultados para los filtros aplicados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
