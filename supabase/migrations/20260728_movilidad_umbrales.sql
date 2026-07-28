-- B1: Semáforo de movilidad — tabla de umbrales configurables
CREATE TABLE movilidad_umbrales (
  id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_año               integer      NOT NULL,
  organización            text,                    -- NULL = todas las UEN
  segmento_organizacional text,                    -- NULL = todos los segmentos
  meses_amarillo          integer      NOT NULL DEFAULT 24,  -- verde < meses_amarillo
  meses_rojo              integer      NOT NULL DEFAULT 48,  -- amarillo < meses_rojo, rojo >= meses_rojo
  activo                  boolean      NOT NULL DEFAULT true,
  creado_por              uuid         REFERENCES usuarios_app(id),
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now()
);

-- Umbral global fallback para 2026
INSERT INTO movilidad_umbrales (ciclo_año, organización, segmento_organizacional, meses_amarillo, meses_rojo)
VALUES (2026, NULL, NULL, 24, 48);

-- Umbrales base por segmento (aplican a todas las UEN; se pueden sobreescribir por UEN+segmento)
-- Lógica: a mayor nivel jerárquico, más tiempo esperado en cada etapa
INSERT INTO movilidad_umbrales (ciclo_año, organización, segmento_organizacional, meses_amarillo, meses_rojo)
VALUES
  (2026, NULL, 'DIRECTOR',             24,  120),  -- <2a · 2-10a · >10a
  (2026, NULL, 'GERENTE',              18,   84),  -- <18m · 18m-7a · >7a
  (2026, NULL, 'SUPERINTENDENTE',      18,   72),  -- <18m · 18m-6a · >6a
  (2026, NULL, 'JEFE DE DEPTO',        12,   60),  -- <12m · 12m-5a · >5a
  (2026, NULL, 'JEFE DE OBRA',         12,   48),  -- <12m · 12m-4a · >4a
  (2026, NULL, 'COORDINADOR DE DEPTO', 12,   48),  -- <12m · 12m-4a · >4a
  (2026, NULL, 'ANALISTA',              6,   24),  -- <6m · 6m-2a · >2a
  (2026, NULL, 'ASISTENTE',             6,   18);  -- <6m · 6m-18m · >18m

-- RLS
ALTER TABLE movilidad_umbrales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movilidad_umbrales_admin_select" ON movilidad_umbrales
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios_app u WHERE u.id = auth.uid() AND u.rol IN ('capital_humano', 'superadmin'))
  );
CREATE POLICY "movilidad_umbrales_admin_insert" ON movilidad_umbrales
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios_app u WHERE u.id = auth.uid() AND u.rol IN ('capital_humano', 'superadmin'))
  );
CREATE POLICY "movilidad_umbrales_admin_update" ON movilidad_umbrales
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios_app u WHERE u.id = auth.uid() AND u.rol IN ('capital_humano', 'superadmin'))
  );
CREATE POLICY "movilidad_umbrales_admin_delete" ON movilidad_umbrales
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios_app u WHERE u.id = auth.uid() AND u.rol IN ('capital_humano', 'superadmin'))
  );
