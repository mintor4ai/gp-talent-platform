import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import ColaboradoresClient from "./ColaboradoresClient";
import { getDisabledOrgs } from "@/lib/disabled-uens";

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

  const disabledOrgs = await getDisabledOrgs();

  // For jefes/colaboradores the result set is small — no pagination needed.
  // For admins paginate to get all rows (PostgREST default cap is 1000).
  let colaboradores: unknown[] = [];

  if (rol === "jefe" && perfil.id_empleado) {
    const { data: jefe } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();

    if (jefe) {
      let q = supabase.from("colaboradores").select("*").order("nombre_completo")
        .eq("jefe_inmediato_nombre", (jefe as { nombre_completo: string }).nombre_completo);
      if (disabledOrgs.length > 0) q = q.not("organización", "in", `("${disabledOrgs.join('","')}")`);
      const { data } = await q;
      colaboradores = data ?? [];
    }
  } else if (rol === "colaborador" && perfil.id_empleado) {
    const { data } = await supabase.from("colaboradores").select("*").eq("id", perfil.id_empleado);
    colaboradores = data ?? [];
  } else {
    // Admin: paginate to retrieve all rows beyond the 1000-row PostgREST cap
    const PAGE = 1000;
    for (let start = 0; ; start += PAGE) {
      let q = supabase.from("colaboradores").select("*").order("nombre_completo").range(start, start + PAGE - 1);
      if (disabledOrgs.length > 0) q = q.not("organización", "in", `("${disabledOrgs.join('","')}")`);
      const { data } = await q;
      if (!data?.length) break;
      colaboradores.push(...data);
      if (data.length < PAGE) break;
    }
  }

  type ColabRow = {
    id: string;
    id_empleado: string | null;
    nombre_completo: string;
    puesto: string | null;
    nivel: string | null;
    organización: string | null;
    area: string | null;
    jefe_inmediato_nombre: string | null;
    segmento_organizacional: string | null;
    activo: boolean;
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
