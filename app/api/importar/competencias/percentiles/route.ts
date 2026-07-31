import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcularPercentilCompetencias } from "@/lib/calcularPercentilCompetencias";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { ciclo_año } = await req.json();
  if (!ciclo_año || ciclo_año < 2020 || ciclo_año > 2035)
    return NextResponse.json({ error: "Ciclo inválido" }, { status: 400 });

  const { inserted, errors } = await calcularPercentilCompetencias(supabase, Number(ciclo_año));

  return NextResponse.json({ ok: true, inserted, errors });
}
