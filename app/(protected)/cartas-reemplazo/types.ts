export type CartaNode = {
  id: string;
  id_empleado: string | null;
  nombre_completo: string;
  puesto: string | null;
  nivel: string | null;
  organización: string | null;
  area: string | null;
  jefe_inmediato_id: string | null;
  puesto_catalogo_id: string | null;
};

export type CartaEip = {
  id_empleado: string;
  ciclo_año: number;
  zona_evaluacion: string | null;
  evaluacion_potencial_total: number | null;
  desempeno_logra: number | null;
  años_en_puesto: number | null;
};

export type CartaTalentoClave = {
  colaborador_id: string;
  es_talento_clave: boolean;
  fuente: string;
  ciclo_año: number;
};

export type CartaSucesor = {
  id_empleado_titular: string;
  sucesor_nombre: string;
  sucesor_id: string | null;
  readiness: string | null;
  tiempo_estimado: string | null;
  estado: string;
  ciclo_año: number;
};

export type CartaPicd = {
  id_empleado: string;
  ciclo_año: number;
  puesto_futuro_opcion1: string | null;
  puesto_futuro_opcion2: string | null;
  puesto_futuro_id1: string | null;
  puesto_futuro_id2: string | null;
};

export type CartaCatalogoPuesto = {
  id: string;
  nombre: string;
  es_critico: boolean;
  organización: string | null;
};
