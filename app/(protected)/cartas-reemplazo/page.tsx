import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import { getDisabledOrgs } from "@/lib/disabled-uens";
import CartasClient from "./CartasClient";
import type { CartaNode, CartaEip, CartaTalentoClave, CartaSucesor, CartaPicd, CartaCatalogoPuesto } from "./types";

export default async function CartasReemplazoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();
  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  const isJefe = rol === "jefe";
  if (!isAdmin && !isJefe) redirect("/dashboard");

  const disabledOrgs = await getDisabledOrgs();

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

  const [colabsRaw, sucesoresRaw, eipRaw, talentoClaveRaw, picdRaw, catalogoRaw] = await Promise.all([
    fetchAllRows((from, to) => {
      let q = supabase
        .from("colaboradores")
        .select("id, id_empleado, nombre_completo, puesto, nivel, organización, area, jefe_inmediato_id, puesto_catalogo_id, fecha_baja")
        .eq("activo", true)
        .order("nombre_completo")
        .range(from, to);
      if (disabledOrgs.length > 0) {
        q = q.not("organización", "in", `("${disabledOrgs.join('","')}")`);
      }
      return q;
    }),
    fetchAllRows((from, to) =>
      supabase
        .from("plan_sucesion")
        .select("id_empleado, sucesor_nombre, sucesor_id, readiness, tiempo_estimado, estado, ciclo_año")
        .neq("estado", "descartado")
        .order("ciclo_año", { ascending: false })
        .range(from, to)
    ),
    supabase
      .from("evaluacion_integral_personal")
      .select("id_empleado, ciclo_año, zona_evaluacion, evaluacion_potencial_total, desempeno_logra, años_en_puesto")
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("talento_clave")
      .select("colaborador_id, es_talento_clave, fuente, ciclo_año")
      .eq("es_talento_clave", true)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("picd")
      .select("id_empleado, ciclo_año, puesto_futuro_opcion1, puesto_futuro_opcion2, puesto_futuro_id1, puesto_futuro_id2")
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("catalogo_puestos")
      .select("id, nombre, es_critico, organización")
      .eq("activo", true),
  ]);

  const colabs = (colabsRaw ?? []) as unknown as CartaNode[];

  // Latest EIP per id_empleado (already ordered desc by ciclo_año)
  const eipByEmpleado = new Map<string, CartaEip>();
  for (const row of ((eipRaw.data ?? []) as unknown as CartaEip[])) {
    if (!eipByEmpleado.has(row.id_empleado)) eipByEmpleado.set(row.id_empleado, row);
  }
  const eipLatest = Array.from(eipByEmpleado.values());

  // Latest talento_clave per colaborador_id
  const tcByColab = new Map<string, CartaTalentoClave>();
  for (const row of ((talentoClaveRaw.data ?? []) as unknown as CartaTalentoClave[])) {
    if (!tcByColab.has(row.colaborador_id)) tcByColab.set(row.colaborador_id, row);
  }
  const talentoClaveLatest = Array.from(tcByColab.values());

  // Latest picd per id_empleado
  const picdByEmpleado = new Map<string, CartaPicd>();
  for (const row of ((picdRaw.data ?? []) as unknown as CartaPicd[])) {
    if (!picdByEmpleado.has(row.id_empleado)) picdByEmpleado.set(row.id_empleado, row);
  }
  const picdLatest = Array.from(picdByEmpleado.values());

  // plan_sucesion: rename id_empleado → id_empleado_titular
  type RawSucesor = { id_empleado: string; sucesor_nombre: string; sucesor_id: string | null; readiness: string | null; tiempo_estimado: string | null; estado: string; ciclo_año: number };
  const sucesores: CartaSucesor[] = ((sucesoresRaw ?? []) as unknown as RawSucesor[]).map((s) => ({
    id_empleado_titular: s.id_empleado,
    sucesor_nombre: s.sucesor_nombre,
    sucesor_id: s.sucesor_id,
    readiness: s.readiness,
    tiempo_estimado: s.tiempo_estimado,
    estado: s.estado,
    ciclo_año: s.ciclo_año,
  }));

  const catalogo = ((catalogoRaw.data ?? []) as unknown as CartaCatalogoPuesto[]);

  // ya asignado: UUIDs that appear as sucesor_id
  const yaAsignadoIds = sucesores.filter((s) => s.sucesor_id).map((s) => s.sucesor_id!);

  // For jefe: their colaborador UUID
  let jefeColabId: string | null = null;
  if (isJefe && perfil.id_empleado) {
    // usuarios_app.id_empleado is a UUID FK to colaboradores.id
    jefeColabId = perfil.id_empleado as string;
  }

  return (
    <CartasClient
      colabs={colabs}
      eipLatest={eipLatest}
      talentoClaveLatest={talentoClaveLatest}
      sucesores={sucesores}
      picdLatest={picdLatest}
      catalogo={catalogo}
      yaAsignadoIds={yaAsignadoIds}
      rol={rol}
      jefeColabId={jefeColabId}
    />
  );
}
