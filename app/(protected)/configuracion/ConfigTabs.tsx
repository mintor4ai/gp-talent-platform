"use client";

import { useState, useTransition } from "react";
import {
  guardarReglaGrupo,
  aplicarReglaGrupo,
  toggleCoachIndividual,
  guardarPrompt,
  activarVersionPrompt,
  actualizarConfigApi,
} from "@/app/actions/configuracion";
import { upsertZonaBands, copyZonaBandsFromCycle } from "@/app/actions/zonas";
import type { ZonaBand } from "@/lib/types";
import { TalentMatrixSVG } from "@/app/(protected)/evaluaciones/EIPScatterChart";

type Regla = { id: string; nivel: string; valor: string; habilitado: boolean };
type Prompt = { id: string; tipo: string; contenido: string; version: number; activo: boolean; created_at: string };
type ColabRow = { id: string; nombre_completo: string | null; puesto: string | null; razon_social: string | null };
type Usuario = { id: string; rol: string; coach_habilitado: boolean | null; id_empleado: string | null; colab: ColabRow | null };

const PROMPT_TIPOS = [
  { key: "coach_colaborador", label: "Colaborador", desc: "Para usuarios con rol colaborador" },
  { key: "coach_jefe",        label: "Jefe",         desc: "Para usuarios con rol jefe" },
  { key: "coach_admin",       label: "Admin / Capital Humano", desc: "Para capital_humano y superadmin" },
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
}: {
  grupos: { uens: string[]; departamentos: string[]; areas: string[]; segmentos: string[] };
  reglasAcceso: Regla[];
  prompts: Prompt[];
  apiConfig: { modelo: string; max_tokens: number } | null;
  usuarios: Usuario[];
  zonasMap: Record<number, ZonaBand[]>;
  availableZonaCycles: number[];
}) {
  const [tab, setTab] = useState<"access" | "prompts" | "api" | "zonas">("access");

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 flex gap-0 mb-6">
        {[
          { key: "access",  label: "Acceso Coach IA" },
          { key: "prompts", label: "Prompts" },
          { key: "api",     label: "API / Modelo" },
          { key: "zonas",   label: "Zonas EIP" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`text-sm font-medium py-3 px-5 border-b-2 transition-colors ${
              tab === key
                ? "border-[#1a3a5c] text-[#1a3a5c]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "access"  && <CoachAccessTab grupos={grupos} reglasAcceso={reglasAcceso} usuarios={usuarios} />}
      {tab === "prompts" && <PromptsTab prompts={prompts} />}
      {tab === "api"     && <ApiTab apiConfig={apiConfig} />}
      {tab === "zonas"   && <ZonasEipTab zonasMap={zonasMap} availableCycles={availableZonaCycles} />}
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
        <div key={nivel} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
          <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
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

// ── Zonas EIP Tab ─────────────────────────────────────────────────────────────

const ZONA_ORDER_CFG = ["Inicio", "Revisión", "Estabilidad", "Desarrollo", "Sobresaliente"];
const ZONA_DOT_COLORS_CFG: Record<string, string> = {
  Sobresaliente: "#8b5cf6",
  Desarrollo: "#3b82f6",
  Estabilidad: "#10b981",
  Revisión: "#f97316",
  Inicio: "#eab308",
};

function ZonasEipTab({
  zonasMap,
  availableCycles,
}: {
  zonasMap: Record<number, ZonaBand[]>;
  availableCycles: number[];
}) {
  const currentYear = new Date().getFullYear();
  const allCycles = availableCycles.includes(currentYear) ? availableCycles : [currentYear, ...availableCycles];
  const [cicloAño, setCicloAño] = useState(allCycles[0] ?? currentYear);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const sourceCycles = allCycles.filter((y) => y !== cicloAño && availableCycles.includes(y));
  const [sourceCiclo, setSourceCiclo] = useState(sourceCycles[0] ?? currentYear - 1);

  const bands = zonasMap[cicloAño] ?? [];
  const bandMap = Object.fromEntries(bands.map((b) => [b.zona, b]));

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await upsertZonaBands(fd);
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

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Ciclo (año)</label>
        <div className="flex items-center gap-3">
          <select
            value={cicloAño}
            onChange={(e) => setCicloAño(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            {allCycles.map((y) => (
              <option key={y} value={y}>{y}{!availableCycles.includes(y) ? " (nuevo)" : ""}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            {bands.length > 0 ? `${bands.length} zonas configuradas` : "Sin configuración aún"}
          </span>
        </div>
      </div>

      {/* Live matrix preview */}
      {bands.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Vista previa — Matriz de Talento {cicloAño}</p>
            <p className="text-xs text-gray-400 mt-0.5">Así se verán las zonas en los reportes de evaluación</p>
          </div>
          <div className="p-4 flex justify-center">
            <TalentMatrixSVG zonaBands={bands} width={520} height={448} showTitle={false} />
          </div>
        </div>
      )}

      <form key={cicloAño} onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">Umbrales de zonas — Ciclo {cicloAño}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Define los umbrales como la <strong>suma de Desempeño + Potencial</strong> (rango típico: 160–240).
          </p>
        </div>
        <div className="p-5 space-y-3">
          <input type="hidden" name="ciclo_año" value={cicloAño} />
          {ZONA_ORDER_CFG.map((zona) => {
            const band = bandMap[zona];
            return (
              <div key={zona} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-28 flex-shrink-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ZONA_DOT_COLORS_CFG[zona] ?? "#9ca3af" }}
                  />
                  <span className="text-xs font-medium text-gray-700">{zona}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 w-10 text-right">desde</label>
                  <input
                    name={`umbral_inferior_${zona}`}
                    type="number"
                    step="0.5"
                    min={160}
                    max={240}
                    defaultValue={band?.umbral_inferior ?? ""}
                    required
                    className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                  />
                  <label className="text-xs text-gray-400">hasta</label>
                  <input
                    name={`umbral_superior_${zona}`}
                    type="number"
                    step="0.5"
                    min={160}
                    max={240}
                    defaultValue={band?.umbral_superior ?? ""}
                    required
                    className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
                  />
                </div>
              </div>
            );
          })}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
            >
              {isPending ? "Guardando..." : "Guardar zonas"}
            </button>
          </div>
        </div>
      </form>

      {sourceCycles.length > 0 && (
        <form onSubmit={handleCopy} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Copiar desde otro ciclo</p>
            <p className="text-xs text-gray-400">
              Copia los umbrales de un ciclo existente al ciclo {cicloAño}. Sobrescribe la configuración actual.
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
                <option key={y} value={y}>{y}</option>
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
