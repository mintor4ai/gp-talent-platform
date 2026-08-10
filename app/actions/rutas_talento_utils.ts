// Shared types and helpers — no "use server", importable by both client and server

export type FuenteCandidato = "sucesion" | "plano" | "picd";

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
};

export type PuestoOption = {
  id: string;
  nombre: string;
  org: string;
  esCritico: boolean;
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
