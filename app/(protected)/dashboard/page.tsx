import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getDisabledOrgs } from "@/lib/disabled-uens";

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

  const [{ data: colab }, { data: eip }, { data: planRaw }] = await Promise.all([
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
    supabase
      .from("plan_carrera")
      .select("id, estado")
      .eq("colaborador_id", idEmpleado)
      .maybeSingle(),
  ]);

  const planCarrera = planRaw as unknown as { id: string; estado: string } | null;

  // Fetch action progress if plan exists
  let planProgress = 0;
  if (planCarrera) {
    const { data: acciones } = await supabase
      .from("plan_carrera_acciones")
      .select("estado")
      .eq("plan_id", planCarrera.id)
      .neq("estado", "cancelado");
    const total = acciones?.length ?? 0;
    const done = acciones?.filter((a) => a.estado === "completado").length ?? 0;
    planProgress = total > 0 ? Math.round((done / total) * 100) : 0;
  }

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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 col-span-full lg:col-span-1">
          <SectionHeader label="Mis datos" />
          <p className="text-lg font-semibold text-gray-900">{colab?.nombre_completo ?? "—"}</p>
          <p className="text-sm text-gray-600 mt-1">{colab?.puesto ?? "—"}</p>
          <p className="text-xs text-gray-400 mt-1">
            {colab?.organización} · {colab?.nivel}
          </p>
          {colab?.area && <p className="text-xs text-gray-400">{colab.area}</p>}
        </div>

        {eip ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <SectionHeader label={`Evaluación Integral ${eip.ciclo_año}`} />
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-center text-center">
            <p className="text-sm text-gray-400">Sin evaluación integral disponible</p>
          </div>
        )}

        {/* Plano de Carrera card — only shown when a plan exists */}
        {planCarrera && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <SectionHeader label="Mi Plano de Carrera" />
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                planCarrera.estado === "activo"
                  ? "bg-green-100 text-green-700"
                  : planCarrera.estado === "pausado"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-500"
              }`}>
                {planCarrera.estado === "activo" ? "Activo" : planCarrera.estado === "pausado" ? "Pausado" : "Cerrado"}
              </span>
              <span className="text-xl font-bold tabular-nums text-gray-900">{planProgress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
              <div
                className="bg-[#1a3a5c] h-2 rounded-full transition-all"
                style={{ width: `${planProgress}%` }}
              />
            </div>
            <a
              href={`/plan-carrera/${idEmpleado}`}
              className="inline-block w-full text-center border border-[#1a3a5c] text-[#1a3a5c] text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Ver mi plano →
            </a>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <SectionHeader label="Coach IA" />
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <SectionHeader label="Mi equipo directo" />
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
                <a href={`/carpeta/${c.id}`} className="hover:text-[#1a3a5c]">
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
  const disabledOrgs = await getDisabledOrgs();

  const colabsQuery = supabase.from("colaboradores").select("id, organización").eq("activo", true) as any;
  const colabsQueryFiltered = disabledOrgs.length > 0
    ? (colabsQuery as any).not("organización", "in", `(${disabledOrgs.map((o) => `"${o}"`).join(",")})`)
    : colabsQuery;

  const [
    { data: colabsRaw },
    { data: zonas },
    { count: matchesPendientes },
    { data: criticosRaw },
    { data: planesRaw },
    { data: sucesionPlanes },
  ] = await Promise.all([
    colabsQueryFiltered,
    supabase.from("ultimo_eip_vigente").select("zona_evaluacion"),
    supabase
      .from("sucesion_matches")
      .select("*", { count: "exact", head: true })
      .is("validado_ch", null)
      .eq("descartado", false),
    supabase.from("catalogo_puestos").select("id").eq("es_critico", true).eq("activo", true) as any,
    supabase.from("plan_carrera").select("id").eq("estado", "activo") as any,
    supabase.from("plan_sucesion").select("puesto_catalogo_id").neq("estado", "descartado") as any,
  ]);

  // HC por UEN
  const hcByUen: Record<string, number> = {};
  for (const c of (colabsRaw ?? []) as { id: string; organización: string | null }[]) {
    const uen = c.organización ?? "Sin UEN";
    hcByUen[uen] = (hcByUen[uen] ?? 0) + 1;
  }
  const hcByUenSorted = Object.entries(hcByUen).sort((a, b) => b[1] - a[1]);
  const maxHc = hcByUenSorted[0]?.[1] ?? 1;
  const totalColab = (colabsRaw as any[])?.length ?? 0;

  // EIP coverage
  const zonaCounts: Record<string, number> = {};
  for (const row of zonas ?? []) {
    if (row.zona_evaluacion) {
      zonaCounts[row.zona_evaluacion] = (zonaCounts[row.zona_evaluacion] ?? 0) + 1;
    }
  }
  const totalEvaluados = Object.values(zonaCounts).reduce((a, b) => a + b, 0);

  // Sucesión cobertura
  const criticalIds = new Set<string>(((criticosRaw ?? []) as { id: string }[]).map((r) => r.id));
  const coveredIds = new Set<string>(
    ((sucesionPlanes ?? []) as { puesto_catalogo_id: string | null }[])
      .map((r) => r.puesto_catalogo_id)
      .filter((id): id is string => id !== null && criticalIds.has(id))
  );
  const totalCriticos = criticalIds.size;
  const critiCosCubiertos = coveredIds.size;
  const criticosSinSucesor = totalCriticos - critiCosCubiertos;
  const coberturaPct = totalCriticos > 0 ? Math.round((critiCosCubiertos / totalCriticos) * 100) : 0;

  const planesActivos = (planesRaw as any[])?.length ?? 0;

  type Alert = { count: number; label: string; href: string; urgent: boolean };
  const alerts: Alert[] = [
    matchesPendientes && matchesPendientes > 0
      ? { count: matchesPendientes, label: "matches pendientes de validar", href: "/sucesion?tab=matching", urgent: false }
      : null,
  ].filter(Boolean) as Alert[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Panel de Capital Humano</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {rol === "superadmin" ? "Super Admin" : "Capital Humano"} · GP Talent Intelligence
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="HC activo" value={totalColab.toLocaleString()} />
        <KpiCard
          label="Cobertura EIP"
          value={`${Math.round((totalEvaluados / (totalColab || 1)) * 100)}%`}
          sub={`${totalEvaluados.toLocaleString()} evaluados`}
        />
        <KpiCard label="Planes de carrera" value={planesActivos.toLocaleString()} />
      </div>

      {/* HC por UEN */}
      <div className="bg-white rounded-lg border border-gray-200">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3.5 pt-3 pb-2">HC por UEN</p>
        <div className="px-3.5 pb-3 space-y-2">
          {hcByUenSorted.map(([uen, hc]) => (
            <div key={uen} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-28 truncate flex-shrink-0" title={uen}>{uen}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-[#1a3a5c] h-1.5 rounded-full"
                  style={{ width: `${Math.round((hc / maxHc) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 tabular-nums w-8 text-right">{hc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Posiciones críticas */}
      <a href="/sucesion?tab=cobertura" className="block bg-white rounded-lg border border-gray-200 px-3.5 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Posiciones críticas</p>
          <span className="text-[11px] text-gray-400">ver →</span>
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{coberturaPct}%</span>
          <span className="text-xs text-gray-500">cobertura · {critiCosCubiertos}/{totalCriticos} puestos</span>
          {criticosSinSucesor > 0 && (
            <span className="ml-auto text-xs font-semibold text-red-500">{criticosSinSucesor} sin sucesor</span>
          )}
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${coberturaPct >= 80 ? "bg-green-500" : coberturaPct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
            style={{ width: `${coberturaPct}%` }}
          />
        </div>
      </a>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((alert) => (
            <a
              key={alert.href}
              href={alert.href}
              className="flex items-center justify-between bg-white rounded-lg border border-gray-200 border-l-2 border-l-amber-400 px-3.5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold tabular-nums text-amber-600">{alert.count}</span>
                <span className="text-xs text-gray-500">{alert.label}</span>
              </div>
              <span className="text-[11px] text-gray-400">ver →</span>
            </a>
          ))}
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3.5 py-2.5">Accesos rápidos</p>
        <QuickLink href="/carpetas" label="Carpetas Individuales" />
        <QuickLink href="/sucesion?tab=matching" label="Motor de Matching" />
        <QuickLink href="/organizacion" label="Organización" />
        <QuickLink href="/importar" label="Importar datos" />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between px-3.5 py-2.5 hover:bg-gray-50 transition-colors"
    >
      <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
      <span className="text-gray-300 group-hover:text-gray-400 text-xs transition-colors">→</span>
    </a>
  );
}
