import * as XLSX from "xlsx";

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function autoWidthCols(ws: XLSX.WorkSheet, rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  const colWidths = headers.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(r[h] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 60) };
  });
  ws["!cols"] = colWidths;
}

// ── Matches export ────────────────────────────────────────────────────────────

import type { MatchRow } from "@/app/(protected)/sucesion/MatchingView";

const TIPO_LABEL: Record<string, string> = {
  bidireccional: "Bidireccional",
  aspiracion:    "Aspiración",
  propuesta:     "Propuesta",
  gap_critico:   "Gap Crítico",
  manual:        "Manual",
};

const READINESS_LABEL: Record<string, string> = {
  listo_ahora:    "Inmediato",
  uno_dos_anios:  "Mediano Plazo",
  tres_mas_anios: "Largo Plazo",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("es-MX", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
  } catch { return s; }
}

export function exportMatches(matches: MatchRow[], filename = "matches.xlsx") {
  const rows = matches.map((m) => ({
    "Match ID":              m.id,
    "Ciclo":                 m.ciclo_año,
    "Puesto ID":             m.puesto_catalogo_id,
    "Puesto":                m.puesto_nombre ?? "",
    "UEN / Organización":    m.puesto_org ?? "",
    "Segmento":              m.puesto_area ?? "",
    "Área Catálogo":         m.puesto_catalogo_area ?? "",
    "Es Crítico":            m.es_puesto_critico ? "Sí" : "No",
    "Tipo Match":            TIPO_LABEL[m.tipo_match] ?? m.tipo_match,
    "Colaborador ID":        m.colaborador_id ?? "",
    "ID Empleado":           m.colaborador_id_empleado ?? "",
    "Colaborador":           m.colaborador_nombre ?? "",
    "Área Colaborador":      m.colaborador_area ?? "",
    "Org Colaborador":       m.colaborador_org ?? "",
    "Titulares":             (m.titular_nombres ?? []).map((t) => t.nombre + (t.baja ? " [Baja]" : "")).join("; "),
    "Readiness":             m.readiness ? (READINESS_LABEL[m.readiness] ?? m.readiness) : "",
    "Validado":              m.validado_ch === true ? "Sí" : m.validado_ch === false ? "No" : "Pendiente",
    "Validado Por":          m.validado_por_nombre ?? "",
    "Fecha Validación":      fmtDate(m.fecha_validacion),
    "Descartado":            m.descartado ? "Sí" : "No",
    "Descartado Por":        m.descartado_por_nombre ?? "",
    "Fecha Descarte":        fmtDate(m.fecha_descarte),
    "Motivo Descarte":       m.motivo_descarte ?? "",
    "Plan Carrera Estado":   m.plan_estado ?? "",
    "Creado el":             fmtDate(m.created_at),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  autoWidthCols(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Matches");
  downloadWorkbook(wb, filename);
}

// ── Cobertura / Cartas de Reemplazo export ────────────────────────────────────

import type { PuestoCoberturaItem } from "@/app/(protected)/sucesion/CoberturaView";

const RIESGO_LABEL: Record<string, string> = {
  sin_sucesor: "Sin sucesor",
  tres_mas:    "3+ años",
  listo:       "Con sucesor",
  vacante:     "Vacante",
};

function getRiesgoLabel(p: PuestoCoberturaItem): string {
  const hasCoverage = p.sucesores.length > 0 || p.matchesValidados.length > 0;
  if (p.titulares.length === 0 && !hasCoverage) return RIESGO_LABEL.vacante;
  if (!hasCoverage) return RIESGO_LABEL.sin_sucesor;
  const readinessValues = [
    ...p.sucesores.map((s) => s.readiness ?? s.tiempo_estimado ?? ""),
    ...p.matchesValidados.map((m) => m.readiness ?? ""),
  ];
  if (readinessValues.some((r) => r === "listo_ahora" || r === "uno_dos_anios")) return RIESGO_LABEL.listo;
  return RIESGO_LABEL.tres_mas;
}

export function exportCobertura(puestos: PuestoCoberturaItem[], ciclo: number | "todos", filename = "cobertura.xlsx") {
  // One row per puesto×sucesor (or one row if no sucesores)
  const rows: Record<string, unknown>[] = [];

  for (const p of puestos) {
    const base = {
      "Puesto ID":             p.id,
      "Clave":                 p.clave ?? "",
      "Puesto":                p.nombre,
      "UEN / Organización":    p.organización ?? "",
      "Área":                  p.area ?? "",
      "Segmento":              p.segmento_organizacional ?? "",
      "Tipo Vacante":          p.tipo_vacante ?? "",
      "Es Crítico":            p.es_critico ? "Sí" : "No",
      "Riesgo Cobertura":      getRiesgoLabel(p),
      "# Titulares":           p.titulares.length,
      "Titulares IDs":         p.titulares.map((t) => t.id).join("; "),
      "Titulares":             p.titulares.map((t) => t.nombre_completo).join("; "),
      "Aspirantes IDs":        p.aspirantes.map((a) => a.colaborador_id).join("; "),
      "Aspirantes":            p.aspirantes.map((a) => a.colaborador_nombre ?? a.colaborador_id).join("; "),
      "Matches Validados IDs": p.matchesValidados.map((m) => m.colaborador_id).join("; "),
      "Matches Validados":     p.matchesValidados.map((m) => `${m.colaborador_nombre ?? m.colaborador_id} (${READINESS_LABEL[m.readiness ?? ""] ?? m.readiness ?? ""})`).join("; "),
    };

    if (p.sucesores.length === 0) {
      rows.push({
        ...base,
        "Sucesor ID":       "",
        "Sucesor Nombre":   "",
        "Titular ID Plan":  "",
        "Titular Plan":     "",
        "Readiness":        "",
        "Tiempo Estimado":  "",
        "Estado Plan":      "",
      });
    } else {
      for (const s of p.sucesores) {
        rows.push({
          ...base,
          "Sucesor ID":       s.sucesor_id ?? "",
          "Sucesor Nombre":   s.sucesor_nombre,
          "Titular ID Plan":  s.titular_id ?? "",
          "Titular Plan":     s.titular_nombre ?? "",
          "Readiness":        s.readiness ? (READINESS_LABEL[s.readiness] ?? s.readiness) : "",
          "Tiempo Estimado":  s.tiempo_estimado ?? "",
          "Estado Plan":      s.estado,
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  autoWidthCols(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cobertura");
  downloadWorkbook(wb, filename);
}

// ── Plan Carrera list export ──────────────────────────────────────────────────

export type PlanListRow = {
  id: string;
  colaborador_id: string;
  estado: string;
  ciclo_año: number;
  created_at: string;
  colaborador_nombre: string;
  colaborador_puesto: string;
  colaborador_org: string;
  objetivo_principal: string | null;
  objetivo_org: string | null;
  objetivos_count: number;
  sesiones_count: number;
};

const PLAN_ESTADO_LABEL: Record<string, string> = {
  activo:    "Activo",
  pausado:   "Pausado",
  cerrado:   "Cerrado",
  eliminado: "Eliminado",
};

export function exportPlanesCarrera(planes: PlanListRow[], filename = "planes_carrera.xlsx") {
  const rows = planes.map((p) => ({
    "Plan ID":              p.id,
    "Colaborador ID":       p.colaborador_id,
    "Colaborador":          p.colaborador_nombre,
    "Puesto Actual":        p.colaborador_puesto,
    "UEN / Organización":   p.colaborador_org,
    "Ciclo":                p.ciclo_año,
    "Estado":               PLAN_ESTADO_LABEL[p.estado] ?? p.estado,
    "Objetivo Principal":   p.objetivo_principal ?? "",
    "Org Objetivo":         p.objetivo_org ?? "",
    "# Objetivos":          p.objetivos_count,
    "# Sesiones":           p.sesiones_count,
    "Creado el":            fmtDate(p.created_at),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  autoWidthCols(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planes de Carrera");
  downloadWorkbook(wb, filename);
}
