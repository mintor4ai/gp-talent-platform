import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol, ZonaBand } from "@/lib/types";
import CarpetaTabs from "./CarpetaTabs";
import type { SucesionItem } from "./SucesionEditor";

export default async function CarpetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: colaboradorId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  const isOwn = perfil.id_empleado === colaboradorId;

  // Colaborador: solo su propia carpeta
  if (rol === "colaborador" && !isOwn) redirect("/carpeta");

  // Jefe: solo su carpeta propia + equipo directo
  if (rol === "jefe" && !isOwn && !isAdmin) {
    const { data: miColab } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();

    if (miColab) {
      const { data: equipo } = await supabase
        .from("colaboradores")
        .select("id")
        .eq("jefe_inmediato_nombre", miColab.nombre_completo);
      const ids = equipo?.map((e) => e.id) ?? [];
      if (!ids.includes(colaboradorId)) redirect("/equipo");
    }
  }

  const { data: colab } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", colaboradorId)
    .single();

  if (!colab) notFound();

  const [
    { data: eips },
    { data: desempenos },
    { data: competencias },
    { data: eals },
    { data: picdAcciones },
    { data: picdRecords },
    { data: entrevistas },
    { data: comentarios },
    { data: rutas },
    { data: zonasRaw },
    { data: sucesionRaw },
    { data: colaboradoresAll },
    { data: candidaturasRaw },
    { data: ciclosEstadoRaw },
  ] = await Promise.all([
    supabase
      .from("evaluacion_integral_personal")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("evaluacion_desempeno_anual")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("evaluacion_competencias_360")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("evaluacion_eal")
      .select("*")
      .eq("id_lider_evaluado", colaboradorId)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("picd_acciones")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false })
      .order("tipo_accion")
      .order("created_at"),
    supabase
      .from("picd")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("picd_entrevistas")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_ano", { ascending: false }),
    supabase
      .from("picd_comentarios")
      .select("*, picd_entrevistas!inner(id_empleado)")
      .eq("picd_entrevistas.id_empleado", colaboradorId)
      .order("created_at"),
    supabase
      .from("rutas_carrera")
      .select("id, tipo_ruta, puesto_objetivo, uen_objetivo, plazo_estimado, habilidades_gap, acciones_recomendadas, acciones, aspiracion, generado_con_ia, activa")
      .eq("id_empleado", colaboradorId)
      .eq("activa", true)
      .order("created_at"),
    supabase
      .from("config_zonas_eip")
      .select("ciclo_año, zona, umbral_inferior, umbral_superior"),
    supabase
      .from("plan_sucesion")
      .select("*")
      .eq("id_empleado", colaboradorId)
      .order("ciclo_año", { ascending: false })
      .order("created_at"),
    supabase
      .from("colaboradores")
      .select("id, nombre_completo, puesto")
      .order("nombre_completo"),
    supabase
      .from("plan_sucesion")
      .select("*")
      .eq("sucesor_id", colaboradorId)
      .eq("informar_sucesor", true)
      .eq("estado", "aprobado")
      .order("ciclo_año", { ascending: false }),
    supabase
      .from("picd_ciclos_estado")
      .select("*")
      .eq("id_empleado", colaboradorId),
  ]);

  const canEdit = isOwn || isAdmin;

  // Build zones map: Record<ciclo_año, ZonaBand[]>
  const zonasMap: Record<number, ZonaBand[]> = {};
  for (const row of (zonasRaw ?? []) as unknown as { ciclo_año: number; zona: string; umbral_inferior: number; umbral_superior: number }[]) {
    if (!zonasMap[row.ciclo_año]) zonasMap[row.ciclo_año] = [];
    zonasMap[row.ciclo_año].push({ zona: row.zona, umbral_inferior: row.umbral_inferior, umbral_superior: row.umbral_superior });
  }

  const sucesion = (sucesionRaw ?? []) as unknown as SucesionItem[];
  type ColabOption = { id: string; nombre_completo: string | null; puesto: string | null };
  const colaboradoresLista = (colaboradoresAll ?? []) as unknown as ColabOption[];
  const candidaturasComoSuccesor = (candidaturasRaw ?? []) as unknown as SucesionItem[];

  // Build ciclosEstado map: Record<ciclo_año, CicloEstado>
  type CicloEstadoRow = {
    ciclo_año: number; estado: string; cerrado_at: string | null;
    decision_at: string | null; decision_nombre: string | null;
    comentario_jefe: string | null; reabierto_at: string | null; reabierto_nombre: string | null;
  };
  const ciclosEstadoMap: Record<number, CicloEstadoRow> = {};
  for (const row of (ciclosEstadoRaw ?? []) as unknown as CicloEstadoRow[]) {
    ciclosEstadoMap[row.ciclo_año] = row;
  }

  // Gather all available cycles from EIP + desempeño data
  const ciclosSet = new Set<number>();
  for (const e of eips ?? []) ciclosSet.add(e.ciclo_año);
  for (const d of desempenos ?? []) ciclosSet.add(d.ciclo_año);
  const ciclos = Array.from(ciclosSet).sort((a, b) => b - a);

  const antiguedad = colab.fecha_antiguedad
    ? Math.floor(
        (Date.now() - new Date(colab.fecha_antiguedad).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        {isAdmin && (
          <>
            <a href="/colaboradores" className="hover:text-gray-600 transition-colors">
              Colaboradores
            </a>
            <span>/</span>
          </>
        )}
        {rol === "jefe" && !isOwn && (
          <>
            <a href="/equipo" className="hover:text-gray-600 transition-colors">
              Mi Equipo
            </a>
            <span>/</span>
          </>
        )}
        <span className="text-gray-700 font-medium">
          {isOwn ? "Mi Carpeta" : colab.nombre_completo}
        </span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-bold">
              {colab.nombre_completo.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900">{colab.nombre_completo}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{colab.puesto}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-gray-400">
              {(colab as any).organización && <span>{(colab as any).organización}</span>}
              {colab.nivel && <span>{colab.nivel}</span>}
              {colab.area && <span>{colab.area}</span>}
              {antiguedad !== null && <span>{antiguedad} año{antiguedad !== 1 ? "s" : ""} de antigüedad</span>}
            </div>
          </div>
        </div>
      </div>

      <CarpetaTabs
        colaboradorId={colaboradorId}
        ciclos={ciclos}
        eips={eips ?? []}
        desempenos={desempenos ?? []}
        competencias={competencias ?? []}
        eals={eals ?? []}
        picdAcciones={picdAcciones ?? []}
        picdRecords={picdRecords ?? []}
        entrevistas={(entrevistas ?? []) as any[]}
        comentarios={(comentarios ?? []) as any[]}
        rutas={(rutas ?? []) as any[]}
        zonasMap={zonasMap}
        sucesion={sucesion}
        colaboradores={colaboradoresLista}
        candidaturasComoSuccesor={candidaturasComoSuccesor}
        canEdit={canEdit}
        isOwn={isOwn}
        isJefe={rol === "jefe"}
        isAdmin={isAdmin}
        nombreColaborador={colab.nombre_completo}
        ciclosEstadoMap={ciclosEstadoMap}
      />
    </div>
  );
}
