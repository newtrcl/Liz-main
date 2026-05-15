-- ════════════════════════════════════════════════════════════════════════════════
-- FASE 1d: Seed Data — Inicializar tenants y datos de ejemplo
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Este script crea:
-- 1. Tenants "demo" y "liz-belleza"
-- 2. Datos de ejemplo en el tenant "demo" (servicios, empleados, bloqueos)
-- 3. Configuración inicial para cada tenant
--
-- ⚠️ IMPORTANTE: Ejecutar DESPUÉS de las migraciones 001, 002, 003
-- ════════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 1: Crear TENANT "demo"
-- ────────────────────────────────────────────────────────────────────────────────

INSERT INTO tenants (
  slug,
  name,
  domain,
  owner_email,
  status,
  subscription_status,
  config_json,
  created_at,
  updated_at
) VALUES (
  'demo',
  'Demo - Salón de Prueba',
  'demo.newt.newtraderchiles.workers.dev',
  'admin@demo.local',
  'active',
  'trial',
  '{
    "colores": {
      "primary": "#735c00",
      "secondary": "#1e1b2e"
    },
    "horarios": {
      "lunes": {"inicio": "09:00", "fin": "19:00"},
      "martes": {"inicio": "09:00", "fin": "19:00"},
      "miercoles": {"inicio": "09:00", "fin": "19:00"},
      "jueves": {"inicio": "09:00", "fin": "19:00"},
      "viernes": {"inicio": "09:00", "fin": "19:00"},
      "sabado": {"inicio": "10:00", "fin": "18:00"},
      "domingo": null
    },
    "duracion_defecto_minutos": 30,
    "intervalo_disponibilidad_minutos": 15
  }',
  now(),
  now()
) ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 2: Crear TENANT "liz-belleza"
-- ────────────────────────────────────────────────────────────────────────────────

