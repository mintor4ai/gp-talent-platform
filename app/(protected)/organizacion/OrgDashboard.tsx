"use client";

import { useState, useMemo } from "react";
import type { OrgData, RotacionUen } from "@/app/actions/organizacion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
  ComposedChart, Line,
} from "recharts";

// ── Palette ──────────────────────────────────────────────────────────────────
const UEN_COLORS: Record<string, string> = {
  "101 GP CONSTRUCCIÓN": "#1a3a5c",
  "102 GP MAQUINARIA":   "#2563eb",
  "201 GP DESARROLLOS":  "#0891b2",
  "301 GP ENERGÍA":      "#059669",
  "401 GP CORPORATIVO":  "#7c3aed",
  "501 TREZ":            "#ea580c",
  "402 PRESIDENCIA":     "#6b7280",
  "404 PRACTICANTES":    "#9ca3af",
};
const COLOR_FALLBACK = ["#1a3a5c","#2563eb","#0891b2","#059669","#7c3aed","#ea580c","#f59e0b","#6b7280"];
function uenColor(uen: string, idx: number) { return UEN_COLORS[uen] ?? COLOR_FALLBACK[idx % COLOR_FALLBACK.length]; }

const NIVEL_LABELS: Record<number, string> = {
  1: "N1 Dirección General", 2: "N2 VP / Dir Corp", 3: "N3 Director",
  4: "N4 Subdirector",       5: "N5 Gerente Sr",    6: "N6 Gerente",
  7: "N7 Jefe Sr",           8: "N8 Jefe",          9: "N9 Coord Sr",
  10: "N10 Coord",           11: "N11 Analista",    12: "N12 Asistente",
  13: "N13 Operativo",       99: "Sin nivel",
};

// ── Short UEN label ───────────────────────────────────────────────────────────
function shortUen(uen: string) {
  return uen.replace(/^\d+\s+/, "").replace("GP ", "").replace(" CONSTRUCCIÓN", " Const.")
    .replace(" MAQUINARIA", " Maq.").replace(" DESARROLLOS", " Des.")
    .replace(" ENERGÍA", " En.").replace(" CORPORATIVO", " Corp.");
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-[#1a3a5c] tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-[#1a3a5c] text-[#1a3a5c]" : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>
          <span className="font-medium">{p.name}:</span> {p.value}
        </p>
      ))}
    </div>
  );
}

// ── Rotation helpers ──────────────────────────────────────────────────────────
const NIVEL_LABELS_SHORT: Record<number, string> = {
  1: "N1 Dir. Gral", 2: "N2 VP/Dir Corp", 3: "N3 Director",
  4: "N4 Subdirector", 5: "N5 Ger. Sr", 6: "N6 Gerente",
  7: "N7 Jefe Sr", 8: "N8 Jefe", 9: "N9 Coord Sr",
  10: "N10 Coord", 11: "N11 Analista", 12: "N12 Asistente",
  13: "N13 Operativo", 99: "Sin nivel",
};

function rotColor(pct: number) {
  if (pct >= 20) return "#dc2626";
  if (pct >= 10) return "#d97706";
  return "#059669";
}

function RotBadge({ pct }: { pct: number }) {
  const color = rotColor(pct);
  const bg = pct >= 20 ? "#fef2f2" : pct >= 10 ? "#fffbeb" : "#f0fdf4";
  const label = pct >= 20 ? "Alto" : pct >= 10 ? "Medio" : "OK";
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color, background: bg }}>
      {label}
    </span>
  );
}

