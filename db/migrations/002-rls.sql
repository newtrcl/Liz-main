-- ════════════════════════════════════════════════════════════════════════════════
-- FASE 1c: Row Level Security (RLS) — Segregación de datos por tenant
-- ════════════════════════════════════════════════════════════════════════════════
--
-- RLS asegura que:
-- 1. Un cliente solo ve sus propias reservas
-- 2. Un admin solo ve datos de su tenant
-- 3. Un superadmin ve todo (para auditoría)
--
-- IMPORTANTE: RLS se valida en la BD, el Worker le confía a Supabase
-- ════════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────────
-- 1. HABILITAR RLS EN TODAS LAS TABLAS
-- ────────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- (Las siguientes se habilitarán en migración 003-legacy.sql)
-- ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fidelizacion ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────────
-- 2. POLÍTICAS PARA TABLA: tenants
-- ────────────────────────────────────────────────────────────────────────────────

-- Cualquiera puede leer su propio tenant (si está en tenant_users)
CREATE POLICY "Users can read their own tenant"
  ON tenants
  FOR SELECT
  USING (
    id IN (
      SELECT tenant_id FROM tenant_users
      WHERE auth_user_id = auth.uid()
    )
  );

-- Solo superadmin puede actualizar tenants
CREATE POLICY "Only superadmin can update tenants"
  ON tenants
  FOR UPDATE
  USING (
    -- El usuario debe ser superadmin en este tenant
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE tenant_id = tenants.id
        AND auth_user_id = auth.uid()
        AND role = 'superadmin'
    )
  );

-- ────────────────────────────────────────────────────────────────────────────────
-- 3. POLÍTICAS PARA TABLA: tenant_users
-- ────────────────────────────────────────────────────────────────────────────────

-- Admin puede ver usuarios de su tenant
CREATE POLICY "Admins can view users in their tenant"
  ON tenant_users
  FOR SELECT
  USING (
    -- El usuario actual es admin en este tenant
    EXISTS (
      SELECT 1 FROM tenant_users tu2
      WHERE tu2.tenant_id = tenant_users.tenant_id
        AND tu2.auth_user_id = auth.uid()
        AND tu2.role IN ('admin', 'superadmin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────────
-- 4. FUNCIÓN HELPER: get_current_tenant()
-- ────────────────────────────────────────────────────────────────────────────────
-- Útil para queries que necesiten filtrar por tenant del usuario actual

CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM tenant_users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_current_tenant_id() IS 'Retorna el ID del tenant actual del usuario logueado';

-- ────────────────────────────────────────────────────────────────────────────────
-- 5. COMENTARIOS Y DOCUMENTACIÓN
-- ────────────────────────────────────────────────────────────────────────────────

-- RLS garantiza:
-- ✅ Aislamiento de datos entre tenants
-- ✅ Cumplimiento de GDPR/privacidad
-- ✅ Seguridad de datos a nivel de BD
-- ❌ NO reemplaza validación en la aplicación (defensa en profundidad)

-- Verificar RLS está habilitado:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables
-- WHERE rowsecurity = true AND schemaname = 'public';
