import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const colaboradorId = searchParams.get("colaborador_id");
  const cicloAño = Number(searchParams.get("ciclo_año"));

  if (!colaboradorId || !cicloAño)
    return NextResponse.json({ error: "Parámetros requeridos" }, { status: 400 });

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol, id_empleado").eq("id", user.id).single();
  if (!perfil) return NextResponse.json({ error: "Sin perfil" }, { status: 403 });

  const isAdmin = perfil.rol === "capital_humano" || perfil.rol === "superadmin";
  const isOwn = perfil.id_empleado === colaboradorId;

  if (!isAdmin && !isOwn) {
    if (perfil.rol === "jefe" && perfil.id_empleado) {
      const { data: miColab } = await supabase
        .from("colaboradores").select("nombre_completo").eq("id", perfil.id_empleado).single();
      if (miColab) {
        const { data: equipo } = await supabase
          .from("colaboradores").select("id").eq("jefe_inmediato_nombre", miColab.nombre_completo);
        const ids = equipo?.map((e) => e.id) ?? [];
        if (!ids.includes(colaboradorId))
          return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      } else {
        return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
  }

  // Fetch comments — never return evaluador_id or evaluador_nombre
  const { data: comentariosRaw, error: errC } = await supabase
    .from("competencias_360_comentarios")
    .select("calificacion_general, comentarios")
    .eq("colaborador_id", colaboradorId)
    .eq("ciclo_año", cicloAño)
    .order("calificacion_general", { ascending: false });

  if (errC) return NextResponse.json({ error: errC.message }, { status: 500 });

  const comentarios = (comentariosRaw ?? []).map((c) => ({
    calificacion_general: c.calificacion_general != null ? Number(c.calificacion_general) : null,
    comentarios: c.comentarios ?? null,
  }));

  return NextResponse.json({ comentarios });
}
