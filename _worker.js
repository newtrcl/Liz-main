/* ================================================================
   Belleza Integral — _worker.js  (Cloudflare Worker v2)
   ─────────────────────────────────────────────────────────────
   Rutas públicas:
     GET  /api/health
     GET  /api/servicios
     GET  /api/empleados
     GET  /api/disponibilidad?fecha=&servicioID=
     POST /api/reservas
     POST /api/reservas/cancelar
     POST /api/slots/bloquear      → reserva temporal 10 min
     DELETE /api/slots/bloqueo/:id → libera bloqueo
     GET  /api/giftcards/:codigo   → valida gift card
     GET  /api/fidelizacion/qr/:token
   Rutas cliente (Supabase Auth token):
     GET  /api/cliente/reservas?estado=&desde=&hasta=
     GET  /api/cliente/perfil
     POST /api/cliente/cancelar-reserva
   Rutas admin (cookie httpOnly HMAC-SHA256):
     POST /api/admin/login
     POST /api/admin/logout
     GET  /api/admin/dashboard
     GET  /api/admin/reservas?fecha=
     GET  /api/admin/reportes?desde=&hasta=
     POST /api/admin/reservas/estado
     POST /api/admin/reservas/cancelar
     POST /api/admin/reservas/reagendar
     POST /api/admin/giftcards
     GET  /api/admin/giftcards
     GET  /api/admin/fidelizacion
   Protección:
     GET  /admin/* → cookie válida, sino redirect a /admin/login.html
   ================================================================ */

// ── HELPERS GENERALES ─────────────────────────────────────────

function sanitizar(valor, maxLen = 300) {
  if (typeof valor !== 'string') return '';
  return valor.trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .slice(0, maxLen);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function horaAMin(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function minAHora(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function hoyISO() {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Santiago' }).format(new Date());
}

function minutosAhoraEnSantiago() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   || '0');
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  return h * 60 + m;
}

// Mapea snake_case Supabase → camelCase frontend
function mapReserva(r) {
  return {
    id:              r.id,
    nombre:          r.nombre,
    email:           r.email,
    telefono:        r.telefono || '',
    servicioID:      r.servicio_id,
    servicioNombre:  r.servicio_nombre,
    empleadoID:      r.empleado_id,
    empleadoNombre:  r.empleado_nombre,
    fecha:           r.fecha,
    horaInicio:      r.hora_inicio,
    horaFin:         r.hora_fin,
    duracion:        r.duracion,
    precio:          parseFloat(r.precio || 0),
    sesionNum:       r.sesion_num,
    sesionesTotales: r.sesiones_totales,
    estado:          r.estado,
    notas:           r.notas || '',
    canceladoPor:    r.cancelado_por,
    giftcardCodigo:  r.giftcard_codigo || '',
    createdAt:       r.created_at,
  };
}

// ── SUPABASE ──────────────────────────────────────────────────

async function supaFetch(env, path, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey:        env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:        'return=representation',
    ...(options.headers || {}),
  };
  try {
    const res  = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: e.message };
  }
}

// ── HMAC / COOKIE ─────────────────────────────────────────────

