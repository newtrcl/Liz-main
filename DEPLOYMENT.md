# 🚀 Deployment Guide — LIZ SaaS

Guía paso a paso para desplegar LIZ SaaS en Cloudflare Workers.

---

## Prerequisites

- ✅ Cuenta Cloudflare con acceso a Workers
- ✅ Proyecto Git inicializado
- ✅ npm instalado localmente
- ✅ Migraciones completadas en Supabase
- ✅ Wrangler CLI instalado: `npm install -g wrangler`

---

## PASO 1: Autenticarse con Cloudflare

```bash
# Login a Cloudflare
wrangler login

# Seleccionar el sitio/cuenta cuando se solicite
# Se abrirá navegador para autorizar
```

Verificar autenticación:
```bash
wrangler whoami
# Debe mostrar tu email de Cloudflare
```

---

## PASO 2: Configurar Secrets en Cloudflare

### Método A: Via Cloudflare Dashboard (Recomendado)

1. Ir a **Cloudflare Dashboard** → **Workers & Pages** → **liz-saas**
2. Ir a **Settings** → **Environment Variables**

#### Variables (public)

Agregar:
- `SUPABASE_URL` = `https://oljmpzjpbwwomuqwipba.supabase.co`
- `SUPABASE_ANON_KEY` = (copiar de Supabase Dashboard)

#### Secrets (private)

Ir a **Settings** → **Secrets** y agregar:

```
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SESSION_SECRET = "$(openssl rand -hex 32)"
JWT_SECRET = "$(openssl rand -hex 32)"
```

### Método B: Via CLI (Automation)

```bash
# Agregar secreto (prompts interactivamente)
wrangler secret put SUPABASE_SERVICE_KEY --env production
# Copiar y pegar la service key cuando se solicite

wrangler secret put SESSION_SECRET --env production
# Ingresar secret aleatorio

wrangler secret put JWT_SECRET --env production
# Ingresar secret aleatorio

# Verificar que se agregaron
wrangler secret list --env production
```

---

## PASO 3: Desplegar a Staging (Development)

```bash
# Deploy a staging/development
npm run deploy

# Alternativamente:
wrangler deploy --env development

# Salida esperada:
# ✨ Successfully published your Worker
# 📦 Deployed to https://liz-saas.newtraderchiles.workers.dev
```

### Test en Staging

```bash
# Verificar que el worker funciona
curl https://liz-saas.newtraderchiles.workers.dev/api/health

# Respuesta esperada:
# {
#   "error": "Tenant not found"
# }
# (Esperado porque no es subdominio válido)

# Probar con subdominio local:
curl http://demo.localhost:8787/api/health

# O en staging cloud:
# Nota: Cloudflare automáticamente ruteará *.newt.newtraderchiles.workers.dev
```

---

## PASO 4: Configurar Rutas Custom Domain

**IMPORTANTE:** Si usas Cloudflare para DNS, los subdomios se rutean automáticamente.

### Opción A: Wildcard en Cloudflare DNS (Recomendado)

1. Ir a **Cloudflare Dashboard** → **DNS** → **Records**
2. Crear CNAME:

```
Type: CNAME
Name: *.newt (wildcard para subelementos)
Target: liz-saas.newtraderchiles.workers.dev
TTL: Auto
Proxy: Proxied (nube naranja)
```

3. Verificar DNS:
```bash
nslookup demo.newt.newtraderchiles.workers.dev

# Debe resolver a liz-saas.newtraderchiles.workers.dev
```

### Opción B: Custom Domain en Cloudflare Workers

1. Dashboard → Workers → liz-saas → Settings
2. **Domains & Routes** → **Add route**
3. Agregar:
   - `*.newt.newtraderchiles.workers.dev/*` → liz-saas (environment: development)

---

## PASO 5: Desplegar a Producción

```bash
# Revisar cambios antes de desplegar
npm run deploy:dry

# Deploy a producción
npm run deploy:prod

# Salida esperada:
# ✨ Successfully published your Worker (prod)
```

### Verificar en Producción

```bash
# Health check
curl https://demo.newt.newtraderchiles.workers.dev/api/health
# {"ok": true, "tenant": "demo"}

# Obtener servicios
curl https://demo.newt.newtraderchiles.workers.dev/api/servicios
# {
#   "ok": true,
#   "tenant": "demo",
#   "servicios": [...]
# }

# Para liz-belleza
curl https://liz-belleza.newt.newtraderchiles.workers.dev/api/config
```

---

## PASO 6: Configurar Monitoreo

### Cloudflare Analytics

1. Dashboard → Workers → liz-saas → **Analytics**
   - Requests: Total de requests al worker
   - Status codes: Errores 4xx/5xx
   - CPU ms: Tiempo de ejecución

### Logging

Los logs aparecen en:
1. **Dashboard → Workers → liz-saas → Logs** (real-time, últimas 100 líneas)
2. **CLI:** `wrangler tail --env production` (stream en vivo)

```bash
# Watch logs en vivo durante testing
wrangler tail --env production --format json

# Filtrar por searchPatterns
wrangler tail --env production --search "error"
```

---

## PASO 7: Configurar Cron Jobs

