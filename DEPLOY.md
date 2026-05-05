# Belleza Integral — Guía de Despliegue v2

## Flujo de datos

```
Cliente → Cloudflare Worker → Supabase (lectura/escritura principal, < 100 ms)
                            ↘ Google Apps Script  (async ctx.waitUntil, max 10 s)
                                └─ Email cliente + admin
                                └─ Google Calendar
                                └─ Slack
                                └─ Log en Sheets
```

> Si GAS falla, la reserva **ya está guardada en Supabase**. El cliente siempre recibe confirmación rápida.

---

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://app.supabase.com).
2. **SQL Editor** → pega y ejecuta `supabase/schema.sql`.
3. Tablas resultantes: `servicios`, `empleados`, `reservas`, `bloqueos`, `gift_cards`, `fidelizacion`.
4. Copia la **URL del proyecto** y la **clave `service_role`** (Settings → API).
   - `SUPABASE_URL` va en `wrangler.toml` (pública).
   - `SUPABASE_SERVICE_KEY` va en Wrangler secrets (¡nunca en código!).

> **RLS**: habilitado en todas las tablas. El Worker usa `service_role` (omite RLS).
> No crees políticas anon — el acceso directo queda bloqueado por defecto.

---

## 2. Cloudflare Worker

### 2a. Instalar Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2b. Secrets — NUNCA en código ni en git

```bash
cd C:\Users\LENOVO\Documents\Liz-main

# Clave service_role de Supabase
wrangler secret put SUPABASE_SERVICE_KEY

# Contraseña del panel admin (elige una segura, mín. 12 chars)
wrangler secret put ADMIN_PASSWORD

# Secreto HMAC para firmar cookies (cadena aleatoria, mín. 32 chars)
wrangler secret put ADMIN_SECRET

# URL del Google Apps Script (con /exec al final)
wrangler secret put GAS_URL
```

### 2c. KV para rate-limiting (opcional pero recomendado)

```bash
wrangler kv namespace create RATE_KV
# Copia el ID que aparece y descomenta las líneas en wrangler.toml
```

### 2d. Desplegar

```bash
wrangler deploy
```

### 2e. Variables de entorno — resumen

| Variable              | Dónde se define       | Es secreto | Descripción                         |
|-----------------------|-----------------------|:----------:|-------------------------------------|
| `SUPABASE_URL`        | `wrangler.toml [vars]`| No         | URL pública del proyecto Supabase   |
| `SUPABASE_SERVICE_KEY`| `wrangler secret`     | **Sí**     | Clave service_role (omite RLS)      |
| `ADMIN_PASSWORD`      | `wrangler secret`     | **Sí**     | Contraseña del panel admin          |
| `ADMIN_SECRET`        | `wrangler secret`     | **Sí**     | Secreto HMAC para cookies (32+ ch)  |
| `GAS_URL`             | `wrangler secret`     | **Sí**     | URL del Web App de Apps Script      |
| `RATE_KV`             | KV namespace binding  | No         | Namespace KV para rate-limiting     |

> **¿Debo agregar secretos a git?** → **NO.** `wrangler.toml` solo tiene variables públicas. Los secrets van exclusivamente en Cloudflare via `wrangler secret put`.

---

## 3. Google Apps Script (GAS)

1. Ve a [script.google.com](https://script.google.com) → **Nuevo proyecto**.
2. Crea un archivo `.gs` por cada archivo de la carpeta `appscript/`:
   - `1_config.gs`, `2_main.gs`, `3_reservas.gs`, `calendar.gs`, `sheets.gs`
3. En `1_config.gs` verifica las constantes (email, Slack, Sheet ID, etc.).
4. **Primera autorización** (obligatorio para que funcionen los emails):
   - Selecciona la función `testEnviarCorreo` → **Ejecutar**.
   - Acepta **todos** los permisos (Gmail, Calendar, Sheets).
5. **Desplegar como Web App**:
   - Implementar → Nueva implementación → Tipo: **App web**
   - **Ejecutar como: Yo (mi correo)** ← crítico para envío de emails
   - **Quién tiene acceso: Cualquier usuario (incluso anónimos)**
   - Copia la URL (`/exec`) → úsala como `GAS_URL` en Wrangler.
6. Tras cualquier cambio de código: volver a desplegar con **"Nueva versión"**.

---

## 4. Rutas del sistema

| Ruta                        | Descripción                              | Auth       |
|-----------------------------|------------------------------------------|------------|
| `/`                         | Página de reservas pública               | Ninguna    |
| `/api/health`               | Health-check (monitor 30 s)              | Ninguna    |
| `/api/servicios`            | Catálogo de servicios                    | Ninguna    |
| `/api/disponibilidad`       | Slots disponibles (incluye bloqueos)     | Ninguna    |
| `/api/reservas`             | Crear reserva                            | Ninguna    |
| `/api/slots/bloquear`       | Bloqueo temporal de slot (10 min)        | Ninguna    |
| `/api/giftcards/:codigo`    | Validar gift card                        | Ninguna    |
| `/api/fidelizacion/qr/:tk`  | Consulta perfil por QR token             | Ninguna    |
| `/admin/login.html`         | Login del panel admin                    | Ninguna    |
| `/admin/panel.html`         | Panel admin (Zoho-style)                 | Cookie     |
| `/api/admin/dashboard`      | Stats del día                            | Cookie     |
| `/api/admin/reportes`       | Reportes por rango de fechas             | Cookie     |
| `/api/admin/reservas/reagendar` | Reagendar cita                       | Cookie     |
| `/api/admin/giftcards`      | Crear / listar gift cards                | Cookie     |
| `/api/admin/fidelizacion`   | Listado de clientes con puntos           | Cookie     |

---

## 5. Seguridad — checklist

- [x] RLS habilitado en todas las tablas de Supabase
- [x] Worker usa `service_role` (no expone keys al browser)
- [x] Cookies de sesión `HttpOnly; Secure; SameSite=Strict`
- [x] HMAC-SHA256 para firmar tokens de sesión (expiran en 24 h)
- [x] Rate limiting: 10 reservas/h por IP, 5 logins/10 min por IP
- [x] Sanitización de inputs en Worker y en GAS
- [x] Secrets en Cloudflare (no en git ni en código)
- [x] `.gitignore` excluye `.env`, `.wrangler/`, `secrets.json`
- [ ] Rotar `ADMIN_SECRET` y `ADMIN_PASSWORD` cada 90 días
- [ ] Habilitar 2FA en la cuenta de Cloudflare
- [ ] Habilitar 2FA en la cuenta de Supabase

---

## 6. Replicar para otro negocio

Solo necesitas editar **`appscript/1_config.gs`**:

```js
const NEGOCIO_NOMBRE    = "Nombre del Negocio";
const NEGOCIO_EMAIL     = "correo@negocio.cl";
const NEGOCIO_TEL       = "+56 9 XXXX XXXX";
const NEGOCIO_WHATSAPP  = "569XXXXXXXX";
const NEGOCIO_INSTAGRAM = "https://instagram.com/...";
const NEGOCIO_DIR       = "Dirección, Ciudad";
const SITIO_URL         = "https://tu-sitio.pages.dev";
const LOGO_URL          = "https://...url-logo...";
const SHEET_ID          = "ID_DE_TU_HOJA_DE_CALCULO";
const SLACK_WEBHOOK_URL = "https://hooks.slack.com/...";
```

Y en el frontend actualiza `LOGO_URL` / `NEGOCIO_NOMBRE` en `js/api.js`.
