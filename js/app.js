/* ================================================================
   Belleza Integral — js/app.js
   ================================================================ */

const _sessionToken = Math.random().toString(36).slice(2) + Date.now().toString(36);

const state = {
  servicios:     [],
  empleados:     [],
  servicioSel:   null,
  slotSel:       null,
  fechaSel:      null,
  disponibilidad: {},
  bloqueoID:     null,
};

// ── SANITIZACIÓN ──────────────────────────────────────────────
function sanitizar(valor, maxLen = 300) {
  if (typeof valor !== 'string') return '';
  return valor.trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .slice(0, maxLen);
}

function sanitizarTelefono(valor) {
  return String(valor || '').trim().replace(/[^0-9+\s\-]/g, '').slice(0, 20);
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  aplicarLogo();
  mostrarLoader(true, 'Cargando servicios…');
  try {
    const [srv, emp] = await Promise.all([API.getServicios(), API.getEmpleados()]);
    state.servicios = Array.isArray(srv) ? srv : [];
    state.empleados = Array.isArray(emp) ? emp : [];
    renderServiciosDropdown();
    renderEmpleadosFiltro();
  } catch (e) {
    mostrarError('Error al cargar datos. Recarga la página.');
  } finally {
    mostrarLoader(false);
  }
  renderCalendario('calendario');
  escucharEventos();
});

