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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { data: perfil } = await supabase.from("usuarios_app").select("rol").eq("id", user.id).single();
    const rol = (perfil as any)?.rol ?? "";
    if (rol !== "capital_humano" && rol !== "superadmin") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    // ── Fetch plans ──────────────────────────────────────────────────────────

    const { data: planes, error: plErr } = await supabase
      .from("plan_carrera")
      .select("id, colaborador_id, estado, ciclo_año, created_at")
      .order("created_at", { ascending: false });

    if (plErr) throw plErr;

    // ── Fetch collaborator names ─────────────────────────────────────────────

    const colaboradorIds = [...new Set((planes ?? []).map((p: any) => p.colaborador_id))];
    const { data: colabs } = await supabase
      .from("colaboradores")
      .select("id, nombre_completo, puesto, organización")
      .in("id", colaboradorIds.length > 0 ? colaboradorIds : ["__none__"]);

    const colabMap = Object.fromEntries((colabs ?? []).map((c: any) => [c.id, c]));

    // ── Fetch objetivos ──────────────────────────────────────────────────────

    const planIds = (planes ?? []).map((p: any) => p.id);
    const { data: objetivos } = await supabase
      .from("plan_carrera_objetivos")
      .select("id, plan_id, puesto_nombre, puesto_org, activo, prioridad")
      .in("plan_id", planIds.length > 0 ? planIds : ["__none__"])
      .eq("activo", true)
      .order("prioridad");

    const objetivosByPlan: Record<string, any[]> = {};
    for (const o of (objetivos ?? [])) {
      const pid = (o as any).plan_id;
      if (!objetivosByPlan[pid]) objetivosByPlan[pid] = [];
      objetivosByPlan[pid].push(o);
    }

    // ── Fetch all notas ──────────────────────────────────────────────────────

    const { data: notas, error: nErr } = await supabase
      .from("plan_carrera_notas")
      .select("*")
      .order("created_at", { ascending: true });

    if (nErr) throw nErr;

    const notasByPlan: Record<string, any[]> = {};
    for (const n of (notas ?? [])) {
      const pid = (n as any).plan_id;
      if (!notasByPlan[pid]) notasByPlan[pid] = [];
      notasByPlan[pid].push(n);
    }

    // ── Sheet 1: planes summary ──────────────────────────────────────────────

    const planesRows = (planes ?? []).map((p: any) => {
      const colab = colabMap[p.colaborador_id] ?? {};
      const objs = objetivosByPlan[p.id] ?? [];
      const principal = objs[0];
      const sesionesCount = (notasByPlan[p.id] ?? []).filter((n: any) => n.tipo === "sesion").length;
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
        "# Objetivos":         objs.length,
        "# Sesiones":          sesionesCount,
        "Creado el":           fmtDate(p.created_at),
      };
    });

    // ── Sheet 2: notas / hilo de entradas ────────────────────────────────────

    const notasRows = (notas ?? []).map((n: any) => ({
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

    const ws1 = XLSX.utils.json_to_sheet(planesRows.length > 0 ? planesRows : [{ "Sin datos": "" }]);
    if (planesRows.length > 0) autoWidth(ws1, planesRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Planes de Carrera");

    const ws2 = XLSX.utils.json_to_sheet(notasRows.length > 0 ? notasRows : [{ "Sin datos": "" }]);
    if (notasRows.length > 0) autoWidth(ws2, notasRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Hilo de Entradas");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="planes_carrera_completo.xlsx"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
