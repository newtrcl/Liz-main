/* ================================================================
   Belleza Integral — js/api.js  v2
   Todas las llamadas van al Worker (/api/*).
   No hay API keys ni tokens expuestos aquí.
   ================================================================ */

// Config visual (no son secretos)
const LOGO_URL       = 'https://lh3.googleusercontent.com/d/1KegXjaRohFEhnPc-FxlaC-sa8esSI3QV';
const NEGOCIO_NOMBRE = 'Belleza Integral';

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
    apiFetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}&servicioID=${encodeURIComponent(servicioID)}`),

  crearReserva: (payload) =>
    apiFetch('/api/reservas', { method: 'POST', body: JSON.stringify({ payload }) }),

  cancelarReserva: (reservaID) =>
    apiFetch('/api/reservas/cancelar', {
      method: 'POST',
      body:   JSON.stringify({ reservaID, canceladoPor: 'cliente' }),
    }),

  // ── Bloqueo temporal de slot ─────────────────────────────────
  bloquearSlot: (empleadoID, fecha, horaInicio, horaFin, sessionToken) =>
    apiFetch('/api/slots/bloquear', {
      method: 'POST',
      body:   JSON.stringify({ empleadoID, fecha, horaInicio, horaFin, sessionToken }),
    }),

  liberarBloqueo: (bloqueoID) =>
    apiFetch(`/api/slots/bloqueo/${encodeURIComponent(bloqueoID)}`, { method: 'DELETE' }),

  // ── Gift Cards ───────────────────────────────────────────────
  validarGiftCard: (codigo) =>
    apiFetch(`/api/giftcards/${encodeURIComponent(codigo)}`),

  // ── Fidelización ─────────────────────────────────────────────
  getFidelizacionQR: (token) =>
    apiFetch(`/api/fidelizacion/qr/${encodeURIComponent(token)}`),

  // ── Admin (cookie httpOnly) ──────────────────────────────────
  adminLogin: (password) =>
    apiFetch('/api/admin/login', {
      method:      'POST',
      credentials: 'same-origin',
      body:        JSON.stringify({ password }),
    }),

  adminLogout: () =>
    apiFetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }),

  getDashboard: () =>
    apiFetch('/api/admin/dashboard', { credentials: 'same-origin' }),

  getReservasPorDia: (fecha) =>
    apiFetch(`/api/admin/reservas?fecha=${encodeURIComponent(fecha)}`, { credentials: 'same-origin' }),

  getReportes: (desde, hasta) =>
    apiFetch(`/api/admin/reportes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, {
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

  reagendar: (reservaID, nuevaFecha, nuevaHora) =>
    apiFetch('/api/admin/reservas/reagendar', {
      method:      'POST',
      credentials: 'same-origin',
      body:        JSON.stringify({ reservaID, nuevaFecha, nuevaHora }),
    }),

  // ── Admin Gift Cards ──────────────────────────────────────────
  crearGiftCard: (datos) =>
    apiFetch('/api/admin/giftcards', {
      method:      'POST',
      credentials: 'same-origin',
      body:        JSON.stringify(datos),
    }),

  listGiftCards: () =>
    apiFetch('/api/admin/giftcards', { credentials: 'same-origin' }),

  // ── Admin Fidelización ────────────────────────────────────────
  getFidelizacion: (q = '', limit = 50) =>
    apiFetch(`/api/admin/fidelizacion?q=${encodeURIComponent(q)}&limit=${limit}`, {
      credentials: 'same-origin',
    }),
};
