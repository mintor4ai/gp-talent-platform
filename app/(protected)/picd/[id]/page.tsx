import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import PicdEditor from "./PicdEditor";
import { getCicloEstado } from "@/app/actions/picd_ciclo";

export default async function PicdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ciclo?: string }>;
}) {
  const { id } = await params;
  const { ciclo: cicloParam } = await searchParams;
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
  const isOwn = perfil.id_empleado === id;

  // Colaborador solo puede ver su propio PICD
  if (rol === "colaborador" && !isOwn) redirect("/dashboard");

  const { data: colab } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, nivel")
    .eq("id", id)
    .single();

  if (!colab) notFound();

  // Jefe: solo puede ver su equipo
  if (rol === "jefe" && !isOwn) {
    const { data: miColab } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();

    const { data: equipo } = await supabase
      .from("colaboradores")
      .select("id")
      .eq("jefe_inmediato_nombre", miColab?.nombre_completo ?? "");
    const ids = equipo?.map((e) => e.id) ?? [];
    if (!ids.includes(id)) redirect("/dashboard");
  }

  // Obtener ciclos disponibles desde picd (fuente de verdad)
  const { data: ciclosData } = await supabase
    .from("picd")
    .select("ciclo_año")
    .eq("id_empleado", id)
    .order("ciclo_año", { ascending: false });

  const ciclosDisponibles = (ciclosData ?? []).map((r) => (r as unknown as { ciclo_año: number }).ciclo_año);
  const maxCiclo = ciclosDisponibles[0] ?? new Date().getFullYear();
  const cicloParamNum = cicloParam ? parseInt(cicloParam) : null;
  const cicloAño = cicloParamNum && ciclosDisponibles.includes(cicloParamNum)
    ? cicloParamNum
    : maxCiclo;

  const [{ data: picdRecord }, { data: acciones }, cicloEstado, { data: catalogoPuestos }] = await Promise.all([
    supabase
      .from("picd")
      .select("*")
      .eq("id_empleado", id)
      .eq("ciclo_año", cicloAño)
      .single(),
    supabase
      .from("picd_acciones")
      .select("*")
      .eq("id_empleado", id)
      .eq("ciclo_año", cicloAño)
      .order("tipo_accion")
      .order("created_at"),
    getCicloEstado(id, cicloAño),
    supabase.from("catalogo_puestos").select("id, nombre, razon_social, area").eq("activo", true).order("nombre"),
  ]);

  const isCycleLocked =
    cicloEstado?.estado === "enviado_revision" || cicloEstado?.estado === "aprobado";

  const canEdit = (isOwn || isAdmin) && !isCycleLocked;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        {isAdmin && (
          <>
            <a href="/colaboradores" className="hover:text-gray-600 transition-colors">
              Colaboradores
            </a>
            <span>/</span>
            <a
              href={`/colaboradores/${id}`}
              className="hover:text-gray-600 transition-colors"
            >
              {colab.nombre_completo}
            </a>
            <span>/</span>
          </>
        )}
        <span className="text-gray-700 font-medium">PICD {cicloAño}</span>
      </div>

      {/* Header colaborador */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">
              {colab.nombre_completo.charAt(0)}
            </span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">{colab.nombre_completo}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {colab.puesto} · {colab.nivel}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">Plan Individual de Capacitación y Desarrollo</p>
            <p className="text-sm font-semibold text-gray-700">Ciclo {cicloAño}</p>
          </div>
        </div>
      </div>

      <PicdEditor
        colaboradorId={id}
        cicloAño={cicloAño}
        ciclosDisponibles={ciclosDisponibles}
        picd={picdRecord ?? null}
        acciones={acciones ?? []}
        canEdit={canEdit}
        isOwn={isOwn}
        isAdmin={isAdmin}
        cicloEstado={cicloEstado}
        catalogoPuestos={(catalogoPuestos ?? []) as Array<{ id: string; nombre: string; razon_social: string | null; area: string | null }>}
      />
    </div>
  );
}
