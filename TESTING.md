# 🧪 Testing Guide — LIZ SaaS Multi-Tenant

## Prerequisitos

1. ✅ Migraciones ejecutadas en Supabase (ver `MIGRATION_GUIDE.md`)
2. ✅ Seed data cargado (tenants "demo" y "liz-belleza")
3. ✅ Worker desplegado (local o production)
4. ✅ Postman, curl, o cliente HTTP similar

---

## FASE 1: Tenant Detection

### Test 1.1: Verificar que el worker detecta el subdominio

```bash
# Debe detectar "demo" tenant
curl https://demo.newt.newtraderchiles.workers.dev/api/health

# Respuesta esperada:
# {
#   "ok": true,
#   "tenant": "demo"
# }
```

### Test 1.2: Verificar landing page (sin tenant)

```bash
curl https://newt.newtraderchiles.workers.dev/

# Debe retornar HTML con "LIZ SaaS" y lista de tenants disponibles
```

### Test 1.3: Verificar 404 para tenant inexistente

```bash
curl https://nonexistent.newt.newtraderchiles.workers.dev/api/health

# Respuesta esperada:
# {
#   "error": "Tenant not found"
# }
# Status: 404
```

---

## FASE 2: API Pública (sin autenticación)

### Test 2.1: Obtener servicios disponibles

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/servicios

# Respuesta esperada:
# {
#   "ok": true,
#   "tenant": "demo",
#   "servicios": [
#     {
#       "id": "...",
#       "nombre": "Corte de cabello",
#       "descripcion": "...",
#       "duracion_minutos": 30,
#       "precio": 25.00
#     },
#     ...
#   ]
# }
```

### Test 2.2: Obtener empleados disponibles

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/empleados

# Respuesta esperada:
# {
#   "ok": true,
#   "tenant": "demo",
#   "empleados": [
#     {
#       "id": "...",
#       "nombre": "María García",
#       "especialidades": "Cortes,Peinados"
#     },
#     ...
#   ]
# }
```

### Test 2.3: Verificar disponibilidad para una fecha

```bash
curl "https://demo.newt.newtraderchiles.workers.dev/api/disponibilidad?fecha=2025-06-20&servicio_id=<service-id>&empleado_id=<employee-id>"

# Respuesta esperada:
# {
#   "ok": true,
#   "fecha": "2025-06-20",
#   "duracion_minutos": 30,
#   "slots": [
#     { "hora": "09:00", "disponible": true },
#     { "hora": "09:15", "disponible": true },
#     ...
#   ]
# }
```

### Test 2.4: Crear una reserva (POST)

```bash
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/reservas \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@test.com",
    "telefono": "+56912345678",
    "fecha": "2025-06-20",
    "hora": "14:00",
    "servicio_id": "<service-id>",
    "empleado_id": "<employee-id>",
    "notas": "Tengo alergia al latex"
  }'

# Respuesta esperada (201):
# {
#   "ok": true,
#   "mensaje": "Reserva creada exitosamente",
#   "reserva_id": "...",
#   "estado": "pendiente"
# }
```

### Test 2.5: Obtener estado de reserva (por ID)

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/reservas/<reserva-id>

# Respuesta esperada:
# {
#   "ok": true,
#   "reserva": {
#     "id": "...",
#     "nombre": "Juan Pérez",
#     "email": "juan@test.com",
#     "fecha": "2025-06-20",
#     "hora": "14:00",
#     "estado": "pendiente",
#     "confirmada": false
#   }
# }
```

---

## FASE 3: API Protegida - Cliente (JWT)

### Prerequisito: Obtener JWT token

```bash
# Para testing, generar un JWT con email del cliente
# En producción, obtenido desde Supabase Auth

# Usando OpenSSL/Node:
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { email: 'juan@test.com', sub: 'user-uuid' },
  'jwt-secret',
  { expiresIn: '1h' }
);
console.log(token);
"

