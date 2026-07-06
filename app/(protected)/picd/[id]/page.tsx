import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import PicdEditor from "./PicdEditor";

export default async function PicdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // Obtener ciclo activo (el más reciente con acciones)
  const { data: cicloRow } = await supabase
    .from("picd_acciones")
    .select("*")
    .eq("id_empleado", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const cicloAño = (cicloRow as { ciclo_año?: number } | null)?.ciclo_año ?? new Date().getFullYear();

  const [{ data: picdRecord }, { data: acciones }] = await Promise.all([
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
  ]);

  const canEdit = isOwn || isAdmin;

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
      <div className="bg-white rounded-xl border border-gray-200 p-5">
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
        picd={picdRecord ?? null}
        acciones={acciones ?? []}
        canEdit={canEdit}
      />
    </div>
  );
}
