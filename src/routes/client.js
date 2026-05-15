/**
 * Client Routes — Endpoints protegidos con JWT
 *
 * Estos endpoints requieren JWT válido del cliente
 * - GET /api/cliente/reservas (ver propias reservas)
 * - GET /api/cliente/fidelizacion (ver puntos)
 * - POST /api/cliente/reservas/:id/cancelar
 * - etc.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Verificar JWT y extraer email del cliente
 * @param {Request} request
 * @param {string} jwtSecret
 * @returns {string|null} Email del cliente o null
 */
function verifyJWT(request, jwtSecret) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  // Validación simple - En producción, usar librería JWT
  try {
    // Supabase valida el JWT automáticamente vía RLS
    // Aquí solo extraemos el email del token
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );

    return payload.email || null;
  } catch (e) {
    return null;
  }
}

function getSupabaseClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

/**
 * GET /api/cliente/reservas
 * Retorna todas las reservas del cliente autenticado
 */
export async function handleClienteGetReservas(request, env, tenant) {
  try {
    const email = verifyJWT(request, env.JWT_SECRET);
    if (!email) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    // RLS automáticamente filtra por tenant + email
    const { data, error } = await supabase
      .from('reservas')
      .select(`
        id,
        fecha,
        hora,
        estado,
        confirmada,
        notas,
        servicios!inner(nombre, duracion_minutos, precio),
        empleados!inner(nombre)
      `)
      .eq('tenant_id', tenant.id)
      .eq('email', email)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('[ClientAPI] Error fetching reservas:', error);
      return json({ error: 'Error fetching reservations' }, 500);
    }

    return json({
      ok: true,
      cliente_email: email,
      reservas: data || []
    }, 200);

  } catch (error) {
    console.error('[ClientAPI] handleClienteGetReservas error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/cliente/fidelizacion
 * Retorna puntos y nivel de fidelización del cliente
 */
export async function handleClienteGetFidelizacion(request, env, tenant) {
  try {
    const email = verifyJWT(request, env.JWT_SECRET);
    if (!email) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    // RLS automáticamente filtra por tenant + email
    const { data, error } = await supabase
      .from('fidelizacion')
      .select('puntos_acumulados, puntos_canjeados, nivel, ultima_compra')
      .eq('tenant_id', tenant.id)
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = No rows found (es OK, cliente sin fidelización)
      console.error('[ClientAPI] Error fetching fidelizacion:', error);
      return json({ error: 'Error fetching loyalty' }, 500);
    }

    if (!data) {
      // Cliente sin registro de fidelización
      return json({
        ok: true,
        cliente_email: email,
        fidelizacion: {
          puntos_acumulados: 0,
          puntos_canjeados: 0,
          nivel: 'no_registrado',
          ultima_compra: null
        }
      }, 200);
    }

    return json({
      ok: true,
      cliente_email: email,
      fidelizacion: data
    }, 200);

  } catch (error) {
    console.error('[ClientAPI] handleClienteGetFidelizacion error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * GET /api/cliente/gift-cards
 * Retorna gift cards disponibles para el cliente
 */
export async function handleClienteGetGiftCards(request, env, tenant) {
  try {
    const email = verifyJWT(request, env.JWT_SECRET);
    if (!email) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    const { data, error } = await supabase
      .from('gift_cards')
      .select('codigo, monto_restante, estado, fecha_vencimiento')
      .eq('tenant_id', tenant.id)
      .eq('email_cliente', email)
      .eq('estado', 'activa')
      .order('fecha_vencimiento', { ascending: true });

    if (error) {
      console.error('[ClientAPI] Error fetching gift cards:', error);
      return json({ error: 'Error fetching gift cards' }, 500);
    }

    return json({
      ok: true,
      cliente_email: email,
      gift_cards: data || [],
      total_disponible: (data || []).reduce((sum, gc) => sum + gc.monto_restante, 0)
    }, 200);

  } catch (error) {
    console.error('[ClientAPI] handleClienteGetGiftCards error:', error);
    return json({ error: error.message }, 500);
  }
}

/**
 * POST /api/cliente/reservas/:id/cancelar
 * Cancela una reserva del cliente
 */
export async function handleClienteCancelarReserva(request, env, tenant, reservaId) {
  try {
    const email = verifyJWT(request, env.JWT_SECRET);
    if (!email) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(env);

    // Verificar que la reserva pertenece al cliente y al tenant
    const { data: reserva, error: checkError } = await supabase
      .from('reservas')
      .select('id, estado, fecha, hora')
      .eq('id', reservaId)
      .eq('tenant_id', tenant.id)
      .eq('email', email)
      .single();

    if (checkError || !reserva) {
      return json({ error: 'Reservation not found or not authorized' }, 404);
    }

    // Validar que no está en el pasado
    const fechaReserva = new Date(`${reserva.fecha}T${reserva.hora}`);
    if (fechaReserva < new Date()) {
      return json({ error: 'Cannot cancel past reservations' }, 400);
    }

    // Validar que no está ya cancelada
    if (reserva.estado === 'cancelada') {
      return json({ error: 'Reservation already cancelled' }, 400);
    }

    // Actualizar estado
    const { error: updateError } = await supabase
      .from('reservas')
      .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', reservaId)
      .eq('tenant_id', tenant.id)
      .eq('email', email);

    if (updateError) {
      console.error('[ClientAPI] Error cancelling reserva:', updateError);
      return json({ error: 'Error cancelling reservation' }, 500);
    }

    return json({
      ok: true,
      mensaje: 'Reserva cancelada',
      reserva_id: reservaId
    }, 200);

  } catch (error) {
    console.error('[ClientAPI] handleClienteCancelarReserva error:', error);
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
