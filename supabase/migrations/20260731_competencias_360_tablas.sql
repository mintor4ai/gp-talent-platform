-- Raw per-evaluator-per-competency scores (one row per evaluado+evaluador+competencia)
CREATE TABLE IF NOT EXISTS competencias_360_detalle (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id       uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ciclo_año            integer NOT NULL,
  empleado_evaluado_id text NOT NULL,
  segmento             text,
  evaluador_id         text NOT NULL,
  evaluador_nombre     text,
  competencia_id       integer,
  competencia          text,
  tipo_competencia     text,   -- 'Individual' | 'Colaboración'
  calificacion         numeric,
  origen_dato          text NOT NULL DEFAULT 'ReporteCompetencias',
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, ciclo_año, evaluador_id, competencia_id)
);

ALTER TABLE competencias_360_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_comp_detalle" ON competencias_360_detalle
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios_app WHERE id = auth.uid() AND rol IN ('capital_humano','superadmin'))
  );
CREATE POLICY "self_select_comp_detalle" ON competencias_360_detalle
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      JOIN usuarios_app ua ON ua.id_empleado = c.id WHERE ua.id = auth.uid()
    )
  );
CREATE POLICY "jefe_select_comp_detalle" ON competencias_360_detalle
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      WHERE c.jefe_inmediato_id IN (
        SELECT col.id FROM colaboradores col
        JOIN usuarios_app ua ON ua.id_empleado = col.id WHERE ua.id = auth.uid()
      )
    )
  );

-- Raw per-evaluator general comments + overall score (one row per evaluado+evaluador)
CREATE TABLE IF NOT EXISTS competencias_360_comentarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id       uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ciclo_año            integer NOT NULL,
  empleado_evaluado_id text NOT NULL,
  evaluador_id         text NOT NULL,
  evaluador_nombre     text,
  calificacion_general numeric,   -- scale 1–10
  comentarios          text,
  origen_dato          text NOT NULL DEFAULT 'ReporteCompetencias',
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, ciclo_año, evaluador_id)
);

ALTER TABLE competencias_360_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_comp_comentarios" ON competencias_360_comentarios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios_app WHERE id = auth.uid() AND rol IN ('capital_humano','superadmin'))
  );
CREATE POLICY "self_select_comp_comentarios" ON competencias_360_comentarios
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      JOIN usuarios_app ua ON ua.id_empleado = c.id WHERE ua.id = auth.uid()
    )
  );
CREATE POLICY "jefe_select_comp_comentarios" ON competencias_360_comentarios
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      WHERE c.jefe_inmediato_id IN (
        SELECT col.id FROM colaboradores col
        JOIN usuarios_app ua ON ua.id_empleado = col.id WHERE ua.id = auth.uid()
      )
    )
  );

-- Add competencia_id to the existing aggregated table (if not already there)
ALTER TABLE evaluacion_competencias_360
  ADD COLUMN IF NOT EXISTS competencia_id integer,
  ADD COLUMN IF NOT EXISTS num_evaluadores integer,
  ADD COLUMN IF NOT EXISTS calificacion_general_promedio numeric;
