-- formacion_academica: one row per degree/study per collaborator
CREATE TABLE IF NOT EXISTS formacion_academica (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id    uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  id_empleado       text NOT NULL,
  nivel_estudio     text,
  nombre_carrera    text,
  institucion       text,
  fecha_inicio      date,
  fecha_fin         date,
  cedula            text,
  estado_cedula     text,
  origen_dato       text NOT NULL DEFAULT 'ReporteEstudios',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE formacion_academica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_formacion_academica" ON formacion_academica
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios_app WHERE id = auth.uid() AND rol IN ('capital_humano','superadmin'))
  );

CREATE POLICY "self_select_formacion_academica" ON formacion_academica
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      JOIN usuarios_app ua ON ua.id_empleado = c.id
      WHERE ua.id = auth.uid()
    )
  );

CREATE POLICY "jefe_select_formacion_academica" ON formacion_academica
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      WHERE c.jefe_inmediato_id IN (
        SELECT col.id FROM colaboradores col
        JOIN usuarios_app ua ON ua.id_empleado = col.id
        WHERE ua.id = auth.uid()
      )
    )
  );

-- cursos_formacion: one row per course/training record
CREATE TABLE IF NOT EXISTS cursos_formacion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id        uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  id_empleado           text NOT NULL,
  id_registro_source    text,
  nombre_curso          text,
  fecha_inicio          date,
  fecha_fin             date,
  lugar                 text,
  institucion           text,
  documento             text,
  horas_efectivas       numeric,
  tipo_curso            text,
  evaluacion_final      numeric,
  estado_completitud    text,
  origen_dato           text NOT NULL DEFAULT 'ReporteCursos',
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cursos_formacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_cursos_formacion" ON cursos_formacion
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios_app WHERE id = auth.uid() AND rol IN ('capital_humano','superadmin'))
  );

CREATE POLICY "self_select_cursos_formacion" ON cursos_formacion
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      JOIN usuarios_app ua ON ua.id_empleado = c.id
      WHERE ua.id = auth.uid()
    )
  );

CREATE POLICY "jefe_select_cursos_formacion" ON cursos_formacion
  FOR SELECT USING (
    colaborador_id IN (
      SELECT c.id FROM colaboradores c
      WHERE c.jefe_inmediato_id IN (
        SELECT col.id FROM colaboradores col
        JOIN usuarios_app ua ON ua.id_empleado = col.id
        WHERE ua.id = auth.uid()
      )
    )
  );
