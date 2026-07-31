-- Add raw import columns to evaluacion_integral_personal
ALTER TABLE evaluacion_integral_personal
  ADD COLUMN IF NOT EXISTS uen                    text,
  ADD COLUMN IF NOT EXISTS tablero_gestion        numeric,
  ADD COLUMN IF NOT EXISTS puesto_ciclo           text,
  ADD COLUMN IF NOT EXISTS segmento_organizacional text,
  ADD COLUMN IF NOT EXISTS escolaridad_texto      text,
  ADD COLUMN IF NOT EXISTS escolaridad_id         integer,
  ADD COLUMN IF NOT EXISTS horas_cursos           numeric,
  ADD COLUMN IF NOT EXISTS competencias           numeric,
  ADD COLUMN IF NOT EXISTS percentil_competencias text,
  ADD COLUMN IF NOT EXISTS eal_score              numeric,
  ADD COLUMN IF NOT EXISTS percentil_eal          text,
  ADD COLUMN IF NOT EXISTS cumplimiento_picd      numeric;
