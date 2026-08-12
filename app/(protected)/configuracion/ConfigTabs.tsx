"use client";

import { useState, useTransition } from "react";
import {
  guardarReglaGrupo,
  aplicarReglaGrupo,
  toggleCoachIndividual,
  guardarPrompt,
  activarVersionPrompt,
  actualizarConfigApi,
  recalcularTodosLosCiclos,
} from "@/app/actions/configuracion";
import { saveZonaBandsArray, copyZonaBandsFromCycle } from "@/app/actions/zonas";
import { upsertPeriodo, setPeriodoActivo, deletePeriodo } from "@/app/actions/periodos";
import { savePonderaciones, type PonderacionInput } from "@/app/actions/ponderaciones";
import type { ZonaBand, Periodo } from "@/lib/types";
import ZoneBoundaryEditor from "./ZoneBoundaryEditor";
import UsuariosTab, { type AuthUsuario } from "./UsuariosTab";
import TablasEipTab, { type TablasEipRow } from "./TablasEipTab";

type Regla = { id: string; nivel: string; valor: string; habilitado: boolean };
type Prompt = { id: string; tipo: string; contenido: string; version: number; activo: boolean; created_at: string };
type ColabRow = { id: string; nombre_completo: string | null; puesto: string | null; razon_social: string | null };
type PonderacionRow = {
  ciclo_año: number; calif_ponderada: number;
  w_exp: number; w_form_acad: number; w_cursos: number;
  w_comp: number; w_eal: number; w_picd: number;
};
type Usuario = { id: string; rol: string; coach_habilitado: boolean | null; id_empleado: string | null; colab: ColabRow | null };
export type { AuthUsuario };

const PROMPT_TIPOS = [
  { key: "coach_colaborador",          label: "Colaborador",          desc: "Para usuarios con rol colaborador" },
  { key: "coach_jefe",                 label: "Jefe",                 desc: "Para usuarios con rol jefe" },
  { key: "coach_admin",                label: "Admin / Capital Humano", desc: "Para capital_humano y superadmin" },
  { key: "plano_carrera_sugerencias",  label: "Plano de Carrera — Sugerencias IA", desc: "Genera acciones de desarrollo por dimensión. Variables: {{dimension}}, {{snapshot}}, {{puesto_objetivo}}, {{brecha}}" },
];

const GRUPO_LABELS: Record<string, string> = {
  razon_social:             "UEN (Razón social)",
  departamento:             "Departamento",
  area:                     "Área",
  segmento_organizacional:  "Segmento organizacional",
};

