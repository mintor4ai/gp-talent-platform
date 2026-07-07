import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import PicdCiclosAdmin from "./PicdCiclosAdmin";

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

  let query = supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, nivel, organización, area, activo")
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "Directorio de Colaboradores" : "Mi Equipo"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {colaboradores?.length ?? 0} colaboradores
        </p>
      </div>

      {isAdmin && picdCiclosRows.length > 0 && (
        <PicdCiclosAdmin rows={picdCiclosRows} cicloAño={cicloAño} />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Puesto</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Nivel</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Organización</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Área</th>
                <th className="px-5 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(colaboradores ?? []).map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {c.nombre_completo}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{c.puesto ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                    {c.nivel ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">
                    {(c as any).organización ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">
                    {c.area ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <a
                      href={`/colaboradores/${c.id}`}
                      className="text-[#1a3a5c] hover:underline text-xs font-medium"
                    >
                      Ver →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
