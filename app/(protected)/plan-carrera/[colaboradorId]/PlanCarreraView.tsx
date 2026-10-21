"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import Link from "next/link";
import type { PlanCarreraFull, PlanCarreraObjetivo } from "@/app/actions/plan_carrera";
import { agregarObjetivo, actualizarPrioridadObjetivo, desactivarObjetivo, crearPlanCarrera } from "@/app/actions/plan_carrera";
import { crearPuestoCatalogoTemporal } from "@/app/actions/catalogo-puestos";
import type { PlanCarreraNota } from "@/app/actions/plan_carrera_notas";
import { agregarNota, editarNota } from "@/app/actions/plan_carrera_notas";
import { getFotoUrl } from "@/lib/foto-empleado";

type ColabInfo = {
  id: string;
  id_empleado: string | null;
  nombre_completo: string;
  puesto: string;
  nivel: string;
  area: string;
  organización: string;
  departamento: string | null;
  segmento_organizacional: string | null;
  razon_social: string | null;
  fecha_antiguedad: string | null;
};

type CatalogItem = {
  id: string;
  nombre: string;
  org: string;
  es_critico: boolean;
};

const SECCIONES = [
  { key: "fortalezas",              label: "Fortalezas observadas y por consolidar",          placeholder: "Describe las fortalezas que se identificaron en la conversación…" },
  { key: "areas_desarrollo",        label: "Áreas de desarrollo / comportamientos esperados", placeholder: "Comportamientos, habilidades o competencias a desarrollar…" },
  { key: "logros_experiencias",     label: "Logros o experiencias observadas",                placeholder: "Logros relevantes o experiencias que destacaron…" },
  { key: "experiencias_requeridas", label: "Experiencias requeridas o sugeridas",              placeholder: "Qué tipo de experiencias recomienda el director o CH para este rol…" },
  { key: "observaciones",           label: "Observaciones generales / Compromiso del Director de área", placeholder: "Cualquier comentario adicional, contexto o acuerdo…" },
] as const;

type SeccionKey = (typeof SECCIONES)[number]["key"];

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── PDF export ────────────────────────────────────────────────────────────────

const SECCIONES_LABELS: Record<string, string> = {
  fortalezas:              "Fortalezas observadas y por consolidar",
  areas_desarrollo:        "Áreas de desarrollo / comportamientos esperados",
  logros_experiencias:     "Logros o experiencias observadas",
  experiencias_requeridas: "Experiencias requeridas o sugeridas",
  observaciones:           "Observaciones generales / Compromiso del Director de área",
};

