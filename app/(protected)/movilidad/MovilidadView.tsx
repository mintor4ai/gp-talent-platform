"use client";

import { useState, useMemo, useTransition } from "react";
import { crearUmbral, actualizarUmbral, eliminarUmbral } from "@/app/actions/movilidad";
import type { UmbralRow } from "@/app/actions/movilidad";
import type { ColabMovilidad } from "./page";

type Semaforo = "verde" | "amarillo" | "rojo" | "sin_datos";

const SEMAFORO_CONFIG: Record<Semaforo, { label: string; sublabel: string; dot: string; row: string; badge: string; order: number }> = {
  verde:     { label: "En adaptación",   sublabel: "Recién ingresó a la posición",          dot: "bg-green-500",  row: "",               badge: "bg-green-100 text-green-700 border-green-200",  order: 3 },
  amarillo:  { label: "Establecido",     sublabel: "Conoce bien su rol y entorno",           dot: "bg-amber-400",  row: "bg-amber-50/40", badge: "bg-amber-100 text-amber-700 border-amber-200",   order: 1 },
  rojo:      { label: "Alta permanencia",sublabel: "Larga trayectoria en la misma posición", dot: "bg-red-500",    row: "bg-red-50/40",   badge: "bg-red-100 text-red-700 border-red-200",         order: 0 },
  sin_datos: { label: "Sin fecha",       sublabel: "No se registró fecha de ingreso",        dot: "bg-gray-300",   row: "",               badge: "bg-gray-100 text-gray-400 border-gray-200",      order: 2 },
};

function resolveUmbral(
  umbrales: UmbralRow[],
  ciclo: number,
  org: string | null,
  segmento: string | null
): { meses_amarillo: number; meses_rojo: number } {
  const forCiclo = umbrales.filter((u) => u.ciclo_año === ciclo && u.activo);
  // Priority: exact → only-org → only-segmento → global
  const exact    = forCiclo.find((u) => u.organización === org && u.segmento_organizacional === segmento);
  if (exact) return exact;
  const byOrg    = forCiclo.find((u) => u.organización === org && u.segmento_organizacional === null);
  if (byOrg) return byOrg;
  const bySeg    = forCiclo.find((u) => u.organización === null && u.segmento_organizacional === segmento);
  if (bySeg) return bySeg;
  const global   = forCiclo.find((u) => u.organización === null && u.segmento_organizacional === null);
  if (global) return global;
  return { meses_amarillo: 24, meses_rojo: 48 };
}

function getSemaforo(meses: number | null, umbral: { meses_amarillo: number; meses_rojo: number }): Semaforo {
  if (meses === null) return "sin_datos";
  if (meses < umbral.meses_amarillo) return "verde";
  if (meses < umbral.meses_rojo) return "amarillo";
  return "rojo";
}

function mesesDesde(fecha: string | null): number | null {
  if (!fecha) return null;
  const diff = Date.now() - new Date(fecha).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 30.4375));
}

function fmtMeses(m: number | null): string {
  if (m === null) return "—";
  if (m < 12) return `${m} mes${m !== 1 ? "es" : ""}`;
  const años = (m / 12).toFixed(1);
  return `${años} años`;
}

// ── Configuración de umbrales ────────────────────────────────────────────────

