import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import CicloSelector from "./CicloSelector";
import CarpetasClient from "./CarpetasClient";

export default async function CarpetasPage({
  searchParams,
}: {
  searchParams: Promise<{ ciclo?: string }>;
}) {
  const { ciclo: cicloParam } = await searchParams;
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

  const { data: eips } = await supabase
    .from("evaluacion_integral_personal")
    .select(`
      id, id_empleado, ciclo_año, zona_evaluacion,
      evaluacion_potencial_total, desempeno_logra,
      colaboradores (
        nombre_completo, puesto, segmento_organizacional,
        organización, area, jefe_inmediato_nombre
      )
    `)
    .order("ciclo_año", { ascending: false });

  const ciclos = Array.from(new Set((eips ?? []).map((e) => (e as any).ciclo_año))).sort(
    (a, b) => (b as number) - (a as number)
  ) as number[];

  const cicloActual: number = cicloParam ? Number(cicloParam) : (ciclos[0] ?? new Date().getFullYear());
  const eipsActual = (eips ?? []).filter((e) => (e as any).ciclo_año === cicloActual);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carpetas Individuales</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ciclo {cicloActual} · {eipsActual.length} colaboradores evaluados
          </p>
        </div>

        {ciclos.length > 1 && (
          <CicloSelector ciclos={ciclos} cicloActual={cicloActual} />
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <SectionHeader label={`Detalle — Ciclo ${cicloActual}`} />
        </div>
        <CarpetasClient eips={eipsActual as any} />
      </div>
    </div>
  );
}
