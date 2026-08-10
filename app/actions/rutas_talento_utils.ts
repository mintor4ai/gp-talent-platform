// Shared helpers — no "use server" so they can be imported by client components too

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
