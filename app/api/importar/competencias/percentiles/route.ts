import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcularPercentilCompetencias } from "@/lib/calcularPercentilCompetencias";
import { calcularEvaluacionCompetencias } from "@/lib/calcularEvaluacionCompetencias";

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

  const año = Number(ciclo_año);

  const { inserted, errors: pErrors } = await calcularPercentilCompetencias(supabase, año);
  const { updated, created, errors: eErrors } = await calcularEvaluacionCompetencias(supabase, año);

  return NextResponse.json({
    ok: true,
    percentiles_calculados: inserted,
    ev_comp_updated: updated,
    ev_comp_created: created,
    errors: [...pErrors, ...eErrors],
  });
}
