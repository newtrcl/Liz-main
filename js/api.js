/**
 * API Functions — Belleza Integral Admin
 * Comunicación con el worker en Cloudflare
 */

const API = {
  // ── DASHBOARD ────────────────────────────────────────────────
  async getDashboard() {
    try {
      const res = await fetch('/api/admin/dashboard', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) return { ok: false, error: 'No autenticado', status: res.status };
      return await res.json();
    } catch (e) {
      console.error('getDashboard error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── RESERVAS ─────────────────────────────────────────────────
  async getReservasPorDia(fecha) {
    try {
      const res = await fetch(`/api/admin/reservas?fecha=${encodeURIComponent(fecha)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al obtener reservas', status: res.status };
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data.reservas || [];
    } catch (e) {
      console.error('getReservasPorDia error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── ACTUALIZAR ESTADO ────────────────────────────────────────
  async actualizarEstado(reservaID, estado) {
    try {
      const res = await fetch('/api/admin/reservas/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservaID, estado }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al actualizar', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('actualizarEstado error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── CANCELAR RESERVA (ADMIN) ─────────────────────────────────
  async cancelarAdmin(reservaID) {
    try {
      const res = await fetch('/api/admin/reservas/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservaID }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cancelar', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('cancelarAdmin error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── REAGENDAR ────────────────────────────────────────────────
  async reagendar(reservaID, nuevaFecha, nuevaHora) {
    try {
      const res = await fetch('/api/admin/reservas/reagendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservaID, nuevaFecha, nuevaHora }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al reagendar', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('reagendar error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── REPORTES ─────────────────────────────────────────────────
  async getReportes(desde, hasta) {
    try {
      const url = `/api/admin/reportes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cargar reportes', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('getReportes error:', e);
      return { ok: false, error: e.message };
    }
  },

  async getReportesResumen(desde, hasta) {
    try {
      const url = `/api/admin/reportes/resumen?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cargar resumen', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('getReportesResumen error:', e);
      return { ok: false, error: e.message };
    }
  },

  async getReportesGraficos(desde, hasta) {
    try {
      const url = `/api/admin/reportes/grafico-datos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cargar gráficos', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('getReportesGraficos error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── GIFT CARDS ───────────────────────────────────────────────
  async crearGiftCard(payload) {
    try {
      const res = await fetch('/api/admin/giftcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al crear', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('crearGiftCard error:', e);
      return { ok: false, error: e.message };
    }
  },

  async listGiftCards() {
    try {
      const res = await fetch('/api/admin/giftcards', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cargar', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('listGiftCards error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── FIDELIZACIÓN ─────────────────────────────────────────────
  async getFidelizacion(q, limit) {
    try {
      const url = `/api/admin/fidelizacion?q=${encodeURIComponent(q || '')}&limit=${limit || 50}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cargar', status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('getFidelizacion error:', e);
      return { ok: false, error: e.message };
    }
  },
};

// Export para uso global
window.API = API;
