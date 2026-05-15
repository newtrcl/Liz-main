# 🏢 LIZ SaaS — Multi-Tenant Booking Platform

**Transformando el POC local en una plataforma SaaS escalable para salones de belleza.**

---

## 📋 Descripción General

LIZ SaaS es una plataforma de reservas multi-tenant construida con:

- **Backend:** Cloudflare Workers (Node.js)
- **Base de datos:** Supabase PostgreSQL con RLS
- **Autenticación:** Google OAuth + JWT para clientes + Cookie para admin
- **Notificaciones:** Google Apps Script + Gmail/Slack por tenant
- **Hosting:** Cloudflare Edge (subdominio por tenant)

### Arquitectura

```
┌─────────────────────────────────────┐
│  Cliente Browser                    │
│  demo.newt...                       │
│  liz-belleza.newt...                │
└────────────┬────────────────────────┘
             │ HTTPS + Subdominio
             ▼
┌─────────────────────────────────────┐
│  Cloudflare Workers                 │
│  ├─ Tenant detection (subdominio)
│  ├─ Routing por tenant
│  └─ API multi-tenant
└────────────┬────────────────────────┘
             │ REST API
             ▼
┌─────────────────────────────────────┐
│  Supabase (Centralizado)            │
│  ├─ Tabla: tenants
│  ├─ tenant_id en todas las tablas
│  ├─ RLS por tenant
│  └─ Google OAuth
└────────────┬────────────────────────┘
             │ Webhook
             ▼
┌─────────────────────────────────────┐
│  Google Apps Script (Genérico)      │
│  ├─ Carga config del tenant
│  ├─ Envía email desde tenant.gmail
│  └─ Logs auditados
└─────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Clonar el repositorio

```bash
git clone <repo-url> liz-saas
cd liz-saas
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.local.example .env.local
# Editar .env.local con tus credenciales de Supabase
```

### 3. Ejecutar migraciones en Supabase

Ver `MIGRATION_GUIDE.md` para pasos detallados:

```bash
# 1. Ejecutar db/migrations/001-tenants.sql
# 2. Ejecutar db/migrations/002-rls.sql
# 3. Ejecutar db/migrations/003-legacy.sql
# 4. Ejecutar db/seed-demo.sql
```

### 4. Desarrollo local

```bash
npm run dev
# Acceder a: http://localhost:8787/

# O con subdominio:
# demo.newt.localhost:8787/api/servicios
```

### 5. Deploy a Cloudflare

```bash
npm run deploy           # A staging (development)
npm run deploy:prod     # A producción
```

---

## 📁 Estructura del Proyecto

```
liz-saas/
├── src/
│   ├── _worker.js                    # Entry point principal
│   ├── middleware/
│   │   ├── tenant-detection.js       # Detectar tenant por subdominio
│   │   └── auth.js                   # JWT + validation (próximo)
│   └── routes/
│       ├── public.js                 # GET /api/servicios, POST /api/reservas
│       ├── client.js                 # GET /api/cliente/reservas (JWT)
│       └── admin.js                  # GET /api/admin/dashboard (Cookie)
│
├── db/
│   ├── migrations/
│   │   ├── 001-tenants.sql          # Crear tabla tenants
│   │   ├── 002-rls.sql              # Habilitar RLS
│   │   └── 003-legacy.sql           # Migrar schema POC
│   └── seed-demo.sql                 # Datos de ejemplo
│
├── wrangler.toml                     # Config Cloudflare Workers
├── package.json
├── MIGRATION_GUIDE.md                # Cómo ejecutar migraciones
├── TESTING.md                        # Guía de testing
└── README.md                         # Este archivo
```

---

## 🌍 Tenants Disponibles

### Demo (Genérico)

- **URL:** `https://demo.newt.newtraderchiles.workers.dev`
- **Slug:** `demo`
- **Status:** Activo
- **Datos:** Ejemplos de servicios, empleados, reservas
- **Uso:** Testing, validación, capacitación

### Liz Belleza (Piloto)

- **URL:** `https://liz-belleza.newt.newtraderchiles.workers.dev`
- **Slug:** `liz-belleza`
- **Status:** Activo
- **Email:** `newtraderchiles@gmail.com`
- **Uso:** Primer cliente real

---

## 🔌 Endpoints API

### Públicos (sin autenticación)

```
GET  /api/health                    # Health check
GET  /api/config                    # Config del tenant
GET  /api/servicios                 # Listar servicios
GET  /api/empleados                 # Listar empleados
GET  /api/disponibilidad            # Slots libres (query params)
POST /api/reservas                  # Crear reserva
GET  /api/reservas/:id              # Estado de reserva
```

