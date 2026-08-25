"use client";

import { useState } from "react";
import SucesionAdminView from "./SucesionAdminView";
import CoberturaView from "./CoberturaView";
import MatchingView from "./MatchingView";
import type { SucesionItem } from "../carpeta/[id]/SucesionEditor";
import type { PuestoCoberturaItem } from "./CoberturaView";
import type { MatchRow } from "./MatchingView";

type ColabRow = {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  organización: string | null;
  segmento_organizacional: string | null;
};

export default function SucesionTabs({
  planes,
  colabs,
  ciclos,
  puestosByCiclo,
  coberturaAllCiclos,
  uens,
  segmentos,
  matches,
  matchCiclos,
}: {
  planes: SucesionItem[];
  colabs: ColabRow[];
  ciclos: number[];
  puestosByCiclo: Record<number, PuestoCoberturaItem[]>;
  coberturaAllCiclos: PuestoCoberturaItem[];
  uens: string[];
  segmentos: string[];
  matches: MatchRow[];
  matchCiclos: number[];
}) {
  const [tab, setTab] = useState<"planes" | "cobertura" | "matching">("planes");
  const [cicloCobertura, setCicloCobertura] = useState<number | "todos">(ciclos[0] ?? "todos");

  const puestosCobertura =
    cicloCobertura === "todos"
      ? coberturaAllCiclos
      : (puestosByCiclo[cicloCobertura] ?? coberturaAllCiclos);

  const gapsCriticosCount = coberturaAllCiclos.filter(
    (p) => p.es_critico && p.sucesores.length === 0 && p.titulares.length > 0
  ).length;

  const activeMatchGaps = matches.filter(
    (m) => m.tipo_match === "gap_critico" && !m.descartado
  ).length;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <TabBtn active={tab === "planes"} onClick={() => setTab("planes")}>
          Planes de Sucesión
        </TabBtn>
        <TabBtn active={tab === "cobertura"} onClick={() => setTab("cobertura")}>
          Cobertura por Puesto
          {gapsCriticosCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
              {gapsCriticosCount}
            </span>
          )}
        </TabBtn>
        <TabBtn active={tab === "matching"} onClick={() => setTab("matching")}>
          Motor de Matching
          {activeMatchGaps > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
              {activeMatchGaps}
            </span>
          )}
        </TabBtn>
      </div>

      {tab === "planes" && (
        <SucesionAdminView planes={planes} colabs={colabs} ciclos={ciclos} allCiclos={matchCiclos} segmentos={segmentos} />
      )}
      {tab === "cobertura" && (
        <CoberturaView
          puestos={puestosCobertura}
          uens={uens}
          segmentos={segmentos}
          cicloActual={cicloCobertura}
          ciclosDisponibles={ciclos}
          onCicloChange={setCicloCobertura}
        />
      )}
      {tab === "matching" && (
        <MatchingView
          matches={matches}
          ciclosDisponibles={matchCiclos}
          uens={uens}
          segmentos={segmentos}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active
          ? "border-[#1a3a5c] text-[#1a3a5c]"
          : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}