# O usar jwt.io para generar un token de testing
```

### Test 3.1: Obtener reservas del cliente

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/cliente/reservas \
  -H "Authorization: Bearer <jwt-token>"

# Respuesta esperada:
# {
#   "ok": true,
#   "cliente_email": "juan@test.com",
#   "reservas": [
#     {
#       "id": "...",
#       "fecha": "2025-06-20",
#       "hora": "14:00",
#       "estado": "pendiente",
#       "confirmada": false,
#       "servicios": { "nombre": "Corte", "precio": 25 },
#       "empleados": { "nombre": "María" }
#     }
#   ]
# }
```

### Test 3.2: Obtener puntos de fidelización

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/cliente/fidelizacion \
  -H "Authorization: Bearer <jwt-token>"

# Respuesta esperada:
# {
#   "ok": true,
#   "cliente_email": "juan@test.com",
#   "fidelizacion": {
#     "puntos_acumulados": 150,
#     "puntos_canjeados": 0,
#     "nivel": "bronce",
#     "ultima_compra": "2025-05-15"
#   }
# }
```

### Test 3.3: Obtener gift cards del cliente

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/cliente/gift-cards \
  -H "Authorization: Bearer <jwt-token>"

# Respuesta esperada:
# {
#   "ok": true,
#   "cliente_email": "juan@test.com",
#   "gift_cards": [
#     {
#       "codigo": "GC-DEMO-001",
#       "monto_restante": 50.00,
#       "estado": "activa",
#       "fecha_vencimiento": "2026-05-15"
#     }
#   ],
#   "total_disponible": 50.00
# }
```

### Test 3.4: Cancelar reserva del cliente

```bash
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/cliente/reservas/<reserva-id>/cancelar \
  -H "Authorization: Bearer <jwt-token>"

# Respuesta esperada:
# {
#   "ok": true,
#   "mensaje": "Reserva cancelada",
#   "reserva_id": "..."
# }

# Test error: Intentar cancelar reserva ajena
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/cliente/reservas/<reserva-id>/cancelar \
  -H "Authorization: Bearer <otro-jwt-token>"
# Debe retornar 404
```

---

## FASE 4: API Protegida - Admin (Cookie)

### Prerequisito: Crear sesión de admin

```bash
# Para testing local, crear una cookie manualmente:
# Estructura: liz_session=base64({"userId":"<uuid>","email":"admin@demo.local","role":"admin"})

NODE_CONTENT='{"userId":"550e8400-e29b-41d4-a716-446655440000","email":"admin@demo.local","role":"admin"}'
COOKIE=$(echo "$NODE_CONTENT" | base64)
echo "liz_session=$COOKIE"
# Usar en las siguientes requests
```

### Test 4.1: Ver dashboard del admin

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/admin/dashboard \
  -H "Cookie: liz_session=<encoded-session>"

# Respuesta esperada:
# {
#   "ok": true,
#   "tenant": "demo",
#   "estadisticas": {
#     "reservas_hoy": 5,
#     "reservas_pendientes": 2,
#     "clientes_activos": 42,
#     "total_servicios": 6,
#     "total_empleados": 4
#   }
# }
```

### Test 4.2: Obtener reservas del tenant

```bash
curl "https://demo.newt.newtraderchiles.workers.dev/api/admin/reservas?fecha=2025-06-20&estado=pendiente" \
  -H "Cookie: liz_session=<encoded-session>"

# Respuesta esperada:
# {
#   "ok": true,
#   "tenant": "demo",
#   "reservas": [
#     {
#       "id": "...",
#       "nombre": "Juan Pérez",
#       "email": "juan@test.com",
#       "fecha": "2025-06-20",
#       "hora": "14:00",
#       "estado": "pendiente",
#       "servicios": { "nombre": "Corte", "precio": 25 }
#     }
#   ]
# }
```

### Test 4.3: Confirmar reserva

```bash
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/admin/reservas/<reserva-id>/confirmar \
  -H "Cookie: liz_session=<encoded-session>"

