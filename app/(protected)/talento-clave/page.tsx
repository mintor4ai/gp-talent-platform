import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import TalentoClavePage from "./TalentoClavePage";

export const dynamic = "force-dynamic";

type UmbralRow = {
  organización: string | null;
  segmento_organizacional: string | null;
  meses_amarillo: number;
  meses_rojo: number;
};

function resolveUmbral(
  umbrales: UmbralRow[],
  org: string | null,
  segmento: string | null
): { meses_amarillo: number; meses_rojo: number } {
  const exact = umbrales.find((u) => u.organización === org && u.segmento_organizacional === segmento);
  if (exact) return exact;
  const byOrg = umbrales.find((u) => u.organización === org && u.segmento_organizacional === null);
  if (byOrg) return byOrg;
  const bySeg = umbrales.find((u) => u.organización === null && u.segmento_organizacional === segmento);
  if (bySeg) return bySeg;
  const global = umbrales.find((u) => u.organización === null && u.segmento_organizacional === null);
  return global ?? { meses_amarillo: 24, meses_rojo: 48 };
}

function computeSemaforo(
  fechaIngreso: string | null,
  umbral: { meses_amarillo: number; meses_rojo: number }
): { semaforo: "verde" | "amarillo" | "rojo" | "sin_datos"; meses: number | null } {
  if (!fechaIngreso) return { semaforo: "sin_datos", meses: null };
  const meses = Math.floor((Date.now() - new Date(fechaIngreso).getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
  if (meses < umbral.meses_amarillo) return { semaforo: "verde", meses };
  if (meses < umbral.meses_rojo)    return { semaforo: "amarillo", meses };
  return { semaforo: "rojo", meses };
}

export default async function TalentoClaveRoute() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");
  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  // Current cycle = most recent EIP cycle
  const { data: ciclosData } = await supabase
    .from("evaluacion_integral_personal")
    .select("ciclo_año")
    .order("ciclo_año", { ascending: false })
    .limit(1)
    .single();

  const cicloAño = (ciclosData as any)?.ciclo_año ?? new Date().getFullYear();

  // EIP candidates (Desarrollo + Sobresaliente)
  const { data: eips } = await supabase
    .from("evaluacion_integral_personal")
    .select("id_empleado, zona_evaluacion")
    .eq("ciclo_año", cicloAño)
    .in("zona_evaluacion", ["Desarrollo", "Sobresaliente"]);

  const eipArr = (eips ?? []) as { id_empleado: string; zona_evaluacion: string }[];
  const eipMap = new Map(eipArr.map((e) => [e.id_empleado, e.zona_evaluacion]));

  // All collaborators for manual-promotion search
  const { data: allColabsData } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, organización")
    .order("nombre_completo");

  type AllColab = { id: string; nombre_completo: string; puesto: string | null; organización: string | null };
  const allColabsArr = (allColabsData ?? []) as unknown as AllColab[];

  // Current TC records for this cycle
  const { data: tcRecords } = await supabase
    .from("talento_clave")
    .select("id, colaborador_id, es_talento_clave, fuente, zona_eip, updated_at")
    .eq("ciclo_año", cicloAño);

  type TcRec = {
    id: string;
    colaborador_id: string;
    es_talento_clave: boolean;
    fuente: string;
    zona_eip: string | null;
    updated_at: string;
  };

  const tcArr = (tcRecords ?? []) as TcRec[];
  const tcMap = new Map(tcArr.map((r) => [r.colaborador_id, r]));

  // All relevant collaborator IDs
  const colabIdSet = new Set([...Array.from(eipMap.keys()), ...tcArr.map((r) => r.colaborador_id)]);
  const allColabIds = Array.from(colabIdSet);

  const EMPTY_ID = "00000000-0000-0000-0000-000000000000";
  const idList   = allColabIds.length > 0 ? allColabIds : [EMPTY_ID];

  // Fetch collaborator details + fecha_ingreso_posicion for movilidad semáforo
  const { data: colaboradores } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, organización, segmento_organizacional, area, fecha_ingreso_posicion")
    .in("id", idList);

  type ColabRow = {
    id: string;
    nombre_completo: string;
    puesto: string | null;
    organización: string | null;
    segmento_organizacional: string | null;
    area: string | null;
    fecha_ingreso_posicion: string | null;
  };

  const colabArr = (colaboradores ?? []) as unknown as ColabRow[];

  // Movilidad umbrales (active, for current cycle; falls back to any cycle if none found)
  const { data: umbralesData } = await supabase
    .from("movilidad_umbrales")
    .select("organización, segmento_organizacional, meses_amarillo, meses_rojo")
    .eq("ciclo_año", cicloAño)
    .eq("activo", true);

  const umbralesArr = (umbralesData ?? []) as UmbralRow[];

  // PICD status for TC collaborators in this cycle
  const { data: picdData } = await supabase
    .from("picd_ciclos_estado")
    .select("id_empleado, estado")
    .eq("ciclo_año", cicloAño)
    .in("id_empleado", idList);

  const picdMap = new Map(
    ((picdData ?? []) as { id_empleado: string; estado: string }[]).map((p) => [p.id_empleado, p.estado])
  );

  // Annotate all collaborators with TC + EIP status for the search modal
  const allColaboradores = allColabsArr.map((c) => {
    const tc = tcMap.get(c.id);
    return {
      id: c.id,
      nombre_completo: c.nombre_completo,
      puesto: c.puesto,
      organización: c.organización,
      zona_eip: eipMap.get(c.id) ?? null,
      ya_es_tc: tc ? tc.es_talento_clave : eipMap.has(c.id),
    };
  });

  const rows = colabArr.map((c) => {
    const tc   = tcMap.get(c.id);
    const zona = tc?.zona_eip ?? eipMap.get(c.id) ?? null;
    const esTC = tc?.es_talento_clave ?? eipMap.has(c.id);

    const umbral = resolveUmbral(umbralesArr, c.organización ?? null, c.segmento_organizacional ?? null);
    const { semaforo: semaforo_movilidad, meses: meses_en_posicion } = computeSemaforo(
      c.fecha_ingreso_posicion,
      umbral
    );

    const estado_picd  = picdMap.get(c.id) ?? null;

    return {
      colaborador_id:     c.id,
      nombre_completo:    c.nombre_completo,
      puesto:             c.puesto,
      organización:       c.organización,
      segmento_organizacional: c.segmento_organizacional,
      area:               c.area,
      es_talento_clave:   esTC,
      fuente:             tc?.fuente ?? (eipMap.has(c.id) ? "auto" : "manual_ch"),
      zona_eip:           zona,
      semaforo_movilidad,
      meses_en_posicion,
      tiene_picd:         estado_picd !== null,
      estado_picd,
    };
  });

  // Log history (admin only)
  const { data: logRaw } = await supabase
    .from("talento_clave_log")
    .select("id, colaborador_id, ciclo_año, accion, justificacion, zona_eip, es_talento_clave_anterior, creado_por, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  type LogRec = {
    id: string;
    colaborador_id: string;
    ciclo_año: number;
    accion: string;
    justificacion: string;
    zona_eip: string | null;
    es_talento_clave_anterior: boolean | null;
    creado_por: string;
    created_at: string;
  };

  const logArr = (logRaw ?? []) as unknown as LogRec[];

  const logColabIds = Array.from(new Set(logArr.map((l) => l.colaborador_id)));
  const logUserIds  = Array.from(new Set(logArr.map((l) => l.creado_por)));

  const { data: logColabs } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo")
    .in("id", logColabIds.length > 0 ? logColabIds : [EMPTY_ID]);

  const { data: logUsers } = await supabase
    .from("usuarios_app")
    .select("id, nombre")
    .in("id", logUserIds.length > 0 ? logUserIds : [EMPTY_ID]);

  const colabNames = new Map(
    ((logColabs ?? []) as { id: string; nombre_completo: string }[]).map((c) => [c.id, c.nombre_completo])
  );
  const userNames = new Map(
    ((logUsers ?? []) as { id: string; nombre: string | null }[]).map((u) => [u.id, u.nombre])
  );

  const logRows = logArr.map((l) => ({
    ...l,
    colaborador_nombre: colabNames.get(l.colaborador_id) ?? "—",
    creado_por_nombre:  userNames.get(l.creado_por) ?? "—",
  }));

  return (
    <TalentoClavePage
      rows={rows}
      logRows={logRows}
      cicloAño={cicloAño}
      allColaboradores={allColaboradores}
    />
  );
}
