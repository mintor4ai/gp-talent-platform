import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, id_empleado, coach_habilitado, tokens_consumidos_mes, tokens_limite_mes")
    .eq("id", user.id)
    .single();

  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";

  if (isAdmin) {
    return <AdminDashboard supabase={supabase} rol={rol} />;
  }

  return (
    <ColaboradorDashboard
      supabase={supabase}
      idEmpleado={perfil.id_empleado}
      rol={rol}
      coachHabilitado={perfil.coach_habilitado}
      tokensUsados={perfil.tokens_consumidos_mes}
      tokensLimite={perfil.tokens_limite_mes}
    />
  );
}

async function ColaboradorDashboard({
  supabase,
  idEmpleado,
  rol,
  coachHabilitado,
  tokensUsados,
  tokensLimite,
}: {
  supabase: SupabaseClient;
  idEmpleado: string | null;
  rol: Rol;
  coachHabilitado: boolean;
  tokensUsados: number;
  tokensLimite: number;
}) {
  if (!idEmpleado) {
    return (
      <div className="text-center py-16 text-gray-500">
        Tu cuenta no está vinculada a un expediente de colaborador. Contacta a Capital Humano.
      </div>
    );
  }

  const [{ data: colab }, { data: eip }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("*")
      .eq("id", idEmpleado)
      .single(),
    supabase
      .from("ultimo_eip_vigente")
      .select("*")
      .eq("id_empleado", idEmpleado)
      .single(),
  ]);

  const zonaColors = eip?.zona_evaluacion
    ? ZONA_COLORS[eip.zona_evaluacion] ?? { bg: "bg-gray-100", text: "text-gray-700" }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido{colab ? `, ${colab.nombre_completo.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {rol === "jefe" ? "Vista de Jefe / Líder" : "Mi Perfil de Talento"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-full lg:col-span-1">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Mis datos
          </p>
          <p className="text-lg font-semibold text-gray-900">{colab?.nombre_completo ?? "—"}</p>
          <p className="text-sm text-gray-600 mt-1">{colab?.puesto ?? "—"}</p>
          <p className="text-xs text-gray-400 mt-1">
            {colab?.organización} · {colab?.nivel}
          </p>
          {colab?.area && <p className="text-xs text-gray-400">{colab.area}</p>}
        </div>

        {eip ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Evaluación Integral {eip.ciclo_año}
            </p>
            {zonaColors && (
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${zonaColors.bg} ${zonaColors.text} mb-3`}
              >
                {eip.zona_evaluacion}
              </span>
            )}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p className="text-xs text-gray-400">Potencial</p>
                <p className="text-xl font-bold text-gray-900">
                  {eip.evaluacion_potencial_total?.toFixed(1) ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Desempeño</p>
                <p className="text-xl font-bold text-gray-900">
                  {eip.desempeno_logra?.toFixed(1) ?? "—"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-center text-center">
            <p className="text-sm text-gray-400">Sin evaluación integral disponible</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Coach IA
          </p>
          {coachHabilitado ? (
            <div>
              <p className="text-sm text-gray-700 mb-3">
                Tokens este mes:{" "}
                <span className="font-semibold text-gray-900">
                  {tokensUsados.toLocaleString()} / {tokensLimite.toLocaleString()}
                </span>
              </p>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#1a3a5c] h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, (tokensUsados / tokensLimite) * 100)}%`,
                  }}
                />
              </div>
              <a
                href="/coach"
                className="mt-4 inline-block w-full text-center bg-[#1a3a5c] text-white text-sm font-medium py-2 rounded-lg hover:bg-[#152e4d] transition-colors"
              >
                Iniciar sesión de coaching
              </a>
              <a
                href="/picd"
                className="mt-2 inline-block w-full text-center border border-[#1a3a5c] text-[#1a3a5c] text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Mi PICD
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              El Coach IA no está habilitado para tu cuenta. Contacta a Capital Humano.
            </p>
          )}
        </div>
      </div>

      {rol === "jefe" && colab && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
            Mi equipo directo
          </p>
          <TeamTable supabase={supabase} nombreJefe={colab.nombre_completo} />
        </div>
      )}
    </div>
  );
}

async function TeamTable({
  supabase,
  nombreJefe,
}: {
  supabase: SupabaseClient;
  nombreJefe: string;
}) {
  const { data: equipo } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto, nivel")
    .eq("jefe_inmediato_nombre", nombreJefe)
    .eq("activo", true)
    .order("nombre_completo");

  if (!equipo || equipo.length === 0) {
    return <p className="text-sm text-gray-400">No se encontraron reportes directos.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="pb-2 font-medium">Nombre</th>
            <th className="pb-2 font-medium">Puesto</th>
            <th className="pb-2 font-medium">Nivel</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {equipo.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
              <td className="py-2.5 font-medium text-gray-900">
                <a href={`/colaboradores/${c.id}`} className="hover:text-[#1a3a5c]">
                  {c.nombre_completo}
                </a>
              </td>
              <td className="py-2.5 text-gray-600">{c.puesto}</td>
              <td className="py-2.5 text-gray-500">{c.nivel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function AdminDashboard({
  supabase,
  rol,
}: {
  supabase: SupabaseClient;
  rol: Rol;
}) {
  const [{ count: totalColab }, { data: zonas }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("*", { count: "exact", head: true })
      .eq("activo", true),
    supabase.from("ultimo_eip_vigente").select("zona_evaluacion"),
  ]);

  const zonaCounts: Record<string, number> = {};
  for (const row of zonas ?? []) {
    if (row.zona_evaluacion) {
      zonaCounts[row.zona_evaluacion] = (zonaCounts[row.zona_evaluacion] ?? 0) + 1;
    }
  }

  const totalEvaluados = Object.values(zonaCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel de Capital Humano</h1>
        <p className="text-sm text-gray-500 mt-1">
          {rol === "superadmin" ? "Vista Super Admin" : "Vista Capital Humano"} · GP Talent
          Intelligence
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Colaboradores activos" value={totalColab ?? 0} />
        <StatCard label="Con evaluación EIP" value={totalEvaluados} />
        {Object.entries(ZONA_COLORS).map(([zona, colors]) => (
          <div key={zona} className={`rounded-xl border p-5 ${colors.bg} border-transparent`}>
            <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${colors.text}`}>
              {zona}
            </p>
            <p className={`text-2xl font-bold ${colors.text}`}>{zonaCounts[zona] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
          Accesos rápidos
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickLink href="/colaboradores" label="Directorio de colaboradores" />
          <QuickLink href="/evaluaciones" label="Carpetas individuales" />
          <QuickLink href="/sucesion" label="Plan de sucesión" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-700 transition-colors"
    >
      {label} →
    </a>
  );
}
