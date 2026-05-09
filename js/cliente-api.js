// ═══════════════════════════════════════════════════════════════
// CLIENTE API — Funciones para comunicarse con endpoints /api/cliente/*
// Usa Supabase Auth para autenticación con Google
// ═══════════════════════════════════════════════════════════════

// Obtener cliente Supabase (se carga desde window.supabaseClient)
async function getSupabaseClient() {
  if (!window.supabaseClient) {
    // Esperar a que Supabase SDK cargue
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.supabaseClient) {
          clearInterval(checkInterval);
          resolve(window.supabaseClient);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 5000);
    });
  }
  return window.supabaseClient;
}

const ClienteAPI = {
  // ── AUTENTICACIÓN ──────────────────────────────────────

  async loginGoogle() {
    const supabase = await getSupabaseClient();
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/cliente.html`,
        },
      });
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.error('Google login error:', e);
      return { ok: false, error: e.message };
    }
  },

  async getSession() {
    const supabase = await getSupabaseClient();
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session;
    } catch (e) {
      console.error('Session error:', e);
      return null;
    }
  },

  async logout() {
    const supabase = await getSupabaseClient();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.error('Logout error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── RESERVAS ──────────────────────────────────────────

  async getReservas(estado = '', desde = '', hasta = '') {
    try {
      const session = await this.getSession();
      if (!session?.access_token) {
        return { ok: false, error: 'No autenticado' };
      }

      const url = new URL('/api/cliente/reservas', window.location.origin);
      if (estado) url.searchParams.set('estado', estado);
      if (desde) url.searchParams.set('desde', desde);
      if (hasta) url.searchParams.set('hasta', hasta);

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al obtener reservas' };
      }

      const data = await res.json();
      return data;
    } catch (e) {
      console.error('getReservas error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── PERFIL ────────────────────────────────────────────

  async getPerfil() {
    try {
      const session = await this.getSession();
      if (!session?.access_token) {
        return { ok: false, error: 'No autenticado' };
      }

      const res = await fetch('/api/cliente/perfil', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al obtener perfil' };
      }

      const data = await res.json();
      return data;
    } catch (e) {
      console.error('getPerfil error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── CANCELAR RESERVA ──────────────────────────────────

  async cancelarReserva(reservaID) {
    try {
      const session = await this.getSession();
      if (!session?.access_token) {
        return { ok: false, error: 'No autenticado' };
      }

      const res = await fetch('/api/cliente/cancelar-reserva', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reservaID }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error || 'Error al cancelar' };
      }

      const data = await res.json();
      return data;
    } catch (e) {
      console.error('cancelarReserva error:', e);
      return { ok: false, error: e.message };
    }
  },
};

// Exportar para uso global
window.ClienteAPI = ClienteAPI;
