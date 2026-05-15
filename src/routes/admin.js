/**
 * Admin Routes — Endpoints protegidos con cookie/sesión
 *
 * Estos endpoints requieren:
 * 1. Cookie de sesión válida (liz_session)
 * 2. Usuario debe ser admin o superadmin en el tenant
 *
 * - GET /api/admin/dashboard
 * - GET /api/admin/reservas
 * - POST /api/admin/reservas/:id/confirmar
 * - GET /api/admin/empleados
 * - POST /api/admin/empleados
 * - etc.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Validar sesión del admin desde cookie
 * @param {Request} request
 * @param {string} sessionSecret - Secret para validar sesión
 * @returns {Object|null} { userId, email, role } o null
 */
function validateAdminSession(request, sessionSecret) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }

  // Buscar cookie liz_session
  const cookies = cookieHeader.split('; ').reduce((acc, cookie) => {
    const [key, value] = cookie.split('=');
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});

  // En producción, validar firma del sessionSecret
  // Por ahora, asumimos que Supabase valida la sesión
  if (!cookies.liz_session) {
    return null;
  }

  try {
    // Deserializar sesión (en producción, validar firma)
    const session = JSON.parse(atob(cookies.liz_session));
    return session;
  } catch (e) {
    return null;
  }
}

function getSupabaseClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

/**
 * Verificar que el usuario es admin en el tenant
 */
async function requireAdminRole(env, tenant, session) {
  if (!session) {
    return false;
  }

  const supabase = getSupabaseClient(env);

  const { data, error } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('auth_user_id', session.userId)
    .in('role', ['admin', 'superadmin'])
    .single();

  return !error && data;
}

/**
 * GET /api/admin/dashboard
 * Retorna estadísticas del tenant
 */
