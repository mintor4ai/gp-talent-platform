import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";

export default async function SucesionPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { data: sucesiones } = await supabase
    .from("sucesion_picd")
    .select("*, colaboradores!sucesion_picd_id_empleado_fkey(id, nombre_completo, puesto, nivel)")
    .order("ciclo_año", { ascending: false });

  // Agrupar por ciclo
  const ciclos = Array.from(new Set((sucesiones ?? []).map((s) => s.ciclo_año))).sort(
    (a, b) => b - a
  );
  const cicloActual = ciclos[0] ?? new Date().getFullYear();
  const sucActual = (sucesiones ?? []).filter((s) => s.ciclo_año === cicloActual);

  // Agrupar por titular
  const porTitular: Record<string, typeof sucActual> = {};
  for (const s of sucActual) {
    const nombre = (s.colaboradores as { nombre_completo: string } | null)?.nombre_completo ?? s.id_empleado;
    if (!porTitular[nombre]) porTitular[nombre] = [];
    porTitular[nombre].push(s);
  }

  const LISTO_COLORS: Record<string, { bg: string; text: string }> = {
    "Inmediato":    { bg: "bg-green-100",  text: "text-green-800" },
    "1-2 años":     { bg: "bg-blue-100",   text: "text-blue-800" },
    "2-3 años":     { bg: "bg-yellow-100", text: "text-yellow-800" },
    "3+ años":      { bg: "bg-orange-100", text: "text-orange-800" },
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plan de Sucesión</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ciclo {cicloActual} · {Object.keys(porTitular).length} posiciones con sucesor definido
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Posiciones con plan</p>
          <p className="text-2xl font-bold text-gray-900">{Object.keys(porTitular).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Sucesores identificados</p>
          <p className="text-2xl font-bold text-gray-900">{sucActual.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1">Sucesores externos</p>
          <p className="text-2xl font-bold text-gray-900">
            {sucActual.filter((s) => s.sucesor_es_externo).length}
          </p>
        </div>
      </div>

      {/* Tarjetas por titular */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.entries(porTitular).map(([titular, sucesores]) => {
          const colab = sucesores[0].colaboradores as {
            id: string;
            nombre_completo: string;
            puesto: string;
            nivel: string;
          } | null;

          return (
            <div key={titular} className="bg-white rounded-xl border border-gray-200 p-5">
              {/* Titular */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">
                    {(colab?.nombre_completo ?? titular).charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {colab?.nombre_completo ?? titular}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{colab?.puesto ?? "—"}</p>
                  <p className="text-xs text-gray-400">{colab?.nivel ?? "—"}</p>
                </div>
                {colab?.id && (
                  <a
                    href={`/colaboradores/${colab.id}`}
                    className="text-xs text-[#1a3a5c] hover:underline flex-shrink-0"
                  >
                    Ver perfil →
                  </a>
                )}
              </div>

              {/* Sucesores */}
              <div className="space-y-2 pl-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Sucesores ({sucesores.length})
                </p>
                {sucesores.map((s) => {
                  const listoColors =
                    s.listo_para_rol ? LISTO_COLORS[s.listo_para_rol] : null;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {s.sucesor_nombre ?? "—"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {s.sucesor_puesto_actual ?? "—"}
                          {s.sucesor_es_externo && (
                            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700">
                              Externo
                            </span>
                          )}
                        </p>
                      </div>
                      {listoColors && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${listoColors.bg} ${listoColors.text}`}
                        >
                          {s.listo_para_rol}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
