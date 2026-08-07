-- ═══════════════════════════════════════════════════════════════════
--  PLANO DE CARRERA
--  Un solo plan activo por colaborador.
--  N objetivos (posiciones target) con prioridad editable + log.
--  Acciones de desarrollo por dimensión, con trazabilidad de IA.
--  Revisiones anuales co-gestionadas por CH y jefe directo.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. plan_carrera ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_carrera (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id   uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ciclo_año        integer NOT NULL,
  estado           text NOT NULL DEFAULT 'activo'
                     CHECK (estado IN ('activo','pausado','cerrado')),
  snapshot_json    jsonb NOT NULL DEFAULT '{}',
  notas_internas   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES auth.users(id),

  -- Garantía de nivel DB: un solo plan por persona
  CONSTRAINT plan_carrera_colab_unique UNIQUE (colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_carrera_colab ON plan_carrera (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_plan_carrera_ciclo ON plan_carrera (ciclo_año);

-- ── 2. plan_carrera_objetivos ────────────────────────────────────
--  Posiciones target (primaria + alternativas).
--  prioridad=1 → objetivo principal; 2,3… → alternativos.
CREATE TABLE IF NOT EXISTS plan_carrera_objetivos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid NOT NULL REFERENCES plan_carrera(id) ON DELETE CASCADE,
  puesto_catalogo_id  uuid NOT NULL REFERENCES catalogo_puestos(id),
  match_id            uuid REFERENCES sucesion_matches(id),   -- match que lo originó (nullable)
  prioridad           integer NOT NULL DEFAULT 1 CHECK (prioridad >= 1),
  notas               text,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pco_plan    ON plan_carrera_objetivos (plan_id);
CREATE INDEX IF NOT EXISTS idx_pco_puesto  ON plan_carrera_objetivos (puesto_catalogo_id);
-- Garantía: no duplicar el mismo puesto activo en el mismo plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_pco_plan_puesto_unique
  ON plan_carrera_objetivos (plan_id, puesto_catalogo_id)
  WHERE activo = true;

-- ── 3. plan_carrera_objetivos_log ───────────────────────────────
--  Historial inmutable de cambios en objetivos (prioridad, notas, activo).
CREATE TABLE IF NOT EXISTS plan_carrera_objetivos_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objetivo_id    uuid NOT NULL REFERENCES plan_carrera_objetivos(id) ON DELETE CASCADE,
  campo          text NOT NULL,        -- 'prioridad' | 'activo' | 'notas'
  valor_anterior text,
  valor_nuevo    text,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pcol_objetivo ON plan_carrera_objetivos_log (objetivo_id);

-- ── 4. plan_carrera_acciones ─────────────────────────────────────
--  Actividades de desarrollo (manuales o sugeridas por IA).
CREATE TABLE IF NOT EXISTS plan_carrera_acciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES plan_carrera(id) ON DELETE CASCADE,
  objetivo_id          uuid REFERENCES plan_carrera_objetivos(id), -- nullable: acción general o ligada a un target
  dimension            text NOT NULL
                         CHECK (dimension IN ('tecnica','liderazgo','visibilidad','operativa')),
  titulo               text NOT NULL,
  descripcion          text,
  tipo                 text NOT NULL
                         CHECK (tipo IN ('capacitacion','proyecto','mentoria','rotacion','visibilidad')),
  estado               text NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','en_progreso','completado','cancelado')),
  fecha_inicio         date,
  fecha_fin_estimada   date,
  fecha_completado     date,
  validado_por         uuid REFERENCES auth.users(id),
  fecha_validacion     timestamptz,
  -- Trazabilidad IA
  origen               text NOT NULL DEFAULT 'manual'
                         CHECK (origen IN ('manual','ia')),
  ia_prompt_id         uuid REFERENCES configuracion_prompts(id),  -- versión del prompt usada
  ia_respuesta_json    jsonb,                                        -- respuesta completa para auditoría
  -- Auditoría
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pca_plan      ON plan_carrera_acciones (plan_id);
CREATE INDEX IF NOT EXISTS idx_pca_objetivo  ON plan_carrera_acciones (objetivo_id);
CREATE INDEX IF NOT EXISTS idx_pca_dimension ON plan_carrera_acciones (dimension);
CREATE INDEX IF NOT EXISTS idx_pca_estado    ON plan_carrera_acciones (estado);

-- ── 5. plan_carrera_revisiones ───────────────────────────────────
--  Revisiones anuales co-gestionadas: CH + jefe directo.
CREATE TABLE IF NOT EXISTS plan_carrera_revisiones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES plan_carrera(id) ON DELETE CASCADE,
  ciclo_año            integer NOT NULL,
  estado               text NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','en_proceso','completada')),
  fecha_revision       date,
  notas_ch             text,
  notas_jefe           text,
  notas_colaborador    text,
  -- Quién completó cada sección
  completada_por_ch    uuid REFERENCES auth.users(id),
  fecha_ch             timestamptz,
  completada_por_jefe  uuid REFERENCES auth.users(id),
  fecha_jefe           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id),
  CONSTRAINT plan_carrera_revision_ciclo_unique UNIQUE (plan_id, ciclo_año)
);

CREATE INDEX IF NOT EXISTS idx_pcr_plan  ON plan_carrera_revisiones (plan_id);
CREATE INDEX IF NOT EXISTS idx_pcr_ciclo ON plan_carrera_revisiones (ciclo_año);

-- ── 6. updated_at auto-trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_plan_carrera_updated_at
    BEFORE UPDATE ON plan_carrera
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_plan_carrera_objetivos_updated_at
    BEFORE UPDATE ON plan_carrera_objetivos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_plan_carrera_acciones_updated_at
    BEFORE UPDATE ON plan_carrera_acciones
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. RLS ───────────────────────────────────────────────────────
ALTER TABLE plan_carrera               ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_carrera_objetivos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_carrera_objetivos_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_carrera_acciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_carrera_revisiones    ENABLE ROW LEVEL SECURITY;

-- plan_carrera: admins y jefes gestionan; colaborador lee el suyo
CREATE POLICY "pc_admin_all" ON plan_carrera
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_app
      WHERE id = auth.uid()
        AND rol IN ('capital_humano','superadmin','jefe')
    )
  );