async function crearTokenSesion(env) {
  const payload = Date.now().toString();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.ADMIN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sigHex}`;
}

async function verificarCookie(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    })
  );
  const token = cookies['liz_session'];
  if (!token) return false;

  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = token.slice(0, dotIdx);
  const sigHex  = token.slice(dotIdx + 1);

  const ts = parseInt(payload);
  if (isNaN(ts) || Date.now() - ts > 86_400_000) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.ADMIN_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

// ── SUPABASE AUTH CLIENTE ──────────────────────────────────────

// [SECURITY] Validar JWT contra JWKS de Supabase (CVE-2025-29927 mitigation)
const jwksCache = new Map();
const JWKS_TTL = 3600; // 1 hora

async function obtenerJWKS(supabaseUrl) {
  const cacheKey = supabaseUrl;
  const cached = jwksCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < JWKS_TTL * 1000) {
    return cached.data;
  }

  try {
    const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
    const res = await fetch(jwksUrl);
    if (!res.ok) throw new Error('JWKS fetch failed');

    const jwks = await res.json();
    jwksCache.set(cacheKey, { data: jwks, timestamp: Date.now() });
    return jwks;
  } catch (e) {
    console.error('JWKS fetch error:', e.message);
    return null;
  }
}

function base64UrlDecode(str) {
  const padded = str.padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function verificarTokenSupabase(token, supabaseUrl) {
  if (!token || !supabaseUrl) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decodificar header y payload
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const signature = parts[2];

    // Verificar expiración
    const ahora = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < ahora) {
      console.warn('[JWT] Token expirado');
      return null;
    }

    // Obtener JWKS de Supabase
    const jwks = await obtenerJWKS(supabaseUrl);
    if (!jwks || !jwks.keys) {
      console.error('[JWT] JWKS no disponible');
      return null;
    }

    // Encontrar la clave correspondiente
    const key = jwks.keys.find(k => k.kid === header.kid);
    if (!key) {
      console.warn('[JWT] Key ID no encontrado en JWKS');
      return null;
    }

    // Validar que el algoritmo sea ES256 (Supabase siempre usa ES256)
    if (header.alg !== 'ES256' || key.alg !== 'ES256') {
      console.warn('[JWT] Algoritmo no es ES256');
      return null;
    }

    // Importar clave pública desde JWKS
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: key.kty,
        crv: key.crv,
        x: key.x,
        y: key.y,
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    // Decodificar firma (base64url → hex → bytes)
    const sigBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');
    const sigBytes = new Uint8Array(atob(sigBase64).split('').map(c => c.charCodeAt(0)));

    // Verificar firma: sign = ECDSA(header.payload)
    const message = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBytes,
      message
    );

    if (!valid) {
      console.warn('[JWT] Firma inválida');
      return null;
    }

    // Token válido y autenticado
    return {
      email: payload.email || payload.user_metadata?.email,
      sub: payload.sub,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (e) {
    console.error('[JWT] Validation error:', e.message);
    return null;
  }
}

// ── RATE LIMITING (KV) ────────────────────────────────────────

async function checkRateLimit(env, key, maxReq, windowMs) {
  if (!env.RATE_KV) return true;
  const bucket = Math.floor(Date.now() / windowMs);
  const kvKey  = `rl:${key}:${bucket}`;
  const cur    = parseInt(await env.RATE_KV.get(kvKey) || '0');
  if (cur >= maxReq) return false;
  await env.RATE_KV.put(kvKey, String(cur + 1), {
    expirationTtl: Math.ceil(windowMs / 1000) + 10,
  });
  return true;
}

// ── SLOT GENERATION ───────────────────────────────────────────

function generarSlots(ocupados, duracion, fecha) {
  const slots  = [];
  const esHoy    = fecha === hoyISO();
  const minAhora = esHoy ? (minutosAhoraEnSantiago() + 30) : -1;

  for (let h = 9; h < 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      const startMin = h * 60 + m;
      const endMin   = startMin + duracion;
      if (endMin > 20 * 60) break;
      if (esHoy && startMin < minAhora) continue;

      const disponible = !ocupados.some(r => {
        const rS = horaAMin(r.hora_inicio);
        const rE = horaAMin(r.hora_fin);
        return startMin < rE && endMin > rS;
      });

      slots.push({ horaInicio: minAHora(startMin), horaFin: minAHora(endMin), disponible });
    }
  }
  return slots;
}

// ── GAS NOTIFICACIÓN (fire-and-forget) ───────────────────────

async function notificarGAS(env, accion, payload) {
  if (!env.GAS_URL) return;
  try {
    await fetch(env.GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify({ accion, ...payload }),
      signal:  AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('GAS notify error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS PÚBLICOS
// ═══════════════════════════════════════════════════════════════

function handleHealth(cors) {
  return json({
    ok:      true,
    service: 'Belleza Integral API',
    version: '2.0',
    ts:      Date.now(),
  }, 200, cors);
}

function handleGetConfig(env, cors) {
  // Retorna credenciales públicas de Supabase para cliente
  return json({
    ok: true,
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
  }, 200, cors);
}

async function handleGetServicios(env, cors) {
  const r = await supaFetch(env,
    'servicios?activo=eq.true&order=categoria,nombre&select=*'
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar servicios' }, 500, cors);
  return json(r.data.map(s => ({
    id:           s.id,
    nombre:       s.nombre,
    categoria:    s.categoria,
    duracion:     s.duracion,
    precio:       parseFloat(s.precio),
    esSesion:     s.es_sesion,
    maxSesiones:  s.max_sesiones,
    requiereSkill: s.requiere_skill,
  })), 200, cors);
}

async function handleGetEmpleados(env, cors) {
  const r = await supaFetch(env, 'empleados?activo=eq.true&order=nombre&select=*');
  if (!r.ok) return json({ ok: false, error: 'Error al cargar empleados' }, 500, cors);
  return json(r.data.map(e => ({
    id:     e.id,
    nombre: e.nombre,
    color:  e.color,
    skills: e.skills || [],
  })), 200, cors);
}

async function handleGetDisponibilidad(env, cors, url) {
  const fecha      = url.searchParams.get('fecha')      || '';
  const servicioID = url.searchParams.get('servicioID') || '';
  const debug      = url.searchParams.get('debug')      === '1';

  if (!fecha || !servicioID)
    return json({ ok: false, error: 'Faltan parámetros' }, 400, cors);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);

  const srvR = await supaFetch(env,
    `servicios?id=eq.${encodeURIComponent(servicioID)}&select=*`
  );
  if (!srvR.ok || !srvR.data?.length)
    return json({ ok: false, error: 'Servicio no encontrado' }, 404, cors);

  const srv = srvR.data[0];
  const { duracion, requiere_skill } = srv;

  if (debug) {
    console.log(`[DEBUG] Servicio: ${srv.nombre} | duracion=${duracion} | requiere_skill=${requiere_skill}`);
  }

  const empR = await supaFetch(env, 'empleados?activo=eq.true&select=*');
  if (!empR.ok) return json({ ok: false, error: 'Error empleados' }, 500, cors);

  let empleados = empR.data;
  if (requiere_skill) {
    const filtered = empleados.filter(e =>
      Array.isArray(e.skills) && e.skills.includes(requiere_skill)
    );
    if (debug) {
      console.log(`[DEBUG] Filtro por skill '${requiere_skill}': ${empleados.length} → ${filtered.length} empleados`);
      empleados.forEach(e => {
        console.log(`  - ${e.nombre}: skills=${JSON.stringify(e.skills)}`);
      });
    }
    empleados = filtered;
  }

  if (debug && empleados.length === 0) {
    return json({
      ok: false,
      error: 'No hay empleados disponibles',
      debug: {
        servicio: srv.nombre,
        requiere_skill,
        duracion,
        empleadosTotales: empR.data.length,
        empleadosFiltrados: 0,
      }
    }, 400, cors);
  }

  // Reservas + bloqueos activos del día (ambos bloquean slots)
  const [resR, bloqR] = await Promise.all([
    supaFetch(env,
      `reservas?fecha=eq.${fecha}&estado=neq.Cancelada&select=empleado_id,hora_inicio,hora_fin`
    ),
    supaFetch(env,
      `bloqueos?fecha=eq.${fecha}&expires_at=gt.${new Date().toISOString()}&select=empleado_id,hora_inicio,hora_fin`
    ),
  ]);

  const reservas = resR.ok && Array.isArray(resR.data) ? resR.data : [];
  const bloqueos = bloqR.ok && Array.isArray(bloqR.data) ? bloqR.data : [];
  const ocupados = [...reservas, ...bloqueos];

  const result = {};
  for (const emp of empleados) {
    const ocup  = ocupados.filter(r => r.empleado_id === emp.id);
    const slots = generarSlots(ocup, duracion, fecha);
    result[emp.id] = {
      empleado:          { id: emp.id, nombre: emp.nombre, color: emp.color, skills: emp.skills || [] },
      slots,
      hayDisponibilidad: slots.some(s => s.disponible),
    };
    if (debug) {
      const slotsDispo = slots.filter(s => s.disponible).length;
      console.log(`[DEBUG] ${emp.nombre}: ${slotsDispo} slots disponibles de ${slots.length}`);
    }
  }
  return json({ ok: true, empleados: result }, 200, cors);
}

// ── BLOQUEO TEMPORAL DE SLOT ──────────────────────────────────

async function handleBloquearSlot(env, cors, request) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }

  const empleadoID   = sanitizar(body.empleadoID   || '', 50);
  const fecha        = body.fecha       || '';
  const horaInicio   = body.horaInicio  || '';
  const horaFin      = body.horaFin     || '';
  const sessionToken = sanitizar(body.sessionToken || '', 100);

  if (!empleadoID || !fecha || !horaInicio || !horaFin || !sessionToken)
    return json({ ok: false, error: 'Faltan campos' }, 400, cors);

  // Eliminar bloqueos anteriores de esta sesión (evita acumulación al cambiar de slot)
  await supaFetch(env,
    `bloqueos?empleado_id=eq.${encodeURIComponent(empleadoID)}&fecha=eq.${fecha}&session_token=eq.${encodeURIComponent(sessionToken)}`,
    { method: 'DELETE' }
  );
  // Limpiar bloqueos expirados de otros usuarios también
  await supaFetch(env,
    `bloqueos?empleado_id=eq.${encodeURIComponent(empleadoID)}&fecha=eq.${fecha}&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
    { method: 'DELETE' }
  );

  // Verificar si el slot sigue libre
  const [resR, bloqR] = await Promise.all([
    supaFetch(env,
      `reservas?fecha=eq.${fecha}&empleado_id=eq.${encodeURIComponent(empleadoID)}&estado=neq.Cancelada&select=hora_inicio,hora_fin`
    ),
    supaFetch(env,
      `bloqueos?fecha=eq.${fecha}&empleado_id=eq.${encodeURIComponent(empleadoID)}&expires_at=gt.${new Date().toISOString()}&select=hora_inicio,hora_fin`
    ),
  ]);

  const existentes = [
    ...(resR.ok && Array.isArray(resR.data) ? resR.data : []),
    ...(bloqR.ok && Array.isArray(bloqR.data) ? bloqR.data : []),
  ];

  const sMin = horaAMin(horaInicio), eMin = horaAMin(horaFin);
  const overlap = existentes.some(r => sMin < horaAMin(r.hora_fin) && eMin > horaAMin(r.hora_inicio));
  if (overlap)
    return json({ ok: false, error: 'El slot ya no está disponible' }, 409, cors);

  const bloqueoID = `BLQ-${Date.now().toString(36).toUpperCase()}`;
  const expires   = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const ins = await supaFetch(env, 'bloqueos', {
    method: 'POST',
    body:   JSON.stringify({
      id: bloqueoID, empleado_id: empleadoID, fecha,
      hora_inicio: horaInicio, hora_fin: horaFin,
      session_token: sessionToken, expires_at: expires,
    }),
  });

  if (!ins.ok) return json({ ok: false, error: 'Error al bloquear slot' }, 500, cors);
  return json({ ok: true, bloqueoID, expiresAt: expires }, 200, cors);
}

async function handleLiberarBloqueo(env, cors, bloqueoID) {
  if (!bloqueoID) return json({ ok: false, error: 'ID requerido' }, 400, cors);
  await supaFetch(env, `bloqueos?id=eq.${encodeURIComponent(bloqueoID)}`, { method: 'DELETE' });
  return json({ ok: true }, 200, cors);
}

// ── CREAR RESERVA ─────────────────────────────────────────────