function buildPdfHtml(colab: ColabInfo, plan: PlanCarreraFull, notas: PlanCarreraNota[], objetivos: PlanCarreraObjetivo[]): string {
  const antiguedad = colab.fecha_antiguedad
    ? Math.floor((Date.now() - new Date(colab.fecha_antiguedad).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const fotoUrl = getFotoUrl(colab.id_empleado);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const notasHtml = notas.map((n) => {
    const secciones = (["fortalezas", "areas_desarrollo", "logros_experiencias", "experiencias_requeridas", "observaciones"] as const)
      .filter((k) => n[k])
      .map((k) => `
        <div style="margin-bottom:12px">
          <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 4px">${SECCIONES_LABELS[k]}</p>
          <div style="font-size:11px;color:#1e293b;white-space:pre-wrap;line-height:1.6">${n[k]!.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
        </div>`).join("");

    const tipo = n.tipo === "creacion" ? "Expediente creado" : n.tipo === "sesion" ? "Sesión documentada" : "Sistema";
    const dot  = n.tipo === "creacion" ? "#94a3b8" : n.tipo === "sesion" ? "#22c55e" : "#e2e8f0";

    return `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:14px;break-inside:avoid">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:9px;height:9px;border-radius:50%;background:${dot};flex-shrink:0"></div>
            <span style="font-size:11px;font-weight:600;color:#334155">${tipo}</span>
            <span style="font-size:10px;color:#94a3b8">${fmtDate(n.created_at)}</span>
          </div>
          ${n.autor_nombre ? `<span style="font-size:10px;color:#64748b">${n.autor_nombre}</span>` : ""}
        </div>
        ${secciones || `<p style="font-size:11px;color:#94a3b8;font-style:italic">Sin contenido registrado</p>`}
      </div>`;
  }).join("");

  const objetivosHtml = objetivos.length === 0 ? "" : `
    <div style="margin-bottom:20px">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 8px">Posiciones Objetivo</p>
      ${objetivos.map((o, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${i===0?"#eff6ff":"#f8fafc"};border:1px solid ${i===0?"#bfdbfe":"#e2e8f0"};border-radius:8px;margin-bottom:6px">
          <span style="width:18px;height:18px;border-radius:50%;background:${i===0?"#1a3a5c":"#e2e8f0"};color:${i===0?"#fff":"#64748b"};font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
          <span style="font-size:11px;color:#1e293b;font-weight:500">${o.puesto_nombre ?? "—"}</span>
          ${o.puesto_org ? `<span style="font-size:10px;color:#64748b">· ${o.puesto_org}</span>` : ""}
          ${i===0?`<span style="font-size:9px;color:#2563eb;background:#dbeafe;padding:1px 6px;border-radius:99px;margin-left:auto">Principal</span>`:""}
        </div>`).join("")}
    </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Expediente — ${colab.nombre_completo}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; color: #1e293b; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="no-print" style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 20px;display:flex;align-items:center;justify-content:space-between">
  <span style="font-size:12px;color:#64748b">Vista previa del expediente — usa Ctrl+P / ⌘P para imprimir o guardar como PDF</span>
  <button onclick="window.print()" style="background:#1a3a5c;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer">Imprimir / Guardar PDF</button>
</div>

<div style="max-width:700px;margin:0 auto;padding:20px 0">

  <!-- Header card -->
  <div style="display:flex;align-items:flex-start;gap:16px;padding:20px;background:#1a3a5c;border-radius:12px;margin-bottom:20px;color:#fff">
    ${fotoUrl ? `<img src="${fotoUrl}" style="width:70px;height:70px;border-radius:10px;object-fit:cover;object-position:top;flex-shrink:0;border:2px solid rgba(255,255,255,.2)" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div style="display:none;width:70px;height:70px;border-radius:10px;background:rgba(255,255,255,.15);align-items:center;justify-content:center;flex-shrink:0;font-size:26px;font-weight:700;color:#fff">${colab.nombre_completo.charAt(0)}</div>` :
    `<div style="width:70px;height:70px;border-radius:10px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:26px;font-weight:700;color:#fff">${colab.nombre_completo.charAt(0)}</div>`}
    <div style="flex:1;min-width:0">
      <p style="font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);margin:0 0 4px">Expediente de Talento</p>
      <h1 style="font-size:18px;font-weight:700;margin:0 0 4px;line-height:1.2">${colab.nombre_completo}</h1>
      <p style="font-size:12px;color:rgba(255,255,255,.75);margin:0 0 10px">${colab.puesto}${colab.nivel ? " · " + colab.nivel : ""}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${[
          ["UEN", colab.organización],
          ["Área", colab.area],
          ["Depto.", colab.departamento],
          ["Segmento", colab.segmento_organizacional],
          ["Razón Social", colab.razon_social],
          ["Antigüedad", antiguedad !== null ? antiguedad + " año" + (antiguedad !== 1 ? "s" : "") : null],
          ["Ciclo Plan", String(plan.ciclo_año)],
          ["Estado Plan", plan.estado],
        ].filter(([, v]) => v).map(([l, v]) => `<span style="font-size:9px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:2px 8px;color:rgba(255,255,255,.85)"><span style="color:rgba(255,255,255,.5)">${l}: </span>${v}</span>`).join("")}
      </div>
    </div>
  </div>

  ${objetivosHtml}

  <!-- Hilo de entradas -->
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0">Hilo de entradas</p>
      <span style="font-size:10px;color:#94a3b8">${notas.length} ${notas.length === 1 ? "entrada" : "entradas"}</span>
    </div>
    ${notasHtml || `<p style="font-size:12px;color:#94a3b8;text-align:center;padding:20px">Sin entradas registradas</p>`}
  </div>

  <p style="font-size:9px;color:#cbd5e1;text-align:right;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:10px">Generado el ${new Date().toLocaleDateString("es-MX", { day:"numeric", month:"long", year:"numeric" })} · GP Talent Platform</p>
</div>
</body>
</html>`;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PlanCarreraView({
  colab,
  plan: initialPlan,
  notas: initialNotas,
  catalogo,
  matchPendiente,
}: {
  colab: ColabInfo;
  plan: PlanCarreraFull | null;
  notas: PlanCarreraNota[];
  catalogo: CatalogItem[];
  matchPendiente?: { id: string; puesto_catalogo_id: string; ciclo_año: number } | null;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [notas, setNotas] = useState<PlanCarreraNota[]>(initialNotas);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function showFlash(msg: string, ok = true) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  }

  const activeObjetivos = (plan?.objetivos ?? [])
    .filter((o) => o.activo)
    .sort((a, b) => a.prioridad - b.prioridad);

  function handleNotaAdded(nota: PlanCarreraNota) {
    setNotas((prev) => [...prev, nota]);
  }

  function handleNotaEdited(notaId: string, updated: Partial<PlanCarreraNota>) {
    setNotas((prev) => prev.map((n) => n.id === notaId ? { ...n, ...updated } : n));
  }

  function handleDesactivarObjetivo(objetivoId: string) {
    if (activeObjetivos.length <= 1) { showFlash("No puedes eliminar el único objetivo activo", false); return; }
    startTransition(async () => {
      const res = await desactivarObjetivo(objetivoId);
      if (!res.ok) { showFlash(res.error ?? "Error", false); return; }
      setPlan((prev) => prev ? { ...prev, objetivos: prev.objetivos.map((o) => o.id === objetivoId ? { ...o, activo: false } : o) } : prev);
      showFlash("Objetivo removido");
    });
  }

  function handlePrioridadChange(objetivoId: string, delta: -1 | 1) {
    const sorted = [...activeObjetivos];
    const idx = sorted.findIndex((o) => o.id === objetivoId);
    if (idx < 0) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const current = sorted[idx];
    const target = sorted[targetIdx];
    startTransition(async () => {
      await Promise.all([
        actualizarPrioridadObjetivo(current.id, target.prioridad),
        actualizarPrioridadObjetivo(target.id, current.prioridad),
      ]);
      setPlan((prev) => prev ? {
        ...prev,
        objetivos: prev.objetivos.map((o) => {
          if (o.id === current.id) return { ...o, prioridad: target.prioridad };
          if (o.id === target.id)  return { ...o, prioridad: current.prioridad };
          return o;
        }),
      } : prev);
    });
  }

  function handleObjetivoAdded(objetivo: PlanCarreraObjetivo) {
    setPlan((prev) => prev ? { ...prev, objetivos: [...prev.objetivos, objetivo] } : prev);
  }

  function handleExportPdf() {
    if (!plan) return;
    const html = buildPdfHtml(colab, plan, notas, activeObjetivos);
    const win = window.open("", "_blank");
    if (!win) { showFlash("El navegador bloqueó la ventana emergente. Permite ventanas emergentes e inténtalo de nuevo.", false); return; }
    win.document.write(html);
    win.document.close();
  }

  // ── No plan ────────────────────────────────────────────────────────────────

  if (!plan) {
    function handleCrearExpediente() {
      if (!matchPendiente) return;
      startTransition(async () => {
        const res = await crearPlanCarrera({
          colaboradorId: colab.id,
          matchId: matchPendiente.id,
          puestoCatalogoId: matchPendiente.puesto_catalogo_id,
          cicloAño: matchPendiente.ciclo_año,
          snapshot: { puesto: colab.puesto, area: colab.area, organización: colab.organización, fecha_validacion: new Date().toISOString() },
        });
        if (res.ok) {
          // Reload to show the new plan
          window.location.reload();
        } else {
          setFlash({ msg: `Error: ${res.error}`, ok: false });
        }
      });
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          {flash && (
            <div className={`text-sm border rounded-lg px-4 py-2 ${flash.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {flash.msg}
            </div>
          )}
          <div className="text-5xl">📋</div>
          <h1 className="text-xl font-bold text-gray-900">Sin Expediente de Talento</h1>
          <p className="text-sm text-gray-500">
            {colab.nombre_completo} no tiene un expediente aún.
            {matchPendiente ? " Se detectó un match validado — puedes crear el expediente ahora." : " Se genera automáticamente al validar un match de sucesión."}
          </p>
          {matchPendiente ? (
            <button
              onClick={handleCrearExpediente}
              disabled={isPending}
              className="px-5 py-2 text-sm font-semibold bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
            >
              {isPending ? "Creando expediente…" : "Crear expediente"}
            </button>
          ) : null}
          <Link href="/sucesion" className="block text-sm font-medium text-[#1a3a5c] hover:underline">
            ← Ir al Motor de Matching
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {flash && (
        <div className={`fixed top-4 right-4 z-50 text-sm px-4 py-2.5 rounded-lg shadow-lg border font-medium ${
          flash.ok ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"
        }`}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a3a5c] text-white">
        <div className="relative px-6 py-8 md:px-10"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "32px 32px",
          }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-5 text-xs text-white/50">
              <Link href="/sucesion" className="hover:text-white/80 transition-colors">Motor de Matching</Link>
              <span>/</span>
              <Link href="/plan-carrera" className="hover:text-white/80 transition-colors">Expedientes</Link>
              <span>/</span>
              <span className="text-white/70">{colab.nombre_completo}</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Expediente de Talento</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{colab.nombre_completo}</h1>
                <p className="text-white/70 text-sm mt-1">{colab.puesto} · {colab.nivel} · {colab.organización}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    { label: "Área", value: colab.area },
                    { label: "Ciclo", value: String(plan.ciclo_año) },
                    { label: "Entradas", value: String(notas.length) },
                  ].map(({ label, value }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/20 text-white/80">
                      <span className="text-white/50">{label}:</span>
                      <span className="font-medium text-white">{value || "—"}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 md:pt-1">
                <button
                  onClick={handleExportPdf}
                  className="text-xs bg-white/10 border border-white/20 text-white hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                >
                  <span>↓</span> Exportar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Posiciones objetivo */}
        <ObjetivosSection
          objetivos={activeObjetivos}
          planId={plan.id}
          catalogo={catalogo}
          isPending={isPending}
          onPrioridad={handlePrioridadChange}
          onDesactivar={handleDesactivarObjetivo}
          onAdded={handleObjetivoAdded}
          onFlash={showFlash}
        />

        {/* Hilo de notas */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Hilo de entradas</h2>
            <span className="text-xs text-gray-400">{notas.length} entrada{notas.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-4">
            {notas.map((nota) => (
              <NotaCard
                key={nota.id}
                nota={nota}
                onEdited={handleNotaEdited}
                onFlash={showFlash}
              />
            ))}

            {/* Nueva entrada */}
            <NuevaNotaForm
              planId={plan.id}
              onAdded={handleNotaAdded}
              onFlash={showFlash}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NotaCard ───────────────────────────────────────────────────────────────

function NotaCard({
  nota,
  onEdited,
  onFlash,
}: {
  nota: PlanCarreraNota;
  onEdited: (id: string, updated: Partial<PlanCarreraNota>) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<SeccionKey, string>>({
    fortalezas:              nota.fortalezas ?? "",
    areas_desarrollo:        nota.areas_desarrollo ?? "",
    logros_experiencias:     nota.logros_experiencias ?? "",
    experiencias_requeridas: nota.experiencias_requeridas ?? "",
    observaciones:           nota.observaciones ?? "",
  });
  const [isPending, startTransition] = useTransition();

  const isCreacion = nota.tipo === "creacion";
  const isSistema  = nota.tipo === "sistema";

  function handleSave() {
    startTransition(async () => {
      const res = await editarNota(nota.id, {
        fortalezas:              form.fortalezas || null,
        areas_desarrollo:        form.areas_desarrollo || null,
        logros_experiencias:     form.logros_experiencias || null,
        experiencias_requeridas: form.experiencias_requeridas || null,
        observaciones:           form.observaciones || null,
      });
      if (!res.ok) { onFlash(res.error ?? "Error al guardar", false); return; }
      onEdited(nota.id, {
        ...form,
        fortalezas:              form.fortalezas || null,
        areas_desarrollo:        form.areas_desarrollo || null,
        logros_experiencias:     form.logros_experiencias || null,
        experiencias_requeridas: form.experiencias_requeridas || null,
        observaciones:           form.observaciones || null,
        editado_en:              new Date().toISOString(),
      });
      setEditing(false);
      onFlash("Entrada actualizada");
    });
  }

  const seccionesConContenido = SECCIONES.filter((s) => nota[s.key]);

  // Sistema entries: just show the observaciones line, no edit
  if (isSistema) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-500">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
        <span className="flex-1">{nota.observaciones}</span>
        <span className="text-gray-300 flex-shrink-0">{formatFecha(nota.created_at)}</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isCreacion ? "border-[#1a3a5c]/20" : "border-gray-200"}`}>
      {/* Card header */}
      <div className={`px-5 py-3 flex items-center justify-between ${isCreacion ? "bg-[#1a3a5c]/5" : "bg-gray-50"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isCreacion ? "bg-[#1a3a5c]" : "bg-emerald-500"}`} />
          <div>
            <span className="text-xs font-semibold text-gray-700">
              {isCreacion ? "Expediente creado" : "Sesión documentada"}
            </span>
            <span className="text-xs text-gray-400 ml-2">{formatFecha(nota.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {nota.autor_nombre && (
            <span className="text-xs text-gray-400">{nota.autor_nombre}</span>
          )}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-[#1a3a5c] transition-colors"
            >
              Editar
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4">
        {editing ? (
          /* ── Edit mode ── */
          <div className="space-y-4">
            {SECCIONES.map((s) => (
              <div key={s.key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {s.label}
                </label>
                <textarea
                  rows={3}
                  value={form[s.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  placeholder={s.placeholder}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none leading-relaxed"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
              >
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm({
                    fortalezas:              nota.fortalezas ?? "",
                    areas_desarrollo:        nota.areas_desarrollo ?? "",
                    logros_experiencias:     nota.logros_experiencias ?? "",
                    experiencias_requeridas: nota.experiencias_requeridas ?? "",
                    observaciones:           nota.observaciones ?? "",
                  });
                }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <div className="space-y-4">
            {seccionesConContenido.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {isCreacion ? nota.observaciones : "Sin contenido registrado."}
              </p>
            ) : (
              seccionesConContenido.map((s) => (
                <div key={s.key}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{nota[s.key]}</p>
                </div>
              ))
            )}

            {nota.editado_en && (
              <p className="text-[10px] text-gray-300 pt-2 border-t border-gray-50">
                Editado el {formatFecha(nota.editado_en)}{nota.editado_por_nombre ? ` por ${nota.editado_por_nombre}` : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NuevaNotaForm ──────────────────────────────────────────────────────────

function NuevaNotaForm({
  planId,
  onAdded,
  onFlash,
}: {
  planId: string;
  onAdded: (nota: PlanCarreraNota) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<SeccionKey, string>>({
    fortalezas: "", areas_desarrollo: "", logros_experiencias: "",
    experiencias_requeridas: "", observaciones: "",
  });
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const hasContent = Object.values(form).some((v) => v.trim());
    if (!hasContent) { onFlash("Agrega contenido en al menos una sección", false); return; }

    startTransition(async () => {
      const res = await agregarNota({
        planId,
        fortalezas:              form.fortalezas || null,
        areas_desarrollo:        form.areas_desarrollo || null,
        logros_experiencias:     form.logros_experiencias || null,
        experiencias_requeridas: form.experiencias_requeridas || null,
        observaciones:           form.observaciones || null,
      });
      if (!res.ok) { onFlash(res.error ?? "Error al guardar", false); return; }
      if (res.data) onAdded(res.data);
      setForm({ fortalezas: "", areas_desarrollo: "", logros_experiencias: "", experiencias_requeridas: "", observaciones: "" });
      setOpen(false);
      onFlash("Entrada agregada al expediente");
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1a3a5c]/30 hover:text-[#1a3a5c] transition-colors"
      >
        + Documentar nueva sesión
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#1a3a5c]/20 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-[#1a3a5c]/5 border-b border-[#1a3a5c]/10">
        <p className="text-sm font-semibold text-[#1a3a5c]">Nueva entrada — Sesión documentada</p>
        <p className="text-xs text-gray-500 mt-0.5">Llena las secciones que apliquen. No es necesario completar todas.</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {SECCIONES.map((s) => (
          <div key={s.key}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {s.label}
            </label>
            <textarea
              rows={3}
              value={form[s.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={s.placeholder}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none leading-relaxed"
            />
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar entrada"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ObjetivosSection ───────────────────────────────────────────────────────

function ObjetivosSection({
  objetivos,
  planId,
  catalogo,
  isPending,
  onPrioridad,
  onDesactivar,
  onAdded,
  onFlash,
}: {
  objetivos: PlanCarreraObjetivo[];
  planId: string;
  catalogo: CatalogItem[];
  isPending: boolean;
  onPrioridad: (id: string, delta: -1 | 1) => void;
  onDesactivar: (id: string) => void;
  onAdded: (o: PlanCarreraObjetivo) => void;
  onFlash: (msg: string, ok?: boolean) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPuesto, setSelectedPuesto] = useState<{ id: string; nombre: string; org: string } | null>(null);
  const [notas, setNotas] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newEsCritico, setNewEsCritico] = useState(false);
  const [isPendingLocal, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const existingIds = new Set(objetivos.map((o) => o.puesto_catalogo_id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = catalogo.filter((c) => !existingIds.has(c.id));
    if (!q) return available;
    return available.filter(
      (c) => c.nombre.toLowerCase().includes(q) || c.org.toLowerCase().includes(q)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, catalogo, objetivos]);

  const exactMatch = useMemo(
    () => catalogo.some((c) => c.nombre.toLowerCase() === query.trim().toLowerCase()),
    [query, catalogo]
  );
  const showCreateOption = query.trim().length >= 2 && !exactMatch;

  function handleSelectPuesto(c: CatalogItem) {
    setSelectedPuesto({ id: c.id, nombre: c.nombre, org: c.org });
    setQuery(c.nombre + (c.org ? ` — ${c.org}` : ""));
    setShowDropdown(false);
  }

  function handleStartCreate() {
    setNewNombre(query.trim().toUpperCase());
    setShowCreateForm(true);
    setShowDropdown(false);
  }

  function handleAgregarObjetivo() {
    if (!selectedPuesto) return;
    startTransition(async () => {
      const res = await agregarObjetivo({ planId, puestoCatalogoId: selectedPuesto.id, notas: notas.trim() || null });
      if (!res.ok) { onFlash(res.error ?? "Error", false); return; }
      window.location.reload();
    });
  }

  function handleCrearYAgregar() {
    if (!newNombre.trim()) return;
    startTransition(async () => {
      const createRes = await crearPuestoCatalogoTemporal({
        nombre: newNombre,
        organización: newOrg || null,
        area: newArea || null,
        departamento: newDept || null,
        es_critico: newEsCritico,
      });
      if (!createRes.ok || !createRes.id) {
        onFlash(createRes.error ?? "Error al crear puesto", false);
        return;
      }
      const addRes = await agregarObjetivo({ planId, puestoCatalogoId: createRes.id, notas: notas.trim() || null });
      if (!addRes.ok) { onFlash(addRes.error ?? "Error al agregar objetivo", false); return; }
      window.location.reload();
    });
  }

  function resetAdd() {
    setShowAdd(false);
    setQuery("");
    setSelectedPuesto(null);
    setShowDropdown(false);
    setNotas("");
    setShowCreateForm(false);
    setNewNombre("");
    setNewOrg("");
    setNewArea("");
    setNewDept("");
    setNewEsCritico(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Posiciones objetivo</p>
          <p className="text-xs text-gray-400 mt-0.5">Prioridad 1 = objetivo principal</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] transition-colors"
        >
          + Agregar alternativa
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {objetivos.map((obj, idx) => (
          <div key={obj.id} className="flex items-center gap-3 px-5 py-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              idx === 0 ? "bg-[#1a3a5c] text-white" : "bg-gray-100 text-gray-500"
            }`}>
              {obj.prioridad}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{obj.puesto_nombre ?? obj.puesto_catalogo_id}</p>
              {obj.puesto_org && <p className="text-xs text-gray-400">{obj.puesto_org}</p>}
              {obj.notas && <p className="text-xs text-gray-500 italic mt-0.5">{obj.notas}</p>}
            </div>
            {idx === 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a3a5c]/10 text-[#1a3a5c] font-medium flex-shrink-0">
                Principal
              </span>
            )}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button onClick={() => onPrioridad(obj.id, -1)} disabled={idx === 0 || isPending}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none">▲</button>
              <button onClick={() => onPrioridad(obj.id, 1)} disabled={idx === objetivos.length - 1 || isPending}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors leading-none">▼</button>
            </div>
            <button onClick={() => onDesactivar(obj.id)} disabled={isPending}
              className="text-gray-200 hover:text-red-400 disabled:opacity-20 transition-colors flex-shrink-0 text-xs"
              title="Remover objetivo">✕</button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/60 space-y-3">
          {!showCreateForm ? (
            <>
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  placeholder="Buscar puesto en catálogo..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedPuesto(null); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
                />
                {showDropdown && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filtered.slice(0, 30).map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={() => handleSelectPuesto(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-900">{c.nombre}</span>
                        {c.org && <span className="text-gray-400 ml-1 text-xs">— {c.org}</span>}
                      </button>
                    ))}
                    {showCreateOption && (
                      <button
                        onMouseDown={handleStartCreate}
                        className="w-full text-left px-3 py-2 text-sm text-[#1a3a5c] font-medium hover:bg-blue-50 transition-colors border-t border-gray-100"
                      >
                        + Crear nuevo puesto: <span className="italic">&ldquo;{query.trim()}&rdquo;</span>
                      </button>
                    )}
                    {filtered.length === 0 && !showCreateOption && (
                      <div className="px-3 py-2 text-sm text-gray-400">Sin resultados</div>
                    )}
                  </div>
                )}
              </div>
              <input type="text" placeholder="Notas / justificación (opcional)" value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <div className="flex gap-2">
                <button onClick={handleAgregarObjetivo} disabled={!selectedPuesto || isPendingLocal}
                  className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors">
                  {isPendingLocal ? "Agregando…" : "Agregar objetivo"}
                </button>
                <button onClick={resetAdd}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-[#1a3a5c] uppercase tracking-wide">Nuevo puesto</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Temporal</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                  <input type="text" value={newNombre} onChange={(e) => setNewNombre(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Organización / UEN</label>
                  <input type="text" value={newOrg} onChange={(e) => setNewOrg(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Área</label>
                  <input type="text" value={newArea} onChange={(e) => setNewArea(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Departamento</label>
                  <input type="text" value={newDept} onChange={(e) => setNewDept(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={newEsCritico} onChange={(e) => setNewEsCritico(e.target.checked)}
                  className="rounded border-gray-300 text-[#1a3a5c] focus:ring-[#1a3a5c]" />
                ¿Es puesto crítico?
              </label>
              <input type="text" placeholder="Notas / justificación (opcional)" value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <div className="flex gap-2 flex-wrap">
                <button onClick={handleCrearYAgregar} disabled={!newNombre.trim() || isPendingLocal}
                  className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors">
                  {isPendingLocal ? "Creando…" : "Crear y agregar"}
                </button>
                <button onClick={() => setShowCreateForm(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors">
                  ← Volver
                </button>
                <button onClick={resetAdd}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
