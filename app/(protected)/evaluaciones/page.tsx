import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";
import EIPScatterChart from "./EIPScatterChart";
import EvaluacionesTable from "./EvaluacionesTable";
import ZonaConfigEditor from "./ZonaConfigEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default async function EvaluacionesPage() {
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

  const { data: eips } = await supabase
    .from("evaluacion_integral_personal")
    .select("*, colaboradores(*)")
    .order("ciclo_año", { ascending: false })
    .order("zona_evaluacion");

  // Ciclos disponibles
  const ciclos = Array.from(new Set((eips ?? []).map((e) => e.ciclo_año))).sort(
    (a, b) => b - a
  );
  const cicloActual = ciclos[0] ?? new Date().getFullYear();

  const eipsActual = (eips ?? []).filter((e) => e.ciclo_año === cicloActual);

  // Load zone config for the current cycle, fall back to default thresholds
  const { data: zonaConfig } = await supabase
    .from("config_zonas_eip")
    .select("zona, umbral_inferior, umbral_superior")
    .eq("ciclo_año", cicloActual)
    .order("umbral_inferior");

  const DEFAULT_ZONA_BANDS = [
    { zona: "Inicio",        umbral_inferior: 160,   umbral_superior: 175   },
    { zona: "Revisión",      umbral_inferior: 175,   umbral_superior: 187.5 },
    { zona: "Estabilidad",   umbral_inferior: 187.5, umbral_superior: 212.5 },
    { zona: "Desarrollo",    umbral_inferior: 212.5, umbral_superior: 225   },
    { zona: "Sobresaliente", umbral_inferior: 225,   umbral_superior: 240   },
  ];

  const zonaBands = (zonaConfig && zonaConfig.length > 0) ? zonaConfig : DEFAULT_ZONA_BANDS;

  // Conteos por zona
  const zonaCounts: Record<string, number> = {};
  for (const e of eipsActual) {
    if (e.zona_evaluacion) {
      zonaCounts[e.zona_evaluacion] = (zonaCounts[e.zona_evaluacion] ?? 0) + 1;
    }
  }

  // Scatter chart data
  const scatterPoints = eipsActual
    .filter((e) => e.desempeno_logra != null && e.evaluacion_potencial_total != null)
    .map((e) => {
      const colab = e.colaboradores as {
        nombre_completo: string;
        puesto: string;
        area: string | null;
        organización: string | null;
        jefe_inmediato_nombre: string | null;
      } | null;
      return {
        id: e.id,
        id_empleado: e.id_empleado,
        nombre: colab?.nombre_completo ?? "—",
        puesto: colab?.puesto ?? "—",
        area: colab?.area ?? null,
        uen: colab?.organización ?? null,
        jefe: colab?.jefe_inmediato_nombre ?? null,
        desempeno: Number(e.desempeno_logra),
        potencial: Number(e.evaluacion_potencial_total),
        zona: e.zona_evaluacion,
      };
    });

  const uens = Array.from(new Set(scatterPoints.map((p) => p.uen).filter(Boolean) as string[])).sort();
  const areas = Array.from(new Set(scatterPoints.map((p) => p.area).filter(Boolean) as string[])).sort();
  const jefes = Array.from(new Set(scatterPoints.map((p) => p.jefe).filter(Boolean) as string[])).sort();

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Carpetas individuales</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ciclo {cicloActual} · {eipsActual.length} evaluaciones
        </p>
      </div>

      {/* Resumen por zona */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {["Sobresaliente", "Desarrollo", "Estabilidad", "Revisión", "Inicio"].map((zona) => {
          const colors = ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-700" };
          return (
            <div key={zona} className={`rounded-xl border p-4 ${colors.bg} border-transparent`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                {zona}
              </p>
              <p className={`text-3xl font-bold mt-1 ${colors.text}`}>
                {zonaCounts[zona] ?? 0}
              </p>
            </div>
          );
        })}
      </div>

      {/* Scatter chart */}
      {scatterPoints.length > 0 && (
        <EIPScatterChart
          points={scatterPoints}
          uens={uens}
          areas={areas}
          jefes={jefes}
          zonaBands={zonaBands}
        />
      )}

      {/* Zone config editor (superadmin only) */}
      {rol === "superadmin" && (
        <ZonaConfigEditor cicloAño={cicloActual} zonaBands={zonaBands} />
      )}

      {/* Tabla de evaluaciones */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <SectionHeader label={`Detalle — Ciclo ${cicloActual}`} />
        </div>
        <div className="overflow-x-auto">
          <EvaluacionesTable eips={eipsActual as any} />
        </div>
      </div>

      {/* Ciclos anteriores */}
      {ciclos.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <SectionHeader label="Ciclos anteriores" />
          <div className="space-y-2">
            {ciclos.slice(1).map((ciclo) => {
              const eipsCiclo = (eips ?? []).filter((e) => e.ciclo_año === ciclo);
              const zonasC: Record<string, number> = {};
              for (const e of eipsCiclo) {
                if (e.zona_evaluacion) {
                  zonasC[e.zona_evaluacion] = (zonasC[e.zona_evaluacion] ?? 0) + 1;
                }
              }
              return (
                <div key={ciclo} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-700">Ciclo {ciclo}</span>
                  <div className="flex gap-3">
                    {Object.entries(zonasC).map(([zona, n]) => {
                      const c = ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-600" };
                      return (
                        <span key={zona} className={`text-xs px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                          {zona}: {n}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