async function handleCrearReserva(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }

  const p = body.payload || body;

  const nombre     = sanitizar(p.nombre     || '', 100);
  const email      = sanitizar(p.email      || '', 100).toLowerCase();
  const tel        = (p.telefono || '').trim().replace(/[^0-9+\s\-]/g, '').slice(0, 20);
  const notas      = sanitizar(p.notas      || '', 500);
  const servicioID = sanitizar(p.servicioID || '', 50);
  const empleadoID = sanitizar(p.empleadoID || '', 50);
  const fecha      = p.fecha      || '';
  const horaInicio = p.horaInicio || '';
  const sesionNum  = parseInt(p.sesionNum) || 1;
  const bloqueoID    = sanitizar(p.bloqueoID    || '', 100);
  const sessionToken = sanitizar(p.sessionToken || '', 100);
  const gcCodigo     = sanitizar(p.giftcardCodigo || '', 50);

  if (!nombre || nombre.length < 2)
    return json({ ok: false, error: 'Nombre inválido' }, 400, cors);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ ok: false, error: 'Email inválido' }, 400, cors);
  if (!servicioID || !empleadoID)
    return json({ ok: false, error: 'Faltan datos del servicio o especialista' }, 400, cors);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);
  if (!/^\d{2}:\d{2}$/.test(horaInicio))
    return json({ ok: false, error: 'Hora inválida' }, 400, cors);

  const [srvR, empR] = await Promise.all([
    supaFetch(env, `servicios?id=eq.${encodeURIComponent(servicioID)}&select=*`),
    supaFetch(env, `empleados?id=eq.${encodeURIComponent(empleadoID)}&select=*`),
  ]);

  if (!srvR.ok || !srvR.data?.length)
    return json({ ok: false, error: 'Servicio no encontrado' }, 404, cors);
  if (!empR.ok || !empR.data?.length)
    return json({ ok: false, error: 'Especialista no encontrado' }, 404, cors);

  const srv = srvR.data[0];
  const emp = empR.data[0];
  const startMin = horaAMin(horaInicio);
  const endMin   = startMin + srv.duracion;
  const horaFin  = minAHora(endMin);

  // Validar gift card si viene
  let precioFinal = parseFloat(srv.precio);
  let gcUsada = null;
  if (gcCodigo) {
    const gcR = await supaFetch(env,
      `gift_cards?codigo=eq.${encodeURIComponent(gcCodigo)}&estado=eq.Activa&select=*`
    );
    if (!gcR.ok || !gcR.data?.length)
      return json({ ok: false, error: 'Gift card inválida o ya usada' }, 400, cors);
    gcUsada = gcR.data[0];
    const saldo = parseFloat(gcUsada.monto) - parseFloat(gcUsada.monto_usado || 0);
    precioFinal = Math.max(0, precioFinal - saldo);
  }

  // Verificar disponibilidad (doble chequeo)
  const [resR, bloqR] = await Promise.all([
    supaFetch(env,
      `reservas?fecha=eq.${fecha}&empleado_id=eq.${encodeURIComponent(empleadoID)}&estado=neq.Cancelada&select=hora_inicio,hora_fin`
    ),
    supaFetch(env,
      `bloqueos?fecha=eq.${fecha}&empleado_id=eq.${encodeURIComponent(empleadoID)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
      (bloqueoID    ? `&id=neq.${encodeURIComponent(bloqueoID)}`               : '') +
      (sessionToken ? `&session_token=neq.${encodeURIComponent(sessionToken)}` : '') +
      `&select=hora_inicio,hora_fin`
    ),
  ]);

  const existentes = [
    ...(resR.ok && Array.isArray(resR.data) ? resR.data : []),
    ...(bloqR.ok && Array.isArray(bloqR.data) ? bloqR.data : []),
  ];

  const overlap = existentes.some(r =>
    startMin < horaAMin(r.hora_fin) && endMin > horaAMin(r.hora_inicio)
  );
  if (overlap)
    return json({ ok: false, error: 'El horario ya no está disponible. Elige otro.' }, 409, cors);

  const reservaID = `LIZ-${fecha.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`;
  const reserva   = {
    id: reservaID, nombre, email, telefono: tel,
    servicio_id: servicioID, servicio_nombre: srv.nombre,
    empleado_id: empleadoID, empleado_nombre: emp.nombre,
    fecha, hora_inicio: horaInicio, hora_fin: horaFin,
    duracion: srv.duracion, precio: precioFinal,
    sesion_num: sesionNum, sesiones_totales: srv.max_sesiones || 1,
    estado: 'Pendiente', notas,
    giftcard_codigo: gcCodigo || null,
  };

  const insR = await supaFetch(env, 'reservas', { method: 'POST', body: JSON.stringify(reserva) });
  if (!insR.ok) {
    console.error('Supabase insert error:', JSON.stringify(insR.data));
    return json({ ok: false, error: 'Error al crear la reserva.' }, 500, cors);
  }

  // Liberar todos los bloqueos de esta sesión (la reserva ya ocupa el slot)
  if (sessionToken) {
    ctx.waitUntil(
      supaFetch(env, `bloqueos?session_token=eq.${encodeURIComponent(sessionToken)}`, { method: 'DELETE' })
    );
  }

  // Actualizar gift card si se usó
  if (gcUsada) {
    const saldo  = parseFloat(gcUsada.monto) - parseFloat(gcUsada.monto_usado || 0);
    const usado  = Math.min(saldo, parseFloat(srv.precio));
    const nuevoU = parseFloat(gcUsada.monto_usado || 0) + usado;
    await supaFetch(env, `gift_cards?id=eq.${encodeURIComponent(gcUsada.id)}`, {
      method: 'PATCH',
      body:   JSON.stringify({
        monto_usado: nuevoU,
        estado: nuevoU >= parseFloat(gcUsada.monto) ? 'Usada' : 'Activa',
      }),
    });
  }

  // Liberar bloqueo temporal
  if (bloqueoID) {
    await supaFetch(env, `bloqueos?id=eq.${encodeURIComponent(bloqueoID)}`, { method: 'DELETE' });
  }

  // [AUDIT:reserva-flujo] Notificar GAS: enviar email "solicitud recibida" (estado Pendiente, espera de pago)
  ctx.waitUntil(notificarGAS(env, 'solicitudReserva', {
    payload: {
      reservaID, nombre, email, telefono: tel, notas,
      servicioID, servicioNombre: srv.nombre,
      empleadoID, empleadoNombre: emp.nombre,
      fecha, horaInicio, horaFin,
      precio: precioFinal, sesionNum,
      sesionesTotales: srv.max_sesiones || 1,
      esSesion: srv.es_sesion,
    },
  }));

  // ── SIEM: Notificar evento de reserva creada
  if (env.APPS_SCRIPT_URL && env.WEBHOOK_SECRET) {
    ctx.waitUntil(
      fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'siemEventoLiz',
          secret: env.WEBHOOK_SECRET,
          departamento: 'liz-belleza',
          tipo: 'reserva_creada',
          timestamp: new Date().toISOString(),
          reservaID,
          cliente: nombre,
          servicio: srv.nombre,
          empleado: emp.nombre,
          estado: 'Pendiente',
          monto: precioFinal,
          duracion: srv.duracion,
          notas: 'Creada por cliente'
        })
      }).catch(e => console.error('SIEM error:', e))
    );
  }

  return json({
    ok: true, reservaID,
    reserva: { nombre, servicioNombre: srv.nombre, empleadoNombre: emp.nombre, fecha, horaInicio, horaFin },
  }, 200, cors);
}

// ── CANCELAR RESERVA ──────────────────────────────────────────

async function handleCancelarReserva(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }
  const reservaID = sanitizar(body.reservaID || '', 100);
  if (!reservaID) return json({ ok: false, error: 'ID requerido' }, 400, cors);

  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ estado: 'Cancelada', cancelado_por: 'cliente' }),
  });
  if (!r.ok) return json({ ok: false, error: 'Error al cancelar' }, 500, cors);

  ctx.waitUntil(notificarGAS(env, 'cancelarReserva', { reservaID, canceladoPor: 'cliente' }));
  return json({ ok: true }, 200, cors);
}

// ── GIFT CARDS PÚBLICO ────────────────────────────────────────

async function handleValidarGiftCard(env, cors, codigo) {
  if (!codigo) return json({ ok: false, error: 'Código requerido' }, 400, cors);
  const r = await supaFetch(env,
    `gift_cards?codigo=eq.${encodeURIComponent(codigo)}&select=id,codigo,monto,monto_usado,estado,fecha_vencimiento,destinatario_nombre`
  );
  if (!r.ok || !r.data?.length)
    return json({ ok: false, error: 'Gift card no encontrada' }, 404, cors);
  const gc = r.data[0];
  if (gc.estado !== 'Activa')
    return json({ ok: false, error: `Gift card ${gc.estado.toLowerCase()}` }, 400, cors);
  if (gc.fecha_vencimiento && new Date(gc.fecha_vencimiento) < new Date())
    return json({ ok: false, error: 'Gift card vencida' }, 400, cors);
  const saldo = parseFloat(gc.monto) - parseFloat(gc.monto_usado || 0);
  return json({ ok: true, saldo, gc: { codigo: gc.codigo, monto: gc.monto, saldo, destinatario: gc.destinatario_nombre } }, 200, cors);
}

// ── FIDELIZACIÓN PÚBLICO ──────────────────────────────────────

async function handleQRFidelizacion(env, cors, token) {
  if (!token) return json({ ok: false, error: 'Token requerido' }, 400, cors);
  const r = await supaFetch(env,
    `fidelizacion?qr_token=eq.${encodeURIComponent(token)}&select=nombre,puntos,nivel,total_visitas,total_gastado`
  );
  if (!r.ok || !r.data?.length)
    return json({ ok: false, error: 'Perfil no encontrado' }, 404, cors);
  return json({ ok: true, perfil: r.data[0] }, 200, cors);
}

// ── ACTUALIZAR FIDELIZACIÓN (interno) ─────────────────────────

async function actualizarFidelizacion(env, { nombre, email, telefono, precio }) {
  try {
    const r = await supaFetch(env, `fidelizacion?email=eq.${encodeURIComponent(email)}&select=*`);
    const PUNTOS_POR_PESO = 0.01; // 1 punto por cada $100 gastados
    const puntosNuevos = Math.floor(precio * PUNTOS_POR_PESO);

    if (r.ok && r.data?.length) {
      const p = r.data[0];
      const totalV = p.total_visitas + 1;
      const totalG = parseFloat(p.total_gastado) + precio;
      const puntos = p.puntos + puntosNuevos;
      const nivel  = totalV >= 20 ? 'VIP' : totalV >= 10 ? 'Oro' : totalV >= 5 ? 'Plata' : 'Bronce';
      await supaFetch(env, `fidelizacion?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        body:   JSON.stringify({ puntos, total_visitas: totalV, total_gastado: totalG, nivel }),
      });
    } else {
      const id = `FID-${Date.now().toString(36).toUpperCase()}`;
      const nivel = 'Bronce';
      await supaFetch(env, 'fidelizacion', {
        method: 'POST',
        body:   JSON.stringify({ id, email, nombre, telefono: telefono || '', puntos: puntosNuevos, total_visitas: 1, total_gastado: precio, nivel }),
      });
    }
  } catch (e) {
    console.error('fidelizacion error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS CLIENTE
// ═══════════════════════════════════════════════════════════════

async function handleClienteReservas(env, cors, request, url) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const usuario = await verificarTokenSupabase(token, env.SUPABASE_URL);
  if (!usuario) return json({ ok: false, error: 'No autorizado' }, 401, cors);

  try {
    const qParams = Object.fromEntries(url.searchParams);
    const estado = sanitizar(qParams.estado || '', 50);
    const desde = sanitizar(qParams.desde || '', 50);
    const hasta = sanitizar(qParams.hasta || '', 50);

    // Construir query para obtener reservas del cliente
    let query = `reservas?email=eq.${encodeURIComponent(usuario.email.toLowerCase())}&select=*`;
    if (estado) query += `&estado=eq.${encodeURIComponent(estado)}`;
    if (desde || hasta) {
      if (desde) query += `&fecha=gte.${encodeURIComponent(desde)}`;
      if (hasta) query += `&fecha=lte.${encodeURIComponent(hasta)}`;
    }

    const r = await supaFetch(env, query);
    if (!r.ok) return json({ ok: false, error: 'Error al obtener reservas' }, 500, cors);

    return json({
      ok: true,
      reservas: (r.data || []).map(res => ({
        id: res.id,
        nombre: res.nombre,
        email: res.email,
        servicioNombre: res.servicio_nombre,
        empleadoNombre: res.empleado_nombre,
        fecha: res.fecha,
        horaInicio: res.hora_inicio,
        horaFin: res.hora_fin,
        estado: res.estado,
        precio: res.precio,
      }))
    }, 200, cors);
  } catch (e) {
    console.error('clienteReservas error:', e.message);
    return json({ ok: false, error: e.message }, 500, cors);
  }
}

async function handleClientePerfil(env, cors, request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const usuario = await verificarTokenSupabase(token, env.SUPABASE_URL);
  if (!usuario) return json({ ok: false, error: 'No autorizado' }, 401, cors);

  try {
    // Obtener datos de fidelización
    const r = await supaFetch(env, `fidelizacion?email=eq.${encodeURIComponent(usuario.email.toLowerCase())}&select=*`);
    if (!r.ok || !r.data?.length) {
      return json({
        ok: true,
        perfil: {
          email: usuario.email,
          nombre: usuario.email,
          nivel: 'Bronce',
          puntos: 0,
          total_visitas: 0,
          total_gastado: 0,
        }
      }, 200, cors);
    }

    const perfil = r.data[0];
    return json({
      ok: true,
      perfil: {
        email: perfil.email,
        nombre: perfil.nombre,
        nivel: perfil.nivel,
        puntos: perfil.puntos,
        total_visitas: perfil.total_visitas,
        total_gastado: perfil.total_gastado,
      }
    }, 200, cors);
  } catch (e) {
    console.error('clientePerfil error:', e.message);
    return json({ ok: false, error: e.message }, 500, cors);
  }
}

async function handleClienteCancelarReserva(env, cors, request, ctx) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const usuario = await verificarTokenSupabase(token, env.SUPABASE_URL);
  if (!usuario) return json({ ok: false, error: 'No autorizado' }, 401, cors);

  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }

  const reservaID = sanitizar(body.reservaID || '', 100);
  if (!reservaID) return json({ ok: false, error: 'Datos incompletos' }, 400, cors);

  try {
    // Obtener reserva
    const rFetch = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}&select=*`);
    if (!rFetch.ok || !rFetch.data?.length) {
      return json({ ok: false, error: 'Reserva no encontrada' }, 404, cors);
    }

    const reserva = rFetch.data[0];

    // Validaciones
    if (reserva.email !== usuario.email.toLowerCase()) {
      return json({ ok: false, error: 'No es tu reserva' }, 403, cors);
    }

    if (!['Pagada', 'Pendiente'].includes(reserva.estado)) {
      return json({ ok: false, error: `No se puede cancelar una cita ${reserva.estado}` }, 409, cors);
    }

    // Validar que sea más de 24h antes
    const ahora = new Date();
    const cita = new Date(`${reserva.fecha}T${reserva.hora_inicio}:00`);
    const diffMs = cita - ahora;
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 24) {
      return json({ ok: false, error: 'No se puede cancelar con menos de 24 horas de anticipación' }, 409, cors);
    }

    // Actualizar estado
    const updateR = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'Cancelada' }),
    });

    if (!updateR.ok) return json({ ok: false, error: 'Error al cancelar' }, 500, cors);

    // Notificar al cliente y admin
    ctx.waitUntil(notificarGAS(env, 'cancelarReserva', {
      reservaID: reserva.id,
      canceladoPor: 'cliente',
      payload: {
        reservaID: reserva.id,
        nombre: reserva.nombre,
        email: reserva.email,
        telefono: reserva.telefono,
        servicioNombre: reserva.servicio_nombre,
        empleadoNombre: reserva.empleado_nombre,
        fecha: reserva.fecha,
        horaInicio: reserva.hora_inicio,
        horaFin: reserva.hora_fin,
      },
    }));

    return json({ ok: true }, 200, cors);
  } catch (e) {
    console.error('clienteCancelarReserva error:', e.message);
    return json({ ok: false, error: e.message }, 500, cors);
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS ADMIN
// ═══════════════════════════════════════════════════════════════

async function handleAdminLogin(env, cors, request) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }
  const pwd = (body.password || '').trim();
  if (!pwd) return json({ ok: false, error: 'Contraseña requerida' }, 400, cors);
  if (pwd !== env.ADMIN_PASSWORD)
    return json({ ok: false, error: 'Credenciales incorrectas' }, 401, cors);

  const token    = await crearTokenSesion(env);
  const isSecure = request.url.startsWith('https');
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie':
        `liz_session=${token}; HttpOnly; ${isSecure ? 'Secure; ' : ''}` +
        `SameSite=Strict; Path=/; Max-Age=86400`,
      ...cors,
    },
  });
}

async function handleAdminLogout(cors) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'liz_session=; HttpOnly; Path=/; Max-Age=0',
      ...cors,
    },
  });
}

async function handleAdminDashboard(env, cors) {
  const today = hoyISO();
  const [todayR, proximasR, empR] = await Promise.all([
    supaFetch(env, `reservas?fecha=eq.${today}&order=hora_inicio`),
    supaFetch(env, `reservas?fecha=gt.${today}&estado=in.(Confirmada,Pagada)&order=fecha,hora_inicio&limit=20`),
    supaFetch(env, 'empleados?activo=eq.true&select=*'),
  ]);

  const reservasHoy = todayR.ok && Array.isArray(todayR.data) ? todayR.data.map(mapReserva) : [];
  const proximas    = proximasR.ok && Array.isArray(proximasR.data) ? proximasR.data.map(mapReserva) : [];
  const empleados   = empR.ok && Array.isArray(empR.data) ? empR.data : [];

  const stats = {
    totalHoy:        reservasHoy.length,
    confirmadas:     reservasHoy.filter(r => r.estado === 'Confirmada').length,
    completadas:     reservasHoy.filter(r => r.estado === 'Completada').length,
    canceladas:      reservasHoy.filter(r => r.estado === 'Cancelada').length,
    pagadas:         reservasHoy.filter(r => r.estado === 'Pagada').length,
    ingresoEstimado: reservasHoy
      .filter(r => !['Cancelada'].includes(r.estado))
      .reduce((s, r) => s + (r.precio || 0), 0),
  };

  return json({ ok: true, stats, reservasHoy, proximas, empleados }, 200, cors);
}

async function handleAdminReservasPorDia(env, cors, url) {
  const fecha = url.searchParams.get('fecha') || '';
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);
  const r = await supaFetch(env, `reservas?fecha=eq.${fecha}&order=hora_inicio`);
  if (!r.ok) return json({ ok: false, error: 'Error al cargar' }, 500, cors);
  return json(Array.isArray(r.data) ? r.data.map(mapReserva) : [], 200, cors);
}

async function handleAdminReportes(env, cors, url) {
  const desde = url.searchParams.get('desde') || hoyISO().slice(0, 7) + '-01';
  const hasta = url.searchParams.get('hasta') || hoyISO();

  const r = await supaFetch(env,
    `reservas?fecha=gte.${desde}&fecha=lte.${hasta}&estado=neq.Cancelada&order=fecha,hora_inicio&select=*`
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar reportes' }, 500, cors);
  const reservas = Array.isArray(r.data) ? r.data.map(mapReserva) : [];

  // Agrupar por fecha
  const porFecha = {};
  const porServicio = {};
  const porEmpleado = {};

  for (const res of reservas) {
    const f = res.fecha;
    if (!porFecha[f]) porFecha[f] = { fecha: f, total: 0, ingreso: 0 };
    porFecha[f].total++;
    porFecha[f].ingreso += res.precio;

    if (!porServicio[res.servicioNombre]) porServicio[res.servicioNombre] = { nombre: res.servicioNombre, total: 0, ingreso: 0 };
    porServicio[res.servicioNombre].total++;
    porServicio[res.servicioNombre].ingreso += res.precio;

    if (!porEmpleado[res.empleadoNombre]) porEmpleado[res.empleadoNombre] = { nombre: res.empleadoNombre, total: 0, ingreso: 0 };
    porEmpleado[res.empleadoNombre].total++;
    porEmpleado[res.empleadoNombre].ingreso += res.precio;
  }

  return json({
    ok: true, desde, hasta,
    totales: { reservas: reservas.length, ingreso: reservas.reduce((s, r) => s + r.precio, 0) },
    porFecha:    Object.values(porFecha).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porServicio: Object.values(porServicio).sort((a, b) => b.total - a.total),
    porEmpleado: Object.values(porEmpleado).sort((a, b) => b.total - a.total),
  }, 200, cors);
}

// ── REPORTES: RESUMEN ─────────────────────────────────────────
async function handleAdminReportesResumen(env, cors, url) {
  const desde = url.searchParams.get('desde') || hoyISO().slice(0, 7) + '-01';
  const hasta = url.searchParams.get('hasta') || hoyISO();

  // Obtener todas las reservas en el rango
  const r = await supaFetch(env,
    `reservas?fecha=gte.${desde}&fecha=lte.${hasta}&order=fecha&select=*`
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar datos' }, 500, cors);

  const todasReservas = Array.isArray(r.data) ? r.data.map(mapReserva) : [];

  // Calcular estadísticas
  const pagadas = todasReservas.filter(r => r.estado === 'Pagada').length;
  const completadas = todasReservas.filter(r => r.estado === 'Completada').length;
  const canceladas = todasReservas.filter(r => r.estado === 'Cancelada').length;
  const pendientes = todasReservas.filter(r => r.estado === 'Pendiente').length;

  const ingresoTotal = todasReservas
    .filter(r => ['Pagada', 'Completada'].includes(r.estado))
    .reduce((sum, r) => sum + r.precio, 0);

  const promedioPrecio = todasReservas.length > 0
    ? Math.round(ingresoTotal / todasReservas.length)
    : 0;

  // Top especialistas y servicios
  const porEmpleado = {};
  const porServicio = {};
  for (const res of todasReservas) {
    if (!porEmpleado[res.empleadoNombre])
      porEmpleado[res.empleadoNombre] = 0;
    porEmpleado[res.empleadoNombre]++;

    if (!porServicio[res.servicioNombre])
      porServicio[res.servicioNombre] = 0;
    porServicio[res.servicioNombre]++;
  }

  const topEspecialista = Object.entries(porEmpleado)
    .sort((a, b) => b[1] - a[1])[0];
  const topServicio = Object.entries(porServicio)
    .sort((a, b) => b[1] - a[1])[0];

  return json({
    ok: true,
    desde, hasta,
    resumen: {
      total_reservas: todasReservas.length,
      pagadas,
      completadas,
      canceladas,
      pendientes,
      ingresos_total: ingresoTotal,
      promedio_precio: promedioPrecio,
      especialista_top: topEspecialista ? `${topEspecialista[0]} (${topEspecialista[1]} citas)` : '—',
      servicio_popular: topServicio ? `${topServicio[0]} (${topServicio[1]} citas)` : '—',
      tasa_conversion: todasReservas.length > 0
        ? `${Math.round((completadas / todasReservas.length) * 100)}%`
        : '0%',
    }
  }, 200, cors);
}

// ── REPORTES: CSV EXPORT ──────────────────────────────────────
async function handleAdminReportesExcel(env, cors, url) {
  const desde = url.searchParams.get('desde') || hoyISO().slice(0, 7) + '-01';
  const hasta = url.searchParams.get('hasta') || hoyISO();

  const r = await supaFetch(env,
    `reservas?fecha=gte.${desde}&fecha=lte.${hasta}&order=fecha,hora_inicio&select=*`
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar datos' }, 500, cors);

  const reservas = Array.isArray(r.data) ? r.data.map(mapReserva) : [];

  // Headers CSV
  const headers = ['ID', 'Fecha', 'Hora', 'Cliente', 'Email', 'Teléfono', 'Servicio', 'Especialista', 'Precio', 'Estado'];

  // Rows CSV
  const rows = reservas.map(r => [
    r.id,
    r.fecha,
    `${r.horaInicio}-${r.horaFin}`,
    r.nombre,
    r.email,
    r.telefono || '—',
    r.servicioNombre,
    r.empleadoNombre,
    r.precio,
    r.estado,
  ]);

  // Construir CSV
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reportes_${desde}_${hasta}.csv"`,
      ...cors,
    },
  });
}

