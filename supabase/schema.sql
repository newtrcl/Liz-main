-- ================================================================
-- Belleza Integral — Supabase Schema v2
-- Ejecuta en: Supabase → SQL Editor
-- ================================================================

-- ── TABLAS BASE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS servicios (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  categoria        TEXT NOT NULL DEFAULT 'General',
  duracion         INTEGER NOT NULL DEFAULT 30,
  precio           NUMERIC(10,2) NOT NULL DEFAULT 0,
  es_sesion        BOOLEAN DEFAULT false,
  max_sesiones     INTEGER DEFAULT 1,
  requiere_skill   TEXT,
  activo           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empleados (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  color            TEXT DEFAULT '#6366f1',
  skills           TEXT[] DEFAULT '{}',
  activo           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservas (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  email            TEXT NOT NULL,
  telefono         TEXT DEFAULT '',
  servicio_id      TEXT NOT NULL,
  servicio_nombre  TEXT NOT NULL,
  empleado_id      TEXT NOT NULL,
  empleado_nombre  TEXT NOT NULL,
  fecha            DATE NOT NULL,
  hora_inicio      TEXT NOT NULL,
  hora_fin         TEXT NOT NULL,
  duracion         INTEGER NOT NULL,
  precio           NUMERIC(10,2) DEFAULT 0,
  sesion_num       INTEGER DEFAULT 1,
  sesiones_totales INTEGER DEFAULT 1,
  estado           TEXT DEFAULT 'Confirmada',
  notas            TEXT DEFAULT '',
  cancelado_por    TEXT,
  giftcard_codigo  TEXT,          -- gift card usada en el pago
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT estado_valido CHECK (
    estado IN ('Confirmada','Completada','Cancelada','Pendiente','Pagada')
  )
);

-- ── BLOQUEOS TEMPORALES DE SLOT ───────────────────────────────
-- Cuando el usuario elige un slot se crea un bloqueo de 10 min.
-- El Worker lo verifica igual que una reserva al generar disponibilidad.

CREATE TABLE IF NOT EXISTS bloqueos (
  id               TEXT PRIMARY KEY,
  empleado_id      TEXT NOT NULL,
  fecha            DATE NOT NULL,
  hora_inicio      TEXT NOT NULL,
  hora_fin         TEXT NOT NULL,
  session_token    TEXT NOT NULL,   -- token anónimo del browser
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── GIFT CARDS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gift_cards (
  id                  TEXT PRIMARY KEY,
  codigo              TEXT UNIQUE NOT NULL,
  monto               NUMERIC(10,2) NOT NULL,
  monto_usado         NUMERIC(10,2) DEFAULT 0,
  estado              TEXT DEFAULT 'Activa',  -- Activa, Usada, Vencida, Cancelada
  comprador_nombre    TEXT,
  comprador_email     TEXT,
  destinatario_nombre TEXT,
  destinatario_email  TEXT,
  mensaje             TEXT DEFAULT '',
  fecha_vencimiento   DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT gc_estado CHECK (estado IN ('Activa','Usada','Vencida','Cancelada'))
);

-- ── FIDELIZACIÓN ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fidelizacion (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  nombre          TEXT NOT NULL,
  telefono        TEXT DEFAULT '',
  puntos          INTEGER DEFAULT 0,
  total_visitas   INTEGER DEFAULT 0,
  total_gastado   NUMERIC(10,2) DEFAULT 0,
  nivel           TEXT DEFAULT 'Bronce',   -- Bronce, Plata, Oro, VIP
  qr_token        TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  notas           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── ÍNDICES ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reservas_fecha
  ON reservas(fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_empleado_fecha
  ON reservas(empleado_id, fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_estado
  ON reservas(estado);
CREATE INDEX IF NOT EXISTS idx_reservas_email
  ON reservas(email);
CREATE INDEX IF NOT EXISTS idx_bloqueos_empleado_fecha
  ON bloqueos(empleado_id, fecha);
CREATE INDEX IF NOT EXISTS idx_bloqueos_expires
  ON bloqueos(expires_at);
CREATE INDEX IF NOT EXISTS idx_gift_cards_codigo
  ON gift_cards(codigo);
CREATE INDEX IF NOT EXISTS idx_fidelizacion_email
  ON fidelizacion(email);
CREATE INDEX IF NOT EXISTS idx_fidelizacion_qr
  ON fidelizacion(qr_token);

-- ── RLS ───────────────────────────────────────────────────────
-- Todo el acceso llega via Worker con service_role (omite RLS).
-- RLS habilitado = rol anon no puede operar directamente.

ALTER TABLE servicios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fidelizacion  ENABLE ROW LEVEL SECURITY;

-- Política read-only para servicios y empleados (datos públicos de catálogo)
-- Solo si quieres permitir acceso anon directo al catálogo (no recomendado).
-- Si TODO pasa por el Worker, deja sin políticas (anon bloqueado por defecto).

-- ── LIMPIEZA AUTOMÁTICA DE BLOQUEOS EXPIRADOS ─────────────────
-- Ejecuta esto como un cron job en Supabase Edge Functions o manualmente.
-- También el Worker lo limpia on-demand al consultar disponibilidad.
--
-- DELETE FROM bloqueos WHERE expires_at < NOW();

-- ── FUNCIÓN: actualizar updated_at en fidelización ────────────
CREATE OR REPLACE FUNCTION update_fidelizacion_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER fidelizacion_updated_at
  BEFORE UPDATE ON fidelizacion
  FOR EACH ROW EXECUTE FUNCTION update_fidelizacion_updated_at();

-- ── DATOS DE EJEMPLO ─────────────────────────────────────────

INSERT INTO empleados (id, nombre, color, skills) VALUES
  ('EMP_001', 'Liz',       '#D4A5A5', ARRAY['Coloración','Maquillaje','Depilación','Corte']),
  ('EMP_002', 'Valentina', '#A5C4D4', ARRAY['Coloración','Tratamientos','Corte'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO servicios (id, nombre, categoria, duracion, precio, es_sesion, max_sesiones, requiere_skill) VALUES
  ('SRV_COL01', 'Coloración completa',       'Coloración',   120, 45000, false, 1, 'Coloración'),
  ('SRV_COL02', 'Mechas Balayage',            'Coloración',   180, 65000, false, 1, 'Coloración'),
  ('SRV_COL03', 'Tinte raíz',                'Coloración',    60, 25000, false, 1, 'Coloración'),
  ('SRV_MAQ01', 'Maquillaje social',          'Maquillaje',    60, 35000, false, 1, 'Maquillaje'),
  ('SRV_MAQ02', 'Maquillaje de novia',        'Maquillaje',   120, 80000, false, 1, 'Maquillaje'),
  ('SRV_DEP01', 'Depilación facial',          'Depilación',    30, 12000, false, 1, 'Depilación'),
  ('SRV_DEP02', 'Depilación cuerpo completo', 'Depilación',    90, 40000, false, 1, 'Depilación'),
  ('SRV_TRT01', 'Tratamiento hidratación',    'Tratamientos',  60, 28000, true,  4, null),
  ('SRV_TRT02', 'Nutrición capilar',          'Tratamientos',  90, 38000, true,  6, null),
  ('SRV_COR01', 'Corte y peinado',            'Corte',         45, 18000, false, 1, null)
ON CONFLICT (id) DO NOTHING;
