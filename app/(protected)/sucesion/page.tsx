import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import type { SucesionItem } from "../carpeta/[id]/SucesionEditor";
import type { PuestoCoberturaItem, TitularItem, SucesorItem, AspiranteItem } from "./CoberturaView";
import type { MatchRow } from "./MatchingView";
import SucesionTabs from "./SucesionTabs";

export default async function SucesionPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  // PostgREST default limit is 1000 rows — paginate any table that can exceed it
  async function fetchAllRows<T>(
    queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
  ): Promise<T[]> {
    const PAGE = 1000;
    const results: T[] = [];
    for (let start = 0; ; start += PAGE) {
      const { data } = await queryFn(start, start + PAGE - 1);
      if (!data?.length) break;
      results.push(...data);
      if (data.length < PAGE) break;
    }
    return results;
  }

  const [planesRaw, colabsRaw, catalogoResult, matchesRaw] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("plan_sucesion").select("*")
        .order("ciclo_año", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from("colaboradores")
        .select("id, nombre_completo, puesto, nivel, area, organización, puesto_catalogo_id")
        .eq("activo", true)
        .order("nombre_completo")
        .range(from, to)
    ),
    supabase.from("catalogo_puestos").select("*")
      .eq("activo", true)
      .order("es_critico", { ascending: false })
      .order("nombre", { ascending: true }),
    fetchAllRows((from, to) =>
      supabase.from("sucesion_matches").select("*")
        .order("ciclo_año", { ascending: false })
        .order("tipo_match")
        .range(from, to)
    ),
  ]);
  const catalogoRaw = catalogoResult.data;

  const planes = (planesRaw ?? []) as unknown as SucesionItem[];
  type ColabRow = { id: string; nombre_completo: string | null; puesto: string | null; nivel: string | null; area: string | null; organización: string | null; puesto_catalogo_id: string | null };
  const colabs = (colabsRaw ?? []) as unknown as ColabRow[];

  const ciclos = Array.from(new Set(planes.map((p) => p.ciclo_año))).sort((a, b) => b - a);

  // Build cobertura data
  // Build catalog name lookup maps for fallback matching (when puesto_catalogo_id is null)
  type CatalogEntry = { id: string; nombre: string; organización: string | null };
  const catalogoByNombreOrg = new Map<string, string>(); // "NOMBRE|ORG" → id
  const catalogoByNombre    = new Map<string, string[]>(); // "NOMBRE" → [ids]
  for (const raw of catalogoRaw ?? []) {
    const c = raw as unknown as CatalogEntry & Record<string, unknown>;
    const org = String(c["organización"] ?? "").trim().toUpperCase();
    const nom = (c.nombre ?? "").trim().toUpperCase();
    catalogoByNombreOrg.set(`${nom}|${org}`, c.id);
    if (!catalogoByNombre.has(nom)) catalogoByNombre.set(nom, []);
    catalogoByNombre.get(nom)!.push(c.id);
  }

  // Map colaborador.id → puesto_catalogo_id (FK first, then name-based fallback)
  const colabToCatalog = new Map<string, string>();
  for (const c of colabs) {
    if (c.puesto_catalogo_id) {
      colabToCatalog.set(c.id, c.puesto_catalogo_id);
      continue;
    }
    if (!c.puesto) continue;
    const nom = c.puesto.trim().toUpperCase();
    const org = (c.organización ?? "").trim().toUpperCase();
    const byNomOrg = catalogoByNombreOrg.get(`${nom}|${org}`);
    if (byNomOrg) { colabToCatalog.set(c.id, byNomOrg); continue; }
    const byNom = catalogoByNombre.get(nom);
    if (byNom?.length === 1) colabToCatalog.set(c.id, byNom[0]);
  }

  // Colaborador id → nombre (needed in buildPuestos for aspirantes)
  const colabById = new Map(colabs.map((c) => [c.id, c.nombre_completo ?? ""]));

  // Raw matches array (typed)
  const rawMatches = (matchesRaw ?? []) as unknown as MatchRow[];

  // Group titulares by puesto_catalogo_id
  const titularesByCatalog = new Map<string, TitularItem[]>();
  for (const c of colabs) {
    if (!c.puesto_catalogo_id) continue;
    if (!titularesByCatalog.has(c.puesto_catalogo_id)) titularesByCatalog.set(c.puesto_catalogo_id, []);
    titularesByCatalog.get(c.puesto_catalogo_id)!.push({
      id: c.id,
      nombre_completo: c.nombre_completo ?? "",
    });
  }

  // Helper: build puestos for a subset of planes + matches
  function buildPuestos(planesSubset: typeof planes, matchesSubset: typeof rawMatches): PuestoCoberturaItem[] {
    const sucesoresByCatalog = new Map<string, SucesorItem[]>();
    for (const plan of planesSubset) {
      const p = plan as unknown as { id_empleado: string; sucesor_id?: string | null; sucesor_nombre: string; readiness: string | null; tiempo_estimado: string | null; estado: string; puesto_catalogo_id: string | null };
      const catalogId = p.puesto_catalogo_id ?? colabToCatalog.get(p.id_empleado) ?? null;
      if (!catalogId) continue;
      if (!sucesoresByCatalog.has(catalogId)) sucesoresByCatalog.set(catalogId, []);
      sucesoresByCatalog.get(catalogId)!.push({
        sucesor_nombre:  p.sucesor_nombre,
        sucesor_id:      p.sucesor_id ?? null,
        readiness:       p.readiness,
        tiempo_estimado: p.tiempo_estimado,
        estado:          p.estado,
      });
    }

    // Build aspirantes from matches (aspiracion + bidireccional), exclude discarded
    const aspirantesByCatalog = new Map<string, AspiranteItem[]>();
    for (const m of matchesSubset) {
      if (m.tipo_match !== "aspiracion" && m.tipo_match !== "bidireccional") continue;
      if (m.descartado) continue;
      if (!m.puesto_catalogo_id || !m.colaborador_id) continue;
      if (!aspirantesByCatalog.has(m.puesto_catalogo_id)) aspirantesByCatalog.set(m.puesto_catalogo_id, []);
      aspirantesByCatalog.get(m.puesto_catalogo_id)!.push({
        colaborador_id:    m.colaborador_id,
        colaborador_nombre: colabById.get(m.colaborador_id) ?? null,
        tipo_match:        m.tipo_match as "aspiracion" | "bidireccional",
      });
    }

    return (catalogoRaw ?? []).map((c) => ({
      id:                      c.id,
      clave:                   c.clave,
      nombre:                  c.nombre,
      organización:            (c as unknown as Record<string, unknown>)["organización"] as string | null,
      segmento_organizacional: c.segmento_organizacional ?? null,
      tipo_vacante:            c.tipo_vacante ?? null,
      es_critico:              c.es_critico,
      titulares:               titularesByCatalog.get(c.id) ?? [],
      sucesores:               sucesoresByCatalog.get(c.id) ?? [],
      aspirantes:              aspirantesByCatalog.get(c.id) ?? [],
    }));
  }

  // Build cobertura per ciclo + combined
  const coberturaAllCiclos = buildPuestos(planes, rawMatches);
  const puestosByCiclo: Record<number, PuestoCoberturaItem[]> = {};
  for (const ciclo of ciclos) {
    puestosByCiclo[ciclo] = buildPuestos(
      planes.filter((p) => p.ciclo_año === ciclo),
      rawMatches.filter((m) => m.ciclo_año === ciclo),
    );
  }

  const uens = Array.from(new Set(coberturaAllCiclos.map((p) => p.organización).filter(Boolean))).sort() as string[];

  // Enrich matches with names from in-memory lookups
  type CatalogRow = { id: string; nombre: string; organización?: string | null };
  const catalogById = new Map(
    (catalogoRaw ?? []).map((c) => {
      const row = c as unknown as CatalogRow & Record<string, unknown>;
      return [row.id, { nombre: row.nombre, org: String(row["organización"] ?? "") }];
    })
  );

  // Resolve admin UUIDs (validado_por / descartado_por) → nombre via usuarios_app → colaboradores
  const adminUuids = Array.from(new Set([
    ...rawMatches.map((m) => m.validado_por).filter(Boolean),
    ...rawMatches.map((m) => m.descartado_por).filter(Boolean),
  ])) as string[];

  const adminNames = new Map<string, string>();
  if (adminUuids.length > 0) {
    const { data: adminRows } = await supabase
      .from("usuarios_app")
      .select("id, id_empleado")
      .in("id", adminUuids);
    for (const a of adminRows ?? []) {
      const nombre = colabById.get((a as any).id_empleado) ?? "Capital Humano";
      adminNames.set((a as any).id, nombre);
    }
  }

  const matches: MatchRow[] = rawMatches.map((m) => {
    const puesto = catalogById.get(m.puesto_catalogo_id);
    const titularIds: string[] = (m.titular_ids as unknown as string[] | null) ?? [];
    return {
      ...m,
      colaborador_nombre: m.colaborador_id ? (colabById.get(m.colaborador_id) ?? null) : null,
      titular_nombres: titularIds.map((id) => colabById.get(id) ?? id).filter(Boolean),
      puesto_nombre: puesto?.nombre ?? null,
      puesto_org: puesto?.org || null,
      validado_por_nombre: m.validado_por ? (adminNames.get(m.validado_por) ?? null) : null,
      descartado_por_nombre: m.descartado_por ? (adminNames.get(m.descartado_por) ?? null) : null,
    };
  });

  const matchCiclos = Array.from(new Set(matches.map((m) => m.ciclo_año))).sort((a, b) => b - a);
  const allCiclos = Array.from(new Set([...ciclos, ...matchCiclos])).sort((a, b) => b - a);

  return (
    <SucesionTabs
      planes={planes}
      colabs={colabs}
      ciclos={ciclos}
      puestosByCiclo={puestosByCiclo}
      coberturaAllCiclos={coberturaAllCiclos}
      uens={uens}
      matches={matches}
      matchCiclos={allCiclos}
    />
  );
}