// ── REPORTES: DATOS PARA GRÁFICOS ────────────────────────────
async function handleAdminReportesGraficos(env, cors, url) {
  const desde = url.searchParams.get('desde') || hoyISO().slice(0, 7) + '-01';
  const hasta = url.searchParams.get('hasta') || hoyISO();

  const r = await supaFetch(env,
    `reservas?fecha=gte.${desde}&fecha=lte.${hasta}&order=fecha&select=*`
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar datos' }, 500, cors);

  const reservas = Array.isArray(r.data) ? r.data.map(mapReserva) : [];

  // Por día (últimos 30 días)
  const porDia = {};
  for (const res of reservas) {
    if (!porDia[res.fecha])
      porDia[res.fecha] = { date: res.fecha, reservas: 0, ingresos: 0 };
    porDia[res.fecha].reservas++;
    if (['Pagada', 'Completada'].includes(res.estado))
      porDia[res.fecha].ingresos += res.precio;
  }

  // Por servicio
  const porServicio = {};
  for (const res of reservas) {
    if (!porServicio[res.servicioNombre])
      porServicio[res.servicioNombre] = 0;
    porServicio[res.servicioNombre]++;
  }

  // Por especialista
  const porEspecialista = {};
  for (const res of reservas) {
    if (!porEspecialista[res.empleadoNombre])
      porEspecialista[res.empleadoNombre] = 0;
    porEspecialista[res.empleadoNombre]++;
  }

  return json({
    ok: true,
    desde, hasta,
    porDia: Object.values(porDia).sort((a, b) => a.date.localeCompare(b.date)),
    porServicio: Object.entries(porServicio)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    porEspecialista: Object.entries(porEspecialista)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  }, 200, cors);
}

async function handleAdminActualizarEstado(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }
  const params    = body.params || body;
  const reservaID = sanitizar(params.reservaID || '', 100);
  const estado    = sanitizar(params.estado    || '', 50);
  const validos   = ['Confirmada', 'Completada', 'Cancelada', 'Pendiente', 'Pagada'];

  if (!reservaID || !validos.includes(estado))
    return json({ ok: false, error: 'Datos inválidos' }, 400, cors);

  // Fetch completo para obtener estado anterior y datos para notificaciones
  const rFetch = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}&select=*`);
  if (!rFetch.ok || !rFetch.data?.length)
    return json({ ok: false, error: 'Reserva no encontrada' }, 404, cors);

  const reserva = rFetch.data[0];
  const estadoAnterior = reserva.estado;

  // [AUDIT:reactivacion-pago] Validar si cambio es Cancelada → Pagada (pago retardado)
  // TODO: Implementar validación de disponibilidad después de verificar que UPDATE funciona
  if (estadoAnterior === 'Cancelada' && estado === 'Pagada') {
    console.log('DEBUG: Reactivación de cita cancelada para:', reservaID);
  }

  // Actualizar estado en Supabase
  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ estado }),
  });
  if (!r.ok) return json({ ok: false, error: 'Error al actualizar' }, 500, cors);

  // Disparar notificación apropiada según nuevo estado
  if (estado === 'Pagada') {
    // Email de confirmación al cliente (nuevo pago o reactivación)
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(notificarGAS(env, 'confirmarPago', {
        payload: {
          reservaID: reserva.id,
          nombre: reserva.nombre,
          email: reserva.email,
          telefono: reserva.telefono,
          servicioNombre: reserva.servicio_nombre,
          empleadoNombre: reserva.empleado_nombre,
          fecha: reserva.fecha,
          horaInicio: reserva.hora_inicio,
          horaFin: reserva.hora_fin,
          precio: reserva.precio,
        },
      }));

      // [AUDIT:pdf-recibo] Generar y enviar PDF de comprobante cuando se marca Pagada
      ctx.waitUntil(notificarGAS(env, 'generarReciboPDF', {
        payload: {
          reservaID: reserva.id,
          nombre: reserva.nombre,
          email: reserva.email,
          telefono: reserva.telefono,
          servicioNombre: reserva.servicio_nombre,
          empleadoNombre: reserva.empleado_nombre,
          fecha: reserva.fecha,
          horaInicio: reserva.hora_inicio,
          horaFin: reserva.hora_fin,
          precio: parseFloat(reserva.precio || 0),
        },
      }));

      // ── SIEM: Notificar pago confirmado
      if (env.APPS_SCRIPT_URL && env.WEBHOOK_SECRET) {
        ctx.waitUntil(
          fetch(env.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accion: 'siemEventoLiz',
              secret: env.WEBHOOK_SECRET,
              departamento: 'liz-belleza',
              tipo: 'pago_confirmado',
              timestamp: new Date().toISOString(),
              reservaID: reserva.id,
              cliente: reserva.nombre,
              servicio: reserva.servicio_nombre,
              empleado: reserva.empleado_nombre,
              estado: 'Pagada',
              monto: parseFloat(reserva.precio || 0),
              duracion: reserva.duracion,
              notas: 'Pago confirmado por admin'
            })
          }).catch(e => console.error('SIEM error:', e))
        );
      }
    } else {
      console.warn('ctx.waitUntil not available, notifications may not be sent');
    }
  } else if (estado === 'Completada') {
    if (ctx && ctx.waitUntil) {
      // [AUDIT:fidelizacion-completada] Sumar puntos de fidelización solo cuando se marca Completada
      ctx.waitUntil(actualizarFidelizacion(env, {
        nombre: reserva.nombre,
        email: reserva.email,
        telefono: reserva.telefono,
        precio: parseFloat(reserva.precio || 0),
      }));

      // Email de agradecimiento al cliente
      ctx.waitUntil(notificarGAS(env, 'marcarCompletada', {
        payload: {
          reservaID: reserva.id,
          nombre: reserva.nombre,
          email: reserva.email,
          servicioNombre: reserva.servicio_nombre,
          fecha: reserva.fecha,
        },
      }));

      // ── SIEM: Notificar reserva completada
      if (env.APPS_SCRIPT_URL && env.WEBHOOK_SECRET) {
        ctx.waitUntil(
          fetch(env.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accion: 'siemEventoLiz',
              secret: env.WEBHOOK_SECRET,
              departamento: 'liz-belleza',
              tipo: 'reserva_completada',
              timestamp: new Date().toISOString(),
              reservaID: reserva.id,
              cliente: reserva.nombre,
              servicio: reserva.servicio_nombre,
              empleado: reserva.empleado_nombre,
              estado: 'Completada',
              monto: parseFloat(reserva.precio || 0),
              duracion: reserva.duracion,
              notas: 'Servicio completado'
            })
          }).catch(e => console.error('SIEM error:', e))
        );
      }
    }
  } else if (estado === 'Cancelada' && estadoAnterior !== 'Cancelada') {
    if (ctx && ctx.waitUntil) {
      // Email de cancelación (admin cambió a Cancelada)
      ctx.waitUntil(notificarGAS(env, 'cancelarReserva', {
        reservaID: reserva.id,
        canceladoPor: 'admin',
        payload: {
          reservaID: reserva.id,
          nombre: reserva.nombre,
          email: reserva.email,
          telefono: reserva.telefono,
          servicioNombre: reserva.servicio_nombre,
          empleadoNombre: reserva.empleado_nombre,
          fecha: reserva.fecha,
          horaInicio: reserva.hora_inicio,
          horaFin: reserva.hora_fin,
        },
      }));

      // ── SIEM: Notificar cancelación
      if (env.APPS_SCRIPT_URL && env.WEBHOOK_SECRET) {
        ctx.waitUntil(
          fetch(env.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accion: 'siemEventoLiz',
              secret: env.WEBHOOK_SECRET,
              departamento: 'liz-belleza',
              tipo: 'reserva_cancelada',
              timestamp: new Date().toISOString(),
              reservaID: reserva.id,
              cliente: reserva.nombre,
              servicio: reserva.servicio_nombre,
              empleado: reserva.empleado_nombre,
              estado: 'Cancelada',
              monto: parseFloat(reserva.precio || 0),
              duracion: reserva.duracion,
              notas: 'Cancelada por admin'
            })
          }).catch(e => console.error('SIEM error:', e))
        );
      }
    }
  } else {
    // Cambio genérico (sin email especial)
    ctx.waitUntil(notificarGAS(env, 'actualizarEstado', { params: { reservaID, estado } }));
  }

  return json({ ok: true }, 200, cors);
}

async function handleAdminCancelarReserva(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }
  const reservaID = sanitizar(body.reservaID || '', 100);
  if (!reservaID) return json({ ok: false, error: 'ID requerido' }, 400, cors);

  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ estado: 'Cancelada', cancelado_por: 'admin' }),
  });
  if (!r.ok) return json({ ok: false, error: 'Error al cancelar' }, 500, cors);

  ctx.waitUntil(notificarGAS(env, 'cancelarReserva', { reservaID, canceladoPor: 'admin' }));
  return json({ ok: true }, 200, cors);
}

async function handleAdminReagendar(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }
  const reservaID  = sanitizar(body.reservaID  || '', 100);
  const nuevaFecha = body.nuevaFecha  || '';
  const nuevaHora  = body.nuevaHora   || '';

  if (!reservaID || !nuevaFecha || !nuevaHora)
    return json({ ok: false, error: 'Faltan datos' }, 400, cors);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);
  if (!/^\d{2}:\d{2}$/.test(nuevaHora))
    return json({ ok: false, error: 'Hora inválida' }, 400, cors);

  // Obtener la reserva original
  const resR = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}&select=*`);
  if (!resR.ok || !resR.data?.length)
    return json({ ok: false, error: 'Reserva no encontrada' }, 404, cors);
  const original = resR.data[0];

  const nuevaHoraFin = minAHora(horaAMin(nuevaHora) + original.duracion);

  // Verificar disponibilidad en nueva fecha/hora
  const conflicto = await supaFetch(env,
    `reservas?fecha=eq.${nuevaFecha}&empleado_id=eq.${encodeURIComponent(original.empleado_id)}&estado=neq.Cancelada&id=neq.${encodeURIComponent(reservaID)}&select=hora_inicio,hora_fin`
  );
  if (conflicto.ok && Array.isArray(conflicto.data)) {
    const sMin = horaAMin(nuevaHora), eMin = horaAMin(nuevaHoraFin);
    const hay  = conflicto.data.some(r =>
      sMin < horaAMin(r.hora_fin) && eMin > horaAMin(r.hora_inicio)
    );
    if (hay) return json({ ok: false, error: 'Ese horario ya está ocupado' }, 409, cors);
  }

  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ fecha: nuevaFecha, hora_inicio: nuevaHora, hora_fin: nuevaHoraFin, estado: 'Confirmada' }),
  });
  if (!r.ok) return json({ ok: false, error: 'Error al reagendar' }, 500, cors);

  ctx.waitUntil(notificarGAS(env, 'reagendarReserva', {
    reservaID, nuevaFecha, nuevaHora, nuevaHoraFin,
    nombre: original.nombre, email: original.email,
    servicioNombre: original.servicio_nombre,
  }));

  return json({ ok: true }, 200, cors);
}

