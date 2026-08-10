"use client";

import { useState, useTransition } from "react";
import {
  getCandidatosParaPuesto,
  guardarEscenario,
  cargarEscenario,
  eliminarEscenario,
} from "@/app/actions/rutas_talento";
import {
  calcRiesgo,
  readinessLabel,
  type Candidato,
  type FuenteCandidato,
  type PuestoOption,
  type EscenarioResumen,
} from "@/app/actions/rutas_talento_utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Nivel = {
  uid: string;
  puestoId: string;
  puestoNombre: string;
  esCritico: boolean;
  ocupanteActualNombre: string | null;
  candidatos: Candidato[] | null; // null = not loaded
  seleccionado: Candidato | null;
};

type Veredicto = {
  nivel: "viable" | "moderado" | "alto";
  rojos: number;
  amarillos: number;
  verdes: number;
  sinSucesor: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const FUENTE_CONFIG: Record<FuenteCandidato, { label: string; color: string; bg: string }> = {
  sucesion: { label: "Sucesión", color: "text-violet-700", bg: "bg-violet-100" },
  plano:    { label: "Plano de Carrera", color: "text-blue-700",   bg: "bg-blue-100"   },
  picd:     { label: "PICD",    color: "text-amber-700",  bg: "bg-amber-100"  },
};

const RIESGO_CONFIG = {
  verde:    { label: "Cobertura OK",      bg: "bg-emerald-50",  border: "border-emerald-300", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  amarillo: { label: "Riesgo Moderado",   bg: "bg-amber-50",    border: "border-amber-300",   badge: "bg-amber-100 text-amber-800",    dot: "bg-amber-500"   },
  rojo:     { label: "Sin Cobertura",     bg: "bg-red-50",      border: "border-red-300",     badge: "bg-red-100 text-red-800",        dot: "bg-red-500"     },
};

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ id, nombre, size = 40 }: { id: string; nombre: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = nombre.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/colaboradores/fotos/${id}.jpg`;

  if (!err && SUPABASE_URL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={nombre} width={size} height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        onError={() => setErr(true)} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#1a3a5c,#2d6a9f)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontWeight: 700, fontSize: Math.round(size * 0.35) }}>
      {initials}
    </div>
  );
}

// ─── Candidate Card ────────────────────────────────────────────────────────────

function CandidatoCard({
  candidato,
  onSeleccionar,
  isSelected,
}: {
  candidato: Candidato;
  onSeleccionar: () => void;
  isSelected: boolean;
}) {
  const riesgoPos = calcRiesgo(
    candidato.puestoActualEsCritico,
    candidato.tieneSucesor,
    candidato.readinessMejorSucesor
  );
  const rCfg = RIESGO_CONFIG[riesgoPos];

  return (
    <div className={`border-2 rounded-xl p-4 transition-all cursor-pointer ${
      isSelected
        ? "border-[#1a3a5c] bg-[#1a3a5c]/5 shadow-md"
        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
    }`} onClick={onSeleccionar}>
      <div className="flex items-start gap-3">
        <Avatar id={candidato.colaboradorId} nombre={candidato.nombre} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">{candidato.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{candidato.puestoActual}</p>

          {/* Source badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            {candidato.fuentes.map((f) => {
              const cfg = FUENTE_CONFIG[f];
              return (
                <span key={f} className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              );
            })}
          </div>

          {/* Readiness */}
          {candidato.readiness && (
            <p className="text-xs text-gray-500 mt-1.5">
              Readiness: <span className="font-medium text-gray-700">{readinessLabel(candidato.readiness)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Risk of their current position */}
      <div className={`mt-3 rounded-lg px-3 py-2 ${rCfg.bg} border ${rCfg.border}`}>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${rCfg.dot}`} />
          <p className="text-xs font-medium text-gray-700">
            Puesto actual:{" "}
            {candidato.puestoActualEsCritico ? "⚠️ Crítico" : "No crítico"}
            {candidato.puestoActualEsCritico && (
              <span className="ml-1 text-gray-500">
                · {candidato.tieneSucesor
                    ? `Sucesor: ${readinessLabel(candidato.readinessMejorSucesor)}`
                    : "Sin sucesor"}
              </span>
            )}
          </p>
        </div>
      </div>

      {isSelected && (
        <div className="mt-2 text-center">
          <span className="text-xs font-semibold text-[#1a3a5c]">✓ Seleccionado</span>
        </div>
      )}
    </div>
  );
}

