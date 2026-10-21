import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

const TIPO_LABEL: Record<string, string> = {
  creacion: "Expediente creado",
  sesion:   "Sesión documentada",
  sistema:  "Sistema",
};

const ESTADO_LABEL: Record<string, string> = {
  activo:    "Activo",
  pausado:   "Pausado",
  cerrado:   "Cerrado",
  eliminado: "Eliminado",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("es-MX", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
  } catch { return s; }
}

function autoWidth(ws: XLSX.WorkSheet, rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  ws["!cols"] = headers.map((h) => ({
    wch: Math.min(Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length)) + 2, 80),
  }));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("usuarios_app").select("rol").eq("id", user.id).single();
  const rol = (perfil as any)?.rol ?? "";
  if (rol !== "capital_humano" && rol !== "superadmin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // ── Fetch plans with collaborator + objective info ─────────────────────────

  const { data: planesRaw, error: plErr } = await supabase
    .from("planes_carrera")
    .select(`
      id, colaborador_id, estado, ciclo_año, created_at,
      colaboradores!inner(nombre_completo, puesto, organización),
      planes_carrera_objetivos(id, puesto_nombre, puesto_org, activo, prioridad)
    `)
    .order("created_at", { ascending: false });

  if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 });

  // ── Fetch all notas ────────────────────────────────────────────────────────

  const { data: notasRaw, error: nErr } = await supabase
    .from("planes_carrera_notas")
    .select("*")
    .order("created_at", { ascending: true });

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  // ── Sheet 1: planes summary ────────────────────────────────────────────────

  const planesRows = (planesRaw ?? []).map((p: any) => {
    const colab = p.colaboradores ?? {};
    const objetivos = ((p.planes_carrera_objetivos ?? []) as any[])
      .filter((o) => o.activo)
      .sort((a: any, b: any) => a.prioridad - b.prioridad);
    const principal = objetivos[0];
    return {
      "Plan ID":             p.id,
      "Colaborador ID":      p.colaborador_id,
      "Colaborador":         colab.nombre_completo ?? "",
      "Puesto Actual":       colab.puesto ?? "",
      "UEN / Organización":  colab.organización ?? "",
      "Ciclo":               p.ciclo_año,
      "Estado":              ESTADO_LABEL[p.estado] ?? p.estado,
      "Objetivo Principal":  principal?.puesto_nombre ?? "",
      "Org Objetivo":        principal?.puesto_org ?? "",
      "# Objetivos":         objetivos.length,
      "# Sesiones":          (notasRaw ?? []).filter((n: any) => n.plan_id === p.id && n.tipo === "sesion").length,
      "Creado el":           fmtDate(p.created_at),
    };
  });

  // ── Sheet 2: notas / hilo de entradas ─────────────────────────────────────

  const notasRows = (notasRaw ?? []).map((n: any) => ({
    "Nota ID":                  n.id,
    "Plan ID":                  n.plan_id,
    "Tipo":                     TIPO_LABEL[n.tipo] ?? n.tipo,
    "Autor":                    n.autor_nombre ?? "",
    "Fortalezas":               n.fortalezas ?? "",
    "Áreas de Desarrollo":      n.areas_desarrollo ?? "",
    "Logros / Experiencias":    n.logros_experiencias ?? "",
    "Experiencias Requeridas":  n.experiencias_requeridas ?? "",
    "Observaciones":            n.observaciones ?? "",
    "Editado el":               fmtDate(n.editado_en),
    "Editado por":              n.editado_por_nombre ?? "",
    "Creado el":                fmtDate(n.created_at),
  }));

  const wb = XLSX.utils.book_new();

  if (planesRows.length > 0) {
    const ws1 = XLSX.utils.json_to_sheet(planesRows);
    autoWidth(ws1, planesRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Planes de Carrera");
  }

  if (notasRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(notasRows);
    autoWidth(ws2, notasRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Hilo de Entradas");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="planes_carrera_completo.xlsx"`,
    },
  });
}