CREATE POLICY "pc_colab_own" ON plan_carrera
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_app u
      JOIN colaboradores c ON c.id = u.id_empleado
      WHERE u.id = auth.uid()
        AND c.id = plan_carrera.colaborador_id
    )
  );

-- Objetivos: mismas reglas vía plan
CREATE POLICY "pco_admin_all" ON plan_carrera_objetivos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_app
      WHERE id = auth.uid()
        AND rol IN ('capital_humano','superadmin','jefe')
    )
  );

-- Log: solo lectura para admins
CREATE POLICY "pcol_admin_read" ON plan_carrera_objetivos_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_app
      WHERE id = auth.uid()
        AND rol IN ('capital_humano','superadmin')
    )
  );

-- Acciones: admins y jefe gestionan; colaborador lee las suyas
CREATE POLICY "pca_admin_all" ON plan_carrera_acciones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_app
      WHERE id = auth.uid()
        AND rol IN ('capital_humano','superadmin','jefe')
    )
  );

CREATE POLICY "pca_colab_read" ON plan_carrera_acciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_carrera pc
      JOIN usuarios_app u ON u.id = auth.uid()
      JOIN colaboradores c ON c.id = u.id_empleado
      WHERE pc.id = plan_carrera_acciones.plan_id
        AND pc.colaborador_id = c.id
    )
  );

-- Revisiones: admins y jefe gestionan; colaborador lee
CREATE POLICY "pcr_admin_all" ON plan_carrera_revisiones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios_app
      WHERE id = auth.uid()
        AND rol IN ('capital_humano','superadmin','jefe')
    )
  );

CREATE POLICY "pcr_colab_read" ON plan_carrera_revisiones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_carrera pc
      JOIN usuarios_app u ON u.id = auth.uid()
      JOIN colaboradores c ON c.id = u.id_empleado
      WHERE pc.id = plan_carrera_revisiones.plan_id
        AND pc.colaborador_id = c.id
    )
  );

-- ── 8. Seed del prompt plano_carrera_sugerencias ─────────────────
--  Solo inserta si el tipo no existe aún.
INSERT INTO configuracion_prompts (tipo, contenido, version, activo)
SELECT
  'plano_carrera_sugerencias',
  'Eres un consultor experto en desarrollo de talento para Grupo GP, empresa constructora e inmobiliaria.
Tu tarea es sugerir acciones de desarrollo concretas para un colaborador identificado como sucesor potencial.

Dimensión a desarrollar: {{dimension}}
Perfil del colaborador: {{snapshot}}
Puesto objetivo: {{puesto_objetivo}}
Brecha identificada: {{brecha}}

Genera entre 3 y 5 acciones específicas, accionables y medibles.
Para cada acción incluye: título corto, descripción (máx 2 líneas), tipo (capacitacion|proyecto|mentoria|rotacion|visibilidad), y duración estimada en meses.

Responde únicamente en JSON con el esquema:
[{"titulo":"","descripcion":"","tipo":"","duracion_meses":0}]',
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM configuracion_prompts WHERE tipo = 'plano_carrera_sugerencias'
);
