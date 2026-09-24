"use server";

import { createClient } from "@/lib/supabase/server";
import { getDisabledOrgs } from "@/lib/disabled-uens";

export type OrgData = {
  uens: string[];
  hcByUen: { uen: string; hc: number; edad_prom: number; antiguedad_prom: number }[];
  nivelByUen: { uen: string; nivel_num: number; hc: number }[];
  edadBuckets: { uen: string; menos_25: number; de_25_34: number; de_35_44: number; de_45_54: number; mas_55: number }[];
  crecimiento: { año: string; uen: string; ingresos: number }[];
  areaByUen: { uen: string; area: string; hc: number }[];
  totalHc: number;
  edadProm: number;
  antiguedadProm: number;
};

export async function getOrgData(): Promise<OrgData> {
  const supabase = await createClient();
  const disabledOrgs = await getDisabledOrgs();
  const disabledFilter = disabledOrgs.length > 0
    ? `("${disabledOrgs.join('","')}")`
    : null;

  function applyDisabledFilter<T extends ReturnType<typeof supabase.from>>(q: T): T {
    if (!disabledFilter) return q;
    return (q as any).not("organización", "in", disabledFilter) as T;
  }

  const [hcRes, nivelRes, edadRes, crecRes, areaRes] = await Promise.all([
    supabase.rpc("org_hc_by_uen"),
    supabase.rpc("org_nivel_by_uen"),
    supabase.rpc("org_edad_buckets"),
    supabase.rpc("org_crecimiento"),
    supabase.rpc("org_area_by_uen"),
  ]);

  // Fallback: raw queries if RPCs don't exist yet
  const [rawHc, rawNivel, rawEdad, rawCrec, rawArea] = await Promise.all([
    applyDisabledFilter(supabase
      .from("colaboradores")
      .select("organización, edad, fecha_antiguedad")
      .eq("activo", true)
      .not("organización", "is", null)),
    applyDisabledFilter(supabase
      .from("colaboradores")
      .select("organización, nivel_num")
      .eq("activo", true)
      .not("organización", "is", null)),
    applyDisabledFilter(supabase
      .from("colaboradores")
      .select("organización, edad")
      .eq("activo", true)
      .not("organización", "is", null)),
    applyDisabledFilter(supabase
      .from("colaboradores")
      .select("organización, fecha_antiguedad")
      .eq("activo", true)
      .not("organización", "is", null)
      .not("fecha_antiguedad", "is", null)
      .gte("fecha_antiguedad", "2000-01-01")),
    applyDisabledFilter(supabase
      .from("colaboradores")
      .select("organización, area")
      .eq("activo", true)
      .not("organización", "is", null)),
  ]);

  const rows = (rawHc.data ?? []) as { organización: string; edad: number | null; fecha_antiguedad: string | null }[];
  const nivelRows = (rawNivel.data ?? []) as { organización: string; nivel_num: number | null }[];
  const edadRows = (rawEdad.data ?? []) as { organización: string; edad: number | null }[];
  const crecRows = (rawCrec.data ?? []) as { organización: string; fecha_antiguedad: string }[];
  const areaRows = (rawArea.data ?? []) as { organización: string; area: string | null }[];

  // HC by UEN
  const hcMap: Record<string, { hc: number; sumEdad: number; cntEdad: number; sumAntig: number; cntAntig: number }> = {};
  for (const r of rows) {
    const u = r.organización;
    if (!hcMap[u]) hcMap[u] = { hc: 0, sumEdad: 0, cntEdad: 0, sumAntig: 0, cntAntig: 0 };
    hcMap[u].hc++;
    if (r.edad != null) { hcMap[u].sumEdad += r.edad; hcMap[u].cntEdad++; }
    if (r.fecha_antiguedad) {
      const years = (Date.now() - new Date(r.fecha_antiguedad).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      hcMap[u].sumAntig += years; hcMap[u].cntAntig++;
    }
  }
  const hcByUen = Object.entries(hcMap).map(([uen, v]) => ({
    uen,
    hc: v.hc,
    edad_prom: v.cntEdad ? Math.round(v.sumEdad / v.cntEdad) : 0,
    antiguedad_prom: v.cntAntig ? Math.round(v.sumAntig / v.cntAntig) : 0,
  })).sort((a, b) => b.hc - a.hc);

  // Nivel by UEN
  const nivelMap: Record<string, Record<number, number>> = {};
  for (const r of nivelRows) {
    const u = r.organización; const n = r.nivel_num ?? 99;
    if (!nivelMap[u]) nivelMap[u] = {};
    nivelMap[u][n] = (nivelMap[u][n] ?? 0) + 1;
  }
  const nivelByUen: OrgData["nivelByUen"] = [];
  for (const [uen, lvls] of Object.entries(nivelMap)) {
    for (const [n, hc] of Object.entries(lvls)) {
      nivelByUen.push({ uen, nivel_num: Number(n), hc });
    }
  }

  // Edad buckets
  const edadBucketMap: Record<string, { menos_25: number; de_25_34: number; de_35_44: number; de_45_54: number; mas_55: number }> = {};
  for (const r of edadRows) {
    const u = r.organización;
    if (!edadBucketMap[u]) edadBucketMap[u] = { menos_25: 0, de_25_34: 0, de_35_44: 0, de_45_54: 0, mas_55: 0 };
    const e = r.edad ?? 0;
    if (e < 25) edadBucketMap[u].menos_25++;
    else if (e <= 34) edadBucketMap[u].de_25_34++;
    else if (e <= 44) edadBucketMap[u].de_35_44++;
    else if (e <= 54) edadBucketMap[u].de_45_54++;
    else edadBucketMap[u].mas_55++;
  }
  const edadBuckets = Object.entries(edadBucketMap).map(([uen, v]) => ({ uen, ...v }));

  // Crecimiento por año
  const crecMap: Record<string, Record<string, number>> = {};
  for (const r of crecRows) {
    const u = r.organización;
    const año = r.fecha_antiguedad.slice(0, 4);
    if (!crecMap[u]) crecMap[u] = {};
    crecMap[u][año] = (crecMap[u][año] ?? 0) + 1;
  }
  const crecimiento: OrgData["crecimiento"] = [];
  for (const [uen, años] of Object.entries(crecMap)) {
    for (const [año, ingresos] of Object.entries(años)) {
      crecimiento.push({ año, uen, ingresos });
    }
  }

  // Area by UEN
  const areaMap: Record<string, Record<string, number>> = {};
  for (const r of areaRows) {
    const u = r.organización; const a = r.area ?? "Sin área";
    if (!areaMap[u]) areaMap[u] = {};
    areaMap[u][a] = (areaMap[u][a] ?? 0) + 1;
  }
  const areaByUen: OrgData["areaByUen"] = [];
  for (const [uen, areas] of Object.entries(areaMap)) {
    for (const [area, hc] of Object.entries(areas)) {
      areaByUen.push({ uen, area, hc });
    }
  }

  const totalHc = hcByUen.reduce((s, r) => s + r.hc, 0);
  const edadProm = hcByUen.length
    ? Math.round(hcByUen.reduce((s, r) => s + r.edad_prom * r.hc, 0) / totalHc)
    : 0;
  const antiguedadProm = hcByUen.length
    ? Math.round(hcByUen.reduce((s, r) => s + r.antiguedad_prom * r.hc, 0) / totalHc)
    : 0;

  return {
    uens: hcByUen.map((r) => r.uen),
    hcByUen,
    nivelByUen,
    edadBuckets,
    crecimiento,
    areaByUen,
    totalHc,
    edadProm,
    antiguedadProm,
  };
}
