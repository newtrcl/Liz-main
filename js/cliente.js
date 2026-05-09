// ═══════════════════════════════════════════════════════════════
// CLIENTE UI — Lógica del portal de cliente
// Gestiona sesión de Supabase Auth, UI de login/reservas
// ═══════════════════════════════════════════════════════════════

// Variables de estado
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let currentUser = null;

// ── INICIALIZACIÓN ────────────────────────────────────────────

async function initCliente() {
  try {
    // Obtener credenciales Supabase del servidor
    const configRes = await fetch('/api/config');
    if (configRes.ok) {
      const config = await configRes.json();
      SUPABASE_URL = config.supabaseUrl;
      SUPABASE_ANON_KEY = config.supabaseAnonKey;
    }

    // Inicializar Supabase
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error('Supabase credentials not found');
      showToast('Error: No se puede conectar con Supabase', 'error');
      return;
    }

    // Verificar sesión existente
    const session = await ClienteAPI.getSession();
    if (session?.user) {
      currentUser = session.user;
      mostrarPortalReservas();
    } else {
      mostrarLoginForm();
    }

    // Escuchar cambios de autenticación
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        currentUser = session.user;
        mostrarPortalReservas();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        mostrarLoginForm();
      }
    });
  } catch (e) {
    console.error('Init error:', e);
    showToast('Error al inicializar: ' + e.message, 'error');
  }
}

// ── UI: MOSTRAR LOGIN ──────────────────────────────────────────

function mostrarLoginForm() {
  document.getElementById('login-container').style.display = 'block';
  document.getElementById('mis-reservas-container').style.display = 'none';
  document.getElementById('loader').style.display = 'none';
}

// ── UI: MOSTRAR PORTAL ────────────────────────────────────────

let allReservas = []; // Guardar todas las reservas para filtrar

async function mostrarPortalReservas() {
  try {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('loader').style.display = 'block';
    document.getElementById('mis-reservas-container').style.display = 'none';

    // Mostrar email del usuario
    if (currentUser?.email) {
      document.getElementById('user-email').textContent = currentUser.email;
    }

    // Cargar perfil
    const perfilRes = await ClienteAPI.getPerfil();
    if (perfilRes.ok && perfilRes.perfil) {
      mostrarFidelizacion(perfilRes.perfil);
    }

    // Cargar reservas
    const resRes = await ClienteAPI.getReservas();
    if (resRes.ok) {
      allReservas = resRes.reservas || [];
      mostrarReservas(allReservas);
      cargarServicios(allReservas);
    } else {
      showToast('Error al cargar reservas: ' + resRes.error, 'error');
    }

    document.getElementById('loader').style.display = 'none';
    document.getElementById('mis-reservas-container').style.display = 'block';
  } catch (e) {
    console.error('mostrarPortalReservas error:', e);
    showToast('Error: ' + e.message, 'error');
    document.getElementById('loader').style.display = 'none';
  }
}

// ── UI: MOSTRAR FIDELIZACIÓN ──────────────────────────────────

function mostrarFidelizacion(perfil) {
  const banner = document.getElementById('fidelizacion-banner');
  const nivelEl = document.getElementById('nivel-fidelizacion');
  const puntosEl = document.getElementById('puntos-fidelizacion');
  const visitasEl = document.getElementById('total-visitas');
  const gastadoEl = document.getElementById('total-gastado');

  if (perfil.total_visitas > 0) {
    banner.style.display = 'block';
  }

  nivelEl.textContent = perfil.nivel || 'Bronce';
  puntosEl.textContent = (perfil.puntos || 0).toLocaleString('es-CL');
  visitasEl.textContent = perfil.total_visitas || 0;
  gastadoEl.textContent = `$${(perfil.total_gastado || 0).toLocaleString('es-CL')}`;
}

// ── UI: MOSTRAR RESERVAS ──────────────────────────────────────