function UmbralesConfig({
  umbrales: initialUmbrales,
  ciclo,
  uens,
  segmentos,
}: {
  umbrales: UmbralRow[];
  ciclo: number;
  uens: string[];
  segmentos: string[];
}) {
  const [umbrales, setUmbrales] = useState(initialUmbrales);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ organización: "", segmento_organizacional: "", meses_amarillo: "24", meses_rojo: "48" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const forCiclo = useMemo(() => umbrales.filter((u) => u.ciclo_año === ciclo && u.activo), [umbrales, ciclo]);

  const handleSave = () => {
    const mA = parseInt(form.meses_amarillo);
    const mR = parseInt(form.meses_rojo);
    if (!mA || !mR || mA >= mR) { setMsg({ ok: false, text: "meses_rojo debe ser mayor que meses_amarillo" }); return; }
    startTransition(async () => {
      if (editId) {
        const res = await actualizarUmbral(editId, { meses_amarillo: mA, meses_rojo: mR });
        if (res.ok) {
          setUmbrales((prev) => prev.map((u) => u.id === editId ? { ...u, meses_amarillo: mA, meses_rojo: mR } : u));
          setMsg({ ok: true, text: "Umbral actualizado" });
        } else setMsg({ ok: false, text: res.error ?? "Error" });
      } else {
        const res = await crearUmbral({
          ciclo_año: ciclo,
          organización: form.organización || null,
          segmento_organizacional: form.segmento_organizacional || null,
          meses_amarillo: mA,
          meses_rojo: mR,
        });
        if (res.ok) {
          setMsg({ ok: true, text: "Umbral creado — recarga para verlo" });
        } else setMsg({ ok: false, text: res.error ?? "Error" });
      }
      setShowForm(false);
      setEditId(null);
      setForm({ organización: "", segmento_organizacional: "", meses_amarillo: "24", meses_rojo: "48" });
    });
  };

  const handleEdit = (u: UmbralRow) => {
    setEditId(u.id);
    setForm({
      organización: u.organización ?? "",
      segmento_organizacional: u.segmento_organizacional ?? "",
      meses_amarillo: String(u.meses_amarillo),
      meses_rojo: String(u.meses_rojo),
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await eliminarUmbral(id);
      if (res.ok) setUmbrales((prev) => prev.filter((u) => u.id !== id));
      else setMsg({ ok: false, text: res.error ?? "Error" });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Umbrales para ciclo <strong>{ciclo}</strong>. Prioridad: UEN+Segmento → solo UEN → solo Segmento → Global.
        </p>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ organización: "", segmento_organizacional: "", meses_amarillo: "24", meses_rojo: "48" }); }}
          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#1a3a5c] text-white hover:bg-[#152e4a] transition-colors"
        >
          + Agregar umbral
        </button>
      </div>

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700">{editId ? "Editar umbral" : "Nuevo umbral"}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide block mb-1">UEN</label>
              <select
                value={form.organización}
                onChange={(e) => setForm((f) => ({ ...f, organización: e.target.value }))}
                disabled={!!editId}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              >
                <option value="">Global (todas)</option>
                {uens.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide block mb-1">Segmento</label>
              <select
                value={form.segmento_organizacional}
                onChange={(e) => setForm((f) => ({ ...f, segmento_organizacional: e.target.value }))}
                disabled={!!editId}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              >
                <option value="">Global (todos)</option>
                {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide block mb-1">Verde → Amarillo (meses)</label>
              <input
                type="number" min={1} max={120}
                value={form.meses_amarillo}
                onChange={(e) => setForm((f) => ({ ...f, meses_amarillo: e.target.value }))}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide block mb-1">Amarillo → Rojo (meses)</label>
              <input
                type="number" min={1} max={240}
                value={form.meses_rojo}
                onChange={(e) => setForm((f) => ({ ...f, meses_rojo: e.target.value }))}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#1a3a5c] text-white hover:bg-[#152e4a] disabled:opacity-60 transition-colors">
              {isPending ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Umbrales table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-400 text-left border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">UEN</th>
              <th className="px-4 py-2.5 font-medium">Segmento</th>
              <th className="px-4 py-2.5 font-medium text-center">Verde → Amarillo</th>
              <th className="px-4 py-2.5 font-medium text-center">Amarillo → Rojo</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {forCiclo.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin umbrales configurados para {ciclo}</td></tr>
            )}
            {forCiclo.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{u.organización ?? <span className="italic text-gray-400">Global</span>}</td>
                <td className="px-4 py-2.5 text-gray-600">{u.segmento_organizacional ?? <span className="italic text-gray-400">Todos</span>}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    &lt; {u.meses_amarillo} meses
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {u.meses_amarillo}–{u.meses_rojo} meses
                    <span className="w-2 h-2 rounded-full bg-red-500 ml-1" />
                    ≥{u.meses_rojo}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleEdit(u)}
                      className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(u.id)}
                      className="text-[11px] px-2 py-1 rounded border border-red-100 text-red-500 hover:bg-red-50 transition-colors">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function MovilidadView({
  colabs,
  umbrales,
  uens,
  segmentos,
  ciclos,
  currentYear,
}: {
  colabs: ColabMovilidad[];
  umbrales: UmbralRow[];
  uens: string[];
  segmentos: string[];
  ciclos: number[];
  currentYear: number;
}) {
  const [tab, setTab] = useState<"panel" | "config">("panel");
  const [ciclo, setCiclo] = useState(currentYear);
  const [filterUen, setFilterUen] = useState("");
  const [filterSegmento, setFilterSegmento] = useState("");
  const [filterSemaforo, setFilterSemaforo] = useState<"" | Semaforo>("");
  const [search, setSearch] = useState("");

  const enriched = useMemo(() => {
    return colabs.map((c) => {
      const meses = mesesDesde(c.fecha_ingreso_posicion);
      const umbral = resolveUmbral(umbrales, ciclo, c.organización ?? null, c.segmento_organizacional ?? null);
      const semaforo = getSemaforo(meses, umbral);
      return { ...c, meses, umbral, semaforo };
    });
  }, [colabs, umbrales, ciclo]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter((c) => {
      if (filterUen && c.organización !== filterUen) return false;
      if (filterSegmento && c.segmento_organizacional !== filterSegmento) return false;
      if (filterSemaforo && c.semaforo !== filterSemaforo) return false;
      if (q && !(c.nombre_completo ?? "").toLowerCase().includes(q) && !(c.puesto ?? "").toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => SEMAFORO_CONFIG[a.semaforo].order - SEMAFORO_CONFIG[b.semaforo].order);
  }, [enriched, filterUen, filterSegmento, filterSemaforo, search]);

  const counts = useMemo(() => ({
    rojo:      enriched.filter((c) => c.semaforo === "rojo").length,
    amarillo:  enriched.filter((c) => c.semaforo === "amarillo").length,
    verde:     enriched.filter((c) => c.semaforo === "verde").length,
    sin_datos: enriched.filter((c) => c.semaforo === "sin_datos").length,
  }), [enriched]);

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Semáforo de Movilidad</h2>
        <p className="text-sm text-gray-500 mt-0.5">Indicador de permanencia en la posición actual · los umbrales varían por segmento y UEN</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["panel", "config"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-[#1a3a5c] text-[#1a3a5c]" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}>
            {t === "panel" ? "Panel" : "Configurar umbrales"}
          </button>
        ))}
      </div>

      {tab === "config" ? (
        <UmbralesConfig umbrales={umbrales} ciclo={ciclo} uens={uens} segmentos={segmentos} />
      ) : (
        <>
          {/* Summary chips */}
          <div className="flex flex-wrap gap-3">
            {(["rojo", "amarillo", "verde", "sin_datos"] as Semaforo[]).map((s) => {
              const cfg = SEMAFORO_CONFIG[s];
              return (
                <button key={s}
                  onClick={() => setFilterSemaforo(filterSemaforo === s ? "" : s)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-left transition-all ${
                    filterSemaforo === s
                      ? "border-gray-400 bg-white shadow-sm ring-2 ring-gray-200"
                      : "border-gray-200 bg-white hover:shadow-sm"
                  }`}>
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <div>
                    <p className="text-xl font-bold text-gray-900 leading-none">{counts[s]}</p>
                    <p className="text-[11px] text-gray-700 font-medium mt-0.5">{cfg.label}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 max-w-[120px] leading-tight">{cfg.sublabel}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nombre o puesto..."
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 lg:col-span-2" />
              <select value={String(ciclo)} onChange={(e) => setCiclo(parseInt(e.target.value))}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30">
                {ciclos.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterUen} onChange={(e) => setFilterUen(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30">
                <option value="">Todas las UEN</option>
                {uens.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={filterSegmento} onChange={(e) => setFilterSegmento(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30">
                <option value="">Todos los segmentos</option>
                {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(search || filterUen || filterSegmento || filterSemaforo) && (
              <button onClick={() => { setSearch(""); setFilterUen(""); setFilterSegmento(""); setFilterSemaforo(""); }}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 font-medium">Colaborador</th>
                    <th className="px-4 py-3 font-medium">Puesto</th>
                    <th className="px-4 py-3 font-medium">UEN</th>
                    <th className="px-4 py-3 font-medium">Segmento</th>
                    <th className="px-4 py-3 font-medium text-center">Tiempo en posición</th>
                    <th className="px-4 py-3 font-medium text-center">Semáforo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                        No hay colaboradores con los filtros seleccionados
                      </td>
                    </tr>
                  )}
                  {filtered.map((c) => {
                    const cfg = SEMAFORO_CONFIG[c.semaforo];
                    return (
                      <tr key={c.id} className={`hover:bg-gray-50/70 transition-colors ${cfg.row}`}>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {c.nombre_completo ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                          <span className="break-words leading-snug">{c.puesto ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 truncate max-w-[130px]">
                          {c.organización ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {c.segmento_organizacional ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-gray-700">
                          {fmtMeses(c.meses)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            title={`Umbral: verde <${c.umbral.meses_amarillo}m · amarillo ${c.umbral.meses_amarillo}–${c.umbral.meses_rojo}m · rojo ≥${c.umbral.meses_rojo}m`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-default ${cfg.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a href={`/carpeta/${c.id}`}
                            className="text-[11px] text-[#1a3a5c] hover:underline">
                            Ver carpeta →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
                Mostrando {filtered.length} de {colabs.length} colaboradores activos
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
