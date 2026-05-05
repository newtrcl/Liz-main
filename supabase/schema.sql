-- ================================================================
-- Liz Belleza Integral — Supabase Schema
-- Ejecuta en: Supabase → SQL Editor
-- ================================================================

-- Habilitar extensión UUID (no se usa como PK aquí, pero útil)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABLAS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS servicios (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  categoria        TEXT NOT NULL DEFAULT 'General',
  duracion         INTEGER NOT NULL DEFAULT 30,   -- minutos
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
  hora_inicio      TEXT NOT NULL,      -- HH:MM
  hora_fin         TEXT NOT NULL,      -- HH:MM
  duracion         INTEGER NOT NULL,   -- minutos
  precio           NUMERIC(10,2) DEFAULT 0,
  sesion_num       INTEGER DEFAULT 1,
  sesiones_totales INTEGER DEFAULT 1,
  estado           TEXT DEFAULT 'Confirmada',
  notas            TEXT DEFAULT '',
  cancelado_por    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT estado_valido CHECK (estado IN ('Confirmada','Completada','Cancelada','Pendiente'))
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_reservas_fecha
  ON reservas(fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_empleado_fecha
  ON reservas(empleado_id, fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_estado
  ON reservas(estado);

-- ── RLS (Row Level Security) ──────────────────────────────────
-- Todo el acceso pasa por el Worker con service_role key, que omite RLS.
-- Habilitamos RLS y no creamos políticas anon → anon no puede leer/escribir.

ALTER TABLE servicios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas   ENABLE ROW LEVEL SECURITY;

-- ── DATOS DE EJEMPLO — borra o ajusta según tu negocio ───────

INSERT INTO empleados (id, nombre, color, skills) VALUES
  ('EMP_001', 'Liz',        '#D4A5A5', ARRAY['Coloración','Maquillaje','Depilación']),
  ('EMP_002', 'Valentina',  '#A5C4D4', ARRAY['Coloración','Tratamientos'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO servicios (id, nombre, categoria, duracion, precio, es_sesion, max_sesiones, requiere_skill) VALUES
  ('SRV_COL01', 'Coloración completa',      'Coloración',   120, 45000, false, 1,  'Coloración'),
  ('SRV_COL02', 'Mechas Balayage',           'Coloración',   180, 65000, false, 1,  'Coloración'),
  ('SRV_COL03', 'Tinte raíz',               'Coloración',    60, 25000, false, 1,  'Coloración'),
  ('SRV_MAQ01', 'Maquillaje social',         'Maquillaje',    60, 35000, false, 1,  'Maquillaje'),
  ('SRV_MAQ02', 'Maquillaje de novia',       'Maquillaje',   120, 80000, false, 1,  'Maquillaje'),
  ('SRV_DEP01', 'Depilación facial',         'Depilación',    30, 12000, false, 1,  'Depilación'),
  ('SRV_DEP02', 'Depilación cuerpo completo','Depilación',    90, 40000, false, 1,  'Depilación'),
  ('SRV_TRT01', 'Tratamiento hidratación',   'Tratamientos',  60, 28000, true,  4,  null),
  ('SRV_TRT02', 'Nutrición capilar',         'Tratamientos',  90, 38000, true,  6,  null),
  ('SRV_COR01', 'Corte y peinado',           'Corte',         45, 18000, false, 1,  null)
ON CONFLICT (id) DO NOTHING;
