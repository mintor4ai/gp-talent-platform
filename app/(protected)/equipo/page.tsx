import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";

export default async function MiEquipoPage() {
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

  // Capital Humano goes to full colaboradores list instead
  if (rol === "capital_humano" || rol === "superadmin") redirect("/colaboradores");
  if (rol !== "jefe") redirect("/dashboard");
  if (!perfil.id_empleado) redirect("/dashboard");

  // Get the jefe's own profile to find their name
  const { data: miPerfil } = await supabase
    .from("colaboradores")
    .select("nombre_completo, puesto, area")
    .eq("id", perfil.id_empleado)
    .single();

  if (!miPerfil) redirect("/dashboard");

  // Get direct reports
  const { data: equipo } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, nivel, area")
    .eq("jefe_inmediato_nombre", miPerfil.nombre_completo)
    .eq("activo", true)
    .order("nombre_completo");

  if (!equipo || equipo.length === 0) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Equipo</h1>
          <p className="text-sm text-gray-500 mt-1">{miPerfil.nombre_completo}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">No hay colaboradores directos registrados.</p>
        </div>
      </div>
    );
  }

  const equipoIds = equipo.map((e) => e.id);

  type EipRow = { id_empleado: string; ciclo_año: number; zona_evaluacion: string | null; evaluacion_potencial_total: number | null; desempeno_logra: number | null };
  type PicdRow = { id_empleado: string; ciclo_año: number; estado: string };

  // Get latest EIPs for the team
  const { data: eipsRaw } = await supabase
    .from("evaluacion_integral_personal")
    .select("*")
    .in("id_empleado", equipoIds)
    .order("ciclo_año", { ascending: false });
  const eips = (eipsRaw ?? []) as unknown as EipRow[];

  // Latest EIP per person
  const latestEip: Record<string, EipRow> = {};
  for (const e of eips) {
    if (!latestEip[e.id_empleado]) latestEip[e.id_empleado] = e;
  }

  // Get PICD status for the team
  const { data: picdsRaw } = await supabase
    .from("picd")
    .select("*")
    .in("id_empleado", equipoIds)
    .order("ciclo_año", { ascending: false });
  const picds = (picdsRaw ?? []) as unknown as PicdRow[];

  const latestPicd: Record<string, PicdRow> = {};
  for (const p of picds) {
    if (!latestPicd[p.id_empleado]) latestPicd[p.id_empleado] = p;
  }

  type EntrevistaRow = { id_empleado: string; ciclo_ano: number; estado: string };

  // Get pending entrevistas for the team
  const { data: entrevistasRaw } = await supabase
    .from("picd_entrevistas")
    .select("*")
    .in("id_empleado", equipoIds);
  const entrevistas = (entrevistasRaw ?? []) as unknown as EntrevistaRow[];

  const pendingByEmpleado: Record<string, boolean> = {};
  for (const e of entrevistas) {
    if (e.estado === "pendiente_revision" || e.estado === "ajustes_solicitados") {
      pendingByEmpleado[e.id_empleado] = true;
    }
  }

  const picdEstadoColors: Record<string, string> = {
    borrador: "bg-yellow-100 text-yellow-700",
    enviado: "bg-blue-100 text-blue-700",
    aprobado: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Equipo</h1>
        <p className="text-sm text-gray-500 mt-1">
          {miPerfil.nombre_completo} · {equipo.length} colaborador{equipo.length !== 1 ? "es" : ""}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Colaboradores a tu cargo
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {equipo.map((miembro) => {
            const eip = latestEip[miembro.id];
            const picd = latestPicd[miembro.id];
            const zonaColors = eip?.zona_evaluacion
              ? ZONA_COLORS[eip.zona_evaluacion] ?? { bg: "bg-gray-100", text: "text-gray-700" }
              : null;

            return (
              <div key={miembro.id} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">
                    {miembro.nombre_completo.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{miembro.nombre_completo}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {miembro.puesto}
                    {miembro.nivel && ` · ${miembro.nivel}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {eip && zonaColors && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${zonaColors.bg} ${zonaColors.text}`}>
                      {eip.zona_evaluacion}
                    </span>
                  )}
                  {picd && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${picdEstadoColors[picd.estado] ?? "bg-gray-100 text-gray-600"}`}>
                      PICD: {picd.estado}
                    </span>
                  )}
                  {pendingByEmpleado[miembro.id] && (
                    <span className="flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                      Entrevista pendiente
                    </span>
                  )}
                  <a
                    href={`/carpeta/${miembro.id}`}
                    className="text-xs text-[#1a3a5c] hover:underline font-medium"
                  >
                    Ver carpeta →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