// ── ADMIN GIFT CARDS ──────────────────────────────────────────

async function handleAdminCrearGiftCard(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400, cors);
  }
  const monto = parseFloat(body.monto);
  if (!monto || monto <= 0) return json({ ok: false, error: 'Monto inválido' }, 400, cors);

  // Generar código único de 8 chars alfanumérico
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo   = '';
  const bytes  = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) codigo += chars[b % chars.length];
  codigo = `GC-${codigo}`;

  const id = `GC-${Date.now().toString(36).toUpperCase()}`;
  const vence = body.diasVigencia
    ? new Date(Date.now() + body.diasVigencia * 86400000).toISOString().split('T')[0]
    : null;

  const ins = await supaFetch(env, 'gift_cards', {
    method: 'POST',
    body:   JSON.stringify({
      id, codigo, monto,
      comprador_nombre:    sanitizar(body.compradorNombre    || '', 100),
      comprador_email:     sanitizar(body.compradorEmail     || '', 100).toLowerCase(),
      destinatario_nombre: sanitizar(body.destinatarioNombre || '', 100),
      destinatario_email:  sanitizar(body.destinatarioEmail  || '', 100).toLowerCase(),
      mensaje:             sanitizar(body.mensaje            || '', 500),
      fecha_vencimiento:   vence,
    }),
  });

  if (!ins.ok) return json({ ok: false, error: 'Error al crear gift card' }, 500, cors);

  // Notificar GAS para enviar email con la gift card al destinatario
  const destEmail = sanitizar(body.destinatarioEmail || '', 100).toLowerCase();
  if (destEmail) {
    ctx.waitUntil(notificarGAS(env, 'enviarGiftCard', {
      payload: {
        codigo, monto,
        compradorNombre:    sanitizar(body.compradorNombre    || '', 100),
        compradorEmail:     sanitizar(body.compradorEmail     || '', 100).toLowerCase(),
        destinatarioNombre: sanitizar(body.destinatarioNombre || '', 100),
        destinatarioEmail:  destEmail,
        mensaje:            sanitizar(body.mensaje            || '', 500),
        fechaVencimiento:   vence || '',
      },
    }));
  }

  return json({ ok: true, codigo, id }, 200, cors);
}

