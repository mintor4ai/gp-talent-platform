-- Immutable audit log for HrCorp import changes.
-- One row per imported collaborator that had at least one field change.
CREATE TABLE IF NOT EXISTS colaboradores_historial (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id      uuid        NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  importado_por       uuid        REFERENCES usuarios_app(id),
  importado_en        timestamptz NOT NULL DEFAULT now(),
  campos_modificados  text[]      NOT NULL DEFAULT '{}',
  datos_anteriores    jsonb       NOT NULL,
  datos_nuevos        jsonb       NOT NULL
);

ALTER TABLE colaboradores_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_colaboradores_historial" ON colaboradores_historial
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios_app
      WHERE id = auth.uid()
        AND rol IN ('capital_humano', 'superadmin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_col_historial_colaborador_id
  ON colaboradores_historial (colaborador_id);

CREATE INDEX IF NOT EXISTS idx_col_historial_importado_en
  ON colaboradores_historial (importado_en DESC);
