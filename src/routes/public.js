/**
 * Public Routes — Endpoints accesibles sin autenticación
 *
 * Estos endpoints pueden ser llamados por cualquiera (clientes del salón)
 * - GET /api/servicios
 * - GET /api/disponibilidad
 * - POST /api/reservas
 * - GET /api/config (retorna configuración del tenant)
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Inicializa cliente Supabase con credenciales anónimas
 * @param {Object} env - Variables de entorno
 * @returns {Object} Cliente Supabase
 */
function getSupabaseClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

/**
 * GET /api/servicios
 * Retorna lista de servicios disponibles para el tenant
 */
export async function handleGetServicios(request, env, tenant) {
  try {
    const supabase = getSupabaseClient(env);

    // Obtener servicios activos del tenant
    const { data, error } = await supabase
      .from('servicios')
      .select('id,nombre,descripcion,duracion_minutos,precio')
      .eq('tenant_id', tenant.id)
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      console.error('[PublicAPI] Error fetching servicios:', error);
      return json({ error: 'Error fetching services' }, 500);
    }

    return json({
      ok: true,
      tenant: tenant.slug,
      servicios: data || []
    }, 200);

  } catch (error) {
    console.error('[PublicAPI] handleGetServicios error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/empleados
 * Retorna lista de empleados disponibles para el tenant
 */
export async function handleGetEmpleados(request, env, tenant) {
  try {
    const supabase = getSupabaseClient(env);

    const { data, error } = await supabase
      .from('empleados')
      .select('id,nombre,especialidades')
      .eq('tenant_id', tenant.id)
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      console.error('[PublicAPI] Error fetching empleados:', error);
      return json({ error: 'Error fetching employees' }, 500);
    }

    return json({
      ok: true,
      tenant: tenant.slug,
      empleados: data || []
    }, 200);

  } catch (error) {
    console.error('[PublicAPI] handleGetEmpleados error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/disponibilidad?fecha=YYYY-MM-DD&servicio_id=<id>&empleado_id=<id>
 * Retorna slots disponibles para reserva
 *
 * TODO: Integración con Google Calendar o lógica de disponibilidad
 * Por ahora, retorna slots teóricos
 */
export async function handleGetDisponibilidad(request, env, tenant) {
  try {
    const url = new URL(request.url);
    const fecha = url.searchParams.get('fecha');
    const servicio_id = url.searchParams.get('servicio_id');
    const empleado_id = url.searchParams.get('empleado_id');

    if (!fecha) {
      return json({ error: 'Missing parameter: fecha' }, 400);
    }

    // Validar que sea fecha válida
    const fechaDate = new Date(fecha);
    if (isNaN(fechaDate.getTime())) {
      return json({ error: 'Invalid date format' }, 400);
    }

    const supabase = getSupabaseClient(env);

    // Obtener duracion del servicio (si se especificó)
    let duracion_minutos = 30; // Default
    if (servicio_id) {
      const { data: servicioData } = await supabase
        .from('servicios')
        .select('duracion_minutos')
        .eq('id', servicio_id)
        .eq('tenant_id', tenant.id)
        .single();

      if (servicioData) {
        duracion_minutos = servicioData.duracion_minutos;
      }
    }

    // Obtener horarios del tenant
    const config = tenant.config_json || {};
    const horarios = config.horarios || {};
    const intervalo = config.intervalo_disponibilidad_minutos || 15;

    // Generar slots disponibles teóricos
    // TODO: Validar contra reservas existentes y bloqueos
    const slots = [];
    const dia_semana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const nombreDia = dia_semana[fechaDate.getDay()];

    const horariosDelDia = horarios[nombreDia];
    if (!horariosDelDia) {
      return json({
        ok: true,
        fecha,
        slots: [] // Salón cerrado ese día
      }, 200);
    }

    const [inicio_h, inicio_m] = horariosDelDia.inicio.split(':').map(Number);
    const [fin_h, fin_m] = horariosDelDia.fin.split(':').map(Number);

    let minutoActual = inicio_h * 60 + inicio_m;
    const minutoFin = fin_h * 60 + fin_m;

    while (minutoActual + duracion_minutos <= minutoFin) {
      const h = Math.floor(minutoActual / 60);
      const m = minutoActual % 60;
      slots.push({
        hora: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        disponible: true
      });
      minutoActual += intervalo;
    }

    return json({
      ok: true,
      fecha,
      duracion_minutos,
      slots
    }, 200);

  } catch (error) {
    console.error('[PublicAPI] handleGetDisponibilidad error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * POST /api/reservas
 * Crea una nueva reserva
 *
 * Body:
 * {
 *   "nombre": "Juan Pérez",
 *   "email": "juan@example.com",
 *   "telefono": "+56912345678",
 *   "fecha": "2025-06-20",
 *   "hora": "14:30",
 *   "servicio_id": "<uuid>",
 *   "empleado_id": "<uuid>",
 *   "notas": "Tengo alergia..."
 * }
 */
export async function handleCrearReserva(request, env, tenant) {
  try {
    const payload = await request.json();

    // Validar campos requeridos
    const required = ['nombre', 'email', 'telefono', 'fecha', 'hora', 'servicio_id'];
    for (const field of required) {
      if (!payload[field]) {
        return json({ error: `Missing field: ${field}` }, 400);
      }
    }

    const supabase = getSupabaseClient(env);

    // Verificar que el servicio existe y pertenece al tenant
    const { data: servicio, error: servicioError } = await supabase
      .from('servicios')
      .select('id,nombre,precio')
      .eq('id', payload.servicio_id)
      .eq('tenant_id', tenant.id)
      .single();

    if (servicioError || !servicio) {
      return json({ error: 'Service not found' }, 404);
    }

    // Crear reserva con tenant_id
    const { data: reserva, error: reservaError } = await supabase
      .from('reservas')
      .insert([{
        tenant_id: tenant.id,
        nombre: payload.nombre,
        email: payload.email,
        telefono: payload.telefono,
        fecha: payload.fecha,
        hora: payload.hora,
        servicio_id: payload.servicio_id,
        empleado_id: payload.empleado_id || null,
        notas: payload.notas || null,
        estado: 'pendiente',
        confirmada: false
      }])
      .select();

    if (reservaError) {
      console.error('[PublicAPI] Error creating reserva:', reservaError);
      return json({ error: 'Error creating reservation' }, 500);
    }

    // Enviar webhook a Google Apps Script (con tenant_id)
    try {
      await fetch('https://script.google.com/macros/d/.../usercontent/endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'reserva_creada',
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          gmail_email: tenant.gmail_email,
          reserva: reserva?.[0],
          servicio: servicio
        })
      }).catch(err => console.warn('[PublicAPI] Webhook error (non-blocking):', err));
    } catch (webhookError) {
      console.warn('[PublicAPI] Failed to call webhook:', webhookError);
      // No bloquear la respuesta si el webhook falla
    }

    return json({
      ok: true,
      mensaje: 'Reserva creada exitosamente',
      reserva_id: reserva?.[0]?.id,
      estado: 'pendiente'
    }, 201);

  } catch (error) {
    console.error('[PublicAPI] handleCrearReserva error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/reserva/:id
 * Obtiene estado de una reserva (sin autenticación, solo por ID)
 *
 * ⚠️ En producción, requeriría token o código de confirmación
 */
export async function handleGetReserva(request, env, tenant, reservaId) {
  try {
    const supabase = getSupabaseClient(env);

    const { data, error } = await supabase
      .from('reservas')
      .select('id,nombre,email,fecha,hora,estado,confirmada')
      .eq('id', reservaId)
      .eq('tenant_id', tenant.id)
      .single();

    if (error || !data) {
      return json({ error: 'Reservation not found' }, 404);
    }

    return json({
      ok: true,
      reserva: data
    }, 200);

  } catch (error) {
    console.error('[PublicAPI] handleGetReserva error:', error);
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