// ─── Position Slot ─────────────────────────────────────────────────────────────

function PuestoSlot({
  puesto,
  riesgo,
  nivel,
  isObjetivo,
}: {
  puesto: { nombre: string; esCritico: boolean; ocupanteActualNombre: string | null };
  riesgo?: "verde" | "amarillo" | "rojo";
  nivel: number;
  isObjetivo?: boolean;
}) {
  const rCfg = riesgo ? RIESGO_CONFIG[riesgo] : null;

  return (
    <div className={`rounded-xl border-2 p-4 ${
      isObjetivo
        ? "border-[#1a3a5c] bg-[#1a3a5c]/5"
        : rCfg
        ? `${rCfg.border} ${rCfg.bg}`
        : "border-gray-200 bg-gray-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isObjetivo && (
              <span className="text-xs font-bold uppercase tracking-wider text-[#1a3a5c]">
                🎯 Objetivo
              </span>
            )}
            {!isObjetivo && riesgo && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rCfg!.badge}`}>
                {rCfg!.label}
              </span>
            )}
          </div>
          <p className="font-bold text-gray-900">{puesto.nombre}</p>
          {puesto.esCritico && (
            <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              ⚠️ Puesto Crítico
            </span>
          )}
          {puesto.ocupanteActualNombre && (
            <p className="text-xs text-gray-500 mt-1.5">
              Ocupante actual: <span className="font-medium text-gray-700">{puesto.ocupanteActualNombre}</span>
            </p>
          )}
        </div>
        <div className="text-2xl font-bold text-gray-200 select-none">N{nivel}</div>
      </div>
    </div>
  );
}

