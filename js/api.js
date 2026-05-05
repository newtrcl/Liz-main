/* ================================================================
   Belleza Integral — js/api.js
   Todas las llamadas van al Worker (/api/*).
   No hay API keys ni tokens expuestos aquí.
   ================================================================ */

// Config visual (no son secretos)
const LOGO_URL       = 'https://lh3.googleusercontent.com/d/1KegXjaRohFEhnPc-FxlaC-sa8esSI3QV';
const NEGOCIO_NOMBRE = 'Belleza Integral';

// Helper base
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const API = {
  // ── Públicos ────────────────────────────────────────────────
  getServicios: () =>
    apiFetch('/api/servicios'),

  getEmpleados: () =>
    apiFetch('/api/empleados'),

  getDisponibilidad: (fecha, servicioID) =>
    apiFetch(
      `/api/disponibilidad?fecha=${encodeURIComponent(fecha)}&servicioID=${encodeURIComponent(servicioID)}`
    ),

  crearReserva: (payload) =>
    apiFetch('/api/reservas', {
      method: 'POST',
      body:   JSON.stringify({ payload }),
    }),

  cancelarReserva: (reservaID) =>
    apiFetch('/api/reservas/cancelar', {
      method: 'POST',
      body:   JSON.stringify({ reservaID, canceladoPor: 'cliente' }),
    }),

  // ── Admin (cookie httpOnly) ──────────────────────────────────
  adminLogin: (password) =>
    apiFetch('/api/admin/login', {
      method:      'POST',
      credentials: 'same-origin',
      body:        JSON.stringify({ password }),
    }),

  adminLogout: () =>
    apiFetch('/api/admin/logout', {
      method:      'POST',
      credentials: 'same-origin',
    }),

  getDashboard: () =>
    apiFetch('/api/admin/dashboard', { credentials: 'same-origin' }),

  getReservasPorDia: (fecha) =>
    apiFetch(`/api/admin/reservas?fecha=${encodeURIComponent(fecha)}`, {
      credentials: 'same-origin',
    }),

  actualizarEstado: (reservaID, estado) =>
    apiFetch('/api/admin/reservas/estado', {
      method:      'POST',
      credentials: 'same-origin',
      body:        JSON.stringify({ params: { reservaID, estado } }),
    }),

  cancelarAdmin: (reservaID) =>
    apiFetch('/api/admin/reservas/cancelar', {
      method:      'POST',
      credentials: 'same-origin',
      body:        JSON.stringify({ reservaID, canceladoPor: 'admin' }),
    }),
};
