/* ================================================================
   Liz Belleza Integral — _worker.js (Cloudflare Worker)
   ─────────────────────────────────────────────────────────────
   Rutas públicas:
     GET  /api/servicios
     GET  /api/empleados
     GET  /api/disponibilidad?fecha=&servicioID=
     POST /api/reservas
     POST /api/reservas/cancelar
   Rutas admin (cookie httpOnly HMAC-SHA256):
     POST /api/admin/login
     POST /api/admin/logout
     GET  /api/admin/dashboard
     GET  /api/admin/reservas?fecha=
     POST /api/admin/reservas/estado
     POST /api/admin/reservas/cancelar
   Protección de ruta:
     GET  /admin/* → requiere cookie válida, sino redirect a /admin/login.html
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
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// Mapea snake_case de Supabase → camelCase para el frontend
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
    createdAt:       r.created_at,
  };
}

// ── SUPABASE ──────────────────────────────────────────────────

async function supaFetch(env, path, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey':        env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
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

  // Expiración 24 h
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

function generarSlots(reservasExistentes, duracion) {
  const slots = [];
  for (let h = 9; h < 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      const startMin = h * 60 + m;
      const endMin   = startMin + duracion;
      if (endMin > 20 * 60) break;

      const disponible = !reservasExistentes.some(r => {
        const rS = horaAMin(r.hora_inicio);
        const rE = horaAMin(r.hora_fin);
        return startMin < rE && endMin > rS;
      });

      slots.push({
        horaInicio: minAHora(startMin),
        horaFin:    minAHora(endMin),
        disponible,
      });
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

// ── HANDLERS PÚBLICOS ─────────────────────────────────────────

async function handleGetServicios(env, cors) {
  const r = await supaFetch(env,
    'servicios?activo=eq.true&order=categoria,nombre&select=*'
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar servicios' }, 500, cors);

  const servicios = r.data.map(s => ({
    id:           s.id,
    nombre:       s.nombre,
    categoria:    s.categoria,
    duracion:     s.duracion,
    precio:       parseFloat(s.precio),
    esSesion:     s.es_sesion,
    maxSesiones:  s.max_sesiones,
    requiereSkill: s.requiere_skill,
  }));
  return json(servicios, 200, cors);
}

async function handleGetEmpleados(env, cors) {
  const r = await supaFetch(env,
    'empleados?activo=eq.true&order=nombre&select=*'
  );
  if (!r.ok) return json({ ok: false, error: 'Error al cargar empleados' }, 500, cors);

  const empleados = r.data.map(e => ({
    id:     e.id,
    nombre: e.nombre,
    color:  e.color,
    skills: e.skills || [],
  }));
  return json(empleados, 200, cors);
}

async function handleGetDisponibilidad(env, cors, url) {
  const fecha      = url.searchParams.get('fecha')      || '';
  const servicioID = url.searchParams.get('servicioID') || '';

  if (!fecha || !servicioID)
    return json({ ok: false, error: 'Faltan parámetros' }, 400, cors);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);

  // Obtener duración del servicio
  const srvR = await supaFetch(env,
    `servicios?id=eq.${encodeURIComponent(servicioID)}&select=duracion,requiere_skill`
  );
  if (!srvR.ok || !Array.isArray(srvR.data) || !srvR.data.length)
    return json({ ok: false, error: 'Servicio no encontrado' }, 404, cors);
  const { duracion, requiere_skill } = srvR.data[0];

  // Obtener empleados activos
  const empR = await supaFetch(env, 'empleados?activo=eq.true&select=*');
  if (!empR.ok) return json({ ok: false, error: 'Error al cargar empleados' }, 500, cors);

  let empleados = empR.data;
  if (requiere_skill) {
    empleados = empleados.filter(e =>
      Array.isArray(e.skills) && e.skills.includes(requiere_skill)
    );
  }

  // Obtener reservas del día (no canceladas)
  const resR = await supaFetch(env,
    `reservas?fecha=eq.${fecha}&estado=neq.Cancelada&select=empleado_id,hora_inicio,hora_fin`
  );
  const reservas = (resR.ok && Array.isArray(resR.data)) ? resR.data : [];

  // Construir disponibilidad por empleado
  const result = {};
  for (const emp of empleados) {
    const reservasEmp = reservas.filter(r => r.empleado_id === emp.id);
    const slots       = generarSlots(reservasEmp, duracion);
    result[emp.id] = {
      empleado: {
        id:     emp.id,
        nombre: emp.nombre,
        color:  emp.color,
        skills: emp.skills || [],
      },
      slots,
      hayDisponibilidad: slots.some(s => s.disponible),
    };
  }

  return json({ ok: true, empleados: result }, 200, cors);
}

async function handleCrearReserva(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'JSON inválido' }, 400, cors); }

  const p = body.payload || body;

  // Sanitizar y validar
  const nombre = sanitizar(p.nombre || '', 100);
  const email  = sanitizar(p.email  || '', 100).toLowerCase();
  const tel    = (p.telefono || '').trim().replace(/[^0-9+\s\-]/g, '').slice(0, 20);
  const notas  = sanitizar(p.notas  || '', 500);

  if (!nombre || nombre.length < 2)
    return json({ ok: false, error: 'Nombre inválido' }, 400, cors);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ ok: false, error: 'Email inválido' }, 400, cors);

  const servicioID = sanitizar(p.servicioID || '', 50);
  const empleadoID = sanitizar(p.empleadoID || '', 50);
  const fecha      = p.fecha       || '';
  const horaInicio = p.horaInicio  || '';
  const sesionNum  = parseInt(p.sesionNum) || 1;

  if (!servicioID || !empleadoID)
    return json({ ok: false, error: 'Faltan datos del servicio o especialista' }, 400, cors);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);
  if (!/^\d{2}:\d{2}$/.test(horaInicio))
    return json({ ok: false, error: 'Hora inválida' }, 400, cors);

  // Obtener servicio y empleado
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

  // Verificar que el slot esté libre (doble chequeo)
  const resR = await supaFetch(env,
    `reservas?fecha=eq.${fecha}&empleado_id=eq.${encodeURIComponent(empleadoID)}&estado=neq.Cancelada&select=hora_inicio,hora_fin`
  );
  const existentes = (resR.ok && Array.isArray(resR.data)) ? resR.data : [];

  const startMin = horaAMin(horaInicio);
  const endMin   = startMin + srv.duracion;
  const horaFin  = minAHora(endMin);

  const overlap = existentes.some(r => {
    const rS = horaAMin(r.hora_inicio);
    const rE = horaAMin(r.hora_fin);
    return startMin < rE && endMin > rS;
  });

  if (overlap)
    return json({ ok: false, error: 'El horario ya no está disponible. Por favor elige otro.' }, 409, cors);

  // Generar ID único
  const reservaID = `LIZ-${fecha.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`;

  const reserva = {
    id:              reservaID,
    nombre,
    email,
    telefono:        tel,
    servicio_id:     servicioID,
    servicio_nombre: srv.nombre,
    empleado_id:     empleadoID,
    empleado_nombre: emp.nombre,
    fecha,
    hora_inicio:     horaInicio,
    hora_fin:        horaFin,
    duracion:        srv.duracion,
    precio:          srv.precio,
    sesion_num:      sesionNum,
    sesiones_totales: srv.max_sesiones || 1,
    estado:          'Confirmada',
    notas,
  };

  // INSERT en Supabase
  const insR = await supaFetch(env, 'reservas', {
    method: 'POST',
    body:   JSON.stringify(reserva),
  });

  if (!insR.ok) {
    console.error('Supabase insert error:', JSON.stringify(insR.data));
    return json({ ok: false, error: 'Error al crear la reserva. Intenta de nuevo.' }, 500, cors);
  }

  // Notificar GAS para Google Sheets / email / Calendar (async)
  ctx.waitUntil(notificarGAS(env, 'crearReserva', {
    payload: {
      nombre, email, telefono: tel,
      servicioID, empleadoID, fecha, horaInicio, notas,
      sesionNum,
      // Nombres denormalizados para que GAS los escriba directamente
      servicioNombre: srv.nombre,
      empleadoNombre: emp.nombre,
    },
  }));

  return json({
    ok:       true,
    reservaID,
    reserva: {
      nombre,
      servicioNombre: srv.nombre,
      empleadoNombre: emp.nombre,
      fecha,
      horaInicio,
      horaFin,
    },
  }, 200, cors);
}

async function handleCancelarReserva(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'JSON inválido' }, 400, cors); }

  const reservaID = sanitizar(body.reservaID || '', 100);
  if (!reservaID) return json({ ok: false, error: 'ID de reserva requerido' }, 400, cors);

  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ estado: 'Cancelada', cancelado_por: 'cliente' }),
  });

  if (!r.ok) return json({ ok: false, error: 'Error al cancelar la reserva' }, 500, cors);

  ctx.waitUntil(notificarGAS(env, 'cancelarReserva', {
    reservaID, canceladoPor: 'cliente',
  }));

  return json({ ok: true }, 200, cors);
}

// ── HANDLERS ADMIN ────────────────────────────────────────────

async function handleAdminLogin(env, cors, request) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'JSON inválido' }, 400, cors); }

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
  const today = new Date().toISOString().split('T')[0];

  const [todayR, proximasR, empR] = await Promise.all([
    supaFetch(env, `reservas?fecha=eq.${today}&order=hora_inicio`),
    supaFetch(env, `reservas?fecha=gt.${today}&estado=eq.Confirmada&order=fecha,hora_inicio&limit=20`),
    supaFetch(env, 'empleados?activo=eq.true&select=*'),
  ]);

  const reservasHoy = (todayR.ok && Array.isArray(todayR.data))
    ? todayR.data.map(mapReserva) : [];
  const proximas    = (proximasR.ok && Array.isArray(proximasR.data))
    ? proximasR.data.map(mapReserva) : [];
  const empleados   = (empR.ok && Array.isArray(empR.data)) ? empR.data : [];

  const confirmadas = reservasHoy.filter(r => r.estado === 'Confirmada').length;
  const completadas = reservasHoy.filter(r => r.estado === 'Completada').length;
  const canceladas  = reservasHoy.filter(r => r.estado === 'Cancelada').length;
  const ingreso     = reservasHoy
    .filter(r => r.estado !== 'Cancelada')
    .reduce((s, r) => s + (r.precio || 0), 0);

  return json({
    ok: true,
    stats: { totalHoy: reservasHoy.length, confirmadas, completadas, canceladas, ingresoEstimado: ingreso },
    reservasHoy,
    proximas,
    empleados,
  }, 200, cors);
}

async function handleAdminReservasPorDia(env, cors, url) {
  const fecha = url.searchParams.get('fecha') || '';
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return json({ ok: false, error: 'Fecha inválida' }, 400, cors);

  const r = await supaFetch(env, `reservas?fecha=eq.${fecha}&order=hora_inicio`);
  if (!r.ok) return json({ ok: false, error: 'Error al cargar' }, 500, cors);
  return json(Array.isArray(r.data) ? r.data.map(mapReserva) : [], 200, cors);
}

async function handleAdminActualizarEstado(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'JSON inválido' }, 400, cors); }

  const params    = body.params || body;
  const reservaID = sanitizar(params.reservaID || '', 100);
  const estado    = sanitizar(params.estado    || '', 50);
  const validos   = ['Confirmada', 'Completada', 'Cancelada', 'Pendiente'];

  if (!reservaID || !validos.includes(estado))
    return json({ ok: false, error: 'Datos inválidos' }, 400, cors);

  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ estado }),
  });

  if (!r.ok) return json({ ok: false, error: 'Error al actualizar estado' }, 500, cors);

  ctx.waitUntil(notificarGAS(env, 'actualizarEstado', {
    params: { reservaID, estado },
  }));

  return json({ ok: true }, 200, cors);
}

async function handleAdminCancelarReserva(env, cors, request, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'JSON inválido' }, 400, cors); }

  const reservaID = sanitizar(body.reservaID || '', 100);
  if (!reservaID) return json({ ok: false, error: 'ID de reserva requerido' }, 400, cors);

  const r = await supaFetch(env, `reservas?id=eq.${encodeURIComponent(reservaID)}`, {
    method: 'PATCH',
    body:   JSON.stringify({ estado: 'Cancelada', cancelado_por: 'admin' }),
  });

  if (!r.ok) return json({ ok: false, error: 'Error al cancelar' }, 500, cors);

  ctx.waitUntil(notificarGAS(env, 'cancelarReserva', {
    reservaID, canceladoPor: 'admin',
  }));

  return json({ ok: true }, 200, cors);
}

// ── MAIN FETCH HANDLER ────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin') || '*';
    const cors   = corsHeaders(origin);

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── PROTECCIÓN /admin/* ────────────────────────────────
    if (path.startsWith('/admin/') && !path.startsWith('/api/')) {
      // La página de login es pública
      if (path === '/admin/login.html' || path === '/admin/login') {
        return env.ASSETS.fetch(request);
      }
      const autenticado = await verificarCookie(request, env);
      if (!autenticado) {
        const accept = request.headers.get('Accept') || '';
        if (accept.includes('text/html')) {
          return Response.redirect(
            new URL('/admin/login.html', request.url).toString(), 302
          );
        }
        return json({ ok: false, error: 'No autorizado' }, 401, cors);
      }
      // Servir archivos del panel
      return env.ASSETS.fetch(request);
    }

    // ── API ROUTES ─────────────────────────────────────────
    if (path.startsWith('/api/')) {
      try {
        const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';

        // Públicas
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

        // Admin auth
        if (method === 'POST' && path === '/api/admin/login') {
          const ok = await checkRateLimit(env, `login:${ip}`, 5, 600_000);
          if (!ok) return json({ ok: false, error: 'Demasiados intentos. Espera 10 minutos.' }, 429, cors);
          return handleAdminLogin(env, cors, request);
        }

        if (method === 'POST' && path === '/api/admin/logout')
          return handleAdminLogout(cors);

        // Rutas admin protegidas
        const esAdmin = await verificarCookie(request, env);
        if (!esAdmin) return json({ ok: false, error: 'No autorizado' }, 401, cors);

        if (method === 'GET'  && path === '/api/admin/dashboard')
          return handleAdminDashboard(env, cors);

        if (method === 'GET'  && path === '/api/admin/reservas')
          return handleAdminReservasPorDia(env, cors, url);

        if (method === 'POST' && path === '/api/admin/reservas/estado')
          return handleAdminActualizarEstado(env, cors, request, ctx);

        if (method === 'POST' && path === '/api/admin/reservas/cancelar')
          return handleAdminCancelarReserva(env, cors, request, ctx);

        return json({ ok: false, error: 'Ruta no encontrada' }, 404, cors);

      } catch (e) {
        console.error('Worker error:', e.stack || e.message);
        return json({ ok: false, error: 'Error interno del servidor' }, 500, cors);
      }
    }

    // Todo lo demás → assets estáticos
    return env.ASSETS.fetch(request);
  },
};
