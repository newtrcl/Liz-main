# Liz Belleza Integral — Guía de Despliegue

## 1. Supabase — Crear tablas

1. Ve a [supabase.com](https://app.supabase.com) → tu proyecto
2. **SQL Editor** → pega y ejecuta `supabase/schema.sql`
3. Confirma que aparecen las tablas: `servicios`, `empleados`, `reservas`

---

## 2. Cloudflare — Configurar Worker

### 2a. Instalar Wrangler (si no lo tienes)
```bash
npm install -g wrangler
wrangler login
```

### 2b. Agregar secretos (nunca en código)
```bash
cd C:\Users\LENOVO\Documents\Liz-main

# Clave de servicio Supabase (service_role, NO anon)
wrangler secret put SUPABASE_SERVICE_KEY

# Contraseña del panel admin (elige una segura)
wrangler secret put ADMIN_PASSWORD

# Secreto para firmar cookies HMAC (cadena aleatoria larga)
wrangler secret put ADMIN_SECRET

# URL del Google Apps Script (con la barra final si corresponde)
wrangler secret put GAS_URL
```

### 2c. (Opcional) KV para rate-limiting
```bash
wrangler kv namespace create RATE_KV
# Copia el ID que aparece y descomenta las líneas en wrangler.toml
```

### 2d. Desplegar
```bash
wrangler deploy
```

---

## 3. Accesos

| Ruta | Descripción |
|------|-------------|
| `/` | Página de reservas pública |
| `/admin/login.html` | Login del panel admin |
| `/admin/panel.html` | Panel admin (requiere cookie) |

> El viejo `dashboard.html` sigue en disco pero **no está vinculado** desde ninguna página.
> Puedes eliminarlo cuando quieras.

---

## 4. Variables de entorno (resumen)

| Variable | Dónde se define | Descripción |
|----------|----------------|-------------|
| `SUPABASE_URL` | `wrangler.toml` [vars] | URL pública del proyecto |
| `SUPABASE_SERVICE_KEY` | `wrangler secret` | Clave service_role |
| `ADMIN_PASSWORD` | `wrangler secret` | Contraseña del panel |
| `ADMIN_SECRET` | `wrangler secret` | Secreto HMAC (32+ chars) |
| `GAS_URL` | `wrangler secret` | URL Apps Script |

---

## 5. Flujo de datos

```
Cliente → Worker → Supabase (lectura/escritura primaria)
                 ↘ GAS (ctx.waitUntil — async, para Sheets + email + Calendar)
```

- **Supabase** responde en < 100ms → el cliente recibe confirmación rápida
- **GAS** recibe notificación en segundo plano (máx 10 s timeout)
- Si GAS falla, la reserva ya está guardada en Supabase

---

## 6. Datos de ejemplo

El `schema.sql` incluye empleados y servicios de ejemplo.
Ajusta `INSERT INTO servicios` y `INSERT INTO empleados` con los datos reales del negocio.
