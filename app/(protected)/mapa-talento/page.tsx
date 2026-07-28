import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ZONA_COLORS } from "@/lib/types";
import type { Rol } from "@/lib/types";
import EIPScatterChart from "@/app/(protected)/evaluaciones/EIPScatterChart";
import ZonaConfigEditor from "@/app/(protected)/evaluaciones/ZonaConfigEditor";

const DEFAULT_ZONA_BANDS = [
  { zona: "Inicio",        umbral_inferior: 160,   umbral_superior: 175   },
  { zona: "Revisión",      umbral_inferior: 175,   umbral_superior: 187.5 },
  { zona: "Estabilidad",   umbral_inferior: 187.5, umbral_superior: 212.5 },
  { zona: "Desarrollo",    umbral_inferior: 212.5, umbral_superior: 225   },
  { zona: "Sobresaliente", umbral_inferior: 225,   umbral_superior: 240   },
];

export default async function MapaTalentoPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
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

  // Cycles
  const { data: eips } = await supabase
    .from("evaluacion_integral_personal")
    .select("*, colaboradores(*)")
    .order("ciclo_año", { ascending: false })
    .order("zona_evaluacion");

  const ciclos = Array.from(new Set((eips ?? []).map((e) => (e as any).ciclo_año))).sort(
    (a, b) => (b as number) - (a as number)
  );
  const cicloActual: number = (ciclos[0] as number) ?? new Date().getFullYear();
  const eipsActual = (eips ?? []).filter((e) => (e as any).ciclo_año === cicloActual);

  const { data: zonaConfig } = await supabase
    .from("config_zonas_eip")
    .select("zona, umbral_inferior, umbral_superior")
    .eq("ciclo_año", cicloActual)
    .order("umbral_inferior");

  const zonaBands = (zonaConfig && zonaConfig.length > 0) ? zonaConfig : DEFAULT_ZONA_BANDS;

  // Zone counts
  const zonaCounts: Record<string, number> = {};
  for (const e of eipsActual) {
    const z = (e as any).zona_evaluacion;
    if (z) zonaCounts[z] = (zonaCounts[z] ?? 0) + 1;
  }

  // Build scatter data for ALL cycles (for multi-cycle overlay)
  type ScatterPoint = {
    id: string; id_empleado: string; nombre: string; puesto: string;
    area: string | null; uen: string | null; jefe: string | null;
    desempeno: number; potencial: number; zona: string | null;
  };

  function toScatterPoint(e: unknown): ScatterPoint | null {
    const ev = e as any;
    if (ev.desempeno_logra == null || ev.evaluacion_potencial_total == null) return null;
    const colab = ev.colaboradores as {
      nombre_completo: string; puesto: string; area: string | null;
      organización: string | null; jefe_inmediato_nombre: string | null;
    } | null;
    return {
      id: ev.id,
      id_empleado: ev.id_empleado,
      nombre: colab?.nombre_completo ?? "—",
      puesto: colab?.puesto ?? "—",
      area: colab?.area ?? null,
      uen: colab?.organización ?? null,
      jefe: colab?.jefe_inmediato_nombre ?? null,
      desempeno: Number(ev.desempeno_logra),
      potencial: Number(ev.evaluacion_potencial_total),
      zona: ev.zona_evaluacion,
    };
  }

  const allCyclePoints = ciclos.map((ciclo) => ({
    ciclo: ciclo as number,
    points: (eips ?? [])
      .filter((e) => (e as any).ciclo_año === ciclo)
      .map(toScatterPoint)
      .filter((p): p is ScatterPoint => p !== null),
  }));

  // For current cycle zone counts and config
  const scatterPoints = allCyclePoints.find((c) => c.ciclo === cicloActual)?.points ?? [];

  // UENs/areas/jefes from all cycles combined
  const allPoints = allCyclePoints.flatMap((c) => c.points);
  const uens  = Array.from(new Set(allPoints.map((p) => p.uen).filter(Boolean)  as string[])).sort();
  const areas = Array.from(new Set(allPoints.map((p) => p.area).filter(Boolean) as string[])).sort();
  const jefes = Array.from(new Set(allPoints.map((p) => p.jefe).filter(Boolean) as string[])).sort();

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mapa de Talento</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ciclo {cicloActual} · {eipsActual.length} evaluaciones
        </p>
      </div>

      {/* Zone summary — slim chips */}
      <div className="flex flex-wrap gap-2">
        {(["Sobresaliente", "Desarrollo", "Estabilidad", "Revisión", "Inicio"] as const).map((zona) => {
          const colors = ZONA_COLORS[zona] ?? { bg: "bg-gray-100", text: "text-gray-700" };
          const HEX: Record<string, string> = {
            Sobresaliente: "#7c3aed", Desarrollo: "#2563eb",
            Estabilidad: "#059669", "Revisión": "#ea580c", Inicio: "#ca8a04",
          };
          return (
            <div key={zona}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 flex-1 min-w-[140px] ${colors.bg}`}
              style={{ borderLeft: `3px solid ${HEX[zona] ?? "#6b7280"}` }}
            >
              <span className={`text-2xl font-bold tabular-nums leading-none ${colors.text}`}>
                {zonaCounts[zona] ?? 0}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wide leading-tight ${colors.text} opacity-70`}>
                {zona}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scatter chart */}
      {scatterPoints.length > 0 && (
        <EIPScatterChart
          allCyclePoints={allCyclePoints}
          uens={uens}
          areas={areas}
          jefes={jefes}
          zonaBands={zonaBands}
        />
      )}

      {/* Zone config (superadmin only) */}
      {rol === "superadmin" && (
        <ZonaConfigEditor cicloAño={cicloActual} zonaBands={zonaBands} />
      )}

      {/* Previous cycles summary */}
      {ciclos.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Ciclos anteriores</p>
          <div className="space-y-2">
            {(ciclos as number[]).slice(1).map((ciclo) => {
              const eipsCiclo = (eips ?? []).filter((e) => (e as any).ciclo_año === ciclo);
              const zonasC: Record<string, number> = {};
              for (const e of eipsCiclo) {
                const z = (e as any).zona_evaluacion;
                if (z) zonasC[z] = (zonasC[z] ?? 0) + 1;
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
