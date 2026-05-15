# 🚀 Guía de Migración — LIZ SaaS Multi-Tenant

## Pasos para ejecutar las migraciones

### FASE 1: Preparar Supabase

1. **Crear nuevo proyecto en Supabase** (si no lo has hecho)
   - URL: `https://oljmpzjpbwwomuqwipba.supabase.co`
   - Guardar credenciales en lugar seguro

2. **Ir a SQL Editor en Supabase Dashboard**
   - Dashboard → SQL Editor → New query

### FASE 2: Ejecutar Migraciones en orden

#### Paso 1: Crear tablas base (tenants + tenant_users)

Copiar y ejecutar: `db/migrations/001-tenants.sql`

```bash
# Via SQL Editor en Supabase, o via psql CLI:
psql "postgresql://postgres:<password>@oljmpzjpbwwomuqwipba.supabase.co:5432/postgres" \
  -f db/migrations/001-tenants.sql
```

✅ **Verificación:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('tenants', 'tenant_users');
```
Debe retornar: tenants, tenant_users

---

#### Paso 2: Habilitar Row Level Security (RLS)

Copiar y ejecutar: `db/migrations/002-rls.sql`

✅ **Verificación:**
```sql
SELECT schemaname, tablename, rowsecurity FROM pg_tables 
WHERE rowsecurity = true AND schemaname = 'public';
```
Debe retornar: tenants, tenant_users con rowsecurity = true

---

#### Paso 3: Migrar esquema POC → Multi-tenant

Copiar y ejecutar: `db/migrations/003-legacy.sql`

**Importante:** Este script asume que las tablas POC ya existen:
- servicios
- empleados
- empleado_servicios
- reservas
- bloqueos
- gift_cards
- fidelizacion

Si alguna no existe, comentar esa sección en el script.

✅ **Verificación:**
```sql
-- Verificar que tenant_id fue agregado a todas las tablas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE columns.table_name = tables.table_name AND column_name = 'tenant_id'
);
```

Debe retornar: servicios, empleados, reservas, bloqueos, gift_cards, fidelizacion

---

#### Paso 4: Seed data inicial

Copiar y ejecutar: `db/seed-demo.sql`

Este script:
- Crea tenant "demo" (genérico para testing)
- Crea tenant "liz-belleza" (piloto real)
- Inserta servicios, empleados, bloques de ejemplo en "demo"

✅ **Verificación:**
```sql
SELECT id, slug, name, status FROM tenants 
WHERE slug IN ('demo', 'liz-belleza');
```

Debe retornar 2 tenants

```sql
SELECT COUNT(*) FROM servicios 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');
```

Debe retornar 6 servicios de ejemplo

---

## Configuración de Variables de Entorno

### Local Development

Crear `wrangler.local.toml`:

```toml
name = "liz-saas-dev"
main = "src/_worker.js"
compatibility_date = "2025-01-01"

[env.development.vars]
SUPABASE_URL = "https://oljmpzjpbwwomuqwipba.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

[env.development.secrets]
# Obtener del Supabase Dashboard → Project Settings → API
SUPABASE_SERVICE_KEY = "..."
SESSION_SECRET = "dev-secret-change-in-production"
JWT_SECRET = "jwt-secret"
```

### Production (Cloudflare Dashboard)

1. Ir a **Cloudflare Dashboard → Workers → liz-saas**
2. **Settings → Environment Variables**

Agregar:
- `SUPABASE_URL` = `https://oljmpzjpbwwomuqwipba.supabase.co`
- `SUPABASE_ANON_KEY` = (copiar de Supabase)

3. **Settings → Secrets**

Agregar:
- `SUPABASE_SERVICE_KEY` = (copiar de Supabase)
- `SESSION_SECRET` = (generar token aleatorio)

---

## Testing Post-Migración

### 1. Verificar Tenant Detection

```bash
# Debe detectar "demo" tenant
curl https://demo.newt.newtraderchiles.workers.dev/api/health

# Respuesta esperada:
# {"ok": true, "tenant": "demo"}
```

### 2. Verificar API Pública

```bash
# Obtener servicios de demo
curl https://demo.newt.newtraderchiles.workers.dev/api/servicios

# Respuesta esperada:
# {
#   "ok": true,
#   "tenant": "demo",
#   "servicios": [...]
# }
```

### 3. Crear Reserva de Prueba

```bash
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/reservas \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Test User",
    "email": "test@example.com",
    "telefono": "+56912345678",
    "fecha": "2025-06-20",
    "hora": "14:00",
    "servicio_id": "<service-uuid>"
  }'
```

### 4. Verificar RLS funciona

```sql
-- Conectar como usuario de demo
-- Intentar acceder a datos de liz-belleza debe fallar

-- En una sesión client (no service role), verificar:
SELECT * FROM reservas WHERE tenant_id != '<demo-id>';
-- Debe retornar 0 filas (RLS bloqueó)
```

---

## Rollback (si algo sale mal)

Si necesitas revertir las migraciones:

```sql
-- Eliminar RLS policies
DROP POLICY IF EXISTS "Clientes ven solo sus propias reservas" ON reservas;
DROP POLICY IF EXISTS "Users see services for their tenant" ON servicios;
-- ... etc

-- Eliminar tenant_id de las tablas
ALTER TABLE reservas DROP COLUMN tenant_id;
ALTER TABLE servicios DROP COLUMN tenant_id;
-- ... etc

-- Eliminar tablas nuevas
DROP TABLE IF EXISTS tenant_users;
DROP TABLE IF EXISTS tenants;
```

---

## Próximas Fases

✅ **FASE 1:** Schema multi-tenant + RLS (COMPLETADO)
⏳ **FASE 2:** Middleware tenant detection (EN PROGRESO)
⏳ **FASE 3:** Handlers de API multi-tenant (EN PROGRESO)
⏳ **FASE 4:** Variables de entorno + deployment (PRÓXIMO)
⏳ **FASE 5:** Testing & validación E2E (PRÓXIMO)

---

## Contacto & Troubleshooting

Si encuentras errores:

1. **Error: "Tenant not found"** 
   → Verificar que seed-demo.sql se ejecutó correctamente

2. **Error: "RLS violation"** (esperado en ciertos casos)
   → Verificar que el usuario está autenticado en el tenant correcto

3. **Error de credenciales**
   → Verificar SUPABASE_URL y SUPABASE_ANON_KEY en wrangler.toml

Preguntas: Revisar README-MULTITENANT.md
