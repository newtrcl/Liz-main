-- ════════════════════════════════════════════════════════════════════════════════
-- FASE 1d: Migrar Schema POC → Multi-tenant
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Agrega tenant_id a todas las tablas existentes del POC
-- Las tablas ya deben existir en Supabase (creadas por el POC)
--
-- PASOS:
-- 1. Agregar columna tenant_id a cada tabla
-- 2. Asignar valor por defecto (para migración inicial)
-- 3. Crear foreign key a tenants.id
-- 4. Habilitar RLS
-- 5. Crear índices
-- ════════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────────
-- TABLA: servicios
-- ────────────────────────────────────────────────────────────────────────────────

-- Antes de ejecutar, asegúrate de que ya existe tenant "demo" o "liz-belleza"
-- SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1;

-- Obtener el ID del tenant por defecto (demo)
DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF v_demo_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant "demo" no encontrado. Primero ejecuta seed-demo.sql';
  END IF;

  -- Agregar columna tenant_id a servicios
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'servicios' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE servicios ADD COLUMN tenant_id UUID NOT NULL DEFAULT v_demo_tenant_id;
  END IF;

  -- Crear foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'servicios' AND constraint_name = 'fk_servicios_tenant'
  ) THEN
    ALTER TABLE servicios
    ADD CONSTRAINT fk_servicios_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  -- Crear índice
  CREATE INDEX IF NOT EXISTS idx_servicios_tenant ON servicios(tenant_id);

END $$;

-- Habilitar RLS en servicios
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;

-- Política: Clientes ven servicios de su tenant
CREATE POLICY "Users see services for their tenant"
  ON servicios
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- ────────────────────────────────────────────────────────────────────────────────
-- TABLA: empleados
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empleados' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE empleados ADD COLUMN tenant_id UUID NOT NULL DEFAULT v_demo_tenant_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'empleados' AND constraint_name = 'fk_empleados_tenant'
  ) THEN
    ALTER TABLE empleados
    ADD CONSTRAINT fk_empleados_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_empleados_tenant ON empleados(tenant_id);
END $$;

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see employees for their tenant"
  ON empleados
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- ────────────────────────────────────────────────────────────────────────────────
-- TABLA: reservas (CRITICAL)
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservas' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE reservas ADD COLUMN tenant_id UUID NOT NULL DEFAULT v_demo_tenant_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'reservas' AND constraint_name = 'fk_reservas_tenant'
  ) THEN
    ALTER TABLE reservas
    ADD CONSTRAINT fk_reservas_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_reservas_tenant ON reservas(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_reservas_tenant_email ON reservas(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_reservas_tenant_fecha ON reservas(tenant_id, fecha);
END $$;

ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- Clientes ven solo sus propias reservas
CREATE POLICY "Clients see their own reservations"
  ON reservas
  FOR SELECT
  USING (
    tenant_id = get_current_tenant_id()
    AND email = auth.jwt() ->> 'email'
  );

-- Admin ve todas las reservas de su tenant
CREATE POLICY "Admins see all reservations in their tenant"
  ON reservas
  FOR SELECT
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM tenant_users
      WHERE tenant_id = reservas.tenant_id
        AND auth_user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────────
-- TABLA: bloqueos
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bloqueos' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE bloqueos ADD COLUMN tenant_id UUID NOT NULL DEFAULT v_demo_tenant_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'bloqueos' AND constraint_name = 'fk_bloqueos_tenant'
  ) THEN
    ALTER TABLE bloqueos
    ADD CONSTRAINT fk_bloqueos_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_bloqueos_tenant ON bloqueos(tenant_id);
END $$;

ALTER TABLE bloqueos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see blocks in their tenant"
  ON bloqueos
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- ────────────────────────────────────────────────────────────────────────────────
-- TABLA: gift_cards
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_cards' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE gift_cards ADD COLUMN tenant_id UUID NOT NULL DEFAULT v_demo_tenant_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'gift_cards' AND constraint_name = 'fk_gift_cards_tenant'
  ) THEN
    ALTER TABLE gift_cards
    ADD CONSTRAINT fk_gift_cards_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_gift_cards_tenant ON gift_cards(tenant_id);
END $$;

ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see gift cards for their tenant"
  ON gift_cards
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- ────────────────────────────────────────────────────────────────────────────────
-- TABLA: fidelizacion
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fidelizacion' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE fidelizacion ADD COLUMN tenant_id UUID NOT NULL DEFAULT v_demo_tenant_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fidelizacion' AND constraint_name = 'fk_fidelizacion_tenant'
  ) THEN
    ALTER TABLE fidelizacion
    ADD CONSTRAINT fk_fidelizacion_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_fidelizacion_tenant ON fidelizacion(tenant_id);
END $$;

ALTER TABLE fidelizacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own loyalty points"
  ON fidelizacion
  FOR SELECT
  USING (
    tenant_id = get_current_tenant_id()
    AND email = auth.jwt() ->> 'email'
  );

-- ════════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar después)
-- ════════════════════════════════════════════════════════════════════════════════

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND EXISTS (SELECT 1 FROM information_schema.columns
--            WHERE columns.table_name = tables.table_name AND column_name = 'tenant_id');

-- Debe retornar: servicios, empleados, reservas, bloqueos, gift_cards, fidelizacion