INSERT INTO tenants (
  slug,
  name,
  domain,
  owner_email,
  gmail_email,
  status,
  subscription_status,
  config_json,
  created_at,
  updated_at
) VALUES (
  'liz-belleza',
  'Belleza Integral',
  'liz-belleza.newt.newtraderchiles.workers.dev',
  'newtraderchiles@gmail.com',
  'newtraderchiles@gmail.com',
  'active',
  'trial',
  '{
    "colores": {
      "primary": "#d4af37",
      "secondary": "#1a1a1a"
    },
    "horarios": {
      "lunes": {"inicio": "09:00", "fin": "19:00"},
      "martes": {"inicio": "09:00", "fin": "19:00"},
      "miercoles": {"inicio": "09:00", "fin": "19:00"},
      "jueves": {"inicio": "09:00", "fin": "21:00"},
      "viernes": {"inicio": "09:00", "fin": "21:00"},
      "sabado": {"inicio": "10:00", "fin": "19:00"},
      "domingo": null
    },
    "duracion_defecto_minutos": 45,
    "intervalo_disponibilidad_minutos": 15
  }',
  now(),
  now()
) ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 3: Insertar SERVICIOS para el tenant "demo"
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF v_demo_tenant_id IS NOT NULL THEN
    INSERT INTO servicios (tenant_id, nombre, descripcion, duracion_minutos, precio, activo, created_at, updated_at)
    VALUES
      (v_demo_tenant_id, 'Corte de cabello', 'Corte profesional con diseño personalizado', 30, 25.00, true, now(), now()),
      (v_demo_tenant_id, 'Lavado y peinado', 'Lavado con productos premium y peinado', 25, 20.00, true, now(), now()),
      (v_demo_tenant_id, 'Manicura', 'Manicura completa con esmalte gel', 45, 30.00, true, now(), now()),
      (v_demo_tenant_id, 'Pedicura', 'Pedicura completa con esmalte gel', 45, 30.00, true, now(), now()),
      (v_demo_tenant_id, 'Depilación', 'Depilación con cera profesional', 30, 25.00, true, now(), now()),
      (v_demo_tenant_id, 'Tratamiento facial', 'Limpieza y tratamiento facial de 1 hora', 60, 50.00, true, now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 4: Insertar EMPLEADOS para el tenant "demo"
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF v_demo_tenant_id IS NOT NULL THEN
    INSERT INTO empleados (tenant_id, nombre, email, telefono, especialidades, activo, created_at, updated_at)
    VALUES
      (v_demo_tenant_id, 'María García', 'maria@demo.local', '+56912345678', 'Cortes,Peinados', true, now(), now()),
      (v_demo_tenant_id, 'Laura Martínez', 'laura@demo.local', '+56912345679', 'Manicura,Pedicura', true, now(), now()),
      (v_demo_tenant_id, 'Sofía López', 'sofia@demo.local', '+56912345680', 'Depilación,Faciales', true, now(), now()),
      (v_demo_tenant_id, 'Carolina Rodríguez', 'carolina@demo.local', '+56912345681', 'Faciales,Tratamientos', true, now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 5: Crear BLOQUEOS de horario para el tenant "demo"
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF v_demo_tenant_id IS NOT NULL THEN
    -- Bloqueo de almuerzo (todos los días)
    INSERT INTO bloqueos (tenant_id, tipo, descripcion, fecha_inicio, fecha_fin, es_recurrente, created_at, updated_at)
    VALUES
      (v_demo_tenant_id, 'almuerzo', 'Hora de almuerzo',
       now()::date || ' 13:00:00'::time,
       now()::date || ' 14:00:00'::time,
       true, now(), now())
    ON CONFLICT DO NOTHING;

    -- Bloqueo por cierre (ejemplo: próxima semana)
    INSERT INTO bloqueos (tenant_id, tipo, descripcion, fecha_inicio, fecha_fin, es_recurrente, created_at, updated_at)
    VALUES
      (v_demo_tenant_id, 'cierre', 'Salón cerrado por limpieza',
       (now() + interval '7 days')::date || ' 18:00:00'::time,
       (now() + interval '7 days')::date || ' 20:00:00'::time,
       false, now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 6: Crear GIFT CARDS de ejemplo para el tenant "demo"
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF v_demo_tenant_id IS NOT NULL THEN
    INSERT INTO gift_cards (tenant_id, codigo, monto_inicial, monto_restante, email_cliente, estado, fecha_vencimiento, created_at, updated_at)
    VALUES
      (v_demo_tenant_id, 'GC-DEMO-001', 100.00, 100.00, 'cliente1@demo.local', 'activa', now() + interval '1 year', now(), now()),
      (v_demo_tenant_id, 'GC-DEMO-002', 50.00, 45.50, 'cliente2@demo.local', 'activa', now() + interval '1 year', now(), now()),
      (v_demo_tenant_id, 'GC-DEMO-003', 75.00, 0.00, 'cliente3@demo.local', 'usado', now() + interval '1 year', now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────
-- PASO 7: Crear datos FIDELIZACION para el tenant "demo"
-- ────────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_demo_tenant_id UUID;
BEGIN
  SELECT id INTO v_demo_tenant_id FROM tenants WHERE slug = 'demo' LIMIT 1;

  IF v_demo_tenant_id IS NOT NULL THEN
    INSERT INTO fidelizacion (tenant_id, email, nombre, puntos_acumulados, puntos_canjeados, nivel, ultima_compra, created_at, updated_at)
    VALUES
      (v_demo_tenant_id, 'fiel1@demo.local', 'Juan Pérez', 150, 0, 'bronce', now(), now(), now()),
      (v_demo_tenant_id, 'fiel2@demo.local', 'Patricia Gómez', 350, 100, 'plata', now() - interval '30 days', now(), now()),
      (v_demo_tenant_id, 'fiel3@demo.local', 'Roberto Silva', 750, 200, 'oro', now() - interval '15 days', now(), now())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ════════════════════════════════════════════════════════════════════════════════

-- Verificar tenants creados
SELECT 'Tenants creados:' as verificacion;
SELECT id, slug, name, status FROM tenants WHERE slug IN ('demo', 'liz-belleza');

-- Verificar datos en demo
SELECT 'Servicios en demo:' as verificacion;
SELECT COUNT(*) as cantidad FROM servicios WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');

SELECT 'Empleados en demo:' as verificacion;
SELECT COUNT(*) as cantidad FROM empleados WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');

SELECT 'Gift cards en demo:' as verificacion;
SELECT COUNT(*) as cantidad FROM gift_cards WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');

SELECT 'Fidelización en demo:' as verificacion;
SELECT COUNT(*) as cantidad FROM fidelizacion WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');