async function handleAdminListGiftCards(env, cors) {
  const r = await supaFetch(env, 'gift_cards?order=created_at.desc&limit=100&select=*');
  if (!r.ok) return json({ ok: false, error: 'Error al cargar' }, 500, cors);
  return json({ ok: true, giftCards: Array.isArray(r.data) ? r.data : [] }, 200, cors);
}

// ── ADMIN FIDELIZACIÓN ────────────────────────────────────────

async function handleAdminFidelizacion(env, cors, url) {
  const limit  = parseInt(url.searchParams.get('limit') || '50');
  const search = url.searchParams.get('q') || '';
  let query = `fidelizacion?order=total_gastado.desc&limit=${limit}&select=*`;
  if (search) query += `&nombre=ilike.*${encodeURIComponent(search)}*`;
  const r = await supaFetch(env, query);
  if (!r.ok) return json({ ok: false, error: 'Error al cargar' }, 500, cors);
  return json({ ok: true, clientes: Array.isArray(r.data) ? r.data : [] }, 200, cors);
}

// ═══════════════════════════════════════════════════════════════
// CRON — AUTO-CANCELAR RESERVAS SIN PAGO (Pendiente > 2h)
// ═══════════════════════════════════════════════════════════════

// [AUDIT:cancelacion-auto] Cron cada 30min: busca Pendiente > 2h sin pago, cancela, libera cupo, notifica
async function handleAutoCancelarReservas(env) {
  // Cancela reservas que llevan más de 2 horas en estado 'Pendiente' sin pago confirmado
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const r = await supaFetch(env,
    `reservas?estado=eq.Pendiente&created_at=lt.${encodeURIComponent(cutoff)}&select=*`
  );
  if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) return;

  for (const reserva of r.data) {
    const upd = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reserva.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ estado: 'Cancelada', cancelado_por: 'sistema-pago' }),
    });
    if (upd.ok) {
      const gasPayload = {
        reservaID: reserva.id,
        nombre: reserva.nombre,
        email: reserva.email,
        telefono: reserva.telefono,
        servicioNombre: reserva.servicio_nombre,
        empleadoNombre: reserva.empleado_nombre,
        fecha: reserva.fecha,
        horaInicio: reserva.hora_inicio,
        horaFin: reserva.hora_fin,
        precio: reserva.precio,
      };
      await notificarGAS(env, 'cancelarReserva', {
        reservaID: reserva.id,
        canceladoPor: 'sistema-pago',
        payload: gasPayload,
      });
      console.log(`[cron] Auto-cancelada por falta de pago: ${reserva.id}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN FETCH HANDLER
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin') || '*';
    const cors   = corsHeaders(origin);

    if (method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });

    // ── PROTECCIÓN /admin/* ────────────────────────────────
    if (path.startsWith('/admin/') && !path.startsWith('/api/')) {
      if (path === '/admin/login.html' || path === '/admin/login')
        return env.ASSETS.fetch(request);
      const autenticado = await verificarCookie(request, env);
      if (!autenticado) {
        const accept = request.headers.get('Accept') || '';
        if (accept.includes('text/html'))
          return Response.redirect(new URL('/admin/login.html', request.url).toString(), 302);
        return json({ ok: false, error: 'No autorizado' }, 401, cors);
      }
      return env.ASSETS.fetch(request);
    }

    // ── API ROUTES ─────────────────────────────────────────
    if (path.startsWith('/api/')) {
      try {
        const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';

        // ── PÚBLICAS ───────────────────────────────────────
        if (method === 'GET'  && path === '/api/health')
          return handleHealth(cors);
        if (method === 'GET'  && path === '/api/config')
          return handleGetConfig(env, cors);
        if (method === 'GET'  && path === '/api/servicios')
          return handleGetServicios(env, cors);
        if (method === 'GET'  && path === '/api/empleados')
          return handleGetEmpleados(env, cors);
        if (method === 'GET'  && path === '/api/disponibilidad')
          return handleGetDisponibilidad(env, cors, url);

        if (method === 'POST' && path === '/api/reservas') {
          const ok = await checkRateLimit(env, `reserva:${ip}`, 10, 3_600_000);
          if (!ok) return json({ ok: false, error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429, cors);
          return handleCrearReserva(env, cors, request, ctx);
        }
        if (method === 'POST' && path === '/api/reservas/cancelar')
          return handleCancelarReserva(env, cors, request, ctx);

        if (method === 'POST'   && path === '/api/slots/bloquear')
          return handleBloquearSlot(env, cors, request);
        if (method === 'DELETE' && path.startsWith('/api/slots/bloqueo/'))
          return handleLiberarBloqueo(env, cors, path.split('/').pop());

        if (method === 'GET'  && path.startsWith('/api/giftcards/'))
          return handleValidarGiftCard(env, cors, decodeURIComponent(path.split('/').pop()));
        if (method === 'GET'  && path.startsWith('/api/fidelizacion/qr/'))
          return handleQRFidelizacion(env, cors, decodeURIComponent(path.split('/').pop()));

        // ── CLIENTE PROTEGIDAS ─────────────────────────────
        if (method === 'GET'  && path === '/api/cliente/reservas')
          return handleClienteReservas(env, cors, request, url);
        if (method === 'GET'  && path === '/api/cliente/perfil')
          return handleClientePerfil(env, cors, request);
        if (method === 'POST' && path === '/api/cliente/cancelar-reserva')
          return handleClienteCancelarReserva(env, cors, request, ctx);

        // ── AUTH ADMIN ────────────────────────────────────
        if (method === 'POST' && path === '/api/admin/login') {
          const ok = await checkRateLimit(env, `login:${ip}`, 5, 600_000);
          if (!ok) return json({ ok: false, error: 'Demasiados intentos. Espera 10 minutos.' }, 429, cors);
          return handleAdminLogin(env, cors, request);
        }
        if (method === 'POST' && path === '/api/admin/logout')
          return handleAdminLogout(cors);

        // ── ADMIN PROTEGIDAS ──────────────────────────────
        const esAdmin = await verificarCookie(request, env);
        if (!esAdmin) return json({ ok: false, error: 'No autorizado' }, 401, cors);

        if (method === 'GET'  && path === '/api/admin/dashboard')
          return handleAdminDashboard(env, cors);
        if (method === 'GET'  && path === '/api/admin/reservas')
          return handleAdminReservasPorDia(env, cors, url);
        if (method === 'GET'  && path === '/api/admin/reportes')
          return handleAdminReportes(env, cors, url);
        if (method === 'GET'  && path === '/api/admin/reportes/resumen')
          return handleAdminReportesResumen(env, cors, url);
        if (method === 'GET'  && path === '/api/admin/reportes/excel')
          return handleAdminReportesExcel(env, cors, url);
        if (method === 'GET'  && path === '/api/admin/reportes/grafico-datos')
          return handleAdminReportesGraficos(env, cors, url);
        if (method === 'POST' && path === '/api/admin/reservas/estado')
          return handleAdminActualizarEstado(env, cors, request, ctx);
        if (method === 'POST' && path === '/api/admin/reservas/cancelar')
          return handleAdminCancelarReserva(env, cors, request, ctx);
        if (method === 'POST' && path === '/api/admin/reservas/reagendar')
          return handleAdminReagendar(env, cors, request, ctx);
        if (method === 'POST' && path === '/api/admin/giftcards')
          return handleAdminCrearGiftCard(env, cors, request, ctx);
        if (method === 'GET'  && path === '/api/admin/giftcards')
          return handleAdminListGiftCards(env, cors);
        if (method === 'GET'  && path === '/api/admin/fidelizacion')
          return handleAdminFidelizacion(env, cors, url);

        // ── SIEM ──────────────────────────────────────
        if (method === 'POST' && path === '/api/siem/event') {
          let body;
          try { body = await request.json(); }
          catch { return json({ error: 'JSON inválido' }, 400, cors); }

          if (body.secret !== env.WEBHOOK_SECRET) {
            return json({ error: 'Unauthorized' }, 401, cors);
          }

          if (env.APPS_SCRIPT_URL) {
            ctx.waitUntil(
              fetch(env.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  accion: 'siemEventoLiz',
                  secret: env.WEBHOOK_SECRET,
                  ...body
                })
              }).catch(e => console.error('SIEM notify error:', e))
            );
          }

          return json({ ok: true }, 200, cors);
        }

        return json({ ok: false, error: 'Ruta no encontrada' }, 404, cors);

      } catch (e) {
        console.error('Worker error:', e.stack || e.message);
        return json({ ok: false, error: 'Error interno del servidor' }, 500, cors);
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleAutoCancelarReservas(env));
  },
};
