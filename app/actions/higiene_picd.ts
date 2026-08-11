"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PicdDiscrepancia = {
  picdId: string;
  colaboradorId: string;
  colaboradorNombre: string;
  cicloAño: number;
  estado: string;
  campo: "opcion1" | "opcion2";
  textoEscrito: string;
  nombreEnCatalogo: string;
  puestoCatalogoId: string;
};

export type PicdSinVinculo = {
  picdId: string;
  colaboradorId: string;
  colaboradorNombre: string;
  cicloAño: number;
  estado: string;
  campo: "opcion1" | "opcion2";
  textoEscrito: string;
};

export type OrgOption = {
  org: string;
  areas: string[];
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();
  const rol = (perfil as { rol: string } | null)?.rol;
  if (rol !== "superadmin" && rol !== "capital_humano") redirect("/dashboard");
  return supabase;
}

// ─── Discrepancias: texto vs catálogo ─────────────────────────────────────────

export async function obtenerDiscrepanciasPicd(): Promise<PicdDiscrepancia[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("picd_discrepancias_texto_vs_id");
  if (error) return obtenerDiscrepanciasFallback();
  return (data ?? []) as PicdDiscrepancia[];
}

async function obtenerDiscrepanciasFallback(): Promise<PicdDiscrepancia[]> {
  const supabase = await createClient();

  const { data: picdRaw } = await supabase
    .from("picd")
    .select("id, id_empleado, ciclo_año, estado, puesto_futuro_opcion1, puesto_futuro_opcion2, puesto_futuro_id1, puesto_futuro_id2")
    .or("puesto_futuro_id1.not.is.null,puesto_futuro_id2.not.is.null")
    .order("ciclo_año", { ascending: false });

  if (!picdRaw?.length) return [];

  type PicdRaw = {
    id: string; id_empleado: string; ciclo_año: number; estado: string | null;
    puesto_futuro_opcion1: string | null; puesto_futuro_opcion2: string | null;
    puesto_futuro_id1: string | null; puesto_futuro_id2: string | null;
  };
  const rows = picdRaw as PicdRaw[];

  const allPuestoIds = [...new Set(
    rows.flatMap((r) => [r.puesto_futuro_id1, r.puesto_futuro_id2].filter(Boolean) as string[])
  )];
  const { data: catalogoRaw } = await supabase.from("catalogo_puestos").select("id, nombre").in("id", allPuestoIds);
  const catalogoMap = new Map<string, string>(
    ((catalogoRaw ?? []) as Array<{ id: string; nombre: string }>).map((p) => [p.id, p.nombre])
  );

  const empleadoIds = [...new Set(rows.map((r) => r.id_empleado))];
  const { data: colabsRaw } = await supabase.from("colaboradores").select("id, nombre_completo").in("id", empleadoIds);
  const colabMap = new Map<string, string>(
    ((colabsRaw ?? []) as Array<{ id: string; nombre_completo: string }>).map((c) => [c.id, c.nombre_completo])
  );

  const discrepancias: PicdDiscrepancia[] = [];
  for (const row of rows) {
    const nombre = colabMap.get(row.id_empleado) ?? row.id_empleado;
    for (const campo of ["opcion1", "opcion2"] as const) {
      const idKey = campo === "opcion1" ? "puesto_futuro_id1" : "puesto_futuro_id2";
      const textoKey = campo === "opcion1" ? "puesto_futuro_opcion1" : "puesto_futuro_opcion2";
      const id = row[idKey];
      const textoEscrito = (row[textoKey] ?? "").trim();
      const nombreCatalogo = id ? catalogoMap.get(id) : null;
      if (nombreCatalogo && textoEscrito && nombreCatalogo.toUpperCase() !== textoEscrito.toUpperCase()) {
        discrepancias.push({
          picdId: row.id,
          colaboradorId: row.id_empleado, colaboradorNombre: nombre,
          cicloAño: row.ciclo_año, estado: row.estado ?? "",
          campo, textoEscrito, nombreEnCatalogo: nombreCatalogo, puestoCatalogoId: id!,
        });
      }
    }
  }
  return discrepancias.sort((a, b) =>
    b.cicloAño - a.cicloAño || a.colaboradorNombre.localeCompare(b.colaboradorNombre, "es")
  );
}

// ─── Sin vínculo: texto escrito sin ID de catálogo ────────────────────────────

export async function obtenerSinVinculoPicd(): Promise<PicdSinVinculo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("picd_sin_vinculo");
  if (error) {
    console.error("picd_sin_vinculo RPC error:", error.message);
    return [];
  }
  return (data ?? []) as PicdSinVinculo[];
}

// ─── Org options for the modal ─────────────────────────────────────────────────

export async function obtenerOrgOptions(): Promise<OrgOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogo_puestos")
    .select("organización, area")
    .eq("activo", true)
    .not("area", "is", null)
    .order("organización")
    .order("area");

  const map = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<{ "organización": string; area: string | null }>) {
    const org = row["organización"];
    const area = row.area;
    if (!org || !area) continue;
    if (!map.has(org)) map.set(org, new Set());
    map.get(org)!.add(area);
  }

  return [...map.entries()].map(([org, areas]) => ({
    org,
    areas: [...areas].sort(),
  }));
}

// ─── Crear puesto propuesto ────────────────────────────────────────────────────

export async function crearPuestoPropuesto(params: {
  picdId: string;
  campo: "opcion1" | "opcion2";
  nombre: string;
  org: string;
  area: string;
}): Promise<{ ok: boolean; error?: string; puestoId?: string }> {
  const supabase = await requireAdmin();

  if (!params.nombre.trim() || !params.org.trim()) {
    return { ok: false, error: "Nombre y UEN son obligatorios." };
  }

  // 1. Create the proposed puesto
  const { data: nuevoPuesto, error: insertError } = await supabase
    .from("catalogo_puestos")
    .insert({
      nombre: params.nombre.trim().toUpperCase(),
      "organización": params.org,
      area: params.area.trim() || null,
      activo: false,
      propuesto: true,
      es_critico: false,
    })
    .select("id")
    .single();

  if (insertError || !nuevoPuesto) {
    console.error("crearPuestoPropuesto insert error:", insertError?.message);
    return { ok: false, error: insertError?.message ?? "Error al crear el puesto." };
  }

  const puestoId = (nuevoPuesto as { id: string }).id;

  // 2. Link the picd record to the new puesto
  const idField = params.campo === "opcion1" ? "puesto_futuro_id1" : "puesto_futuro_id2";
  const { error: updateError } = await supabase
    .from("picd")
    .update({ [idField]: puestoId })
    .eq("id", params.picdId);

  if (updateError) {
    console.error("crearPuestoPropuesto update error:", updateError.message);
    // Puesto was created but link failed — return partial success so UI can handle
    return { ok: false, error: `Puesto creado (${puestoId}) pero no se pudo vincular: ${updateError.message}` };
  }

  return { ok: true, puestoId };
}
