import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";

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
