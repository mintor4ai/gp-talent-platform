"use client";

import { useState, useTransition } from "react";
import {
  getCandidatosParaPuesto,
  buscarColaboradores,
  obtenerPerfilCandidatos,
  guardarEscenario,
  cargarEscenario,
  eliminarEscenario,
  generarAnalisisNivelIA,
  generarReporteCompletoIA,
} from "@/app/actions/rutas_talento";
import {
  calcRiesgo,
  calcRiesgoConTipo,
  candidatoExterno,
  candidatoSinDefinir,
  readinessLabel,
  type Candidato,
  type FuenteCandidato,
  type PuestoOption,
  type EscenarioResumen,
  type ColaboradorBusqueda,
} from "@/app/actions/rutas_talento_utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Nivel = {
  uid: string;
  puestoId: string;
  puestoNombre: string;
  esCritico: boolean;
  ocupanteActualNombre: string | null;
  candidatos: Candidato[] | null;
  seleccionado: Candidato | null;
};

type Veredicto = {
  nivel: "viable" | "moderado" | "alto";
  rojos: number;
  amarillos: number;
  verdes: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const FUENTE_CONFIG: Record<FuenteCandidato, { label: string; color: string; bg: string }> = {
  sucesion: { label: "Sucesión",        color: "text-violet-700", bg: "bg-violet-100" },
  plano:    { label: "Plano de Carrera", color: "text-blue-700",   bg: "bg-blue-100"   },
  picd:     { label: "PICD",            color: "text-amber-700",  bg: "bg-amber-100"  },
};

const RIESGO_CONFIG = {
  verde:    { label: "Cobertura OK",    bg: "bg-emerald-50", border: "border-emerald-300", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  amarillo: { label: "Riesgo Moderado", bg: "bg-amber-50",   border: "border-amber-300",   badge: "bg-amber-100 text-amber-800",    dot: "bg-amber-500"   },
  rojo:     { label: "Sin Cobertura",   bg: "bg-red-50",     border: "border-red-300",     badge: "bg-red-100 text-red-800",        dot: "bg-red-500"     },
};

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ id, nombre, size = 40 }: { id: string; nombre: string; size?: number }) {
  const [err, setErr] = useState(false);
  const isSpecial = id.startsWith("__");
  const initials = nombre.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  if (!isSpecial && !err && SUPABASE_URL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${SUPABASE_URL}/storage/v1/object/public/colaboradores/fotos/${id}.jpg`}
        alt={nombre} width={size} height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        onError={() => setErr(true)}
      />
    );
  }

  const bg = isSpecial && id === "__externo__"
    ? "linear-gradient(135deg,#92400e,#d97706)"
    : isSpecial && id === "__sin_candidato__"
    ? "linear-gradient(135deg,#7f1d1d,#dc2626)"
    : isSpecial
    ? "linear-gradient(135deg,#5b21b6,#7c3aed)"
    : "linear-gradient(135deg,#1a3a5c,#2d6a9f)";

  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontWeight: 700, fontSize: Math.round(size * 0.35) }}>
      {isSpecial ? (id === "__externo__" ? "🌐" : id === "__sin_candidato__" ? "—" : "✦") : initials}
    </div>
  );
}

// ─── Candidate Card ────────────────────────────────────────────────────────────

function CandidatoCard({
  candidato, onSeleccionar, isSelected,
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
    <div
      className={`border-2 rounded-xl p-4 transition-all cursor-pointer ${
        isSelected ? "border-[#1a3a5c] bg-[#1a3a5c]/5 shadow-md" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
      onClick={onSeleccionar}
    >
      <div className="flex items-start gap-3">
        <Avatar id={candidato.colaboradorId} nombre={candidato.nombre} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">{candidato.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{candidato.puestoActual}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {candidato.fuentes.map((f) => {
              const cfg = FUENTE_CONFIG[f];
              const isBorradorPicd = f === "picd" && candidato.picdBorrador;
              return (
                <span key={f} title={isBorradorPicd ? "PICD en borrador — aspiración no confirmada" : undefined}
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color} ${isBorradorPicd ? "opacity-70" : ""}`}>
                  {cfg.label}{isBorradorPicd ? " ·" : ""}
                </span>
              );
            })}
          </div>
          {candidato.readiness && (
            <p className="text-xs text-gray-500 mt-1.5">
              Readiness: <span className="font-medium text-gray-700">{readinessLabel(candidato.readiness)}</span>
            </p>
          )}
        </div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 ${rCfg.bg} border ${rCfg.border}`}>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${rCfg.dot}`} />
          <p className="text-xs font-medium text-gray-700">
            Puesto actual: {candidato.puestoActualEsCritico ? "⚠️ Crítico" : "No crítico"}
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

// ─── External / No-candidate special cards ────────────────────────────────────

function SpecialCandidatoCard({
  tipo, onSeleccionar, isSelected,
}: {
  tipo: "externo" | "sin_candidato";
  onSeleccionar: () => void;
  isSelected: boolean;
}) {
  const isExterno = tipo === "externo";
  return (
    <div
      onClick={onSeleccionar}
      className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
        isSelected
          ? isExterno
            ? "border-amber-400 bg-amber-50 shadow-md"
            : "border-red-400 bg-red-50 shadow-md"
          : "border-dashed border-gray-300 bg-white hover:border-gray-400 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
          isExterno ? "bg-amber-100" : "bg-red-100"
        }`}>
          {isExterno ? "🌐" : "—"}
        </div>
        <div>
          <p className={`font-semibold text-sm ${isExterno ? "text-amber-800" : "text-red-800"}`}>
            {isExterno ? "Candidato Externo" : "Sin candidato definido"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isExterno
              ? "Reclutamiento externo · Riesgo de adaptación cultural"
              : "Gap documentado · Riesgo crítico"}
          </p>
        </div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-medium ${
        isExterno ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
      }`}>
        {isExterno
          ? "⚠️ Riesgo moderado — onboarding y adaptación requeridos"
          : "🔴 Sin cobertura — posición queda expuesta"}
      </div>
      {isSelected && (
        <div className="mt-2 text-center">
          <span className={`text-xs font-semibold ${isExterno ? "text-amber-700" : "text-red-700"}`}>
            ✓ Seleccionado
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Position Slot ────────────────────────────────────────────────────────────

function PuestoSlot({
  puesto, riesgo, nivel, isObjetivo,
}: {
  puesto: { nombre: string; esCritico: boolean; ocupanteActualNombre: string | null };
  riesgo?: "verde" | "amarillo" | "rojo";
  nivel: number;
  isObjetivo?: boolean;
}) {
  const rCfg = riesgo ? RIESGO_CONFIG[riesgo] : null;
  return (
    <div className={`rounded-xl border-2 p-4 ${
      isObjetivo ? "border-[#1a3a5c] bg-[#1a3a5c]/5"
      : rCfg ? `${rCfg.border} ${rCfg.bg}`
      : "border-gray-200 bg-gray-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isObjetivo && <span className="text-xs font-bold uppercase tracking-wider text-[#1a3a5c]">🎯 Objetivo</span>}
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

function Connector({ candidato }: { candidato?: Candidato | null }) {
  if (!candidato) {
    return (
      <div className="flex flex-col items-center py-1">
        <div className="w-0.5 h-6 bg-gray-300" />
        <div className="text-gray-300 text-sm">▼</div>
      </div>
    );
  }

  const isExterno = candidato.tipo === "externo";
  const isSin = candidato.tipo === "sin_candidato";
  const isPropuesto = candidato.tipo === "propuesto";
  const bg = isExterno ? "bg-amber-700" : isSin ? "bg-red-700" : isPropuesto ? "bg-violet-700" : "bg-[#1a3a5c]";

  return (
    <div className="flex flex-col items-center py-2">
      <div className="w-0.5 h-4 bg-gray-300" />
      <div className={`flex items-center gap-2 text-white text-xs font-medium px-4 py-1.5 rounded-full ${bg}`}>
        {!isExterno && !isSin && !isPropuesto && <Avatar id={candidato.colaboradorId} nombre={candidato.nombre} size={20} />}
        {isPropuesto && <span>✦</span>}
        {isExterno && <span>🌐</span>}
        {isSin && <span>—</span>}
        {candidato.nombre} promovido ↑
      </div>
      <div className="w-0.5 h-4 bg-gray-300" />
      <div className="text-gray-300 text-sm">▼</div>
    </div>
  );
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────────

function AnalisisPanelInline({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 relative">
      <button onClick={onClose} className="absolute top-2 right-2 text-blue-400 hover:text-blue-700 text-sm">✕</button>
      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">✦ Análisis IA — Talent Management</p>
      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RutasTalentoClient({
  puestos, escenariosPrevios,
}: {
  puestos: PuestoOption[];
  escenariosPrevios: EscenarioResumen[];
}) {
  const [search, setSearch] = useState("");
  const [filterUen, setFilterUen] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterSegmento, setFilterSegmento] = useState("");
  const [filterCritico, setFilterCritico] = useState<"todos" | "critico" | "no_critico">("todos");
  const [puestoObjetivo, setPuestoObjetivo] = useState<PuestoOption | null>(null);
  const [cadena, setCadena] = useState<Nivel[]>([]);
  const [fuentes, setFuentes] = useState<Set<FuenteCandidato>>(new Set(["sucesion", "plano", "picd"]));
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);

  // IA state
  const [analisisIA, setAnalisisIA] = useState<Record<string, string>>({}); // uid → text
  const [loadingIA, setLoadingIA] = useState<string | null>(null); // uid or "reporte"
  const [loadingStep, setLoadingStep] = useState<string>(""); // "Preparando datos…" | "Generando análisis…"
  const [reporteIA, setReporteIA] = useState<string | null>(null);
  const [showReporte, setShowReporte] = useState(false);

  // Proponer colaborador modal state
  const [propuestoModal, setPropuestoModal] = useState<{ nivelIdx: number } | null>(null);
  const [propuestoSearch, setPropuestoSearch] = useState("");
  const [propuestoOrg, setPropuestoOrg] = useState("");
  const [propuestoResultados, setPropuestoResultados] = useState<ColaboradorBusqueda[]>([]);
  const [propuestoSelected, setPropuestoSelected] = useState<ColaboradorBusqueda | null>(null);
  const [propuestoReadiness, setPropuestoReadiness] = useState<string>("uno_dos_anios");
  const [propuestoContinuar, setPropuestoContinuar] = useState(false);
  const [propuestoBuscando, setPropuestoBuscando] = useState(false);

  // Modals
  const [showSave, setShowSave] = useState(false);
  const [saveNombre, setSaveNombre] = useState("");
  const [escenarios, setEscenarios] = useState(escenariosPrevios);
  const [showEscenarios, setShowEscenarios] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // UEN → Area cascading; segmento and crítico are independent
  const AREA_SIN_ASIGNAR = "__sin_area__";
  const uenOptions = [...new Set(puestos.map((p) => p.org).filter(Boolean))].sort();
  const areaBaseList = puestos.filter((p) => !filterUen || p.org === filterUen);
  const areaOptions = [...new Set(areaBaseList.map((p) => p.area).filter(Boolean))].sort();
  const hasSinArea = areaBaseList.some((p) => !p.area);
  const segmentoOptions = [...new Set(puestos.map((p) => p.segmento).filter(Boolean))].sort();

  const puestosFiltered = puestos.filter((p) => {
    if (filterUen && p.org !== filterUen) return false;
    if (filterArea === AREA_SIN_ASIGNAR) { if (p.area) return false; }
    else if (filterArea && p.area !== filterArea) return false;
    if (filterSegmento && p.segmento !== filterSegmento) return false;
    if (filterCritico === "critico" && !p.esCritico) return false;
    if (filterCritico === "no_critico" && p.esCritico) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return p.nombre.toLowerCase().includes(q) || p.org.toLowerCase().includes(q);
  });

  function toggleFuente(f: FuenteCandidato) {
    setFuentes((prev) => {
      const next = new Set(prev);
      if (next.has(f) && next.size > 1) next.delete(f); else next.add(f);
      return next;
    });
  }

  // ── Select target position ────────────────────────────────────────────────────

  function seleccionarPuestoObjetivo(puesto: PuestoOption) {
    setPuestoObjetivo(puesto);
    setVeredicto(null);
    setSearch("");
    setAnalisisIA({});
    setReporteIA(null);

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

    startTransition(async () => {
      const candidatos = await getCandidatosParaPuesto(puesto.id, [...fuentes]);
      setCadena([{ ...nivel0, candidatos }]);
    });
  }

  // ── Select internal candidate ─────────────────────────────────────────────────

  function seleccionarCandidato(nivelIdx: number, candidato: Candidato) {
    const updatedCadena = cadena
      .map((n, i) => i === nivelIdx ? { ...n, seleccionado: candidato } : n)
      .slice(0, nivelIdx + 1);
    setCadena(updatedCadena);
    setVeredicto(null);
    setAnalisisIA((prev) => { const n = { ...prev }; delete n[cadena[nivelIdx]?.uid ?? ""]; return n; });

    // External and sin_candidato stop the chain
    if (!candidato.puestoCatalogoId || candidato.tipo === "externo" || candidato.tipo === "sin_candidato") return;

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

  // ── Special selections ────────────────────────────────────────────────────────

  function seleccionarEspecial(nivelIdx: number, tipo: "externo" | "sin_candidato") {
    const candidato = tipo === "externo" ? candidatoExterno() : candidatoSinDefinir();
    seleccionarCandidato(nivelIdx, candidato);
  }

  // ── Proponer collaborator ─────────────────────────────────────────────────────

  async function handlePropuestoSearch(query: string, org: string) {
    if (query.trim().length < 2 && !org) { setPropuestoResultados([]); return; }
    setPropuestoBuscando(true);
    const results = await buscarColaboradores(query, org);
    setPropuestoResultados(results);
    setPropuestoBuscando(false);
  }

  function confirmarPropuesto() {
    if (!propuestoSelected || !propuestoModal) return;
    const candidato: Candidato = {
      colaboradorId: propuestoSelected.id,
      nombre: propuestoSelected.nombre,
      puestoActual: propuestoSelected.puestoActual,
      puestoCatalogoId: propuestoContinuar ? propuestoSelected.puestoCatalogoId : null,
      puestoActualEsCritico: propuestoSelected.esCritico,
      fuentes: [],
      readiness: propuestoReadiness,
      tieneSucesor: propuestoSelected.tieneSucesor,
      readinessMejorSucesor: propuestoSelected.readinessMejorSucesor,
      tipo: "propuesto",
    };
    seleccionarCandidato(propuestoModal.nivelIdx, candidato);
    setPropuestoModal(null);
    setPropuestoSearch("");
    setPropuestoOrg("");
    setPropuestoResultados([]);
    setPropuestoSelected(null);
    setPropuestoReadiness("uno_dos_anios");
    setPropuestoContinuar(false);
  }

  // ── Stop chain ────────────────────────────────────────────────────────────────

  function detenerEn(nivelIdx: number) {
    setCadena((prev) => prev.slice(0, nivelIdx + 1));
    setVeredicto(null);
  }

  // ── Analyze route ─────────────────────────────────────────────────────────────

  function analizarRuta() {
    let verdes = 0, amarillos = 0, rojos = 0;
    for (const nivel of cadena.slice(1)) {
      const sel = nivel.seleccionado;
      if (!sel) { rojos++; continue; }
      const r = calcRiesgoConTipo(sel);
      if (r === "verde") verdes++;
      else if (r === "amarillo") amarillos++;
      else rojos++;
    }
    const nivelVeredicto: Veredicto["nivel"] =
      rojos > 0 ? "alto" : amarillos > 0 ? "moderado" : "viable";
    setVeredicto({ nivel: nivelVeredicto, rojos, amarillos, verdes });
  }

  // ── AI: per-level analysis ────────────────────────────────────────────────────

  async function handleAnalisisNivel(nivel: Nivel, nivelIdx: number) {
    const sel = nivel.seleccionado;
    if (!sel) return;
    const uid = nivel.uid;

    setLoadingIA(uid);
    setLoadingStep("Preparando datos…");

    const perfiles = await obtenerPerfilCandidatos([sel.colaboradorId]);
    const perfilContexto = perfiles[sel.colaboradorId];

    setLoadingStep("Generando análisis…");
    const riesgo = calcRiesgoConTipo(sel);
    const result = await generarAnalisisNivelIA({
      puestoNombre: nivel.puestoNombre,
      esCritico: nivel.esCritico,
      candidatoNombre: sel.nombre,
      candidatoTipo: sel.tipo ?? "interno",
      readiness: sel.readiness,
      puestoVacanteCritico: sel.puestoActualEsCritico,
      tieneSucesor: sel.tieneSucesor,
      readinessMejorSucesor: sel.readinessMejorSucesor,
      riesgo,
      perfilContexto,
    });
    setLoadingIA(null);
    setLoadingStep("");
    if (result.ok && result.analisis) {
      setAnalisisIA((prev) => ({ ...prev, [uid]: result.analisis! }));
    }
  }

  // ── AI: full report ────────────────────────────────────────────────────────────

  async function handleReporteIA() {
    if (!puestoObjetivo) return;
    setLoadingIA("reporte");
    setLoadingStep("Preparando datos del perfil…");

    // Collect all real colaborador IDs from the chain
    const idsToFetch = cadena
      .slice(1)
      .map((n) => n.seleccionado?.colaboradorId)
      .filter((id): id is string => !!id && !id.startsWith("__"));

    const perfiles = await obtenerPerfilCandidatos(idsToFetch);

    setLoadingStep("Generando reporte…");

    const cadenaConRiesgoLocal = cadena.map((nivel, i) => {
      if (i === 0) return { puestoNombre: nivel.puestoNombre, esCritico: nivel.esCritico, candidatoNombre: "", candidatoTipo: "interno" as const, readiness: null, riesgo: null };
      const sel = nivel.seleccionado;
      return {
        colaboradorId: sel?.colaboradorId,
        puestoNombre: nivel.puestoNombre,
        esCritico: nivel.esCritico,
        candidatoNombre: sel?.nombre ?? "Sin candidato",
        candidatoTipo: (sel?.tipo ?? "sin_candidato") as "interno" | "externo" | "sin_candidato" | "propuesto",
        readiness: sel?.readiness ?? null,
        riesgo: sel ? calcRiesgoConTipo(sel) : "rojo" as const,
      };
    });

    const result = await generarReporteCompletoIA({
      puestoObjetivoNombre: puestoObjetivo.nombre,
      niveles: cadenaConRiesgoLocal,
      perfiles,
    });
    setLoadingIA(null);
    setLoadingStep("");
    if (result.ok && result.reporte) {
      setReporteIA(result.reporte);
      setShowReporte(true);
    }
  }

  // ── Save scenario ─────────────────────────────────────────────────────────────

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
        seleccionadoTipo: n.seleccionado?.tipo ?? null,
      })),
      veredicto,
      analisisIA,
      reporteIA,
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

  // ── Load scenario ─────────────────────────────────────────────────────────────

  function handleLoadEscenario(id: string) {
    startTransition(async () => {
      const datos = await cargarEscenario(id);
      if (!datos) return;
      const pObj = puestos.find((p) => p.id === datos["puestoObjetivoId"]);
      if (!pObj) return;
      setPuestoObjetivo(pObj);
      setShowEscenarios(false);
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
              tipo: (c["seleccionadoTipo"] as "interno" | "externo" | "sin_candidato") ?? "interno",
            } as Candidato)
          : null,
      }));
      setCadena(reconstructed);
      if (datos["veredicto"]) setVeredicto(datos["veredicto"] as Veredicto);
      if (datos["analisisIA"]) setAnalisisIA(datos["analisisIA"] as Record<string, string>);
      if (datos["reporteIA"]) setReporteIA(datos["reporteIA"] as string);
    });
  }

  function handleDeleteEscenario(id: string) {
    startTransition(async () => {
      await eliminarEscenario(id);
      setEscenarios((prev) => prev.filter((e) => e.id !== id));
    });
  }

  // ── Computed ──────────────────────────────────────────────────────────────────

  const cadenaConRiesgo = cadena.map((nivel, i) => {
    if (i === 0) return { ...nivel, riesgo: undefined as "verde" | "amarillo" | "rojo" | undefined };
    const sel = nivel.seleccionado;
    if (!sel) return { ...nivel, riesgo: undefined };
    const riesgo = calcRiesgoConTipo(sel);
    return { ...nivel, riesgo };
  });

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rutas de Talento</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Simula movimientos y evalúa el impacto en la cadena de sucesión
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowEscenarios(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            📂 Escenarios ({escenarios.length})
          </button>
          {puestoObjetivo && cadena.length > 1 && (
            <>
              <button onClick={() => setShowSave(true)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
                💾 Guardar
              </button>
              <button onClick={() => window.print()}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
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

          {/* Filters: UEN→Area cascade + independent segmento + crítico */}
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={filterUen}
              onChange={(e) => { setFilterUen(e.target.value); setFilterArea(""); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 bg-white text-gray-700 min-w-[160px]"
            >
              <option value="">Todas las UEN</option>
              {uenOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              disabled={!filterUen}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 bg-white text-gray-700 min-w-[200px] disabled:opacity-40"
            >
              <option value="">Todas las Áreas</option>
              {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              {hasSinArea && <option value={AREA_SIN_ASIGNAR}>— Sin área asignada</option>}
            </select>
            <select
              value={filterSegmento}
              onChange={(e) => setFilterSegmento(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 bg-white text-gray-700 min-w-[140px]"
            >
              <option value="">Todos los Segmentos</option>
              {segmentoOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterCritico}
              onChange={(e) => setFilterCritico(e.target.value as "todos" | "critico" | "no_critico")}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 bg-white text-gray-700 min-w-[130px]"
            >
              <option value="todos">Crítico y No Crítico</option>
              <option value="critico">Solo Críticos</option>
              <option value="no_critico">Solo No Críticos</option>
            </select>
            {(filterUen || filterArea || filterSegmento || filterCritico !== "todos") && (
              <button
                onClick={() => { setFilterUen(""); setFilterArea(""); setFilterSegmento(""); setFilterCritico("todos"); }}
                className="text-xs text-gray-400 hover:text-gray-700 px-2 transition-colors"
              >
                ✕ Limpiar
              </button>
            )}
          </div>

          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar puesto por nombre o UEN…"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 mb-4"
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
            {puestosFiltered.slice(0, 60).map((p) => (
              <button key={p.id} onClick={() => seleccionarPuestoObjetivo(p)}
                className="text-left border border-gray-200 rounded-xl p-4 hover:border-[#1a3a5c] hover:shadow-sm transition-all group">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm group-hover:text-[#1a3a5c] transition-colors">{p.nombre}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.org}</p>
                    {p.ocupanteNombre && <p className="text-xs text-gray-400 mt-1">👤 {p.ocupanteNombre}</p>}
                  </div>
                  {p.esCritico && <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full shrink-0">Crítico</span>}
                </div>
              </button>
            ))}
            {puestosFiltered.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full text-center py-8">No se encontraron puestos</p>
            )}
          </div>
        </div>
      )}

      {/* Active chain */}
      {puestoObjetivo && (
        <div>
          {/* Filters + reset */}
          <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
            <button onClick={() => { setPuestoObjetivo(null); setCadena([]); setVeredicto(null); setAnalisisIA({}); setReporteIA(null); }}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
              ← Cambiar puesto
            </button>
            <div className="h-4 border-l border-gray-200" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Fuentes:</span>
            {(["sucesion", "plano", "picd"] as FuenteCandidato[]).map((f) => {
              const cfg = FUENTE_CONFIG[f];
              return (
                <button key={f} onClick={() => toggleFuente(f)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    fuentes.has(f) ? `${cfg.bg} ${cfg.color} border-transparent` : "border-gray-200 text-gray-400 bg-white"
                  }`}>
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
              const hasAnalisis = Boolean(analisisIA[nivel.uid]);
              const isLoadingThisNivel = loadingIA === nivel.uid;

              return (
                <div key={nivel.uid}>
                  {/* Connector */}
                  {i > 0 && <Connector candidato={prevSeleccionado} />}

                  {/* Position slot */}
                  <PuestoSlot
                    puesto={{ nombre: nivel.puestoNombre, esCritico: nivel.esCritico, ocupanteActualNombre: nivel.ocupanteActualNombre }}
                    riesgo={nivel.riesgo}
                    nivel={i}
                    isObjetivo={isObjetivo}
                  />

                  {/* Candidate panel (last level or unselected) */}
                  {(isLast || !nivel.seleccionado) && (
                    <div className="mt-4">
                      {nivel.candidatos === null ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          {isPending ? "Buscando candidatos…" : "Cargando…"}
                        </div>
                      ) : (
                        <div>
                          {nivel.candidatos.length > 0 && (
                            <>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                  {nivel.candidatos.length} candidato{nivel.candidatos.length !== 1 ? "s" : ""} interno{nivel.candidatos.length !== 1 ? "s" : ""}
                                </p>
                                {i > 0 && (
                                  <button onClick={() => detenerEn(i - 1)}
                                    className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1 transition-colors no-print">
                                    Detener aquí
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {nivel.candidatos.map((c) => (
                                  <CandidatoCard key={c.colaboradorId} candidato={c}
                                    isSelected={nivel.seleccionado?.colaboradorId === c.colaboradorId}
                                    onSeleccionar={() => seleccionarCandidato(i, c)}
                                  />
                                ))}
                              </div>
                            </>
                          )}

                          {nivel.candidatos.length === 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center mb-3">
                              <p className="text-sm text-gray-500">No se encontraron candidatos internos con las fuentes seleccionadas.</p>
                            </div>
                          )}

                          {/* Always-visible special options */}
                          <div className={`${nivel.candidatos.length > 0 ? "mt-4 pt-4 border-t border-gray-100" : ""}`}>
                            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
                              {nivel.candidatos.length > 0 ? "O bien:" : "Opciones disponibles:"}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                              <SpecialCandidatoCard tipo="externo"
                                isSelected={nivel.seleccionado?.tipo === "externo"}
                                onSeleccionar={() => seleccionarEspecial(i, "externo")}
                              />
                              <SpecialCandidatoCard tipo="sin_candidato"
                                isSelected={nivel.seleccionado?.tipo === "sin_candidato"}
                                onSeleccionar={() => seleccionarEspecial(i, "sin_candidato")}
                              />
                            </div>
                            {/* Propose any collaborator */}
                            <div
                              onClick={() => {
                                setPropuestoModal({ nivelIdx: i });
                                setPropuestoSelected(null);
                                setPropuestoSearch("");
                                setPropuestoOrg("");
                                setPropuestoResultados([]);
                                setPropuestoReadiness("uno_dos_anios");
                                setPropuestoContinuar(false);
                              }}
                              className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                                nivel.seleccionado?.tipo === "propuesto"
                                  ? "border-violet-400 bg-violet-50 shadow-md"
                                  : "border-dashed border-violet-200 bg-white hover:border-violet-400 hover:shadow-sm"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-lg flex-shrink-0">✦</div>
                                <div>
                                  <p className="font-semibold text-sm text-violet-800">
                                    {nivel.seleccionado?.tipo === "propuesto"
                                      ? nivel.seleccionado.nombre
                                      : "Proponer colaborador"}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {nivel.seleccionado?.tipo === "propuesto"
                                      ? `${nivel.seleccionado.puestoActual} · Talento propuesto`
                                      : "Talento de cualquier UEN, no perfilado previamente"}
                                  </p>
                                </div>
                              </div>
                              {nivel.seleccionado?.tipo !== "propuesto" && (
                                <div className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium bg-violet-100 text-violet-800">
                                  ＋ Buscar y seleccionar colaborador
                                </div>
                              )}
                              {nivel.seleccionado?.tipo === "propuesto" && (
                                <div className="mt-2 text-center">
                                  <span className="text-xs font-semibold text-violet-700">✓ Seleccionado · Click para cambiar</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Confirmed selection row (non-last levels) */}
                  {!isLast && nivel.seleccionado && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Avatar id={nivel.seleccionado.colaboradorId} nombre={nivel.seleccionado.nombre} size={28} />
                          <span>
                            <span className="font-semibold text-gray-900">{nivel.seleccionado.nombre}</span>
                            {" "}seleccionado
                            {nivel.seleccionado.tipo === "externo" && <span className="ml-1 text-xs text-amber-700 font-medium bg-amber-100 px-1.5 py-0.5 rounded">Externo</span>}
                            {nivel.seleccionado.tipo === "sin_candidato" && <span className="ml-1 text-xs text-red-700 font-medium bg-red-100 px-1.5 py-0.5 rounded">Sin candidato</span>}
                            {nivel.seleccionado.tipo === "propuesto" && <span className="ml-1 text-xs text-violet-700 font-medium bg-violet-100 px-1.5 py-0.5 rounded">✦ Propuesto</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 no-print">
                          {/* AI analysis button */}
                          <button
                            onClick={() => hasAnalisis
                              ? setAnalisisIA((prev) => { const n = { ...prev }; delete n[nivel.uid]; return n; })
                              : handleAnalisisNivel(nivel, i)}
                            disabled={isLoadingThisNivel}
                            className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            {isLoadingThisNivel ? (loadingStep || "Preparando…") : hasAnalisis ? "✦ Ocultar análisis" : "✦ Análisis IA"}
                          </button>
                          <button
                            onClick={() => {
                              setCadena((prev) =>
                                prev.map((n, idx) => idx === i ? { ...n, seleccionado: null } : n).slice(0, i + 1)
                              );
                              setVeredicto(null);
                              setAnalisisIA((prev) => { const n = { ...prev }; delete n[nivel.uid]; return n; });
                            }}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                          >
                            Cambiar
                          </button>
                        </div>
                      </div>

                      {/* Inline AI analysis */}
                      {hasAnalisis && (
                        <AnalisisPanelInline
                          text={analisisIA[nivel.uid]}
                          onClose={() => setAnalisisIA((prev) => { const n = { ...prev }; delete n[nivel.uid]; return n; })}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Analyze button */}
          {cadena.length > 1 && (
            <div className="mt-6 flex justify-center gap-3 no-print">
              <button onClick={analizarRuta}
                className="px-6 py-3 bg-[#1a3a5c] text-white rounded-xl font-semibold text-sm hover:bg-[#152e4d] transition-colors shadow-sm">
                🔍 Analizar Ruta
              </button>
            </div>
          )}

          {/* Verdict */}
          {veredicto && (
            <div className={`mt-6 rounded-xl border-2 p-6 ${
              veredicto.nivel === "viable" ? "border-emerald-300 bg-emerald-50"
              : veredicto.nivel === "moderado" ? "border-amber-300 bg-amber-50"
              : "border-red-300 bg-red-50"
            }`}>
              <div className="flex items-start gap-4">
                <div className="text-4xl">
                  {veredicto.nivel === "viable" ? "✅" : veredicto.nivel === "moderado" ? "⚠️" : "🔴"}
                </div>
                <div className="flex-1">
                  <h3 className={`text-xl font-bold ${
                    veredicto.nivel === "viable" ? "text-emerald-800"
                    : veredicto.nivel === "moderado" ? "text-amber-800"
                    : "text-red-800"
                  }`}>
                    Ruta {veredicto.nivel === "viable" ? "VIABLE"
                      : veredicto.nivel === "moderado" ? "CON RIESGO MODERADO"
                      : "DE ALTO RIESGO"}
                  </h3>
                  <p className="text-sm text-gray-600 mt-2">
                    {veredicto.nivel === "viable"
                      ? "Todos los movimientos tienen cobertura de sucesión adecuada."
                      : veredicto.nivel === "moderado"
                      ? "Hay posiciones con sucesores disponibles pero no inmediatos, o candidatos externos."
                      : "Hay posiciones críticas sin sucesor o sin candidato definido."}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    {veredicto.verdes > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        {veredicto.verdes} con cobertura
                      </span>
                    )}
                    {veredicto.amarillos > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-amber-500 rounded-full" />
                        {veredicto.amarillos} riesgo moderado
                      </span>
                    )}
                    {veredicto.rojos > 0 && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-100 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 bg-red-500 rounded-full" />
                        {veredicto.rojos} sin cobertura
                      </span>
                    )}
                  </div>

                  {/* Generate full AI report */}
                  <div className="mt-4 pt-4 border-t border-black/10 no-print">
                    <button
                      onClick={reporteIA ? () => setShowReporte(true) : handleReporteIA}
                      disabled={loadingIA === "reporte"}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white border border-blue-200 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <span className="text-base">✦</span>
                      {loadingIA === "reporte" ? (loadingStep || "Preparando…")
                        : reporteIA ? "Ver Reporte IA"
                        : "Generar Reporte IA completo"}
                    </button>
                    {reporteIA && (
                      <p className="text-xs text-gray-400 mt-1.5">Reporte generado · Se guardará con el escenario</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full AI Report Modal */}
      {showReporte && reporteIA && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">✦ Reporte IA — Talent Management</h3>
                <p className="text-xs text-gray-500 mt-0.5">{puestoObjetivo?.nombre}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  ⬇ PDF
                </button>
                <button onClick={() => setShowReporte(false)}
                  className="text-gray-400 hover:text-gray-700 text-xl px-2">✕</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: reporteIA
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/^## (.*?)$/gm, "<h2 class='text-base font-bold text-gray-900 mt-4 mb-2'>$1</h2>")
                  .replace(/^### (.*?)$/gm, "<h3 class='text-sm font-bold text-gray-800 mt-3 mb-1'>$1</h3>")
                  .replace(/^- (.*?)$/gm, "<li class='ml-4 list-disc'>$1</li>")
                  .replace(/\n\n/g, "<br/><br/>")
                }} />
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSave && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Guardar escenario</h3>
            <input
              value={saveNombre} onChange={(e) => setSaveNombre(e.target.value)}
              placeholder="Nombre del escenario…"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
              autoFocus onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            {reporteIA && <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-4">✦ El reporte IA se guardará con el escenario</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSave(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={!saveNombre.trim() || isPending}
                className="px-4 py-2 text-sm font-medium bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-50">
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
                      <p className="text-xs text-gray-400">{new Date(e.created_at).toLocaleDateString("es-MX")}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleLoadEscenario(e.id)}
                        className="text-xs font-medium px-3 py-1.5 bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] transition-colors">
                        Cargar
                      </button>
                      <button onClick={() => handleDeleteEscenario(e.id)}
                        className="text-xs text-red-600 hover:text-red-800 transition-colors px-2">
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

      {/* Proponer Colaborador Modal */}
      {propuestoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">✦ Proponer colaborador</h3>
                <p className="text-xs text-gray-500 mt-0.5">Busca talento de cualquier UEN</p>
              </div>
              <button onClick={() => setPropuestoModal(null)} className="text-gray-400 hover:text-gray-700 text-xl px-2">✕</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <input
                  value={propuestoSearch}
                  onChange={(e) => {
                    setPropuestoSearch(e.target.value);
                    handlePropuestoSearch(e.target.value, propuestoOrg);
                  }}
                  placeholder="Buscar por nombre…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  autoFocus
                />
                <select
                  value={propuestoOrg}
                  onChange={(e) => {
                    setPropuestoOrg(e.target.value);
                    handlePropuestoSearch(propuestoSearch, e.target.value);
                  }}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                >
                  <option value="">Todas las UENs</option>
                  {[...new Set(propuestoResultados.map((r) => r.org).filter(Boolean))].map((org) => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </select>
              </div>

              {/* Results */}
              {propuestoBuscando && (
                <p className="text-sm text-gray-400 text-center py-4">Buscando…</p>
              )}
              {!propuestoBuscando && propuestoResultados.length > 0 && (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {propuestoResultados.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setPropuestoSelected(r)}
                      className={`border-2 rounded-xl p-3 cursor-pointer transition-all ${
                        propuestoSelected?.id === r.id
                          ? "border-violet-400 bg-violet-50"
                          : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-900">{r.nombre}</p>
                          <p className="text-xs text-gray-500">{r.puestoActual}</p>
                          {r.org && <p className="text-xs text-gray-400 mt-0.5">{r.org}</p>}
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          {r.esCritico && (
                            <span className="block text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">Crítico</span>
                          )}
                          {r.tieneSucesor && (
                            <span className="block text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">Con sucesor</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!propuestoBuscando && propuestoSearch.length >= 2 && propuestoResultados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Sin resultados</p>
              )}
              {!propuestoBuscando && propuestoSearch.length < 2 && propuestoResultados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Escribe al menos 2 caracteres para buscar</p>
              )}

              {/* Readiness + chain toggle (shown after selecting) */}
              {propuestoSelected && (
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      Readiness para el puesto objetivo
                    </p>
                    <div className="flex gap-2">
                      {[
                        { value: "listo_ahora", label: "Listo ahora", color: "emerald" },
                        { value: "uno_dos_anios", label: "1-2 años", color: "amber" },
                        { value: "tres_mas_anios", label: "3+ años", color: "red" },
                      ].map(({ value, label, color }) => (
                        <button
                          key={value}
                          onClick={() => setPropuestoReadiness(value)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                            propuestoReadiness === value
                              ? color === "emerald" ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                : color === "amber" ? "border-amber-400 bg-amber-50 text-amber-800"
                                : "border-red-400 bg-red-50 text-red-800"
                              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Continuar cadena desde su puesto actual</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {propuestoSelected.esCritico
                          ? "⚠️ Su puesto actual es crítico — se creará nivel adicional"
                          : "Crea un nivel adicional para cubrir su puesto vacante"}
                      </p>
                    </div>
                    <button
                      onClick={() => setPropuestoContinuar((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        propuestoContinuar ? "bg-violet-600" : "bg-gray-200"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        propuestoContinuar ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setPropuestoModal(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={confirmarPropuesto}
                disabled={!propuestoSelected}
                className="px-4 py-2 text-sm font-semibold bg-violet-700 text-white rounded-lg hover:bg-violet-800 disabled:opacity-40 transition-colors"
              >
                ✦ Proponer candidato
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}} />
    </div>
  );
}
