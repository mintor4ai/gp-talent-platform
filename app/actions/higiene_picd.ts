"use server";

import { createClient } from "@/lib/supabase/server";

export type PicdDiscrepancia = {
  colaboradorId: string;
  colaboradorNombre: string;
  cicloAño: number;
  estado: string;
  campo: "opcion1" | "opcion2";
  textoEscrito: string;
  nombreEnCatalogo: string;
  puestoCatalogoId: string;
};

export async function obtenerDiscrepanciasPicd(): Promise<PicdDiscrepancia[]> {
  const supabase = await createClient();

  // Read-only: join picd → catalogo_puestos on both id fields and flag mismatches
  const { data, error } = await supabase.rpc("picd_discrepancias_texto_vs_id");

  if (error) {
    // Fallback: manual query if RPC not available
    return obtenerDiscrepanciasFallback();
  }

  return (data ?? []) as PicdDiscrepancia[];
}

async function obtenerDiscrepanciasFallback(): Promise<PicdDiscrepancia[]> {
  const supabase = await createClient();

  // Fetch all picd rows that have at least one catalog id linked
  const { data: picdRaw } = await supabase
    .from("picd")
    .select("id_empleado, ciclo_año, estado, puesto_futuro_opcion1, puesto_futuro_opcion2, puesto_futuro_id1, puesto_futuro_id2")
    .or("puesto_futuro_id1.not.is.null,puesto_futuro_id2.not.is.null")
    .order("ciclo_año", { ascending: false });

  if (!picdRaw?.length) return [];

  type PicdRaw = {
    id_empleado: string;
    ciclo_año: number;
    estado: string | null;
    puesto_futuro_opcion1: string | null;
    puesto_futuro_opcion2: string | null;
    puesto_futuro_id1: string | null;
    puesto_futuro_id2: string | null;
  };

  const rows = picdRaw as PicdRaw[];

  // Collect all catalog IDs referenced
  const allPuestoIds = [...new Set(
    rows.flatMap((r) => [r.puesto_futuro_id1, r.puesto_futuro_id2].filter(Boolean) as string[])
  )];

  const { data: catalogoRaw } = await supabase
    .from("catalogo_puestos")
    .select("id, nombre")
    .in("id", allPuestoIds);

  const catalogoMap = new Map<string, string>(
    ((catalogoRaw ?? []) as Array<{ id: string; nombre: string }>).map((p) => [p.id, p.nombre])
  );

  // Get collaborator names
  const empleadoIds = [...new Set(rows.map((r) => r.id_empleado))];
  const { data: colabsRaw } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo")
    .in("id", empleadoIds);

  const colabMap = new Map<string, string>(
    ((colabsRaw ?? []) as Array<{ id: string; nombre_completo: string }>).map((c) => [c.id, c.nombre_completo])
  );

  const discrepancias: PicdDiscrepancia[] = [];

  for (const row of rows) {
    const nombre = colabMap.get(row.id_empleado) ?? row.id_empleado;

    if (row.puesto_futuro_id1) {
      const nombreCatalogo = catalogoMap.get(row.puesto_futuro_id1);
      const textoEscrito = (row.puesto_futuro_opcion1 ?? "").trim();
      if (nombreCatalogo && textoEscrito &&
          nombreCatalogo.toUpperCase() !== textoEscrito.toUpperCase()) {
        discrepancias.push({
          colaboradorId: row.id_empleado,
          colaboradorNombre: nombre,
          cicloAño: row.ciclo_año,
          estado: row.estado ?? "",
          campo: "opcion1",
          textoEscrito,
          nombreEnCatalogo: nombreCatalogo,
          puestoCatalogoId: row.puesto_futuro_id1,
        });
      }
    }

    if (row.puesto_futuro_id2) {
      const nombreCatalogo = catalogoMap.get(row.puesto_futuro_id2);
      const textoEscrito = (row.puesto_futuro_opcion2 ?? "").trim();
      if (nombreCatalogo && textoEscrito &&
          nombreCatalogo.toUpperCase() !== textoEscrito.toUpperCase()) {
        discrepancias.push({
          colaboradorId: row.id_empleado,
          colaboradorNombre: nombre,
          cicloAño: row.ciclo_año,
          estado: row.estado ?? "",
          campo: "opcion2",
          textoEscrito,
          nombreEnCatalogo: nombreCatalogo,
          puestoCatalogoId: row.puesto_futuro_id2,
        });
      }
    }
  }

  // Sort: most recent cycle first, then by name
  return discrepancias.sort((a, b) =>
    b.cicloAño - a.cicloAño || a.colaboradorNombre.localeCompare(b.colaboradorNombre, "es")
  );
}
