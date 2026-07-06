export type Rol = "colaborador" | "jefe" | "capital_humano" | "superadmin";

export type ZonaBand = {
  zona: string;
  umbral_inferior: number;
  umbral_superior: number;
};

export interface UsuarioApp {
  id: string;
  id_empleado: string | null;
  rol: Rol;
  coach_habilitado: boolean;
  tokens_consumidos_mes: number;
  tokens_limite_mes: number;
  activo: boolean;
  created_at: string;
}

export interface Colaborador {
  id: string;
  id_empleado: string;
  nombre_completo: string;
  organización: string;
  puesto: string;
  nivel: string;
  nivel_num: number;
  segmento_organizacional: string;
  jefe_inmediato_nombre: string | null;
  area: string | null;
  departamento: string | null;
  entidad: string | null;
  razon_social: string | null;
  correo: string | null;
  sexo: string | null;
  edad: number | null;
  fecha_antiguedad: string | null;
  nivel_academico: string | null;
  resumen_exp_interno: string | null;
  resumen_exp_externo: string | null;
  resumen_formacion_profesional: string | null;
  estatus_empleado: number;
  activo: boolean;
}

export interface EvaluacionIntegralPersonal {
  id: string;
  id_empleado: string;
  ciclo_año: number;
  tipo_matriz: string;
  tuvo_eal: boolean | null;
  entrego_picd: boolean | null;
  desempeno_logra: number | null;
  años_experiencia: number | null;
  años_en_puesto: number | null;
  ev_exp: number | null;
  ev_form_acad: number | null;
  ev_comp: number | null;
  ev_eal: number | null;
  ev_picd: number | null;
  evaluacion_potencial_total: number | null;
  zona_evaluacion: string | null;
  origen_dato: string;
  created_at: string;
}

export interface EvaluacionDesempeno {
  id: string;
  id_empleado: string;
  ciclo_año: number;
  planea: number | null;
  ejecuta: number | null;
  optimiza: number | null;
  trabaja_equipo: number | null;
  atiende_cliente: number | null;
  informa: number | null;
  resultado_logra: number | null;
  persona_clave: number | null;
  estatus_desem: string | null;
}

export type Periodo = {
  ciclo_año: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "planificado" | "activo" | "cerrado";
  activo: boolean;
  created_at?: string;
  updated_at?: string;
};

export const ZONA_COLORS: Record<string, { bg: string; text: string }> = {
  Sobresaliente: { bg: "bg-purple-100", text: "text-purple-800" },
  Desarrollo: { bg: "bg-blue-100", text: "text-blue-800" },
  Estabilidad: { bg: "bg-green-100", text: "text-green-800" },
  Revisión: { bg: "bg-orange-100", text: "text-orange-800" },
  Inicio: { bg: "bg-yellow-100", text: "text-yellow-800" },
};

export const ROL_LABELS: Record<Rol, string> = {
  colaborador: "Colaborador",
  jefe: "Jefe / Líder",
  capital_humano: "Capital Humano",
  superadmin: "Super Admin",
};
