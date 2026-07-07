import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/types";
import type { SucesionItem } from "../carpeta/[id]/SucesionEditor";
import SucesionAdminView from "./SucesionAdminView";

export default async function SucesionPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  if (!perfil) redirect("/login");

  const rol = perfil.rol as Rol;
  const isAdmin = rol === "capital_humano" || rol === "superadmin";
  if (!isAdmin) redirect("/dashboard");

  const [{ data: planesRaw }, { data: colabsRaw }] = await Promise.all([
    supabase
      .from("plan_sucesion")
      .select("*")
      .order("ciclo_año", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("colaboradores")
      .select("id, nombre_completo, puesto, nivel, area, organización")
      .order("nombre_completo"),
  ]);

  const planes = (planesRaw ?? []) as unknown as SucesionItem[];
  type ColabRow = { id: string; nombre_completo: string | null; puesto: string | null; nivel: string | null; area: string | null; organización: string | null };
  const colabs = (colabsRaw ?? []) as unknown as ColabRow[];

  const ciclos = Array.from(new Set(planes.map((p) => p.ciclo_año))).sort((a, b) => b - a);

  return (
    <SucesionAdminView planes={planes} colabs={colabs} ciclos={ciclos} />
  );
}