# Respuesta esperada:
# {
#   "ok": true,
#   "mensaje": "Reserva confirmada",
#   "reserva_id": "..."
# }
```

### Test 4.4: Crear nuevo servicio

```bash
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/admin/servicios \
  -H "Cookie: liz_session=<encoded-session>" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Masaje relajante",
    "descripcion": "60 minutos de masaje terapéutico",
    "duracion_minutos": 60,
    "precio": 80.00,
    "activo": true
  }'

# Respuesta esperada (201):
# {
#   "ok": true,
#   "mensaje": "Servicio creado",
#   "servicio": {
#     "id": "...",
#     "nombre": "Masaje relajante",
#     "precio": 80.00,
#     ...
#   }
# }
```

---

## FASE 5: Multi-Tenant Isolation (RLS)

### Test 5.1: Verificar que "liz-belleza" tiene datos distintos

```bash
# Obtener servicios de demo
curl https://demo.newt.newtraderchiles.workers.dev/api/servicios | jq '.servicios | length'
# Debe retornar 6

# Obtener servicios de liz-belleza
curl https://liz-belleza.newt.newtraderchiles.workers.dev/api/servicios | jq '.servicios | length'
# Puede retornar 0 (sin datos de ejemplo) o los servicios reales de Liz
```

### Test 5.2: Verificar que cliente de un tenant no ve datos del otro (RLS)

```sql
-- Conectarse como cliente de "demo"
-- Ejecutar:
SELECT * FROM reservas 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'liz-belleza');

-- Debe retornar 0 filas (RLS bloqueó)
```

### Test 5.3: Verificar que admin solo ve su tenant

```bash
# Admin de demo hace request a liz-belleza
curl https://liz-belleza.newt.newtraderchiles.workers.dev/api/admin/dashboard \
  -H "Cookie: liz_session=<demo-admin-session>"

# Debe retornar 401 Unauthorized (no es admin en liz-belleza)
```

---

## FASE 6: Error Handling

### Test 6.1: Validar JWT inválido

```bash
curl https://demo.newt.newtraderchiles.workers.dev/api/cliente/reservas \
  -H "Authorization: Bearer invalid-token"

# Respuesta esperada:
# {
#   "error": "Unauthorized"
# }
# Status: 401
```

### Test 6.2: Validar campo requerido faltante

```bash
curl -X POST https://demo.newt.newtraderchiles.workers.dev/api/reservas \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan",
    "email": "juan@test.com"
    # Falta: telefono, fecha, hora, servicio_id
  }'

# Respuesta esperada:
# {
#   "error": "Missing field: telefono"
# }
# Status: 400
```

### Test 6.3: Validar fecha inválida

```bash
curl "https://demo.newt.newtraderchiles.workers.dev/api/disponibilidad?fecha=invalid-date"

# Respuesta esperada:
# {
#   "error": "Invalid date format"
# }
# Status: 400
```

---

## Checklist de Testing Completo

- [ ] Tenant detection funciona (subdominios)
- [ ] API pública accesible sin autenticación
- [ ] Crear reserva pública funciona
- [ ] Cliente puede ver sus propias reservas (JWT)
- [ ] Admin ve dashboard (cookie)
- [ ] Admin confirma reservas
- [ ] Admin crea servicios
- [ ] RLS aísla datos entre tenants
- [ ] Validaciones de errores funcionan
- [ ] CORS permite requests cross-origin
- [ ] Rate limiting no aplicado (próxima fase)

---

## Próximos Tests

- [ ] Integration tests automatizados
- [ ] Load testing (K6, Artillery)
- [ ] Security testing (OWASP)
- [ ] Performance profiling (Lighthouse)
- [ ] End-to-end workflow (booking → confirmation → email)