export async function handleAdminDashboard(request, env, tenant) {
  try {
    const session = validateAdminSession(request, env.SESSION_SECRET);
    if (!session || !(await requireAdminRole(env, tenant, session))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    // Obtener estadísticas
    const today = new Date().toISOString().split('T')[0];

    // Reservas de hoy
    const { count: reservasHoy } = await supabase
      .from('reservas')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('fecha', today);

    // Reservas pendientes
    const { count: reservasPendientes } = await supabase
      .from('reservas')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('estado', 'pendiente');

    // Total de clientes únicos
    const { data: clientes } = await supabase
      .from('reservas')
      .select('email', { distinct: true })
      .eq('tenant_id', tenant.id)
      .gt('fecha', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    // Servicios disponibles
    const { count: totalServicios } = await supabase
      .from('servicios')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('activo', true);

    // Empleados activos
    const { count: totalEmpleados } = await supabase
      .from('empleados')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('activo', true);

    return json({
      ok: true,
      tenant: tenant.slug,
      estadisticas: {
        reservas_hoy: reservasHoy || 0,
        reservas_pendientes: reservasPendientes || 0,
        clientes_activos: (clientes || []).length,
        total_servicios: totalServicios || 0,
        total_empleados: totalEmpleados || 0
      }
    }, 200);

  } catch (error) {
    console.error('[AdminAPI] handleAdminDashboard error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/admin/reservas?fecha=YYYY-MM-DD&estado=pendiente
 * Retorna reservas del tenant con filtros
 */
export async function handleAdminGetReservas(request, env, tenant) {
  try {
    const session = validateAdminSession(request, env.SESSION_SECRET);
    if (!session || !(await requireAdminRole(env, tenant, session))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const fecha = url.searchParams.get('fecha');
    const estado = url.searchParams.get('estado');

    const supabase = getSupabaseClient(env);

    let query = supabase
      .from('reservas')
      .select(`
        id,
        nombre,
        email,
        telefono,
        fecha,
        hora,
        estado,
        confirmada,
        notas,
        servicios(nombre, precio),
        empleados(nombre)
      `)
      .eq('tenant_id', tenant.id);

    if (fecha) {
      query = query.eq('fecha', fecha);
    }

    if (estado) {
      query = query.eq('estado', estado);
    }

    const { data, error } = await query.order('fecha', { ascending: false });

    if (error) {
      console.error('[AdminAPI] Error fetching reservas:', error);
      return json({ error: 'Error fetching reservations' }, 500);
    }

    return json({
      ok: true,
      tenant: tenant.slug,
      reservas: data || []
    }, 200);

  } catch (error) {
    console.error('[AdminAPI] handleAdminGetReservas error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * POST /api/admin/reservas/:id/confirmar
 * Confirma una reserva
 */
export async function handleAdminConfirmarReserva(request, env, tenant, reservaId) {
  try {
    const session = validateAdminSession(request, env.SESSION_SECRET);
    if (!session || !(await requireAdminRole(env, tenant, session))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    const { error } = await supabase
      .from('reservas')
      .update({
        confirmada: true,
        estado: 'confirmada',
        updated_at: new Date().toISOString()
      })
      .eq('id', reservaId)
      .eq('tenant_id', tenant.id);

    if (error) {
      console.error('[AdminAPI] Error confirming reserva:', error);
      return json({ error: 'Error confirming reservation' }, 500);
    }

    return json({
      ok: true,
      mensaje: 'Reserva confirmada',
      reserva_id: reservaId
    }, 200);

  } catch (error) {
    console.error('[AdminAPI] handleAdminConfirmarReserva error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/admin/servicios
 * Retorna servicios del tenant
 */
export async function handleAdminGetServicios(request, env, tenant) {
  try {
    const session = validateAdminSession(request, env.SESSION_SECRET);
    if (!session || !(await requireAdminRole(env, tenant, session))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    const { data, error } = await supabase
      .from('servicios')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('nombre');

    if (error) {
      console.error('[AdminAPI] Error fetching servicios:', error);
      return json({ error: 'Error fetching services' }, 500);
    }

    return json({
      ok: true,
      servicios: data || []
    }, 200);

  } catch (error) {
    console.error('[AdminAPI] handleAdminGetServicios error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * POST /api/admin/servicios
 * Crea un nuevo servicio
 */
export async function handleAdminCrearServicio(request, env, tenant) {
  try {
    const session = validateAdminSession(request, env.SESSION_SECRET);
    if (!session || !(await requireAdminRole(env, tenant, session))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const payload = await request.json();

    const required = ['nombre', 'duracion_minutos', 'precio'];
    for (const field of required) {
      if (!payload[field]) {
        return json({ error: `Missing field: ${field}` }, 400);
      }
    }

    const supabase = getSupabaseClient(env);

    const { data, error } = await supabase
      .from('servicios')
      .insert([{
        tenant_id: tenant.id,
        nombre: payload.nombre,
        descripcion: payload.descripcion || null,
        duracion_minutos: payload.duracion_minutos,
        precio: payload.precio,
        activo: payload.activo !== false
      }])
      .select();

    if (error) {
      console.error('[AdminAPI] Error creating servicio:', error);
      return json({ error: 'Error creating service' }, 500);
    }

    return json({
      ok: true,
      mensaje: 'Servicio creado',
      servicio: data?.[0]
    }, 201);

  } catch (error) {
    console.error('[AdminAPI] handleAdminCrearServicio error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/admin/empleados
 * Retorna empleados del tenant
 */
export async function handleAdminGetEmpleados(request, env, tenant) {
  try {
    const session = validateAdminSession(request, env.SESSION_SECRET);
    if (!session || !(await requireAdminRole(env, tenant, session))) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    const { data, error } = await supabase
      .from('empleados')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('nombre');

    if (error) {
      console.error('[AdminAPI] Error fetching empleados:', error);
      return json({ error: 'Error fetching employees' }, 500);
    }

    return json({
      ok: true,
      empleados: data || []
    }, 200);

  } catch (error) {
    console.error('[AdminAPI] handleAdminGetEmpleados error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * Helper: Retorna JSON response
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