function mostrarReservas(reservas) {
  const grid = document.getElementById('reservas-grid');
  const emptyState = document.getElementById('empty-state');

  if (!reservas || reservas.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  grid.innerHTML = reservas.map(res => crearTarjetaReserva(res)).join('');
}

function crearTarjetaReserva(res) {
  const ahora = new Date();
  const citaDate = new Date(`${res.fecha}T${res.horaInicio}:00`);
  const esPasada = citaDate < ahora;
  const puedeCancelar = !esPasada && res.estado === 'Pagada' && (citaDate - ahora) > 24 * 60 * 60 * 1000;
  const estadoClass = `status-${res.estado.toLowerCase()}`;

  return `
    <div class="reserva-card ${esPasada ? 'expired' : ''}">
      <div class="reserva-header">
        <div>
          <div class="reserva-service">${escapeHtml(res.servicioNombre)}</div>
          <span class="reserva-status ${estadoClass}">${res.estado}</span>
        </div>
      </div>
      <div class="reserva-detail">
        <span class="reserva-detail-label">Especialista:</span>
        <span>${escapeHtml(res.empleadoNombre)}</span>
      </div>
      <div class="reserva-detail">
        <span class="reserva-detail-label">Fecha:</span>
        <span>${formatFecha(res.fecha)}</span>
      </div>
      <div class="reserva-detail">
        <span class="reserva-detail-label">Hora:</span>
        <span>${res.horaInicio} – ${res.horaFin}</span>
      </div>
      <div class="reserva-price">$${(res.precio || 0).toLocaleString('es-CL')} CLP</div>
      <div class="reserva-actions">
        <button class="btn-small btn-ghost" onclick="descargarComprobante('${res.id}')" title="Descargar comprobante">
          📄 Comprobante
        </button>
        ${puedeCancelar ? `
          <button class="btn-small btn-cancel" onclick="iniciarCancelacion('${res.id}')">
            ❌ Cancelar
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// ── FILTROS ───────────────────────────────────────────────────

function cargarServicios(reservas) {
  // Obtener lista única de servicios
  const servicios = [...new Set(reservas.map(r => r.servicioNombre).filter(Boolean))].sort();

  const select = document.getElementById('filter-servicio');
  servicios.forEach(servicio => {
    const option = document.createElement('option');
    option.value = servicio;
    option.textContent = servicio;
    select.appendChild(option);
  });
}

function aplicarFiltros() {
  const estado = document.getElementById('filter-estado').value;
  const servicio = document.getElementById('filter-servicio').value;
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value;

  let filtradas = allReservas;

  // Filtrar por estado
  if (estado) {
    filtradas = filtradas.filter(r => r.estado === estado);
  }

  // Filtrar por servicio
  if (servicio) {
    filtradas = filtradas.filter(r => r.servicioNombre === servicio);
  }

  // Filtrar por fecha desde
  if (desde) {
    filtradas = filtradas.filter(r => r.fecha >= desde);
  }

  // Filtrar por fecha hasta
  if (hasta) {
    filtradas = filtradas.filter(r => r.fecha <= hasta);
  }

  mostrarReservas(filtradas);

  if (filtradas.length === 0) {
    showToast('No hay reservas que coincidan con los filtros', 'warning');
  } else {
    showToast(`Se encontraron ${filtradas.length} reserva${filtradas.length !== 1 ? 's' : ''}`, 'success');
  }
}

function limpiarFiltros() {
  document.getElementById('filter-estado').value = '';
  document.getElementById('filter-servicio').value = '';
  document.getElementById('filter-desde').value = '';
  document.getElementById('filter-hasta').value = '';

  mostrarReservas(allReservas);
  showToast('Filtros limpios', 'success');
}

// ── ACCIONES ──────────────────────────────────────────────────

function descargarComprobante(reservaID) {
  const res = allReservas.find(r => r.id === reservaID);
  if (!res) { showToast('Reserva no encontrada', 'error'); return; }
  descargarPDFComprobante(res);
}

async function iniciarCancelacion(reservaID) {
  if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?\n\nNo podrás recuperar el horario.')) {
    return;
  }

  try {
    showLoaderMini(true);
    const res = await ClienteAPI.cancelarReserva(reservaID);
    showLoaderMini(false);

    if (res.ok) {
      showToast('Reserva cancelada exitosamente', 'success');
      // Recargar reservas
      await mostrarPortalReservas();
    } else {
      showToast('Error: ' + res.error, 'error');
    }
  } catch (e) {
    showLoaderMini(false);
    showToast('Error: ' + e.message, 'error');
  }
}

async function cerrarSesion() {
  if (!confirm('¿Deseas cerrar sesión?')) {
    return;
  }

  try {
    const res = await ClienteAPI.logout();
    if (res.ok) {
      currentUser = null;
      mostrarLoginForm();
      showToast('Sesión cerrada', 'success');
    } else {
      showToast('Error al cerrar sesión', 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ── UTILS ──────────────────────────────────────────────────────

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, c => map[c]);
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '';
  try {
    const [year, month, day] = fechaStr.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  } catch {
    return fechaStr;
  }
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showLoaderMini(show) {
  const loader = document.getElementById('loader');
  loader.style.display = show ? 'block' : 'none';
}

// ── EVENT LISTENERS ────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-google-login').addEventListener('click', async () => {
    const btn = document.getElementById('btn-google-login');
    btn.disabled = true;
    btn.textContent = '⏳ Conectando...';

    const res = await ClienteAPI.loginGoogle();
    if (!res.ok) {
      showToast('Error: ' + res.error, 'error');
      btn.disabled = false;
      btn.textContent = '🔐 Iniciar sesión con Google';
    }
  });

  // Inicializar
  initCliente();
});

// CSS adicional para animación
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
  #btn-google-login:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
document.head.appendChild(style);