export default function ConfigTabs({
  grupos,
  reglasAcceso,
  prompts,
  apiConfig,
  usuarios,
  zonasMap,
  availableZonaCycles,
  periodos,
  authUsuarios,
  colaboradores,
  ponderacionesMap,
  tablaExp,
  tablaMov,
}: {
  grupos: { uens: string[]; departamentos: string[]; areas: string[]; segmentos: string[] };
  reglasAcceso: Regla[];
  prompts: Prompt[];
  apiConfig: { modelo: string; max_tokens: number } | null;
  usuarios: Usuario[];
  zonasMap: Record<number, ZonaBand[]>;
  availableZonaCycles: number[];
  periodos: Periodo[];
  authUsuarios: AuthUsuario[];
  colaboradores: ColabRow[];
  ponderacionesMap: Record<number, PonderacionRow[]>;
  tablaExp: TablasEipRow[];
  tablaMov: TablasEipRow[];
  sucesionCiclosDisponibles: number[];
}) {
  const [tab, setTab] = useState<"usuarios" | "access" | "prompts" | "api" | "zonas" | "periodos" | "ponderaciones" | "tablas_eip" | "sucesion">("usuarios");

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 flex gap-0 mb-6 overflow-x-auto">
        {[
          { key: "usuarios", label: "Usuarios" },
          { key: "access",   label: "Acceso Coach IA" },
          { key: "prompts",  label: "Prompts" },
          { key: "api",      label: "API / Modelo" },
          { key: "periodos",       label: "Períodos" },
          { key: "zonas",          label: "Zonas EIP" },
          { key: "ponderaciones",  label: "Ponderaciones EIP" },
          { key: "tablas_eip",     label: "Tablas Exp. / Movilidad" },
          { key: "sucesion",       label: "Sucesión" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`text-sm font-medium py-3 px-5 border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? "border-[#1a3a5c] text-[#1a3a5c]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "usuarios" && <UsuariosTab usuarios={authUsuarios} colaboradores={colaboradores} />}
      {tab === "access"   && <CoachAccessTab grupos={grupos} reglasAcceso={reglasAcceso} usuarios={usuarios} />}
      {tab === "prompts"  && <PromptsTab prompts={prompts} />}
      {tab === "api"      && <ApiTab apiConfig={apiConfig} />}
      {tab === "periodos"      && <PeriodosTab periodos={periodos} />}
      {tab === "zonas"         && <ZonasEipTab zonasMap={zonasMap} availableCycles={availableZonaCycles} periodos={periodos} />}
      {tab === "ponderaciones" && <PonderacionesEipTab ponderacionesMap={ponderacionesMap} periodos={periodos} />}
      {tab === "tablas_eip"    && <TablasEipTab tablaExp={tablaExp} tablaMov={tablaMov} periodos={periodos} />}
      {tab === "sucesion"      && <SucesionTab ciclosDisponibles={sucesionCiclosDisponibles} />}
    </div>
  );
}

// ── Coach Access Tab ──────────────────────────────────────────────────────────

function CoachAccessTab({
  grupos,
  reglasAcceso,
  usuarios,
}: {
  grupos: { uens: string[]; departamentos: string[]; areas: string[]; segmentos: string[] };
  reglasAcceso: Regla[];
  usuarios: Usuario[];
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [localReglas, setLocalReglas] = useState<Map<string, boolean>>(
    new Map(reglasAcceso.map((r) => [`${r.nivel}::${r.valor}`, r.habilitado]))
  );
  const [localUsers, setLocalUsers] = useState<Map<string, boolean | null>>(
    new Map(usuarios.map((u) => [u.id, u.coach_habilitado]))
  );
  const [search, setSearch] = useState("");

  const grupos_config = [
    { nivel: "razon_social",            valores: grupos.uens },
    { nivel: "departamento",            valores: grupos.departamentos },
    { nivel: "area",                    valores: grupos.areas },
    { nivel: "segmento_organizacional", valores: grupos.segmentos },
  ];

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }

  function handleGroupToggle(nivel: string, valor: string, checked: boolean) {
    const key = `${nivel}::${valor}`;
    setLocalReglas((prev) => new Map(prev).set(key, checked));
    startTransition(async () => {
      const res = await guardarReglaGrupo(nivel, valor, checked);
      if (res?.error) flash(`Error: ${res.error}`);
    });
  }

  function handleApply(nivel: string, valor: string) {
    const key = `${nivel}::${valor}`;
    const habilitado = localReglas.get(key) ?? false;
    startTransition(async () => {
      const res = await aplicarReglaGrupo(nivel, valor, habilitado);
      if (res?.error) flash(`Error: ${res.error}`);
      else flash(`Aplicado a ${(res as { afectados?: number }).afectados ?? 0} usuario(s)`);
    });
  }

  function handleUserToggle(userId: string, checked: boolean) {
    setLocalUsers((prev) => new Map(prev).set(userId, checked));
    startTransition(async () => {
      const res = await toggleCoachIndividual(userId, checked);
      if (res?.error) flash(`Error: ${res.error}`);
    });
  }

  const filteredUsers = usuarios.filter((u) => {
    if (!search) return true;
    const name = u.colab?.nombre_completo?.toLowerCase() ?? "";
    const puesto = u.colab?.puesto?.toLowerCase() ?? "";
    const s = search.toLowerCase();
    return name.includes(s) || puesto.includes(s);
  });

  return (
    <div className="space-y-8">
      {msg && (
        <div className="text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-4 py-2.5">
          {msg}
        </div>
      )}

      {/* Group rules */}
      {grupos_config.map(({ nivel, valores }) => (
        <div key={nivel} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">{GRUPO_LABELS[nivel]}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Guarda la regla y luego usa "Aplicar" para propagar a todos los usuarios del grupo.
              Las excepciones individuales siempre tienen prioridad.
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {valores.map((valor) => {
              const key = `${nivel}::${valor}`;
              const enabled = localReglas.get(key) ?? false;
              return (
                <div key={valor} className="flex items-center justify-between px-5 py-3 gap-4">
                  <span className="text-sm text-gray-700 flex-1 truncate">{valor}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => handleGroupToggle(nivel, valor, e.target.checked)}
                        disabled={isPending}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#1a3a5c] rounded-full transition-colors peer-disabled:opacity-50" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                    </label>
                    <span className={`text-xs w-16 ${enabled ? "text-green-600" : "text-gray-400"}`}>
                      {enabled ? "Habilitado" : "Deshabilitado"}
                    </span>
                    <button
                      onClick={() => handleApply(nivel, valor)}
                      disabled={isPending}
                      className="text-xs text-[#1a3a5c] font-medium border border-[#1a3a5c] rounded-md px-2.5 py-1 hover:bg-[#1a3a5c] hover:text-white transition-colors disabled:opacity-40"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Individual exceptions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Excepciones individuales</p>
            <p className="text-xs text-gray-400 mt-0.5">Siempre tienen prioridad sobre las reglas de grupo.</p>
          </div>
          <input
            type="text"
            placeholder="Buscar colaborador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] w-48"
          />
        </div>
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {filteredUsers.map((u) => {
            const enabled = localUsers.get(u.id) ?? false;
            return (
              <div key={u.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {u.colab?.nombre_completo ?? u.id}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {u.colab?.puesto ?? "—"} · {u.colab?.razon_social?.trim() ?? "—"}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={!!enabled}
                    onChange={(e) => handleUserToggle(u.id, e.target.checked)}
                    disabled={isPending}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#1a3a5c] rounded-full transition-colors peer-disabled:opacity-50" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Sin resultados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Prompts Tab ───────────────────────────────────────────────────────────────

function PromptsTab({ prompts }: { prompts: Prompt[] }) {
  const [isPending, startTransition] = useTransition();
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [editTexts, setEditTexts] = useState<Record<string, string>>(
    Object.fromEntries(
      PROMPT_TIPOS.map(({ key }) => {
        const active = prompts.find((p) => p.tipo === key && p.activo);
        return [key, active?.contenido ?? ""];
      })
    )
  );
  const [expandHistory, setExpandHistory] = useState<Record<string, boolean>>({});

  function flash(tipo: string, m: string) {
    setMsgs((prev) => ({ ...prev, [tipo]: m }));
    setTimeout(() => setMsgs((prev) => ({ ...prev, [tipo]: "" })), 3500);
  }

  function handleSave(tipo: string) {
    startTransition(async () => {
      const res = await guardarPrompt(tipo, editTexts[tipo]);
      if (res?.error) flash(tipo, `Error: ${res.error}`);
      else flash(tipo, `Guardado como versión ${(res as { version?: number }).version ?? "nueva"}`);
    });
  }

  function handleActivar(id: string, tipo: string) {
    startTransition(async () => {
      const res = await activarVersionPrompt(id, tipo);
      if (res?.error) flash(tipo, `Error: ${res.error}`);
      else {
        const p = prompts.find((x) => x.id === id);
        if (p) setEditTexts((prev) => ({ ...prev, [tipo]: p.contenido }));
        flash(tipo, "Versión restaurada");
      }
    });
  }

  return (
    <div className="space-y-6">
      {PROMPT_TIPOS.map(({ key, label, desc }) => {
        const history = prompts.filter((p) => p.tipo === key).sort((a, b) => b.version - a.version);
        const showHistory = expandHistory[key];

        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              {msgs[key] && (
                <span className="text-xs text-blue-600 font-medium">{msgs[key]}</span>
              )}
            </div>

            <div className="p-5 space-y-4">
              <textarea
                value={editTexts[key]}
                onChange={(e) => setEditTexts((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={10}
                className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-y"
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpandHistory((prev) => ({ ...prev, [key]: !showHistory }))}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showHistory ? "Ocultar historial" : `Ver historial (${history.length} versión${history.length !== 1 ? "es" : ""})`}
                </button>
                <button
                  onClick={() => handleSave(key)}
                  disabled={isPending || !editTexts[key].trim()}
                  className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
                >
                  {isPending ? "Guardando..." : "Guardar nueva versión"}
                </button>
              </div>

              {showHistory && history.length > 0 && (
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {history.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono text-gray-500">v{p.version}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString("es-MX", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </span>
                        {p.activo && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                            Activa
                          </span>
                        )}
                      </div>
                      {!p.activo && (
                        <button
                          onClick={() => handleActivar(p.id, key)}
                          disabled={isPending}
                          className="text-xs text-[#1a3a5c] font-medium hover:underline disabled:opacity-40"
                        >
                          Restaurar esta versión
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── API Tab ───────────────────────────────────────────────────────────────────

const MODELOS_DISPONIBLES = [
  { value: "claude-opus-4-8", label: "Claude Opus 4.8 (Recomendado — máxima calidad)" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Más rápido, menor costo)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Más económico)" },
];

function ApiTab({ apiConfig }: { apiConfig: { modelo: string; max_tokens: number } | null }) {
  const [isPending, startTransition] = useTransition();
  const [modelo, setModelo] = useState(apiConfig?.modelo ?? "claude-opus-4-8");
  const [maxTokens, setMaxTokens] = useState(apiConfig?.max_tokens ?? 1024);
  const [msg, setMsg] = useState<string | null>(null);

  function handleSave() {
    startTransition(async () => {
      const res = await actualizarConfigApi(modelo, maxTokens);
      if (res?.error) setMsg(`Error: ${res.error}`);
      else {
        setMsg("Configuración guardada");
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Modelo de IA</label>
          <select
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            {MODELOS_DISPONIBLES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">
            Cambiar el modelo afecta todas las respuestas del Coach IA en tiempo real.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Tokens máximos por respuesta
          </label>
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            min={256}
            max={4096}
            step={128}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Entre 256 y 4096. Valores más altos permiten respuestas más largas pero consumen más tokens.
          </p>
        </div>

        <div className="pt-1 flex items-center justify-between">
          {msg && <span className="text-sm text-blue-600">{msg}</span>}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="ml-auto text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
          >
            {isPending ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Próximamente</p>
        <p className="text-xs">Soporte para OpenAI (GPT-4o, o3) y otros proveedores estará disponible en una versión futura.</p>
      </div>
    </div>
  );
}

// ── Períodos Tab ──────────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  planificado: "Planificado",
  activo:      "Activo",
  cerrado:     "Cerrado",
};
const ESTADO_COLORS: Record<string, string> = {
  planificado: "bg-gray-100 text-gray-600",
  activo:      "bg-green-100 text-green-700",
  cerrado:     "bg-slate-100 text-slate-500",
};

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function PeriodosTab({ periodos }: { periodos: Periodo[] }) {
  const [rows, setRows]    = useState<Periodo[]>(periodos);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding]   = useState(false);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg]      = useState<{ text: string; ok: boolean } | null>(null);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  const blankRow: Periodo = {
    ciclo_año:    new Date().getFullYear() + 1,
    nombre:       `Ciclo ${new Date().getFullYear() + 1}`,
    fecha_inicio: `${new Date().getFullYear() + 1}-01-01`,
    fecha_fin:    `${new Date().getFullYear() + 1}-12-31`,
    estado:       "planificado",
    activo:       false,
  };
  const [newRow, setNewRow] = useState<Periodo>(blankRow);

  function handleSave(p: Periodo) {
    const fd = new FormData();
    fd.append("ciclo_año",    String(p.ciclo_año));
    fd.append("nombre",       p.nombre);
    fd.append("fecha_inicio", p.fecha_inicio);
    fd.append("fecha_fin",    p.fecha_fin);
    fd.append("estado",       p.estado);
    fd.append("activo",       String(p.activo));
    startTransition(async () => {
      try {
        await upsertPeriodo(fd);
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.ciclo_año === p.ciclo_año);
          return idx >= 0 ? prev.map((r) => (r.ciclo_año === p.ciclo_año ? p : r)) : [...prev, p];
        });
        setEditing(null);
        setAdding(false);
        setNewRow(blankRow);
        flash("Período guardado");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al guardar", false);
      }
    });
  }

  function handleActivate(cicloAño: number) {
    startTransition(async () => {
      try {
        await setPeriodoActivo(cicloAño);
        setRows((prev) =>
          prev.map((r) => ({
            ...r,
            activo: r.ciclo_año === cicloAño,
            estado: r.ciclo_año === cicloAño ? "activo" : r.estado === "activo" ? "cerrado" : r.estado,
          }))
        );
        flash("Período activado");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error", false);
      }
    });
  }

  function handleDelete(cicloAño: number) {
    if (!confirm(`¿Eliminar el período ${cicloAño}? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      try {
        await deletePeriodo(cicloAño);
        setRows((prev) => prev.filter((r) => r.ciclo_año !== cicloAño));
        flash("Período eliminado");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error", false);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {msg && (
        <div className={`text-sm border rounded-lg px-4 py-2.5 ${msg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Catálogo de Períodos</p>
            <p className="text-xs text-gray-400 mt-0.5">Define los ciclos anuales de evaluación. Solo un período puede estar activo a la vez.</p>
          </div>
          {!adding && (
            <button
              onClick={() => { setAdding(true); setEditing(null); }}
              className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] transition-colors"
            >
              + Nuevo período
            </button>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-5 py-2.5">Ciclo</th>
              <th className="text-left px-3 py-2.5">Nombre</th>
              <th className="text-left px-3 py-2.5">Inicio</th>
              <th className="text-left px-3 py-2.5">Fin</th>
              <th className="text-left px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.sort((a, b) => b.ciclo_año - a.ciclo_año).map((p) => (
              editing === p.ciclo_año
                ? <PeriodoEditRow key={p.ciclo_año} row={p} onSave={handleSave} onCancel={() => setEditing(null)} isPending={isPending} />
                : (
                  <tr key={p.ciclo_año} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono font-semibold text-gray-800">{p.ciclo_año}</td>
                    <td className="px-3 py-3 text-gray-700">{p.nombre}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{fmtDate(p.fecha_inicio)}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{fmtDate(p.fecha_fin)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[p.estado] ?? "bg-gray-100 text-gray-500"}`}>
                          {ESTADO_LABELS[p.estado] ?? p.estado}
                        </span>
                        {p.activo && <span className="text-xs text-green-600 font-semibold">● Vigente</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {!p.activo && (
                          <button
                            onClick={() => handleActivate(p.ciclo_año)}
                            disabled={isPending}
                            className="text-xs text-[#1a3a5c] hover:underline disabled:opacity-40"
                          >
                            Activar
                          </button>
                        )}
                        <button
                          onClick={() => { setEditing(p.ciclo_año); setAdding(false); }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.ciclo_año)}
                          disabled={isPending || p.activo}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-30"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
            ))}
            {adding && (
              <PeriodoEditRow
                key="new"
                row={newRow}
                onSave={handleSave}
                onCancel={() => { setAdding(false); setNewRow(blankRow); }}
                isPending={isPending}
                isNew
                onChange={setNewRow}
              />
            )}
          </tbody>
        </table>

        {rows.length === 0 && !adding && (
          <p className="text-sm text-gray-400 text-center py-8">Sin períodos configurados.</p>
        )}
      </div>
    </div>
  );
}