Los cron jobs validarán diariamente:
- Trials expirados
- Renovaciones automáticas (próximo)

### En Cloudflare Dashboard

1. Workers → liz-saas → **Settings** → **Cron Triggers**
2. Ya configurado en `wrangler.toml`: `crons = ["0 9 * * *"]`

### Verificar

```bash
# Ver últimas ejecuciones
wrangler tail --env production --format json | grep cron
```

---

## PASO 8: Configurar Email Notifications (Opcional)

Para que los clientes reciban confirmaciones de reserva:

1. **En cada tenant**, configurar `gmail_email` y `gmail_app_password`:

```sql
-- Actualizar tenant demo
UPDATE tenants
SET gmail_email = 'demonotif@gmail.com',
    gmail_app_password = 'xxxx xxxx xxxx xxxx'  -- 16-char app password
WHERE slug = 'demo';

-- Actualizar liz-belleza
UPDATE tenants
SET gmail_email = 'newtraderchiles@gmail.com',
    gmail_app_password = 'xxxx xxxx xxxx xxxx'
WHERE slug = 'liz-belleza';
```

2. **Generar app password en Gmail:**
   - Google Account → Security
   - App passwords → Seleccionar Mail + Windows
   - Copiar los 16 caracteres

3. **Webhook en Google Apps Script:**
   - Publicar Apps Script con endpoint /doPost
   - Configurar URL en `APPS_SCRIPT_URL` en wrangler.toml

---

## PASO 9: Rollback Plan

Si algo sale mal:

```bash
# Ver historial de deployments
wrangler deployments list --env production

# Revertir a versión anterior
wrangler rollback --env production --message "Rollback: [razón]"

# Verificar que funcionó
curl https://demo.newt.newtraderchiles.workers.dev/api/health
```

---

## PASO 10: Validación Post-Deployment

### Checklist

- [ ] Health check retorna 200
- [ ] Servicios están accesibles (/api/servicios)
- [ ] Crear reserva funciona (POST /api/reservas)
- [ ] Admin dashboard funciona (GET /api/admin/dashboard)
- [ ] Ambos tenants (demo, liz-belleza) funcionan
- [ ] CORS permite requests cross-origin
- [ ] Logs no muestran errores 500
- [ ] Rendimiento < 100ms (Analytics)
- [ ] RLS está bloqueando datos entre tenants (Supabase)

### Performance Targets

```
GET  /api/servicios         < 50ms
POST /api/reservas          < 100ms
GET  /api/admin/dashboard   < 150ms
```

Monitorear en: Dashboard → Workers → Analytics → CPU ms

---

## Troubleshooting

### Error: "Unauthorized" en Supabase

```
SUPABASE_SERVICE_KEY no es válida
→ Ir a Supabase → Project Settings → API
→ Copiar "Service Role Key" (NOT anon key)
→ Actualizar en wrangler.toml
```

### Error: "Tenant not found"

```
Tenant "demo" no existe en Supabase
→ Ir a Supabase SQL Editor
→ Ejecutar: SELECT * FROM tenants;
→ Si está vacío, ejecutar seed-demo.sql
```

### Error: "Worker deployment failed"

```
wrangler deploy devolvió error
→ Verificar: npm run deploy:dry
→ Buscar errores de sintaxis en JS
→ Asegurar que wrangler.toml es válido TOML
```

### Logs en tiempo real

```bash
# Ver errores en vivo
wrangler tail --env production --format json | jq 'select(.outcome != "ok")'

# Ver logs específicos de un tenant
wrangler tail --env production --search "liz-belleza"
```

---

## Monitoreo Continuo

### Daily Checklist

```bash
#!/bin/bash
# health-check.sh

ENDPOINTS=(
  "https://demo.newt.newtraderchiles.workers.dev/api/health"
  "https://liz-belleza.newt.newtraderchiles.workers.dev/api/health"
)

for endpoint in "${ENDPOINTS[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint")
  if [ "$status" != "200" ]; then
    echo "❌ $endpoint returned $status"
  else
    echo "✅ $endpoint OK"
  fi
done
```

Ejecutar con cron:
```bash
# Cada 6 horas
0 */6 * * * /path/to/health-check.sh
```

---

## Escalado (Futuro)

Cloudflare Workers escala automáticamente:
- ✅ Requests ilimitados
- ✅ CPU time: 50ms por request (límite)
- ✅ Global distribution: 275+ datacenters
- ✅ Auto-replicación

Para optimizar:
1. Usar KV para caching de tenant config
2. Implementar rate limiting
3. Comprimir responses con gzip

---

## Conclusión

✅ **Deployment completado**

Tu SaaS ahora está en vivo:
- 🌍 **URL base:** `https://newt.newtraderchiles.workers.dev`
- 🔗 **Demo:** `https://demo.newt.newtraderchiles.workers.dev`
- 🔗 **Liz:** `https://liz-belleza.newt.newtraderchiles.workers.dev`

**Próximos pasos:**
1. Invitar usuarios a probar
2. Monitorear errors en real-time
3. Recopilar feedback
4. Iterar en FASE 5 (próxima)

---

**Questions?** Revisar TESTING.md o contactar newtraderchiles@gmail.com
