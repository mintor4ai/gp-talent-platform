import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import PicdCiclosAdmin from "@/app/(protected)/colaboradores/PicdCiclosAdmin";

export default async function PicdAdminPage() {
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

  const cicloAño = new Date().getFullYear();

  const { data: colaboradores } = await supabase
    .from("colaboradores")
    .select("id, nombre_completo, puesto")
    .eq("activo", true)
    .order("nombre_completo");

  const ids = (colaboradores ?? []).map((c) => c.id);

  const { data: ciclosRaw } = await supabase
    .from("picd_ciclos_estado")
    .select("id_empleado, ciclo_año, estado, cerrado_at, decision_at, decision_nombre, comentario_jefe, reabierto_at")
    .eq("ciclo_año", cicloAño)
    .in("id_empleado", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const ciclosMap = new Map((ciclosRaw ?? []).map((r: any) => [r.id_empleado, r]));

  const rows = (colaboradores ?? []).map((c) => ({
    id_empleado: c.id,
    nombre_completo: c.nombre_completo,
    puesto: c.puesto ?? null,
    ciclo_año: cicloAño,
    ...((ciclosMap.get(c.id) as any) ?? {
      estado: null,
      cerrado_at: null,
      decision_at: null,
      decision_nombre: null,
      comentario_jefe: null,
      reabierto_at: null,
    }),
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Ciclos PICD</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ciclo {cicloAño} · Administra el estado del PICD de cada colaborador
        </p>
      </div>
      <PicdCiclosAdmin rows={rows} cicloAño={cicloAño} />
    </div>
  );
}
