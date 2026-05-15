-- ════════════════════════════════════════════════════════════════════════════════
-- FASE 1a: Crear tabla TENANTS (core del multi-tenant)
-- ════════════════════════════════════════════════════════════════════════════════

-- Tabla: tenants
-- Almacena información de cada negocio/organización
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad del tenant
  slug TEXT UNIQUE NOT NULL,          -- "liz-belleza", "demo"
  name TEXT NOT NULL,                 -- "Belleza Integral", "Demo - Salón"
  domain TEXT UNIQUE,                 -- "liz-belleza.newt.newtraderchiles.workers.dev"
  owner_email TEXT NOT NULL,

  -- Estado
  status TEXT DEFAULT 'active',       -- active, paused, archived

  -- Suscripción / Trial
  trial_starts_at TIMESTAMP,          -- Inicio del trial de 30 días
  trial_ends_at TIMESTAMP,            -- Fin del trial
  subscription_status TEXT DEFAULT 'trial',  -- trial, paid, cancelled

  -- Integraciones (credenciales)
  -- ⚠️  En producción, encriptar estas columnas
  gmail_email TEXT,                   -- Email que envía notificaciones
  gmail_app_password TEXT,            -- Password de app Gmail (NO OAuth)
  slack_webhook_url TEXT,             -- Webhook de Slack (si usa Slack)

  -- Metadata
  config_json JSONB DEFAULT '{}',     -- Colores, logo, horarios, etc.
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT valid_email CHECK (owner_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════
-- FASE 1b: Crear tabla TENANT_USERS (para multi-user por tenant)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencias
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,         -- ID de auth.users (Supabase Auth)

  -- Rol dentro del tenant
  role TEXT DEFAULT 'user',           -- user, admin, superadmin

  -- Control
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- Constraints
  UNIQUE(tenant_id, auth_user_id),    -- Un user no puede tener dos roles en el mismo tenant
  CONSTRAINT valid_role CHECK (role IN ('user', 'admin', 'superadmin'))
);

-- Índices
CREATE INDEX idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_auth_user_id ON tenant_users(auth_user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(role);

-- ════════════════════════════════════════════════════════════════════════════════
-- COMMENTS (Documentación en Supabase)
-- ════════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE tenants IS 'Tabla core: almacena cada negocio/organización en el SaaS';
COMMENT ON COLUMN tenants.slug IS 'Identificador único y amigable del tenant (ej: liz-belleza)';
COMMENT ON COLUMN tenants.domain IS 'Subdominio asignado (ej: liz-belleza.newt.newtraderchiles.workers.dev)';
COMMENT ON COLUMN tenants.trial_starts_at IS 'Inicio del período de prueba (30 días)';
COMMENT ON COLUMN tenants.config_json IS 'JSON con colores, logo URL, horarios, etc.';

COMMENT ON TABLE tenant_users IS 'Relación many-to-many entre Supabase Auth users y tenants';
COMMENT ON COLUMN tenant_users.auth_user_id IS 'ID de auth.users (Google OAuth)';
COMMENT ON COLUMN tenant_users.role IS 'Rol del usuario en este tenant: user, admin, superadmin';

-- ════════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (opcional, ejecutar después de crear la tabla)
-- ════════════════════════════════════════════════════════════════════════════════

-- SELECT COUNT(*) FROM tenants;  -- Debe retornar 0 antes de insertar datos
