import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import PicdCiclosAdmin from "./PicdCiclosAdmin";
import ColaboradoresClient from "./ColaboradoresClient";

export default async function ColaboradoresPage() {
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

  // select("*") avoids Supabase TS parser error on the accented column `organización`
  let query = supabase
    .from("colaboradores")
    .select("*")
    .eq("activo", true)
    .order("nombre_completo");

  if (rol === "jefe" && perfil.id_empleado) {
    const { data: jefe } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();

    if (jefe) {
      query = query.eq("jefe_inmediato_nombre", jefe.nombre_completo);
    }
  } else if (rol === "colaborador" && perfil.id_empleado) {
    query = query.eq("id", perfil.id_empleado);
  }

  const { data: colaboradores } = await query;

  const cicloAño = new Date().getFullYear();
  let picdCiclosRows: any[] = [];

  if (isAdmin && colaboradores?.length) {
    const ids = colaboradores.map((c) => c.id);
    const { data: ciclosRaw } = await supabase
      .from("picd_ciclos_estado")
      .select("id_empleado, ciclo_año, estado, cerrado_at, decision_at, decision_nombre, comentario_jefe, reabierto_at")
      .eq("ciclo_año", cicloAño)
      .in("id_empleado", ids);

    const ciclosMap = new Map((ciclosRaw ?? []).map((r: any) => [r.id_empleado, r]));

    picdCiclosRows = colaboradores.map((c) => ({
      id_empleado: c.id,
      nombre_completo: c.nombre_completo,
      puesto: c.puesto ?? null,
      ciclo_año: cicloAño,
      ...((ciclosMap.get(c.id) as any) ?? { estado: null, cerrado_at: null, decision_at: null, decision_nombre: null, comentario_jefe: null, reabierto_at: null }),
    }));
  }

  type ColabRow = {
    id: string;
    nombre_completo: string;
    puesto: string | null;
    nivel: string | null;
    organización: string | null;
    area: string | null;
    jefe_inmediato_nombre: string | null;
    segmento_organizacional: string | null;
  };

  const colabs = (colaboradores ?? []) as unknown as ColabRow[];

  const uens = Array.from(new Set(colabs.map((c) => c.organización).filter(Boolean) as string[])).sort();
  const areas = Array.from(new Set(colabs.map((c) => c.area).filter(Boolean) as string[])).sort();
  const jefes = Array.from(new Set(colabs.map((c) => c.jefe_inmediato_nombre).filter(Boolean) as string[])).sort();
  const segmentos = Array.from(new Set(colabs.map((c) => c.segmento_organizacional).filter(Boolean) as string[])).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "Directorio de Colaboradores" : "Mi Equipo"}
        </h1>
      </div>

      {isAdmin && picdCiclosRows.length > 0 && (
        <PicdCiclosAdmin rows={picdCiclosRows} cicloAño={cicloAño} />
      )}

      <ColaboradoresClient
        colaboradores={colabs}
        uens={uens}
        areas={areas}
        jefes={jefes}
        segmentos={segmentos}
        isAdmin={isAdmin}
      />
    </div>
  );
}
