// Shared types and helpers — no "use server", importable by both client and server

export type FuenteCandidato = "sucesion" | "plano" | "picd";

export type TipoCandidato = "interno" | "externo" | "sin_candidato" | "propuesto";

export type Candidato = {
  colaboradorId: string;
  nombre: string;
  puestoActual: string;
  puestoCatalogoId: string | null;
  puestoActualEsCritico: boolean;
  fuentes: FuenteCandidato[];
  readiness: string | null;
  tieneSucesor: boolean;
  readinessMejorSucesor: string | null;
  tipo?: TipoCandidato;
  picdBorrador?: boolean; // true when the only PICD cycle found is still a draft
};

export type PuestoOption = {
  id: string;
  nombre: string;
  org: string;
  area: string;
  segmento: string;
  esCritico: boolean;
  propuesto: boolean;
  ocupanteNombre: string | null;
  ocupanteId: string | null;
};

export type EscenarioResumen = {
  id: string;
  nombre: string;
  created_at: string;
  puestoObjetivoNombre: string;
  nivelCount: number;
};

export function readinessLabel(r: string | null): string {
  if (!r) return "No definido";
  if (r === "listo_ahora") return "Listo Ahora";
  if (r === "uno_dos_anios") return "1-2 años";
  if (r === "tres_mas_anios") return "3+ años";
  return r;
}

export function calcRiesgo(
  esCritico: boolean,
  tieneSucesor: boolean,
  readinessMejorSucesor: string | null
): "verde" | "amarillo" | "rojo" {
  if (!esCritico) return "verde";
  if (!tieneSucesor) return "rojo";
  if (readinessMejorSucesor === "listo_ahora") return "verde";
  return "amarillo";
}

export function calcRiesgoConTipo(candidato: Candidato): "verde" | "amarillo" | "rojo" {
  if (candidato.tipo === "externo") return "amarillo";
  if (candidato.tipo === "sin_candidato") return "rojo";
  if (candidato.tipo === "propuesto") {
    const base =
      candidato.readiness === "listo_ahora" ? "verde"
      : candidato.readiness === "tres_mas_anios" ? "rojo"
      : "amarillo";
    // Bump: leaving a critical position adds risk
    if (base === "verde" && candidato.puestoActualEsCritico) return "amarillo";
    return base;
  }
  return calcRiesgo(
    candidato.puestoActualEsCritico,
    candidato.tieneSucesor,
    candidato.readinessMejorSucesor
  );
}

export type ColaboradorBusqueda = {
  id: string;
  nombre: string;
  puestoActual: string;
  puestoCatalogoId: string | null;
  org: string;
  esCritico: boolean;
  tieneSucesor: boolean;
  readinessMejorSucesor: string | null;
};

export function candidatoExterno(): Candidato {
  return {
    colaboradorId: "__externo__",
    nombre: "Candidato Externo",
    puestoActual: "Reclutamiento externo",
    puestoCatalogoId: null,
    puestoActualEsCritico: false,
    fuentes: [],
    readiness: null,
    tieneSucesor: true,
    readinessMejorSucesor: null,
    tipo: "externo",
  };
}

export function candidatoSinDefinir(): Candidato {
  return {
    colaboradorId: "__sin_candidato__",
    nombre: "Sin candidato definido",
    puestoActual: "Gap no cubierto",
    puestoCatalogoId: null,
    puestoActualEsCritico: true,
    fuentes: [],
    readiness: null,
    tieneSucesor: false,
    readinessMejorSucesor: null,
    tipo: "sin_candidato",
  };
}