// ─── Connector ────────────────────────────────────────────────────────────────

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-0.5 h-4 bg-gray-300" />
      <div className="flex items-center gap-2">
        {label && <span className="text-xs text-gray-400 bg-white px-2 py-0.5 border border-gray-200 rounded-full">{label}</span>}
        {!label && <div className="w-0.5 h-2 bg-gray-300" />}
      </div>
      <div className="w-0.5 h-4 bg-gray-300" />
      <div className="text-gray-300 text-base leading-none">▼</div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function RutasTalentoClient({
  puestos,
  escenariosPrevios,
}: {
  puestos: PuestoOption[];
  escenariosPrevios: EscenarioResumen[];
}) {
  const [search, setSearch] = useState("");
  const [puestoObjetivo, setPuestoObjetivo] = useState<PuestoOption | null>(null);
  const [cadena, setCadena] = useState<Nivel[]>([]);
  const [fuentes, setFuentes] = useState<Set<FuenteCandidato>>(
    new Set(["sucesion", "plano", "picd"])
  );
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [saveNombre, setSaveNombre] = useState("");
  const [escenarios, setEscenarios] = useState(escenariosPrevios);
  const [showEscenarios, setShowEscenarios] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const puestosFiltered = puestos.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.org.toLowerCase().includes(search.toLowerCase())
  );

  function toggleFuente(f: FuenteCandidato) {
    setFuentes((prev) => {
      const next = new Set(prev);
      if (next.has(f) && next.size > 1) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  // ── Select target position ───────────────────────────────────────────────────

  function seleccionarPuestoObjetivo(puesto: PuestoOption) {
    setPuestoObjetivo(puesto);
    setVeredicto(null);
    setSearch("");

    const nivel0: Nivel = {
      uid: crypto.randomUUID(),
      puestoId: puesto.id,
      puestoNombre: puesto.nombre,
      esCritico: puesto.esCritico,
      ocupanteActualNombre: puesto.ocupanteNombre,
      candidatos: null,
      seleccionado: null,
    };

    setCadena([nivel0]);

    // Fetch candidates
    startTransition(async () => {
      const candidatos = await getCandidatosParaPuesto(puesto.id, [...fuentes]);
      setCadena([{ ...nivel0, candidatos }]);
    });
  }

  // ── Select candidate at level N ──────────────────────────────────────────────

  function seleccionarCandidato(nivelIdx: number, candidato: Candidato) {
    setCadena((prev) => {
      const updated = prev.map((n, i) =>
        i === nivelIdx ? { ...n, seleccionado: candidato } : n
      );
      // Remove all levels after this one
      return updated.slice(0, nivelIdx + 1);
    });
    setVeredicto(null);

    // If the candidate has a catalogued position, expand the chain
    if (!candidato.puestoCatalogoId) return;

    const puestoInfo = puestos.find((p) => p.id === candidato.puestoCatalogoId);
    const nivelNuevo: Nivel = {
      uid: crypto.randomUUID(),
      puestoId: candidato.puestoCatalogoId,
      puestoNombre: candidato.puestoActual,
      esCritico: candidato.puestoActualEsCritico,
      ocupanteActualNombre: candidato.nombre,
      candidatos: null,
      seleccionado: null,
    };

    setCadena((prev) => [...prev.slice(0, nivelIdx + 1), nivelNuevo]);

    startTransition(async () => {
      const candidatos = await getCandidatosParaPuesto(candidato.puestoCatalogoId!, [...fuentes]);
      setCadena((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.puestoId !== candidato.puestoCatalogoId) return prev;
        return [...prev.slice(0, -1), { ...last, candidatos }];
      });
    });
  }

  // ── Stop chain at level N ────────────────────────────────────────────────────

  function detenerEn(nivelIdx: number) {
    setCadena((prev) => prev.slice(0, nivelIdx + 1));
    setVeredicto(null);
  }

  // ── Analyze route ────────────────────────────────────────────────────────────

  function analizarRuta() {
    const movimientos = cadena.slice(1); // skip the objective level
    let verdes = 0, amarillos = 0, rojos = 0, sinSucesor = 0;

    for (const nivel of movimientos) {
      const candidato = nivel.seleccionado;
      if (!candidato) { rojos++; sinSucesor++; continue; }

      const r = calcRiesgo(
        candidato.puestoActualEsCritico,
        candidato.tieneSucesor,
        candidato.readinessMejorSucesor
      );
      if (r === "verde") verdes++;
      else if (r === "amarillo") amarillos++;
      else { rojos++; if (!candidato.tieneSucesor) sinSucesor++; }
    }

    const nivel: Veredicto["nivel"] =
      rojos > 0 ? "alto" : amarillos > 0 ? "moderado" : "viable";

    setVeredicto({ nivel, rojos, amarillos, verdes, sinSucesor });
  }

  // ── Save scenario ────────────────────────────────────────────────────────────

  function handleSave() {
    if (!saveNombre.trim() || !puestoObjetivo) return;

    const datos = {
      puestoObjetivoId: puestoObjetivo.id,
      puestoObjetivoNombre: puestoObjetivo.nombre,
      cadena: cadena.map((n) => ({
        puestoId: n.puestoId,
        puestoNombre: n.puestoNombre,
        esCritico: n.esCritico,
        seleccionadoId: n.seleccionado?.colaboradorId ?? null,
        seleccionadoNombre: n.seleccionado?.nombre ?? null,
      })),
      veredicto,
    };

    startTransition(async () => {
      const result = await guardarEscenario(saveNombre.trim(), datos);
      if (result.ok) {
        setShowSave(false);
        setSaveNombre("");
        const list = await import("@/app/actions/rutas_talento").then((m) => m.listarEscenarios());
        setEscenarios(list);
      }
    });
  }

  // ── Load scenario ────────────────────────────────────────────────────────────

  function handleLoadEscenario(id: string) {
    startTransition(async () => {
      const datos = await cargarEscenario(id);
      if (!datos) return;

      const pObj = puestos.find((p) => p.id === datos["puestoObjetivoId"]);
      if (!pObj) return;

      setPuestoObjetivo(pObj);
      setShowEscenarios(false);

      // Reconstruct chain (simplified — just show the selected names, don't re-fetch)
      const rawCadena = (datos["cadena"] as Array<Record<string, unknown>>) ?? [];
      const reconstructed: Nivel[] = rawCadena.map((c) => ({
        uid: crypto.randomUUID(),
        puestoId: c["puestoId"] as string,
        puestoNombre: c["puestoNombre"] as string,
        esCritico: c["esCritico"] as boolean,
        ocupanteActualNombre: null,
        candidatos: null,
        seleccionado: c["seleccionadoId"]
          ? ({
              colaboradorId: c["seleccionadoId"] as string,
              nombre: c["seleccionadoNombre"] as string,
              puestoActual: "",
              puestoCatalogoId: null,
              puestoActualEsCritico: false,
              fuentes: [],
              readiness: null,
              tieneSucesor: false,
              readinessMejorSucesor: null,
            } as Candidato)
          : null,
      }));
      setCadena(reconstructed);
      if (datos["veredicto"]) setVeredicto(datos["veredicto"] as Veredicto);
    });
  }

  // ── Delete scenario ───────────────────────────────────────────────────────────

  function handleDeleteEscenario(id: string) {
    startTransition(async () => {
      await eliminarEscenario(id);
      setEscenarios((prev) => prev.filter((e) => e.id !== id));
    });
  }

  // ── Computed chain state ──────────────────────────────────────────────────────

  const cadenaConRiesgo = cadena.map((nivel, i) => {
    if (i === 0) return { ...nivel, riesgo: undefined as "verde" | "amarillo" | "rojo" | undefined };
    const sel = nivel.seleccionado;
    if (!sel) return { ...nivel, riesgo: undefined };
    // Risk is about the position THIS niveau represents (the one being vacated)
    const riesgo = calcRiesgo(nivel.esCritico, sel.tieneSucesor, sel.readinessMejorSucesor);
    return { ...nivel, riesgo };
  });

  const cadenaCompleta = cadena.length > 1 && cadena[cadena.length - 1].seleccionado !== null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rutas de Talento</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Simula movimientos y evalúa el impacto en la cadena de sucesión
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEscenarios(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            📂 Escenarios guardados ({escenarios.length})
          </button>
          {puestoObjetivo && cadena.length > 1 && (
            <>
              <button
                onClick={() => setShowSave(true)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                💾 Guardar
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                ⬇ PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Position selector */}
      {!puestoObjetivo && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Selecciona el Puesto Objetivo a Cubrir
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar puesto por nombre o UEN…"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 mb-4"
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
            {puestosFiltered.slice(0, 60).map((p) => (
              <button
                key={p.id}
                onClick={() => seleccionarPuestoObjetivo(p)}
                className="text-left border border-gray-200 rounded-xl p-4 hover:border-[#1a3a5c] hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm group-hover:text-[#1a3a5c] transition-colors">
                      {p.nombre}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.org}</p>
                    {p.ocupanteNombre && (
                      <p className="text-xs text-gray-400 mt-1">👤 {p.ocupanteNombre}</p>
                    )}
                  </div>
                  {p.esCritico && (
                    <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full shrink-0">
                      Crítico
                    </span>
                  )}
                </div>
              </button>
            ))}
            {puestosFiltered.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full text-center py-8">
                No se encontraron puestos con ese criterio
              </p>
            )}
          </div>
        </div>
      )}

      {/* Active chain */}
      {puestoObjetivo && (
        <div>
          {/* Source filters + reset */}
          <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
            <button
              onClick={() => { setPuestoObjetivo(null); setCadena([]); setVeredicto(null); }}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
            >
              ← Cambiar puesto
            </button>
            <div className="h-4 border-l border-gray-200" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Fuentes:</span>
            {(["sucesion", "plano", "picd"] as FuenteCandidato[]).map((f) => {
              const cfg = FUENTE_CONFIG[f];
              return (
                <button
                  key={f}
                  onClick={() => toggleFuente(f)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    fuentes.has(f)
                      ? `${cfg.bg} ${cfg.color} border-transparent`
                      : "border-gray-200 text-gray-400 bg-white"
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Chain */}
          <div className="space-y-0">
            {cadenaConRiesgo.map((nivel, i) => {
              const isObjetivo = i === 0;
              const isLast = i === cadenaConRiesgo.length - 1;
              const prevSeleccionado = i > 0 ? cadena[i - 1].seleccionado : null;

              return (
                <div key={nivel.uid}>
                  {/* Connector with selected candidate info */}
                  {i > 0 && prevSeleccionado && (
                    <div className="flex flex-col items-center py-2">
                      <div className="w-0.5 h-4 bg-gray-300" />
                      <div className="flex items-center gap-2 bg-[#1a3a5c] text-white text-xs font-medium px-4 py-1.5 rounded-full">
                        <Avatar id={prevSeleccionado.colaboradorId} nombre={prevSeleccionado.nombre} size={20} />
                        {prevSeleccionado.nombre} promovido ↑
                      </div>
                      <div className="w-0.5 h-4 bg-gray-300" />
                      <div className="text-gray-300 text-sm">▼</div>
                    </div>
                  )}
                  {i > 0 && !prevSeleccionado && (
                    <Connector />
                  )}

                  {/* Position slot */}
                  <PuestoSlot
                    puesto={{
                      nombre: nivel.puestoNombre,
                      esCritico: nivel.esCritico,
                      ocupanteActualNombre: nivel.ocupanteActualNombre,
                    }}
                    riesgo={nivel.riesgo}
                    nivel={i}
                    isObjetivo={isObjetivo}
                  />

                  {/* Candidates panel */}
                  {(isLast || !nivel.seleccionado) && (
                    <div className="mt-4">
                      {nivel.candidatos === null ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          {isPending ? "Buscando candidatos…" : "Cargando…"}
                        </div>
                      ) : nivel.candidatos.length === 0 ? (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                          <p className="text-sm text-gray-500">
                            No se encontraron candidatos con las fuentes seleccionadas para este puesto.
                          </p>
                          {i > 0 && (
                            <button
                              onClick={() => detenerEn(i - 1)}
                              className="mt-3 text-sm text-[#1a3a5c] font-medium hover:underline"
                            >
                              Detener cadena aquí
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {nivel.candidatos.length} candidato{nivel.candidatos.length !== 1 ? "s" : ""} disponible{nivel.candidatos.length !== 1 ? "s" : ""}
                            </p>
                            {i > 0 && (
                              <button
                                onClick={() => detenerEn(i - 1)}
                                className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1 transition-colors no-print"
                              >
                                Detener aquí
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {nivel.candidatos.map((c) => (
                              <CandidatoCard
                                key={c.colaboradorId}
                                candidato={c}
                                isSelected={nivel.seleccionado?.colaboradorId === c.colaboradorId}
                                onSeleccionar={() => seleccionarCandidato(i, c)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show selected candidate summary (non-last levels) */}
                  {!isLast && nivel.seleccionado && (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Avatar id={nivel.seleccionado.colaboradorId} nombre={nivel.seleccionado.nombre} size={28} />
                        <span>
                          <span className="font-semibold text-gray-900">{nivel.seleccionado.nombre}</span>
                          {" "}seleccionado
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setCadena((prev) =>
                            prev.map((n, idx) => idx === i ? { ...n, seleccionado: null } : n)
                              .slice(0, i + 1)
                          );
                          setVeredicto(null);
                        }}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors no-print"
                      >
                        Cambiar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Analyze button */}
          {cadena.length > 1 && (
            <div className="mt-6 flex justify-center no-print">
              <button
                onClick={analizarRuta}
                className="px-6 py-3 bg-[#1a3a5c] text-white rounded-xl font-semibold text-sm hover:bg-[#152e4d] transition-colors shadow-sm"
              >
                🔍 Analizar Ruta
              </button>
            </div>
          )}

          {/* Verdict */}
          {veredicto && (
            <div className={`mt-6 rounded-xl border-2 p-6 ${
              veredicto.nivel === "viable"
                ? "border-emerald-300 bg-emerald-50"
                : veredicto.nivel === "moderado"
                ? "border-amber-300 bg-amber-50"
                : "border-red-300 bg-red-50"
            }`}>
              <div className="flex items-start gap-4">
                <div className="text-4xl">
                  {veredicto.nivel === "viable" ? "✅" : veredicto.nivel === "moderado" ? "⚠️" : "🔴"}
                </div>
                <div className="flex-1">
                  <h3 className={`text-xl font-bold ${
                    veredicto.nivel === "viable"
                      ? "text-emerald-800"
                      : veredicto.nivel === "moderado"
                      ? "text-amber-800"
                      : "text-red-800"
                  }`}>
                    Ruta{" "}
                    {veredicto.nivel === "viable"
                      ? "VIABLE"
                      : veredicto.nivel === "moderado"
                      ? "CON RIESGO MODERADO"
                      : "DE ALTO RIESGO"}
                  </h3>
                  <p className="text-sm text-gray-600 mt-2">
                    {veredicto.nivel === "viable"
                      ? "Todos los movimientos tienen cobertura de sucesión adecuada."
                      : veredicto.nivel === "moderado"
                      ? "Hay posiciones críticas con sucesores disponibles pero no inmediatos."
                      : "Hay posiciones críticas sin sucesor — el movimiento genera vulnerabilidad."}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    {veredicto.verdes > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        {veredicto.verdes} posición{veredicto.verdes !== 1 ? "es" : ""} con cobertura
                      </span>
                    )}
                    {veredicto.amarillos > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-amber-500 rounded-full" />
                        {veredicto.amarillos} con sucesor a futuro
                      </span>
                    )}
                    {veredicto.rojos > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-100 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-red-500 rounded-full" />
                        {veredicto.rojos} sin cobertura
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Modal */}
      {showSave && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Guardar escenario</h3>
            <input
              value={saveNombre}
              onChange={(e) => setSaveNombre(e.target.value)}
              placeholder="Nombre del escenario…"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSave(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!saveNombre.trim() || isPending}
                className="px-4 py-2 text-sm font-medium bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved scenarios panel */}
      {showEscenarios && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Escenarios guardados</h3>
              <button onClick={() => setShowEscenarios(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            {escenarios.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay escenarios guardados</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {escenarios.map((e) => (
                  <div key={e.id} className="flex items-center justify-between border border-gray-200 rounded-xl p-4">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{e.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {e.puestoObjetivoNombre} · {e.nivelCount} nivel{e.nivelCount !== 1 ? "es" : ""}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(e.created_at).toLocaleDateString("es-MX")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLoadEscenario(e.id)}
                        className="text-xs font-medium px-3 py-1.5 bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] transition-colors"
                      >
                        Cargar
                      </button>
                      <button
                        onClick={() => handleDeleteEscenario(e.id)}
                        className="text-xs text-red-600 hover:text-red-800 transition-colors px-2"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}} />
    </div>
  );
}