// ── LOGO ──────────────────────────────────────────────────────
function aplicarLogo() {
  if (!LOGO_URL) return;
  const navLogo = document.getElementById('nav-logo');
  if (navLogo) {
    navLogo.innerHTML = `<img src="${LOGO_URL}" alt="${NEGOCIO_NOMBRE}"
      style="height:38px;width:38px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)">`;
  }
  ['sidebar-logo', 'footer-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<img src="${LOGO_URL}" alt="${NEGOCIO_NOMBRE}"
      style="height:52px;border-radius:10px;object-fit:contain">`;
  });
}

// ── SERVICIOS DROPDOWN ────────────────────────────────────────
function renderServiciosDropdown() {
  const cont = document.getElementById('servicios-grid');
  if (!cont) return;

  if (!state.servicios.length) {
    cont.innerHTML = '<p style="color:var(--hint);padding:20px;text-align:center">Sin servicios disponibles</p>';
    return;
  }

  // Agrupar por categoría
  const cats = {};
  state.servicios.forEach(s => {
    if (!cats[s.categoria]) cats[s.categoria] = [];
    cats[s.categoria].push(s);
  });

  // Construir optgroups
  let opciones = '<option value="">— Elige un servicio —</option>';
  Object.entries(cats).forEach(([cat, svs]) => {
    opciones += `<optgroup label="${cat}">`;
    svs.forEach(s => {
      const durStr = s.duracion >= 60
        ? `${Math.floor(s.duracion / 60)}h${s.duracion % 60 ? ' ' + s.duracion % 60 + 'min' : ''}`
        : `${s.duracion} min`;
      opciones += `<option value="${s.id}">
        ${s.nombre} · ${durStr} · $${s.precio.toLocaleString('es-CL')}
      </option>`;
    });
    opciones += '</optgroup>';
  });

  cont.innerHTML = `
    <div class="servicio-select-wrap">
      <select class="servicio-select" id="servicio-sel" onchange="seleccionarServicioDropdown(this.value)">
        ${opciones}
      </select>
    </div>
    <div class="servicio-info-card" id="servicio-info" style="display:none"></div>
  `;

  // Restaurar selección previa
  if (state.servicioSel) {
    const sel = document.getElementById('servicio-sel');
    if (sel) sel.value = state.servicioSel.id;
    renderServicioInfo(state.servicioSel);
  }
}

function seleccionarServicioDropdown(servicioID) {
  const srv = state.servicios.find(s => s.id === servicioID);
  state.servicioSel = srv || null;
  state.slotSel     = null;

  if (srv) {
    renderServicioInfo(srv);
    if (state.fechaSel) cargarDisponibilidad();
    actualizarResumen();
    document.getElementById('paso-fecha')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    const infoCard = document.getElementById('servicio-info');
    if (infoCard) infoCard.style.display = 'none';
    actualizarResumen();
  }
}

function renderServicioInfo(srv) {
  const infoCard = document.getElementById('servicio-info');
  if (!infoCard) return;

  const durStr = srv.duracion >= 60
    ? `${Math.floor(srv.duracion / 60)}h${srv.duracion % 60 ? ' ' + srv.duracion % 60 + 'min' : ''}`
    : `${srv.duracion} min`;

  const sesTag = srv.esSesion
    ? `<span class="srv-sesion">📅 ${srv.maxSesiones} sesiones</span>` : '';
  const skTag  = srv.requiereSkill
    ? `<span class="srv-skill">${srv.requiereSkill}</span>` : '';

  infoCard.innerHTML = `
    <div class="srv-info-inner">
      <div class="srv-info-nombre">${srv.nombre} ${sesTag} ${skTag}</div>
      <div class="srv-info-detalles">
        <span class="srv-duracion">⏱ ${durStr}</span>
        <span class="srv-precio">$${srv.precio.toLocaleString('es-CL')}</span>
      </div>
    </div>
  `;
  infoCard.style.display = 'block';
}

// ── FILTRO EMPLEADOS ──────────────────────────────────────────
function renderEmpleadosFiltro() {
  const cont = document.getElementById('empleados-filtro');
  if (!cont) return;

  let html = `<button class="emp-filtro-btn emp-filtro-btn--all activo"
    onclick="filtrarEmpleado(null,this)">Todos</button>`;
  state.empleados.forEach(e => {
    html += `<button class="emp-filtro-btn" style="border-color:${e.color}"
      onclick="filtrarEmpleado('${e.id}',this)">${e.nombre}</button>`;
  });
  cont.innerHTML = html;
}

let filtroEmpActivo = null;

function filtrarEmpleado(empID, btn) {
  document.querySelectorAll('.emp-filtro-btn').forEach(b => b.classList.remove('activo'));
  btn.classList.add('activo');
  filtroEmpActivo = empID;
  renderSlotsActuales();
}

// ── DISPONIBILIDAD ────────────────────────────────────────────
async function cargarDisponibilidad() {
  if (!state.servicioSel || !state.fechaSel) return;

  mostrarLoader(true, 'Buscando horarios disponibles…');
  try {
    const data = await API.getDisponibilidad(state.fechaSel, state.servicioSel.id);
    state.disponibilidad = (data && data.empleados) ? data.empleados : {};
    renderSlotsActuales();
  } catch (e) {
    mostrarError('Error al cargar disponibilidad.');
    state.disponibilidad = {};
    renderSlotsActuales();
  } finally {
    mostrarLoader(false);
  }
}

function renderSlotsActuales() {
  let empleados = { ...state.disponibilidad };
  if (filtroEmpActivo && empleados[filtroEmpActivo]) {
    empleados = { [filtroEmpActivo]: empleados[filtroEmpActivo] };
  } else if (filtroEmpActivo) {
    empleados = {};
  }
  renderSlots('slots-container', empleados);
}

// ── EVENTOS ───────────────────────────────────────────────────
function escucharEventos() {
  document.addEventListener('fechaSeleccionada', e => {
    state.fechaSel = e.detail.fecha;
    state.slotSel  = null;

    const el = document.getElementById('fecha-display');
    if (el) el.textContent = _formatFecha(state.fechaSel);

    actualizarResumen();
    if (state.servicioSel) cargarDisponibilidad();
    else mostrarError('Selecciona un servicio primero.');
  });

  document.addEventListener('slotSeleccionado', async e => {
    const { empleadoID, empleadoNombre, horaInicio, horaFin } = e.detail;

    // Liberar bloqueo anterior si quedó pendiente
    if (state.bloqueoID) {
      API.liberarBloqueo(state.bloqueoID).catch(() => {});
      state.bloqueoID = null;
    }

    state.slotSel   = { empleadoID, empleadoNombre, horaInicio, horaFin };
    filtroEmpActivo = empleadoID;
    actualizarResumen();
    if (typeof playSound === 'function') playSound('snd-select');
    abrirModalReserva();

    // Bloquear slot en segundo plano (no bloquea la UI)
    try {
      const r = await API.bloquearSlot(empleadoID, state.fechaSel, horaInicio, horaFin, _sessionToken);
      if (r?.ok) state.bloqueoID = r.id;
    } catch (_) {}
  });
}

// ── RESUMEN LATERAL ───────────────────────────────────────────
function actualizarResumen() {
  const el = document.getElementById('resumen-seleccion');
  if (!el) return;

  if (!state.servicioSel && !state.fechaSel) {
    el.innerHTML = '<p class="resumen-placeholder">Selecciona un servicio y fecha para continuar.</p>';
    return;
  }

  let html = '<div class="resumen-items">';

  if (state.servicioSel) {
    html += `
      <div class="resumen-item"><span>✨ Servicio</span><strong>${state.servicioSel.nombre}</strong></div>
      <div class="resumen-item"><span>⏱ Duración</span><strong>${state.servicioSel.duracion} min</strong></div>
      <div class="resumen-item"><span>💰 Precio</span><strong>$${state.servicioSel.precio.toLocaleString('es-CL')}</strong></div>`;
  }
  if (state.fechaSel) {
    html += `<div class="resumen-item"><span>📅 Fecha</span><strong>${_formatFecha(state.fechaSel)}</strong></div>`;
  }
  if (state.slotSel) {
    html += `
      <div class="resumen-item"><span>🕐 Hora</span><strong>${state.slotSel.horaInicio}</strong></div>
      <div class="resumen-item"><span>💆 Especialista</span><strong>${state.slotSel.empleadoNombre}</strong></div>`;
  }

  html += '</div>';

  if (state.servicioSel && state.fechaSel && state.slotSel) {
    html += `<button class="btn-reservar" onclick="abrirModalReserva()">
      Confirmar Reserva →
    </button>`;
  } else if (state.servicioSel && state.fechaSel && !state.slotSel) {
    html += `<p style="font-size:12px;color:var(--hint);margin-top:12px;text-align:center">
      👆 Elige un horario disponible arriba
    </p>`;
  }

  el.innerHTML = html;
}

// ── MODAL ─────────────────────────────────────────────────────
function abrirModalReserva() {
  if (!state.servicioSel || !state.fechaSel || !state.slotSel) {
    mostrarError('Selecciona servicio, fecha y hora primero.');
    return;
  }

  document.getElementById('modal-srv').textContent     = state.servicioSel.nombre;
  document.getElementById('modal-barbero').textContent = state.slotSel.empleadoNombre;
  document.getElementById('modal-fecha').textContent   = _formatFecha(state.fechaSel);
  document.getElementById('modal-hora').textContent    = `${state.slotSel.horaInicio} — ${state.slotSel.horaFin}`;
  document.getElementById('modal-precio').textContent  = `$${state.servicioSel.precio.toLocaleString('es-CL')} CLP`;

  const sesionGroup = document.getElementById('sesion-group');
  if (state.servicioSel.esSesion && sesionGroup) {
    sesionGroup.style.display = 'block';
    const sel = document.getElementById('sesion-num');
    sel.innerHTML = '';
    for (let i = 1; i <= state.servicioSel.maxSesiones; i++) {
      sel.innerHTML += `<option value="${i}">Sesión ${i} de ${state.servicioSel.maxSesiones}</option>`;
    }
  } else if (sesionGroup) {
    sesionGroup.style.display = 'none';
  }

  ['inp-nombre', 'inp-email', 'inp-tel', 'inp-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Limpiar validación previa
  const emailInput = document.getElementById('inp-email');
  if (emailInput) emailInput.style.borderColor = '';

  document.getElementById('modal-reserva').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modal-reserva').classList.remove('open');
  if (state.bloqueoID) {
    API.liberarBloqueo(state.bloqueoID).catch(() => {});
    state.bloqueoID = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-reserva')?.addEventListener('click', function (e) {
    if (e.target === this) cerrarModal();
  });

  // Validación en tiempo real del email
  document.getElementById('inp-email')?.addEventListener('input', function () {
    const val = this.value.trim();
    const btn = document.querySelector('.btn-confirmar');
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      this.style.borderColor = '#f87171';
      if (btn) btn.disabled = true;
    } else {
      this.style.borderColor = '';
      if (btn) btn.disabled = false;
    }
  });
});

// ── CONFIRMAR RESERVA ─────────────────────────────────────────
async function confirmarReserva() {
  const nombre = sanitizar(document.getElementById('inp-nombre')?.value || '', 100);
  const email  = sanitizar(document.getElementById('inp-email')?.value  || '', 100).toLowerCase();
  const tel    = sanitizarTelefono(document.getElementById('inp-tel')?.value  || '');
  const notas  = sanitizar(document.getElementById('inp-notas')?.value  || '', 500);
  const sesion = document.getElementById('sesion-num')?.value || 1;

  if (!nombre || nombre.length < 2) { mostrarError('Ingresa tu nombre completo.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mostrarError('Email inválido.'); return; }

  const payload = {
    nombre, email,
    telefono:   tel,
    servicioID: state.servicioSel.id,
    empleadoID: state.slotSel.empleadoID,
    fecha:      state.fechaSel,
    horaInicio: state.slotSel.horaInicio,
    notas,
    sesionNum:  parseInt(sesion),
    bloqueoID:  state.bloqueoID || undefined,
  };

  mostrarLoader(true, 'Confirmando tu reserva…');
  try {
    const res = await API.crearReserva(payload);
    mostrarLoader(false);

    if (res.ok) {
      state.bloqueoID = null; // Limpiar antes de cerrar modal (evita liberar el bloqueo ya reemplazado)
      cerrarModal();
      mostrarConfirmacion(res.reservaID, res.reserva);
      if (typeof playSound === 'function') playSound('snd-confirm');
      cargarDisponibilidad();
    } else {
      mostrarError(res.error || 'Error al crear la reserva. Intenta de nuevo.');
    }
  } catch (e) {
    mostrarLoader(false);
    mostrarError('Error de conexión. Intenta de nuevo.');
  }
}

// ── CONFIRMACIÓN ──────────────────────────────────────────────
function mostrarConfirmacion(reservaID, reserva) {
  const reservasScreen = document.getElementById('reservas-screen');
  const confScreen     = document.getElementById('confirmacion-screen');
  if (!confScreen) return;

  if (reservasScreen) reservasScreen.style.display = 'none';
  confScreen.style.display = 'block';

  document.getElementById('conf-id').textContent      = reservaID;
  document.getElementById('conf-nombre').textContent  = reserva?.nombre || '';
  document.getElementById('conf-srv').textContent     = reserva?.servicioNombre || '';
  document.getElementById('conf-barbero').textContent = reserva?.empleadoNombre || '';
  document.getElementById('conf-fecha').textContent   = _formatFecha(reserva?.fecha) || '';
  document.getElementById('conf-hora').textContent    = reserva?.horaInicio || '';

  // Botón WhatsApp con mensaje pre-llenado
  const waBtn = document.getElementById('conf-wa-btn');
  if (waBtn) {
    const fechaFmt  = _formatFecha(reserva?.fecha) || reserva?.fecha || '';
    const srvNombre = reserva?.servicioNombre || 'mi servicio';
    const hora      = reserva?.horaInicio || '';
    const waMsg = encodeURIComponent(
      `Hola! Acabo de reservar en *Belleza Integral*.\n` +
      `🔖 N° de reserva: *${reservaID}*\n` +
      `✨ Servicio: *${srvNombre}*\n` +
      `📅 Fecha: *${fechaFmt}* a las *${hora}*\n\n` +
      `Adjunto mi comprobante de pago.`
    );
    waBtn.href = `https://wa.me/56964364128?text=${waMsg}`;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nuevaReserva() {
  const reservasScreen = document.getElementById('reservas-screen');
  const confScreen     = document.getElementById('confirmacion-screen');
  if (reservasScreen) reservasScreen.style.display = 'block';
  if (confScreen)     confScreen.style.display = 'none';

  state.slotSel     = null;
  state.fechaSel    = null;
  state.servicioSel = null;
  filtroEmpActivo   = null;

  actualizarResumen();
  renderServiciosDropdown();
  renderCalendario('calendario');
}

// ── HELPERS ───────────────────────────────────────────────────
function mostrarLoader(show, txt) {
  const el = document.getElementById('loader');
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';
  const txtEl = document.getElementById('loader-txt');
  if (txtEl && txt) txtEl.textContent = txt;
}

function mostrarError(msg) {
  const el = document.getElementById('toast-error');
  if (!el) return;
  el.textContent = '❌ ' + msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 4000);
}

function _formatFecha(str) {
  if (!str) return '';
  const dias  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const f = new Date(str + 'T12:00:00');
  return `${dias[f.getDay()]} ${f.getDate()} de ${meses[f.getMonth()]} ${f.getFullYear()}`;
}
