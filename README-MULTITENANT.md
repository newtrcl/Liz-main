# 🏢 LIZ SaaS — Multi-Tenant Platform

**Versión:** 1.0.0 (MVP)  
**Estado:** En desarrollo  
**Stack:** Cloudflare Workers + Supabase + Google Apps Script

---

## 📋 Descripción

Plataforma SaaS multi-tenant para gestión de agendas en salones de belleza y servicios profesionales.

### Características

- ✅ **Multi-tenant:** Múltiples negocios en una sola instancia
- ✅ **Subdomios dinámicos:** `tenant.newt.newtraderchiles.workers.dev`
- ✅ **RLS:** Row Level Security por tenant en Supabase
- ✅ **Auth:** Google OAuth centralizado + JWT
- ✅ **Notificaciones:** Email personalizado por tenant (Gmail/Slack)

---

## 🚀 Inicio Rápido

### Requisitos
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Acceso a Supabase (BD centralizada)
- Cuenta Cloudflare

### Instalación

```bash
# Clonar y entrar al directorio
git clone <repo-url>
cd "LIZ SaaS POC"

# Instalar dependencias
npm install

# Crear wrangler.local.toml con variables de desarrollo
cp wrangler.toml wrangler.local.toml
# Editar wrangler.local.toml con credenciales de desarrollo
```

### Desarrollo Local

```bash
# Iniciar servidor de desarrollo
npm run dev

# Acceder a
# http://localhost:8787/  (landing page)
# http://demo.localhost:8787/  (tenant demo)
```

### Desplegar a Producción

```bash
# Configurar secrets en Cloudflare Dashboard primero:
# - SUPABASE_SERVICE_KEY
# - ADMIN_SECRET
# - WEBHOOK_SECRET

# Desplegar
npm run deploy:prod

# Acceder a
# https://liz-belleza.newt.newtraderchiles.workers.dev/
# https://demo.newt.newtraderchiles.workers.dev/
```

---

## 📁 Estructura del Proyecto

```
liz-saas/
├── src/
│   ├── _worker.js              # Entry point principal
│   ├── middleware/
│   │   ├── tenant-detection.js # Detectar tenant por subdominio
│   │   ├── auth.js             # JWT + RLS validation
│   │   └── cors.js             # CORS dinámico
│   └── routes/
│       ├── public.js           # GET /api/servicios, POST /api/reservas
│       ├── client.js           # GET /api/cliente/* (JWT)
│       ├── admin.js            # GET /api/admin/* (cookie)
│       └── tenants.js          # POST /api/tenants/* (superadmin)
│
├── db/
│   ├── schema.sql              # Schema multi-tenant completo
│   ├── migrations/
│   │   ├── 001-tenants.sql
│   │   ├── 002-rls.sql
│   │   └── 003-legacy.sql
│   └── seed-demo.sql           # Datos del tenant demo
│
├── appscript/
│   ├── config.gs               # Config loader por tenant
│   ├── main.gs                 # Router HTTP
│   ├── webhooks.gs             # Procesar eventos por tenant
│   └── reservas.gs             # Email templates
│
├── public/
│   ├── index.html              # Landing page SaaS
│   └── admin/
│       ├── tenants.html        # Gestión tenants (SUPERADMIN)
│       └── settings.html       # Configuración global
│
├── wrangler.toml               # Configuración Cloudflare
├── package.json
└── README-MULTITENANT.md       # Este archivo
```

---

## 🏗️ Arquitectura

```
Cliente
  ↓ (subdominio)
Cloudflare Worker
  ├─ Tenant detection (liz-belleza.newt...)
  ├─ Auth (JWT + RLS)
  └─ Routing (/api/*)
       ↓
    Supabase
       ├─ Tabla: tenants
       ├─ Tabla: reservas (tenant_id)
       ├─ RLS policies
       └─ Google OAuth
            ↓
         Google Apps Script
            └─ Webhooks por tenant
```

---

## 📊 Tenants Disponibles

| Slug | Nombre | URL | Estado |
|------|--------|-----|--------|
| `demo` | Demo - Salón de Prueba | `demo.newt...` | ✅ Activo |
| `liz-belleza` | Belleza Integral | `liz-belleza.newt...` | ✅ Piloto |

---

## 🔑 Variables de Entorno

### Production (Cloudflare Dashboard)

```
SUPABASE_URL=https://oljmpzjpbwwomuqwipba.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
APPS_SCRIPT_URL=https://script.google.com/macros/...
SUPABASE_SERVICE_KEY=<secrets>
ADMIN_SECRET=<secrets>
WEBHOOK_SECRET=<secrets>
```

### Development (wrangler.local.toml - NO COMMITEAR)

```toml
[env.development.vars]
SUPABASE_URL = "https://..."
SUPABASE_ANON_KEY = "..."
APPS_SCRIPT_URL = "..."
```

---

## 🔐 Autenticación

### Clientes
- **Método:** JWT Bearer Token (Supabase Auth)
- **Header:** `Authorization: Bearer <token>`
- **Validación:** JWKS + RLS

### Admin
- **Método:** Cookie httpOnly HMAC-SHA256
- **Header:** `Cookie: liz_session=<payload>.<signature>`
- **Validez:** 24 horas

---

## 🧪 Testing

### Test tenant "demo"

```bash
# Crear reserva
curl -X POST https://demo.localhost:8787/api/reservas \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Juan","email":"juan@test.com","servicioID":"...","fecha":"2026-05-20"}'

# Verificar en Supabase
SELECT * FROM reservas WHERE tenant_id = '<demo-id>';
```

### Test Tenant Detection

```bash
# Debe retornar config del tenant
curl https://demo.localhost:8787/api/config
curl https://liz-belleza.localhost:8787/api/config
```

---

## 📝 Próximas Fases

- [ ] Fase 1: Schema multi-tenant + RLS
- [ ] Fase 2: Middleware tenant detection
- [ ] Fase 3: Migrar código POC
- [ ] Fase 4: Variables de entorno
- [ ] Fase 5: Testing

---

## 📚 Documentación

- [Plan de Implementación](../.claude/plans/snuggly-jingling-otter.md)
- [DOCUMENTACION_MAESTRA.md](DOCUMENTACION_MAESTRA.md) (POC original)

---

## 👤 Autor

NewTrader Dev  
newtraderchiles@gmail.com

---

## 📄 Licencia

MIT
