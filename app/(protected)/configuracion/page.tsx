import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfigTabs from "./ConfigTabs";
import type { ZonaBand, Periodo } from "@/lib/types";
import type { AuthUsuario } from "./UsuariosTab";
import type { TablasEipRow } from "./TablasEipTab";

export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "superadmin") redirect("/dashboard");

  // Distinct group values from colaboradores (trim whitespace)
  const [uenRes, deptRes, areaRes, segRes, reglasRes, promptsRes, apiRes, usersRes, colabsRes, zonasRes, periodosRes, authUsersRes, ponderacionesRes, tablaExpRes, tablaMovRes] =
    await Promise.all([
      supabase.from("colaboradores").select("razon_social").not("razon_social", "is", null),
      supabase.from("colaboradores").select("departamento").not("departamento", "is", null),
      supabase.from("colaboradores").select("area").not("area", "is", null),
      supabase.from("colaboradores").select("segmento_organizacional").not("segmento_organizacional", "is", null),
      supabase.from("configuracion_coach_acceso").select("*").order("nivel").order("valor"),
      supabase.from("configuracion_prompts").select("*").order("tipo").order("version", { ascending: false }),
      supabase.from("configuracion_api").select("*").eq("activo", true).single(),
      supabase.from("usuarios_app").select("id, rol, coach_habilitado, id_empleado").not("id_empleado", "is", null),
      supabase.from("colaboradores").select("id, nombre_completo, puesto, razon_social"),
      supabase.from("config_zonas_eip").select("*").order("ciclo_año", { ascending: false }),
      supabase.from("periodos").select("*").order("ciclo_año", { ascending: false }),
      supabase.from("vw_auth_usuarios").select("*").order("auth_created_at", { ascending: false }),
      supabase.from("eip_ponderaciones").select("*").order("ciclo_año", { ascending: false }).order("calif_ponderada"),
      supabase.from("eip_tabla_experiencia").select("ciclo_año, años, nivel_num, score").order("ciclo_año", { ascending: false }).order("años").order("nivel_num"),
      supabase.from("eip_tabla_movilidad").select("ciclo_año, movilidad_floor, nivel_num, score").order("ciclo_año", { ascending: false }).order("movilidad_floor").order("nivel_num"),
    ]);

  type Raw = { [key: string]: string | null };
  const uniqueUens = [...new Set((uenRes.data as Raw[] ?? []).map((r) => r.razon_social?.trim()).filter(Boolean))].sort() as string[];
  const uniqueDepts = [...new Set((deptRes.data as Raw[] ?? []).map((r) => r.departamento?.trim()).filter(Boolean))].sort() as string[];
  const uniqueAreas = [...new Set((areaRes.data as Raw[] ?? []).map((r) => r.area?.trim()).filter(Boolean))].sort() as string[];
  const uniqueSegs = [...new Set((segRes.data as Raw[] ?? []).map((r) => r.segmento_organizacional?.trim()).filter(Boolean))].sort() as string[];

  // Build zones map: Record<ciclo_año, ZonaBand[]>
  type ZonasRow = { ciclo_año: number; zona: string; umbral_inferior: number; umbral_superior: number };
  const zonasMap: Record<number, ZonaBand[]> = {};
  for (const row of ((zonasRes.data as unknown as ZonasRow[]) ?? [])) {
    if (!zonasMap[row.ciclo_año]) zonasMap[row.ciclo_año] = [];
    zonasMap[row.ciclo_año].push({ zona: row.zona, umbral_inferior: row.umbral_inferior, umbral_superior: row.umbral_superior });
  }
  const availableZonaCycles = Object.keys(zonasMap).map(Number).sort((a, b) => b - a);
  const periodos = (periodosRes.data as unknown as Periodo[]) ?? [];
  const authUsuarios = (authUsersRes.data as unknown as AuthUsuario[]) ?? [];

  type PonderacionRow = {
    ciclo_año: number; calif_ponderada: number;
    w_exp: number; w_form_acad: number; w_cursos: number;
    w_comp: number; w_eal: number; w_picd: number;
  };
  const ponderacionesMap: Record<number, PonderacionRow[]> = {};
  for (const row of ((ponderacionesRes.data as unknown as PonderacionRow[]) ?? [])) {
    if (!ponderacionesMap[row.ciclo_año]) ponderacionesMap[row.ciclo_año] = [];
    ponderacionesMap[row.ciclo_año].push(row);
  }

  // Merge user + colaborador data for individual exceptions panel
  type ColabRow = { id: string; nombre_completo: string | null; puesto: string | null; razon_social: string | null };
  type UserRow = { id: string; rol: string; coach_habilitado: boolean | null; id_empleado: string | null };
  const colabMap = new Map<string, ColabRow>(
    ((colabsRes.data as ColabRow[]) ?? []).map((c) => [c.id, c])
  );
  const usuarios = ((usersRes.data as UserRow[]) ?? []).map((u) => ({
    ...u,
    colab: u.id_empleado ? (colabMap.get(u.id_empleado) ?? null) : null,
  }));

  const colaboradoresAll = (colabsRes.data as ColabRow[]) ?? [];

  type TablaExpRaw = { ciclo_año: number; años: number; nivel_num: number; score: number };
  type TablaMovRaw = { ciclo_año: number; movilidad_floor: number; nivel_num: number; score: number };

  const tablaExpRows = ((tablaExpRes.data as unknown as TablaExpRaw[]) ?? []).map((r) => ({
    ciclo_año: r.ciclo_año,
    fila: r.años,
    nivel_num: r.nivel_num,
    score: r.score,
  }));
  const tablaMovRows = ((tablaMovRes.data as unknown as TablaMovRaw[]) ?? []).map((r) => ({
    ciclo_año: r.ciclo_año,
    fila: r.movilidad_floor,
    nivel_num: r.nivel_num,
    score: r.score,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">Panel de administración · Solo superadmin</p>
      </div>
      <ConfigTabs
        grupos={{ uens: uniqueUens, departamentos: uniqueDepts, areas: uniqueAreas, segmentos: uniqueSegs }}
        reglasAcceso={(reglasRes.data ?? []) as Array<{ id: string; nivel: string; valor: string; habilitado: boolean }>}
        prompts={(promptsRes.data ?? []) as Array<{ id: string; tipo: string; contenido: string; version: number; activo: boolean; created_at: string }>}
        apiConfig={apiRes.data as { modelo: string; max_tokens: number } | null}
        usuarios={usuarios as Array<{ id: string; rol: string; coach_habilitado: boolean | null; id_empleado: string | null; colab: ColabRow | null }>}
        zonasMap={zonasMap}
        availableZonaCycles={availableZonaCycles}
        periodos={periodos}
        authUsuarios={authUsuarios}
        colaboradores={colaboradoresAll}
        ponderacionesMap={ponderacionesMap}
        tablaExp={tablaExpRows}
        tablaMov={tablaMovRows}
      />
    </div>
  );
}
