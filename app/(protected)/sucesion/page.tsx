import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import type { SucesionItem } from "../carpeta/[id]/SucesionEditor";
import type { PuestoCoberturaItem, TitularItem, SucesorItem } from "./CoberturaView";
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

  const [
    { data: planesRaw },
    { data: colabsRaw },
    { data: catalogoRaw },
  ] = await Promise.all([
    supabase
      .from("plan_sucesion")
      .select("*")
      .order("ciclo_año", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("colaboradores")
      .select("id, nombre_completo, puesto, nivel, area, organización, puesto_catalogo_id")
      .eq("activo", true)
      .order("nombre_completo"),
    supabase
      .from("catalogo_puestos")
      .select("*")
      .eq("activo", true)
      .order("es_critico", { ascending: false })
      .order("nombre", { ascending: true }),
  ]);

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

  // Group succession plans by catalog position
  // A plan links to a catalog position via plan.puesto_catalogo_id OR titular's puesto_catalogo_id
  const sucesoresByCatalog = new Map<string, SucesorItem[]>();
  for (const plan of planes) {
    const p = plan as unknown as { id_empleado: string; sucesor_nombre: string; readiness: string | null; tiempo_estimado: string | null; estado: string; puesto_catalogo_id: string | null };
    const catalogId = p.puesto_catalogo_id ?? colabToCatalog.get(p.id_empleado) ?? null;
    if (!catalogId) continue;
    if (!sucesoresByCatalog.has(catalogId)) sucesoresByCatalog.set(catalogId, []);
    sucesoresByCatalog.get(catalogId)!.push({
      sucesor_nombre:  p.sucesor_nombre,
      readiness:       p.readiness,
      tiempo_estimado: p.tiempo_estimado,
      estado:          p.estado,
    });
  }

  const puestos: PuestoCoberturaItem[] = (catalogoRaw ?? []).map((c) => ({
    id:                    c.id,
    clave:                 c.clave,
    nombre:                c.nombre,
    organización:          (c as unknown as Record<string, unknown>)["organización"] as string | null,
    segmento_organizacional: c.segmento_organizacional ?? null,
    tipo_vacante:          c.tipo_vacante ?? null,
    es_critico:            c.es_critico,
    titulares:             titularesByCatalog.get(c.id) ?? [],
    sucesores:             sucesoresByCatalog.get(c.id) ?? [],
  }));

  const uens = Array.from(new Set(puestos.map((p) => p.organización).filter(Boolean))).sort() as string[];

  return (
    <SucesionTabs
      planes={planes}
      colabs={colabs}
      ciclos={ciclos}
      puestos={puestos}
      uens={uens}
    />
  );
}