function RotacionTab({ data, selectedUens }: { data: OrgData; selectedUens: Set<string> }) {
  const rot = data.rotacion;

  const filteredByUen = rot.byUen.filter((r) => selectedUens.has(r.uen));

  // Aggregate flujoByUen for selected UENs, then derive HC-at-close
  const flujoConHc = useMemo(() => {
    // Aggregate per-UEN flujo rows into group totals for selected UENs
    const mesMap: Record<string, { altas: number; bajas: number }> = {};
    for (const r of rot.flujoByUen) {
      if (!selectedUens.has(r.uen)) continue;
      if (!mesMap[r.mes]) mesMap[r.mes] = { altas: 0, bajas: 0 };
      mesMap[r.mes].altas += r.altas;
      mesMap[r.mes].bajas += r.bajas;
    }
    // Fill any months present in group flujoMensual but missing per-UEN rows
    for (const m of rot.flujoMensual) {
      if (!mesMap[m.mes]) mesMap[m.mes] = { altas: 0, bajas: 0 };
    }
    const meses = Object.keys(mesMap).sort().slice(-13).map((mes) => ({ mes, ...mesMap[mes] }));

    // Starting HC = sum of hc_activo for selected UENs
    const selStartHc = filteredByUen.reduce((s, r) => s + r.hc_activo, 0);
    let hc = selStartHc;
    const result = [...meses].reverse().map((m) => {
      const hc_fin = hc;
      hc = hc - m.altas + m.bajas;
      return { ...m, hc_fin };
    });
    return result.reverse();
  }, [rot.flujoByUen, rot.flujoMensual, filteredByUen, selectedUens]);
  const filteredFlujo = flujoConHc;

  // Aggregate KPIs for selected UENs
  const selBajas12m = filteredByUen.reduce((s, r) => s + r.bajas_12m, 0);
  const selHcActivo = filteredByUen.reduce((s, r) => s + r.hc_activo, 0);
  const selRotPct = selHcActivo + selBajas12m
    ? Math.round((selBajas12m / (selHcActivo + selBajas12m)) * 1000) / 10 : 0;

  // Flujo chart tooltip
  function FlujoTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const altas = payload.find((p: any) => p.dataKey === "altas")?.value ?? 0;
    const bajas = payload.find((p: any) => p.dataKey === "bajas")?.value ?? 0;
    const neto = altas - bajas;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        <p style={{ color: "#059669" }}>Altas: {altas}</p>
        <p style={{ color: "#dc2626" }}>Bajas: {bajas}</p>
        <p className={`font-semibold ${neto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          Neto: {neto >= 0 ? "+" : ""}{neto}
        </p>
      </div>
    );
  }

  const maxBajas = Math.max(...rot.bajasNivel.map((r) => r.bajas), 1);

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4 flex flex-col gap-0.5"
          style={{ borderColor: rotColor(selRotPct) + "55" }}>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Rotación LTM</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: rotColor(selRotPct) }}>{selRotPct}%</p>
          <p className="text-xs text-gray-400">{selBajas12m} bajas · últimos 12 meses</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-0.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Early Attrition</p>
          <p className="text-3xl font-bold text-[#1a3a5c] tabular-nums">
            {filteredByUen.length
              ? Math.round(filteredByUen.reduce((s, r) => s + r.early_attrition_pct, 0) / filteredByUen.length)
              : 0}%
          </p>
          <p className="text-xs text-gray-400">Salen antes de cumplir 1 año</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-0.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Antigüedad al salir</p>
          <p className="text-3xl font-bold text-[#1a3a5c] tabular-nums">
            {filteredByUen.length
              ? Math.round(filteredByUen.reduce((s, r) => s + r.tenure_exit_avg, 0) / filteredByUen.length * 10) / 10
              : 0} <span className="text-lg font-medium text-gray-400">años</span>
          </p>
          <p className="text-xs text-gray-400">Promedio al momento de la baja</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-0.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Balance Sep 26</p>
          <p className="text-3xl font-bold text-red-600 tabular-nums">–15</p>
          <p className="text-xs text-gray-400">12 altas · 27 bajas · peor mes</p>
        </div>
      </div>

      {/* Flujo mensual */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-700 mb-1">Flujo mensual de Headcount</p>
        <p className="text-xs text-gray-400 mb-4">
          Barras: altas (verde) y bajas (rojo) · Línea azul: HC total al cierre del mes
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={filteredFlujo} margin={{ left: 0, right: 16 }}>
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(2).replace("-", "/")} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#2563eb" }}
              domain={["auto", "auto"]}
              tickFormatter={(v) => v.toLocaleString()}
              width={52}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const altas   = payload.find((p: any) => p.dataKey === "altas")?.value ?? 0;
                const bajas   = payload.find((p: any) => p.dataKey === "bajas")?.value ?? 0;
                const hc_fin  = payload.find((p: any) => p.dataKey === "hc_fin")?.value;
                const neto = Number(altas) - Number(bajas);
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
                    <p className="font-semibold text-gray-700 mb-1">{label}</p>
                    <p style={{ color: "#059669" }}>Altas: {altas}</p>
                    <p style={{ color: "#dc2626" }}>Bajas: {bajas}</p>
                    <p className={`font-semibold ${neto >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      Neto: {neto >= 0 ? "+" : ""}{neto}
                    </p>
                    {hc_fin != null && (
                      <p className="text-blue-600 font-semibold border-t border-gray-100 pt-1 mt-1">
                        HC cierre: {Number(hc_fin).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Bar yAxisId="left" dataKey="altas" name="Altas" fill="#059669" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="bajas" name="Bajas" fill="#dc2626" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="hc_fin"
              name="HC cierre"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Rotation by UEN + Early Attrition */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rotation rate table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Tasa de rotación por UEN (LTM)</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100 text-[10px] uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">UEN</th>
                <th className="text-right pb-2 font-medium">Bajas 12m</th>
                <th className="text-right pb-2 font-medium">Rotación</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredByUen.map((r, i) => (
                <tr key={r.uen} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: uenColor(r.uen, i) }} />
                    <span className="text-gray-800">{shortUen(r.uen)}</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-gray-600">{r.bajas_12m}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold" style={{ color: rotColor(r.rotacion_pct) }}>
                    {r.rotacion_pct}%
                  </td>
                  <td className="py-2.5 pl-2"><RotBadge pct={r.rotacion_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Early attrition + tenure */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-1">Early Attrition y antigüedad al salir</p>
          <p className="text-xs text-gray-400 mb-4">% que sale antes de 1 año · años prom. al momento de la baja</p>
          <div className="space-y-3">
            {filteredByUen.map((r, i) => (
              <div key={r.uen}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: uenColor(r.uen, i) }} />
                    {shortUen(r.uen)}
                  </span>
                  <span className="text-gray-400 tabular-nums">
                    <span className="font-semibold" style={{ color: r.early_attrition_pct >= 40 ? "#dc2626" : r.early_attrition_pct >= 25 ? "#d97706" : "#059669" }}>
                      {r.early_attrition_pct}%
                    </span>
                    {" · "}{r.tenure_exit_avg} años al salir
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.early_attrition_pct}%`,
                      backgroundColor: r.early_attrition_pct >= 40 ? "#dc2626" : r.early_attrition_pct >= 25 ? "#d97706" : "#059669",
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bajas por nivel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-700 mb-1">Bajas por nivel jerárquico</p>
        <p className="text-xs text-gray-400 mb-4">Volumen de bajas históricas y antigüedad promedio al momento de la salida</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100 text-[10px] uppercase tracking-wide">
                <th className="text-left pb-2 font-medium">Nivel</th>
                <th className="text-right pb-2 font-medium">Bajas</th>
                <th className="pb-2 pl-3" style={{ width: "40%" }}>Volumen</th>
                <th className="text-right pb-2 font-medium">Años al salir</th>
              </tr>
            </thead>
            <tbody>
              {rot.bajasNivel.filter((r) => r.nivel_num !== 99).map((r) => (
                <tr key={r.nivel_num} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-700 font-medium">{NIVEL_LABELS_SHORT[r.nivel_num] ?? `N${r.nivel_num}`}</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{r.bajas}</td>
                  <td className="py-2 pl-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((r.bajas / maxBajas) * 100)}%`,
                          backgroundColor: "#1a3a5c",
                          opacity: 0.6 + (r.bajas / maxBajas) * 0.4,
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{r.tenure_exit_avg} años</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrgDashboard({ data }: { data: OrgData }) {
  const [selectedUens, setSelectedUens] = useState<Set<string>>(new Set(data.uens));
  const [tab, setTab] = useState<"resumen" | "headcount" | "demografia" | "rotacion">("resumen");

  function toggleUen(uen: string) {
    setSelectedUens((prev) => {
      const next = new Set(prev);
      if (next.has(uen)) { if (next.size > 1) next.delete(uen); }
      else next.add(uen);
      return next;
    });
  }

  // Derived filtered data
  const filteredHc = useMemo(
    () => data.hcByUen.filter((r) => selectedUens.has(r.uen)),
    [data.hcByUen, selectedUens]
  );
  const totalHc = filteredHc.reduce((s, r) => s + r.hc, 0);
  const edadProm = totalHc
    ? Math.round(filteredHc.reduce((s, r) => s + r.edad_prom * r.hc, 0) / totalHc)
    : 0;
  const antiguedadProm = totalHc
    ? Math.round(filteredHc.reduce((s, r) => s + r.antiguedad_prom * r.hc, 0) / totalHc)
    : 0;

  // Pyramid data (aggregate nivel across selected UENs)
  const pyramidData = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of data.nivelByUen) {
      if (!selectedUens.has(r.uen)) continue;
      map[r.nivel_num] = (map[r.nivel_num] ?? 0) + r.hc;
    }
    return Object.entries(map)
      .map(([n, hc]) => ({ nivel: Number(n), label: NIVEL_LABELS[Number(n)] ?? `N${n}`, hc }))
      .sort((a, b) => a.nivel - b.nivel);
  }, [data.nivelByUen, selectedUens]);

  // Donut data
  const donutData = useMemo(
    () => filteredHc.map((r) => ({ name: shortUen(r.uen), value: r.hc, fullName: r.uen })),
    [filteredHc]
  );

  // Growth curve (cumulative per year for selected UENs)
  const growthData = useMemo(() => {
    const yearMap: Record<string, Record<string, number>> = {};
    for (const r of data.crecimiento) {
      if (!selectedUens.has(r.uen)) continue;
      if (!yearMap[r.año]) yearMap[r.año] = {};
      yearMap[r.año][r.uen] = (yearMap[r.año][r.uen] ?? 0) + r.ingresos;
    }
    return Object.entries(yearMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([año, uens]) => ({ año, ...uens }));
  }, [data.crecimiento, selectedUens]);

  // Age buckets stacked
  const ageData = useMemo(() => {
    const buckets = ["< 25", "25-34", "35-44", "45-54", "55+"];
    const map: Record<string, Record<string, number>> = {
      "< 25": {}, "25-34": {}, "35-44": {}, "45-54": {}, "55+": {},
    };
    for (const r of data.edadBuckets) {
      if (!selectedUens.has(r.uen)) continue;
      const s = shortUen(r.uen);
      map["< 25"][s] = (map["< 25"][s] ?? 0) + r.menos_25;
      map["25-34"][s] = (map["25-34"][s] ?? 0) + r.de_25_34;
      map["35-44"][s] = (map["35-44"][s] ?? 0) + r.de_35_44;
      map["45-54"][s] = (map["45-54"][s] ?? 0) + r.de_45_54;
      map["55+"][s]   = (map["55+"][s] ?? 0)   + r.mas_55;
    }
    const uenList = Array.from(selectedUens);
    return buckets.map((b) => ({ rango: b, ...Object.fromEntries(uenList.map((u) => [shortUen(u), map[b][shortUen(u)] ?? 0])) }));
  }, [data.edadBuckets, selectedUens]);

  // Area breakdown (top 10 areas for selected UENs)
  const areaData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of data.areaByUen) {
      if (!selectedUens.has(r.uen)) continue;
      map[r.area] = (map[r.area] ?? 0) + r.hc;
    }
    return Object.entries(map)
      .map(([area, hc]) => ({ area: area.length > 28 ? area.slice(0, 26) + "…" : area, hc }))
      .sort((a, b) => b.hc - a.hc)
      .slice(0, 12);
  }, [data.areaByUen, selectedUens]);

  const uenList = data.uens;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1a3a5c]">Organización</h1>
        <p className="text-sm text-gray-400 mt-0.5">Análisis de headcount, estructura y demografía del Grupo</p>
      </div>

      {/* UEN filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-400 font-medium">Ver:</span>
        <button
          onClick={() => setSelectedUens(new Set(data.uens))}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
            selectedUens.size === data.uens.length
              ? "bg-[#1a3a5c] text-white border-[#1a3a5c]"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          Todas
        </button>
        {uenList.map((uen, i) => {
          const active = selectedUens.has(uen);
          const color = uenColor(uen, i);
          return (
            <button
              key={uen}
              onClick={() => toggleUen(uen)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                active ? "text-white" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
              style={active ? { backgroundColor: color, borderColor: color } : {}}
            >
              {shortUen(uen)}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-1">
        <Tab active={tab === "resumen"} onClick={() => setTab("resumen")}>Resumen</Tab>
        <Tab active={tab === "headcount"} onClick={() => setTab("headcount")}>Headcount</Tab>
        <Tab active={tab === "demografia"} onClick={() => setTab("demografia")}>Demografía</Tab>
        <Tab active={tab === "rotacion"} onClick={() => setTab("rotacion")}>Rotación</Tab>
      </div>

      {/* ── RESUMEN tab ── */}
      {tab === "resumen" && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Tile label="Headcount Total" value={totalHc.toLocaleString()} sub={`${selectedUens.size} UEN${selectedUens.size !== 1 ? "s" : ""}`} />
            <Tile label="Edad Promedio" value={`${edadProm} años`} />
            <Tile label="Antigüedad Prom." value={`${antiguedadProm} años`} />
            <Tile label="UENs Activas" value={selectedUens.size} sub={`de ${data.uens.length} totales`} />
            <div
              className="bg-white rounded-xl border shadow-sm px-5 py-4 flex flex-col gap-0.5 cursor-pointer hover:border-red-300 transition-colors"
              style={{ borderColor: data.rotacion.rotacionGrupoPct >= 20 ? "#fca5a5" : data.rotacion.rotacionGrupoPct >= 10 ? "#fde68a" : "#86efac" }}
              onClick={() => setTab("rotacion")}
              title="Ver análisis de rotación"
            >
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Rotación LTM</p>
              <p className="text-3xl font-bold tabular-nums" style={{ color: data.rotacion.rotacionGrupoPct >= 20 ? "#dc2626" : data.rotacion.rotacionGrupoPct >= 10 ? "#d97706" : "#059669" }}>
                {data.rotacion.rotacionGrupoPct}%
              </p>
              <p className="text-xs text-gray-400">{data.rotacion.totalBajas12m} bajas · últimos 12 m</p>
            </div>
          </div>

          {/* HC by UEN + donut */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Headcount por UEN</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={filteredHc.map((r, i) => ({ uen: shortUen(r.uen), hc: r.hc, color: uenColor(r.uen, i) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="uen" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="hc" name="HC" radius={[0, 4, 4, 0]}>
                    {filteredHc.map((r, i) => (
                      <Cell key={r.uen} fill={uenColor(r.uen, i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Distribución de HC</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {donutData.map((d, i) => (
                      <Cell key={d.name} fill={uenColor(d.fullName, i)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown, name: unknown) => [`${v} (${((Number(v) / totalHc) * 100).toFixed(1)}%)`, name as string]} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pirámide organizacional */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">Pirámide Organizacional</p>
            <p className="text-xs text-gray-400 mb-4">Distribución por nivel (N1 = más alto)</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={pyramidData} layout="vertical" margin={{ left: 140, right: 24 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="hc" name="Colaboradores" fill="#1a3a5c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── HEADCOUNT tab ── */}
      {tab === "headcount" && (
        <div className="space-y-6">
          {/* Growth chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">Ingresos por año</p>
            <p className="text-xs text-gray-400 mb-4">Nuevos colaboradores por año según fecha de antigüedad (desde 2015)</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={growthData.filter((d) => d.año >= "2015")} margin={{ left: 0, right: 8 }}>
                <XAxis dataKey="año" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                {Array.from(selectedUens).map((uen, i) => (
                  <Area
                    key={uen}
                    type="monotone"
                    dataKey={uen}
                    name={shortUen(uen)}
                    stroke={uenColor(uen, i)}
                    fill={uenColor(uen, i)}
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Area breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">Headcount por Área / Dirección</p>
            <p className="text-xs text-gray-400 mb-4">Top 12 áreas (UENs seleccionadas)</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={areaData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="area" width={180} tick={{ fontSize: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="hc" name="HC" fill="#1a3a5c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* HC details table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Resumen por UEN</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">UEN</th>
                  <th className="text-right pb-2 font-medium">HC</th>
                  <th className="text-right pb-2 font-medium">% del grupo</th>
                  <th className="text-right pb-2 font-medium">Edad prom.</th>
                  <th className="text-right pb-2 font-medium">Antigüedad</th>
                </tr>
              </thead>
              <tbody>
                {filteredHc.map((r, i) => (
                  <tr key={r.uen} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: uenColor(r.uen, i) }} />
                      <span className="text-gray-800">{shortUen(r.uen)}</span>
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-800 tabular-nums">{r.hc.toLocaleString()}</td>
                    <td className="py-2.5 text-right text-gray-500 tabular-nums">{((r.hc / totalHc) * 100).toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-gray-500 tabular-nums">{r.edad_prom} años</td>
                    <td className="py-2.5 text-right text-gray-500 tabular-nums">{r.antiguedad_prom} años</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="pt-2.5 text-gray-700">Total</td>
                  <td className="pt-2.5 text-right text-[#1a3a5c] tabular-nums">{totalHc.toLocaleString()}</td>
                  <td className="pt-2.5 text-right text-gray-500">100%</td>
                  <td className="pt-2.5 text-right text-gray-500 tabular-nums">{edadProm} años</td>
                  <td className="pt-2.5 text-right text-gray-500 tabular-nums">{antiguedadProm} años</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ROTACIÓN tab ── */}
      {tab === "rotacion" && (
        <RotacionTab data={data} selectedUens={selectedUens} />
      )}

      {/* ── DEMOGRAFÍA tab ── */}
      {tab === "demografia" && (
        <div className="space-y-6">
          {/* Age distribution */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-1">Distribución de Edad</p>
            <p className="text-xs text-gray-400 mb-4">Colaboradores activos por rango de edad y UEN</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ageData} margin={{ left: 0, right: 8 }}>
                <XAxis dataKey="rango" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                {Array.from(selectedUens).map((uen, i) => (
                  <Bar key={uen} dataKey={shortUen(uen)} name={shortUen(uen)} fill={uenColor(uen, i)} stackId="a" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tenure distribution */}
          {(() => {
            const msYear = 1000 * 60 * 60 * 24 * 365.25;
            const tenureMap: Record<string, number> = { "0-1 año": 0, "1-3 años": 0, "3-5 años": 0, "5-10 años": 0, "10-20 años": 0, "+20 años": 0 };
            for (const r of data.hcByUen) {
              if (!selectedUens.has(r.uen)) continue;
            }
            // Use raw crecimiento to bucket tenure
            const tenureBuckets = [
              { label: "0-1 año",   min: 0,  max: 1 },
              { label: "1-3 años",  min: 1,  max: 3 },
              { label: "3-5 años",  min: 3,  max: 5 },
              { label: "5-10 años", min: 5,  max: 10 },
              { label: "10-20 años",min: 10, max: 20 },
              { label: "+20 años",  min: 20, max: 999 },
            ];
            // We don't have individual rows here; approximate from crecimiento by year
            const now = new Date();
            const crecByUen: Record<string, Record<string, number>> = {};
            for (const r of data.crecimiento) {
              if (!selectedUens.has(r.uen)) continue;
              if (!crecByUen[r.uen]) crecByUen[r.uen] = {};
              crecByUen[r.uen][r.año] = r.ingresos;
            }
            const bucketTotals = tenureBuckets.map((b) => {
              let total = 0;
              for (const [, años] of Object.entries(crecByUen)) {
                for (const [año, cnt] of Object.entries(años)) {
                  const tenure = now.getFullYear() - Number(año);
                  if (tenure >= b.min && tenure < b.max) total += cnt;
                }
              }
              return { label: b.label, hc: total };
            });

            return (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Distribución de Antigüedad</p>
                <p className="text-xs text-gray-400 mb-4">Colaboradores por años en el grupo (estimado desde fecha de antigüedad)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={bucketTotals} margin={{ left: 0, right: 8 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="hc" name="Colaboradores" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Detailed comparison table by age */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Edad por UEN — detalle</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">UEN</th>
                  <th className="text-right pb-2 font-medium">&lt; 25</th>
                  <th className="text-right pb-2 font-medium">25-34</th>
                  <th className="text-right pb-2 font-medium">35-44</th>
                  <th className="text-right pb-2 font-medium">45-54</th>
                  <th className="text-right pb-2 font-medium">55+</th>
                  <th className="text-right pb-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.edadBuckets
                  .filter((r) => selectedUens.has(r.uen))
                  .map((r, i) => {
                    const tot = r.menos_25 + r.de_25_34 + r.de_35_44 + r.de_45_54 + r.mas_55;
                    const idx = data.uens.indexOf(r.uen);
                    return (
                      <tr key={r.uen} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: uenColor(r.uen, idx) }} />
                          {shortUen(r.uen)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.menos_25}</td>
                        <td className="py-2 text-right tabular-nums font-medium text-[#1a3a5c]">{r.de_25_34}</td>
                        <td className="py-2 text-right tabular-nums">{r.de_35_44}</td>
                        <td className="py-2 text-right tabular-nums">{r.de_45_54}</td>
                        <td className="py-2 text-right tabular-nums">{r.mas_55}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{tot}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