function PeriodoEditRow({
  row,
  onSave,
  onCancel,
  isPending,
  isNew = false,
  onChange,
}: {
  row: Periodo;
  onSave: (p: Periodo) => void;
  onCancel: () => void;
  isPending: boolean;
  isNew?: boolean;
  onChange?: (p: Periodo) => void;
}) {
  const [local, setLocal] = useState<Periodo>(row);
  function update<K extends keyof Periodo>(k: K, v: Periodo[K]) {
    const next = { ...local, [k]: v };
    setLocal(next);
    onChange?.(next);
  }

  return (
    <tr className="bg-blue-50/50">
      <td className="px-5 py-2">
        <input
          type="number"
          value={local.ciclo_año}
          readOnly={!isNew}
          onChange={(e) => update("ciclo_año", Number(e.target.value))}
          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] read-only:bg-gray-100"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={local.nombre}
          onChange={(e) => update("nombre", e.target.value)}
          className="w-36 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={local.fecha_inicio}
          onChange={(e) => update("fecha_inicio", e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={local.fecha_fin}
          onChange={(e) => update("fecha_fin", e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={local.estado}
          onChange={(e) => update("estado", e.target.value as Periodo["estado"])}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
        >
          <option value="planificado">Planificado</option>
          <option value="activo">Activo</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onSave(local)}
            disabled={isPending}
            className="text-xs bg-[#1a3a5c] text-white px-3 py-1 rounded-lg hover:bg-[#152e4d] disabled:opacity-40"
          >
            {isPending ? "..." : "Guardar"}
          </button>
          <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Ponderaciones EIP Tab ────────────────────────────────────────────────────

const CP_LABELS: Record<number, { label: string; desc: string; lockEal: boolean; lockPicd: boolean }> = {
  1: { label: "Sin EAL · Sin PICD", desc: "Colaboradores sin evaluación de liderazgo ni PICD", lockEal: true,  lockPicd: true  },
  2: { label: "Con EAL · Con PICD", desc: "Líderes con evaluación de liderazgo y PICD entregado", lockEal: false, lockPicd: false },
  3: { label: "Sin EAL · Con PICD", desc: "Colaboradores sin EAL pero que entregaron PICD",     lockEal: true,  lockPicd: false },
  4: { label: "Con EAL · Sin PICD", desc: "Líderes con EAL pero sin PICD",                       lockEal: false, lockPicd: true  },
};

const BLANK_ROW: PonderacionInput = { calif_ponderada: 0, w_exp: 0, w_form_acad: 0, w_cursos: 0, w_comp: 0, w_eal: 0, w_picd: 0 };

function pctToW(pct: string): number {
  const n = parseFloat(pct);
  return isNaN(n) ? 0 : Math.round(n * 10) / 1000;
}

function wToPct(w: number): string {
  return (w * 100).toFixed(1);
}

function PonderacionesEipTab({
  ponderacionesMap,
  periodos,
}: {
  ponderacionesMap: Record<number, PonderacionRow[]>;
  periodos: Periodo[];
}) {
  const currentYear = new Date().getFullYear();
  const periodCycles = periodos.map((p) => p.ciclo_año);
  const configuredCycles = Object.keys(ponderacionesMap).map(Number);
  const allCycleSet = new Set([...configuredCycles, ...periodCycles, currentYear]);
  const allCycles = Array.from(allCycleSet).sort((a, b) => b - a);
  const periodoMap = new Map(periodos.map((p) => [p.ciclo_año, p]));

  const [cicloAño, setCicloAño] = useState(allCycles[0] ?? currentYear);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function buildInitial(ciclo: number): Record<number, PonderacionInput> {
    const rows = ponderacionesMap[ciclo] ?? [];
    const map: Record<number, PonderacionInput> = {};
    for (const cp of [1, 2, 3, 4]) {
      const found = rows.find((r) => r.calif_ponderada === cp);
      map[cp] = found
        ? { ...found }
        : { ...BLANK_ROW, calif_ponderada: cp };
    }
    return map;
  }

  const [form, setForm] = useState<Record<number, PonderacionInput>>(() => buildInitial(cicloAño));

  function handleCicloChange(año: number) {
    setCicloAño(año);
    setForm(buildInitial(año));
    setMsg(null);
  }

  function setField(cp: number, field: keyof PonderacionInput, pct: string) {
    setForm((prev) => ({
      ...prev,
      [cp]: { ...prev[cp], [field]: pctToW(pct) },
    }));
  }

  function rowSum(cp: number): number {
    const r = form[cp];
    return r.w_exp + r.w_form_acad + r.w_cursos + r.w_comp + r.w_eal + r.w_picd;
  }

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  function handleSave() {
    for (const cp of [1, 2, 3, 4]) {
      const sum = rowSum(cp);
      if (Math.abs(sum - 1) > 0.001) {
        flash(`Tipo ${cp} suma ${(sum * 100).toFixed(1)}% — debe ser exactamente 100%.`, false);
        return;
      }
    }
    startTransition(async () => {
      const res = await savePonderaciones(cicloAño, [1, 2, 3, 4].map((cp) => form[cp]));
      if (res.error) flash(res.error, false);
      else flash(`Ponderaciones ${cicloAño} guardadas correctamente.`);
    });
  }

  function handleCopy(sourceCiclo: number) {
    setForm(buildInitialFrom(sourceCiclo));
    flash(`Valores copiados desde ${sourceCiclo}. Guarda para confirmar.`);
  }

  function buildInitialFrom(ciclo: number): Record<number, PonderacionInput> {
    return buildInitial(ciclo);
  }

  const sourceCycles = allCycles.filter((y) => y !== cicloAño && configuredCycles.includes(y));
  const [sourceCiclo, setSourceCiclo] = useState(sourceCycles[0] ?? currentYear - 1);

  function cycleLabel(año: number) {
    const p = periodoMap.get(año);
    const hasData = configuredCycles.includes(año);
    if (!p) return `${año}${!hasData ? " (nuevo)" : ""}`;
    const badge = p.activo ? " · Vigente" : p.estado === "cerrado" ? " · Cerrado" : "";
    return `${p.nombre}${badge}`;
  }

  const FIELDS: { key: keyof PonderacionInput; label: string }[] = [
    { key: "w_exp",      label: "Experiencia" },
    { key: "w_form_acad",label: "Formación" },
    { key: "w_cursos",   label: "Cursos" },
    { key: "w_comp",     label: "Competencias" },
    { key: "w_eal",      label: "EAL" },
    { key: "w_picd",     label: "PICD" },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {msg && (
        <div className={`text-sm border rounded-lg px-4 py-2.5 ${msg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* Cycle selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo</label>
        <select
          value={cicloAño}
          onChange={(e) => handleCicloChange(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
        >
          {allCycles.map((y) => (
            <option key={y} value={y}>{cycleLabel(y)}</option>
          ))}
        </select>
        {!configuredCycles.includes(cicloAño) && (
          <p className="text-xs text-amber-600 mt-2">
            Este ciclo no tiene ponderaciones aún. Configúralas abajo y guarda.
          </p>
        )}
      </div>

      {/* Weight editor — one card per calif_ponderada */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((cp) => {
          const meta = CP_LABELS[cp];
          const row = form[cp];
          const sum = rowSum(cp);
          const sumOk = Math.abs(sum - 1) <= 0.001;
          const sumPct = (sum * 100).toFixed(1);

          return (
            <div key={cp} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${sumOk ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {sumPct}%
                </span>
              </div>

              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {FIELDS.map(({ key, label }) => {
                  const locked =
                    (key === "w_eal"  && meta.lockEal) ||
                    (key === "w_picd" && meta.lockPicd);
                  return (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">
                        {label}
                        {locked && <span className="ml-1 text-gray-300">(fijo)</span>}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={wToPct(row[key] as number)}
                          readOnly={locked}
                          onChange={(e) => setField(cp, key, e.target.value)}
                          className={`w-full px-3 py-1.5 pr-7 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/40 focus:border-[#1a3a5c] tabular-nums ${
                            locked ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed" : "border-gray-200"
                          }`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!sumOk && (
                <div className="px-5 pb-3 text-xs text-red-500">
                  La suma debe ser 100% — actualmente {sumPct}% (diferencia: {((sum - 1) * 100).toFixed(1)}%)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 text-sm font-semibold bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
        >
          {isPending ? "Guardando…" : `Guardar ponderaciones ${cicloAño}`}
        </button>
      </div>

      {/* Copy from another cycle */}
      {sourceCycles.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Copiar desde otro ciclo</p>
            <p className="text-xs text-gray-400">
              Pre-rellena los valores desde un ciclo existente. Aún debes guardar para confirmar.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sourceCiclo}
              onChange={(e) => setSourceCiclo(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
            >
              {sourceCycles.map((y) => (
                <option key={y} value={y}>{cycleLabel(y)}</option>
              ))}
            </select>
            <button
              onClick={() => handleCopy(sourceCiclo)}
              className="text-sm border border-[#1a3a5c] text-[#1a3a5c] px-4 py-2 rounded-lg hover:bg-[#1a3a5c] hover:text-white transition-colors"
            >
              Copiar valores
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Zonas EIP Tab ─────────────────────────────────────────────────────────────

function ZonasEipTab({
  zonasMap,
  availableCycles,
  periodos,
}: {
  zonasMap: Record<number, ZonaBand[]>;
  availableCycles: number[];
  periodos: Periodo[];
}) {
  const currentYear = new Date().getFullYear();
  // Union of configured cycles + period cycles, newest first
  const periodCycles = periodos.map((p) => p.ciclo_año);
  const allCycleSet = new Set([...availableCycles, ...periodCycles, currentYear]);
  const allCycles = Array.from(allCycleSet).sort((a, b) => b - a);

  const periodoMap = new Map(periodos.map((p) => [p.ciclo_año, p]));

  function cycleLabel(año: number) {
    const p = periodoMap.get(año);
    const hasZones = availableCycles.includes(año);
    if (!p) return `${año}${!hasZones ? " (nuevo)" : ""}`;
    const inicio = new Date(p.fecha_inicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    const fin    = new Date(p.fecha_fin   + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    const badge  = p.activo ? " · Vigente" : p.estado === "cerrado" ? " · Cerrado" : "";
    return `${p.nombre}${badge} (${inicio} – ${fin})`;
  }
  const [cicloAño, setCicloAño]     = useState(allCycles[0] ?? currentYear);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg]                = useState<{ text: string; ok: boolean } | null>(null);
  const sourceCycles = allCycles.filter((y) => y !== cicloAño && availableCycles.includes(y));
  const [sourceCiclo, setSourceCiclo] = useState(sourceCycles[0] ?? currentYear - 1);

  const bands = zonasMap[cicloAño] ?? [];

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  function handleSaveBands(newBands: ZonaBand[]) {
    startTransition(async () => {
      try {
        await saveZonaBandsArray(cicloAño, newBands);
        flash("Zonas guardadas correctamente");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al guardar", false);
      }
    });
  }

  function handleCopy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await copyZonaBandsFromCycle(fd);
        flash(`Umbrales copiados desde ${sourceCiclo} → ${cicloAño}. Recarga para ver los valores actualizados.`);
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al copiar", false);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {msg && (
        <div className={`text-sm border rounded-lg px-4 py-2.5 ${msg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* Cycle selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo</label>
        <div className="flex items-center gap-3">
          <select
            value={cicloAño}
            onChange={(e) => setCicloAño(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            {allCycles.map((y) => (
              <option key={y} value={y}>{cycleLabel(y)}</option>
            ))}
          </select>
          <div className="text-xs text-gray-400 space-y-0.5">
            <div>{bands.length > 0 ? `${bands.length} zonas configuradas` : "Sin configuración aún — usa los valores por defecto"}</div>
            {periodoMap.get(cicloAño) && (() => {
              const p = periodoMap.get(cicloAño)!;
              return (
                <div>
                  {new Date(p.fecha_inicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                  {" – "}
                  {new Date(p.fecha_fin + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Interactive zone editor */}
      <ZoneBoundaryEditor
        key={cicloAño}
        initialBands={bands}
        onSave={handleSaveBands}
        isPending={isPending}
      />

      {/* Copy from cycle */}
      {sourceCycles.length > 0 && (
        <form onSubmit={handleCopy} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Copiar desde otro ciclo</p>
            <p className="text-xs text-gray-400">
              Copia los umbrales de un ciclo existente al ciclo {cicloAño}. Recarga la página después de copiar.
            </p>
          </div>
          <input type="hidden" name="target_ciclo" value={cicloAño} />
          <div className="flex items-center gap-3">
            <select
              name="source_ciclo"
              value={sourceCiclo}
              onChange={(e) => setSourceCiclo(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
            >
              {sourceCycles.map((y) => (
                <option key={y} value={y}>{cycleLabel(y)}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm border border-[#1a3a5c] text-[#1a3a5c] px-4 py-2 rounded-lg hover:bg-[#1a3a5c] hover:text-white disabled:opacity-40 transition-colors"
            >
              {isPending ? "Copiando..." : `Copiar al ciclo ${cicloAño}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Sucesión Tab ──────────────────────────────────────────────────────────────

function SucesionTab({ ciclosDisponibles }: { ciclosDisponibles: number[] }) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; results: Record<number, unknown>; errors: string[] } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [selectedCiclos, setSelectedCiclos] = useState<Set<number>>(() => new Set(ciclosDisponibles));

  const ciclos = ciclosDisponibles;

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 6000);
  }

  function toggleCiclo(c: number) {
    setSelectedCiclos((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  const ciclosACorrer = ciclos.filter((c) => selectedCiclos.has(c));

  function handleRecalcular() {
    if (ciclosACorrer.length === 0) return;
    if (!confirmed) { setConfirmed(true); return; }
    setConfirmed(false);
    startTransition(async () => {
      const res = await recalcularTodosLosCiclos(ciclosACorrer);
      setResult(res as { ok: boolean; results: Record<number, unknown>; errors: string[] });
      if (res.error) flash(`Error: ${res.error}`, false);
      else if ((res as { errors?: string[] }).errors?.length) flash(`Completado con ${(res as { errors: string[] }).errors.length} error(es)`, false);
      else flash(`Matches recalculados para ciclo(s): ${ciclosACorrer.join(", ")}`);
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {msg && (
        <div className={`text-sm border rounded-lg px-4 py-2.5 ${msg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">Recalcular matches de sucesión</p>
          <p className="text-xs text-gray-400 mt-0.5">Regenera la tabla <code className="font-mono">sucesion_matches</code> para todos los ciclos configurados.</p>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Cómo funciona el motor</p>
            <div className="space-y-2">
              {[
                { tipo: "Bidireccional", color: "bg-blue-100 text-blue-700", desc: "El colaborador tiene al puesto como aspiración en su PICD y además está propuesto como sucesor para ese mismo puesto por el titular." },
                { tipo: "Aspiración", color: "bg-purple-100 text-purple-700", desc: "El colaborador aspira al puesto en su PICD, pero aún no ha sido propuesto por ningún titular de ese puesto." },
                { tipo: "Propuesta", color: "bg-amber-100 text-amber-700", desc: "El titular propone al colaborador como sucesor, pero el colaborador no tiene ese puesto en su PICD." },
                { tipo: "Gap Crítico", color: "bg-red-100 text-red-700", desc: "Puesto marcado como crítico sin ningún sucesor real propuesto ni aspirantes. Filas BAJA (sin ID de sucesor) no cuentan como cobertura." },
              ].map(({ tipo, color, desc }) => (
                <div key={tipo} className="flex gap-3 items-start">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${color}`}>{tipo}</span>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cycle selector */}
          {ciclos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Seleccionar ciclos</p>
              <div className="flex flex-wrap gap-2">
                {ciclos.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedCiclos.has(c)}
                      onChange={() => toggleCiclo(c)}
                      className="w-4 h-4 rounded border-gray-300 text-[#1a3a5c] focus:ring-[#1a3a5c]"
                    />
                    <span className="text-sm font-mono text-gray-700">{c}</span>
                  </label>
                ))}
              </div>
              {ciclosACorrer.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Selecciona al menos un ciclo.</p>
              )}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">Impacto potencial</p>
            <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
              <li>Se elimina y regenera <code className="font-mono">sucesion_matches</code> para cada ciclo seleccionado.</li>
              <li>Los matches existentes se reemplazarán con los datos vigentes al momento de ejecutarse.</li>
              <li>Ciclos a recalcular: {ciclosACorrer.length > 0 ? ciclosACorrer.join(", ") : "ninguno seleccionado"}.</li>
            </ul>
          </div>

          <div className="pt-1 flex items-center gap-3 flex-wrap">
            {!confirmed ? (
              <button
                onClick={handleRecalcular}
                disabled={isPending || ciclosACorrer.length === 0}
                className="px-5 py-2 text-sm font-semibold bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
              >
                {isPending ? "Recalculando…" : `Recalcular ciclo${ciclosACorrer.length !== 1 ? "s" : ""} ${ciclosACorrer.join(", ")}`}
              </button>
            ) : (
              <>
                <p className="text-sm text-amber-700 font-medium">¿Confirmar recálculo de {ciclosACorrer.join(", ")}? Irreversible.</p>
                <button
                  onClick={handleRecalcular}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  {isPending ? "Recalculando…" : "Sí, recalcular"}
                </button>
                <button onClick={() => setConfirmed(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Resultado del último recálculo</p>
          </div>
          <div className="p-5 space-y-3">
            {Object.entries(result.results).map(([ciclo, data]) => {
              const d = data as Record<string, number>;
              return (
                <div key={ciclo} className="flex items-center gap-4 text-sm">
                  <span className="font-mono font-semibold text-gray-700 w-12">{ciclo}</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">Bidi: {d.bidireccional}</span>
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">Aspir.: {d.aspiracion}</span>
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">Prop.: {d.propuesta}</span>
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full">Gaps: {d.gap_critico}</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">Total: {d.total}</span>
                  </div>
                </div>
              );
            })}
            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
