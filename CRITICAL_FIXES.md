# 🔴 PUNTOS CRÍTICOS A RESOLVER

## 1. NAVEGACIÓN - Acceso a "Clientes" en Frontend

**Archivo:** `index.html`
**Problema:** El menú principal no tiene enlace a portal de clientes
**Solución:**
```html
<!-- Agregar en nav principal -->
<a href="/cliente.html" class="nav-link">👥 Clientes</a>
```

**Ubicación:** Junto a "Servicios", "Reservar", "Contactar"

---

## 2. FIDELIZACIÓN - Puntos en Canceladas

**Archivos Afectados:**
- `_worker.js` - `handleCrearReserva()`
- `appscript/reservas.gs` - `_handleReservaCreada()`
- `appscript/main.gs` - Logic de puntos

**Problema:** Puntos se suman al crear, deben sumarse solo al COMPLETAR

**Solución:**
1. En `_worker.js` (línea ~560): NO sumar puntos en `handleCrearReserva()`
2. En `_worker.js` (línea ~800 en `handleAdminActualizarEstado()`): 
   - Cuando estado cambia a "Completada" → sumar puntos al cliente
   - Llamar a GAS con: `notificarGAS(env, 'sumarPuntosReserva', {reservaID, cliente})`
3. En `appscript/reservas.gs`: Crear función `sumarPuntosReserva()`

**Lógica:**
```javascript
// Cuando reserva → Completada
const puntos = reserva.precio / 1000; // $1000 = 1 punto
UPDATE clientes_fidelizacion SET puntos = puntos + ${puntos}
WHERE email = '${reserva.email}'
```

---

## 3. PDF RECIBO - Solo en "Pagado"

**Archivos Afectados:**
- `_worker.js` - `handleCrearReserva()`
- `appscript/main.gs` - `_handleConfirmarPago()`
- `admin/panel.html` - Modal de reserva

**Problema:** PDF se genera al crear, debe generarse al pagar

**Solución:**

### Opción A (Recomendada - Server-side):
1. En `_worker.js` `handleAdminActualizarEstado()` (línea ~1050):
   ```javascript
   if (estado === 'Pagada') {
     ctx.waitUntil(notificarGAS(env, 'generarReciboPDF', {
       reservaID: r.id,
       email: r.email,
       // datos completos de reserva
     }));
   }
   ```

2. En `appscript/main.gs`:
   ```javascript
   case "generarReciboPDF":
     return _handleGenerarReciboPDF(body.payload);
   ```

3. En `appscript/reservas.gs`:
   ```javascript
   function _handleGenerarReciboPDF(payload) {
     const pdf = generarPDFComprobante(payload);
     // Guardar en Google Drive o enviar por email
     MailApp.sendEmail(payload.email, "Tu recibo", "", {
       attachments: [pdf]
     });
   }
   ```

### Opción B (Client-side):
- Agregar botón "📥 Descargar Recibo" en modal de admin
- Solo visible cuando estado = "Pagada"

---

## 4. SEO Y METATAGS

**Archivos a actualizar:** 
- `index.html`
- `cliente.html`
- `admin/login.html`
- `admin/panel.html`

**Ejemplo - Agregar en `<head>`:**
```html
<!-- SEO Básico -->
<meta name="description" content="Sistema de reservas para salón de belleza. Reserva citas online, gestiona fidelización y recibe confirmaciones automáticas.">
<meta name="keywords" content="belleza, salón, citas, reservas, coloración, maquillaje">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="language" content="es">

<!-- Open Graph (compartir en redes) -->
<meta property="og:title" content="Belleza Integral - Reserva tu Cita Online">
<meta property="og:description" content="Sistema de reservas de belleza. Citas, puntos de fidelización y pagos en línea.">
<meta property="og:image" content="https://liz-belleza.newtraderchiles.workers.dev/logo.png">
<meta property="og:url" content="https://liz-belleza.newtraderchiles.workers.dev">
<meta property="og:type" content="website">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Belleza Integral">
<meta name="twitter:description" content="Reserva tu cita de belleza online">
<meta name="twitter:image" content="https://liz-belleza.newtraderchiles.workers.dev/logo.png">

<!-- Favicon -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/logo-apple.png">

<!-- Structured Data (JSON-LD) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Belleza Integral",
  "description": "Salón de belleza",
  "url": "https://liz-belleza.newtraderchiles.workers.dev",
  "telephone": "+56 9 XXXX XXXX",
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "CL"
  }
}
</script>
```

---

## 5. DASHBOARD - Botón Reagendar (¿Falta?)

**Archivo:** `admin/panel.html` línea ~1236

**Estado Actual:** 
```javascript
addBtn('📅 Reagendar', 'btn-primary', () => abrirReagendar(r.id, r.fecha, r.horaInicio));
```

✅ **El botón ESTÁ implementado**

**Posible Problema:**
- El botón está condicionado: `if (!['Cancelada'].includes(r.estado))`
- Solo aparece si estado NO es "Cancelada"
- Cuando reciben pago tardío y estado cambia a "Pagada", el botón SÍ debería aparecer

**Verificar:**
1. Abrir modal de reserva en estado "Cancelada"
2. Cambiar a "Pagada"
3. El botón "Reagendar" debería aparecer (si no está condicionado a Cancelada)

**Si falta: Agregar**
```javascript
// En verDetalle() - línea ~1233
if (!['Cancelada'].includes(r.estado)) {  // ← El botón aparece si NO es Cancelada
  addBtn('📅 Reagendar', 'btn-primary', () => abrirReagendar(r.id, r.fecha, r.horaInicio));
}
```

---

## PRIORIDAD DE IMPLEMENTACIÓN

| # | Tarea | Complejidad | Tiempo |
|---|-------|-------------|--------|
| 1 | Navegación "Clientes" | ⭐ | 5 min |
| 2 | SEO/Metatags | ⭐ | 15 min |
| 3 | PDF Recibo (solo en Pagado) | ⭐⭐⭐ | 1-2 h |
| 4 | Fidelización (puntos en Completada) | ⭐⭐⭐ | 1-2 h |
| 5 | Reagendar (verificar/arreglar) | ⭐ | 10 min |

**Total estimado:** 3-4 horas

---

## PASOS SIGUIENTES

1. ✅ Tú haces depuración web para confirmar dónde están los problemas
2. 📋 Me confirmas qué necesita arreglo
3. 🔧 Yo implemento las correcciones
4. 🧪 Testing y validación
5. ✅ Entrega final

¿Por dónde quieres empezar?