### Cliente (JWT required)

```
GET  /api/cliente/reservas          # Ver propias reservas
GET  /api/cliente/fidelizacion      # Puntos de fidelización
GET  /api/cliente/gift-cards        # Gift cards disponibles
POST /api/cliente/reservas/:id/cancelar
```

### Admin (Cookie + Admin role required)

```
GET  /api/admin/dashboard           # Estadísticas
GET  /api/admin/reservas            # Todas las reservas del tenant
POST /api/admin/reservas/:id/confirmar
GET  /api/admin/servicios           # Listar servicios
POST /api/admin/servicios           # Crear servicio
GET  /api/admin/empleados           # Listar empleados
```

---

## 🔐 Seguridad

### Row Level Security (RLS)

Implementado en Supabase para garantizar:
- ✅ Clientes solo ven sus propias reservas
- ✅ Admins solo ven datos de su tenant
- ✅ Datos de diferentes tenants NO se mezclan
- ✅ Validación a nivel de BD

### Autenticación

- **Clientes:** JWT (Google OAuth) → Token en Authorization header
- **Admin:** Cookie de sesión `liz_session` (encriptada)
- **Integración:** Service Role Key (solo server-side)

### Secretos

Never commitear:
- `.env.local` — Variables de desarrollo
- Cloudflare secrets — Session/JWT secrets
- Supabase service keys

Ver `.env.local.example` para plantilla.

---

## 📊 Estadísticas & Monitoreo

### Logging

Todos los handlers loguean a console:
```javascript
console.log(`[TenantDetection] ✅ Tenant slug: ${slug}`);
console.error(`[AdminAPI] Error confirming reserva:`, error);
```

Visible en:
- Cloudflare Dashboard → Workers → Logs
- Local: `npm run dev` output

### Cron Jobs

- **Diario a las 9 AM UTC:** Validar trials expirados, renovaciones
- Configurable en `wrangler.toml` → `triggers.crons`

---

## 📚 Guías

- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** — Ejecutar migraciones SQL
- **[TESTING.md](./TESTING.md)** — Validar endpoints con curl/Postman
- **[README-MULTITENANT.md](./README-MULTITENANT.md)** — Arquitectura detallada

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología | Razón |
|---|---|---|
| **Backend** | Cloudflare Workers | Edge computing, latencia baja, escala automática |
| **BD** | Supabase PostgreSQL | RLS nativa, escalable, API REST automático |
| **Auth** | Supabase Auth + Google OAuth | Centralizado, seguro, sin gestión de passwords |
| **Notificaciones** | Google Apps Script + Gmail | Sin serverless adicional, integración nativa |
| **Hosting** | Cloudflare Workers + Custom Domain | Subdominio por tenant, DNS dinámico |

---

## 📈 Próximas Fases (Post-MVP)

- [ ] **Onboarding automático** — Formulario de signup
- [ ] **Stripe integration** — Pagos y trial automático
- [ ] **Custom domain** — Clientes con dominio propio (ejemplo.com)
- [ ] **Slack notifications** — Alertas a admins
- [ ] **Dashboard superadmin** — Gestión de todos los tenants
- [ ] **Email templates** — Diseño profesional
- [ ] **Mobile app** — React Native
- [ ] **Analytics** — Métricas de uso por tenant

---

## 🤝 Contribuir

Este proyecto está en desarrollo activo. Para cambios:

1. Crear feature branch: `git checkout -b feature/nombre`
2. Hacer cambios
3. Testear (ver TESTING.md)
4. Commit: `git commit -m "feat: descripción"`
5. Push: `git push origin feature/nombre`
6. PR a main

---

## 📞 Soporte

**Email:** newtraderchiles@gmail.com  
**Issues:** GitHub Issues  
**Status:** https://status.newt.newtraderchiles.workers.dev (próximo)

---

## 📄 Licencia

MIT — Libre para usar y modificar.

---

## 🎉 Estado del Proyecto

| Fase | Estado | ETA |
|---|---|---|
| FASE 0: Git + Estructura | ✅ Completado | - |
| FASE 1: Schema Multi-tenant | ✅ Completado | - |
| FASE 2: Middleware Tenant Detection | ✅ Completado | - |
| FASE 3: API Handlers | ✅ Completado | - |
| FASE 4: Secrets & Config | ⏳ En progreso | 1-2 horas |
| FASE 5: Testing & Validación | ⏳ En progreso | 2-3 horas |
| MVP Funcional | 🎯 Próximo | 1 semana |

---

**Última actualización:** 2026-05-15  
**Versión:** 1.0.0-alpha
