"use client";

import { useState } from "react";
import SucesionAdminView from "./SucesionAdminView";
import CoberturaView from "./CoberturaView";
import type { SucesionItem } from "../carpeta/[id]/SucesionEditor";
import type { PuestoCoberturaItem } from "./CoberturaView";

type ColabRow = {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  nivel: string | null;
  area: string | null;
  organización: string | null;
};

export default function SucesionTabs({
  planes,
  colabs,
  ciclos,
  puestos,
  uens,
}: {
  planes: SucesionItem[];
  colabs: ColabRow[];
  ciclos: number[];
  puestos: PuestoCoberturaItem[];
  uens: string[];
}) {
  const [tab, setTab] = useState<"planes" | "cobertura">("planes");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <TabBtn active={tab === "planes"} onClick={() => setTab("planes")}>
          Planes de Sucesión
        </TabBtn>
        <TabBtn active={tab === "cobertura"} onClick={() => setTab("cobertura")}>
          Cobertura por Puesto
          {puestos.filter((p) => p.es_critico && p.sucesores.length === 0 && p.titulares.length > 0).length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
              {puestos.filter((p) => p.es_critico && p.sucesores.length === 0 && p.titulares.length > 0).length}
            </span>
          )}
        </TabBtn>
      </div>

      {tab === "planes" && (
        <SucesionAdminView planes={planes} colabs={colabs} ciclos={ciclos} />
      )}
      {tab === "cobertura" && (
        <CoberturaView puestos={puestos} uens={uens} />
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
