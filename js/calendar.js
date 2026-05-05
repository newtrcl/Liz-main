/* ================================================================
   BARBERÍA PRO — js/calendar.js
   Vista de calendario y selector de slots
   ================================================================ */

let calState = {
  fechaSeleccionada: null,
  mesActual:         new Date(),
  disponibilidad:    {}
};

// ── MINI CALENDARIO ───────────────────────────────────────────
function renderCalendario(containerId) {
  const cont  = document.getElementById(containerId);
  const year  = calState.mesActual.getFullYear();
  const month = calState.mesActual.getMonth();
  const hoy   = new Date(); hoy.setHours(0,0,0,0);

  const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const primerDia  = new Date(year, month, 1).getDay();
  const diasMes    = new Date(year, month+1, 0).getDate();

  let html = `
    <div class="cal-header">
      <button class="cal-nav" onclick="calNavMes(-1)">‹</button>
      <span class="cal-titulo">${meses[month]} ${year}</span>
      <button class="cal-nav" onclick="calNavMes(1)">›</button>
    </div>
    <div class="cal-grid">
      ${diasSemana.map(d => `<div class="cal-dia-nombre">${d}</div>`).join('')}
  `;

  // Espacios vacíos al inicio
  for (let i = 0; i < primerDia; i++) html += '<div></div>';

  for (let d = 1; d <= diasMes; d++) {
    const fecha    = new Date(year, month, d);
    fecha.setHours(0,0,0,0);
    const fechaStr = _fechaToStr(fecha);
    const esPasado = fecha < hoy;
    const esDom    = fecha.getDay() === 0;
    const esSel    = fechaStr === calState.fechaSeleccionada;

    let cls = 'cal-dia';
    if (esPasado || esDom) cls += ' cal-dia--disabled';
    else                   cls += ' cal-dia--activo';
    if (esSel)             cls += ' cal-dia--seleccionado';

    const onclick = (!esPasado && !esDom)
      ? `onclick="seleccionarFecha('${fechaStr}')"`
      : '';
    html += `<div class="${cls}" ${onclick}>${d}</div>`;
  }

  html += '</div>';
  cont.innerHTML = html;
}

function calNavMes(delta) {
  calState.mesActual.setMonth(calState.mesActual.getMonth() + delta);
  renderCalendario('calendario');
}

function seleccionarFecha(fecha) {
  calState.fechaSeleccionada = fecha;
  renderCalendario('calendario');
  // Disparar evento para que app.js cargue la disponibilidad
  document.dispatchEvent(new CustomEvent('fechaSeleccionada', { detail: { fecha } }));
}

// ── GRID DE SLOTS ─────────────────────────────────────────────
function renderSlots(containerId, empleados, onSlotClick) {
  const cont = document.getElementById(containerId);
  if (!empleados || !Object.keys(empleados).length) {
    cont.innerHTML = '<p class="slots-vacio">Selecciona un servicio y fecha para ver disponibilidad.</p>';
    return;
  }

  let html = '<div class="slots-wrapper">';

  Object.values(empleados).forEach(emp => {
    if (!emp.hayDisponibilidad) return;
    html += `
      <div class="slots-barbero">
        <div class="slots-barbero-header" style="border-color:${emp.empleado.color}">
          <div class="slots-barbero-avatar" style="background:${emp.empleado.color}">
            ${emp.empleado.nombre.charAt(0)}
          </div>
          <div>
            <div class="slots-barbero-nombre">${emp.empleado.nombre}</div>
            <div class="slots-barbero-skills">${emp.empleado.skills.join(', ') || 'Servicios de belleza'}</div>
          </div>
        </div>
        <div class="slots-horas">
    `;

    const libres = emp.slots.filter(s => s.disponible);
    if (!libres.length) {
      html += '<p class="slots-sin-horas">Sin disponibilidad este día</p>';
    } else {
      libres.forEach(slot => {
        html += `
          <button class="slot-btn" onclick="slotClick('${emp.empleado.id}','${emp.empleado.nombre}','${slot.horaInicio}','${slot.horaFin}')">
            ${slot.horaInicio}
          </button>
        `;
      });
    }

    html += '</div></div>';
  });

  html += '</div>';
  cont.innerHTML = html;
}

// Función global llamada desde el HTML generado
function slotClick(empleadoID, empleadoNombre, horaInicio, horaFin) {
  document.dispatchEvent(new CustomEvent('slotSeleccionado', {
    detail: { empleadoID, empleadoNombre, horaInicio, horaFin }
  }));
}

// ── AGENDA DIARIA (para el dashboard) ────────────────────────
function renderAgendaDia(containerId, reservas, empleados) {
  const cont = document.getElementById(containerId);
  if (!reservas || !reservas.length) {
    cont.innerHTML = '<p class="agenda-vacia">No hay reservas para este día.</p>';
    return;
  }

  // Agrupar por empleado
  const porEmpleado = {};
  empleados.forEach(e => { porEmpleado[e.id] = { emp: e, reservas: [] }; });
  reservas.forEach(r => {
    if (porEmpleado[r.empleadoID]) porEmpleado[r.empleadoID].reservas.push(r);
  });

  // Horas del día
  const horas = [];
  for (let h = 9; h < 20; h++) horas.push(h);

  let html = `
    <div class="agenda-container">
      <div class="agenda-timeline">
        ${horas.map(h => `<div class="agenda-hora">${h}:00</div>`).join('')}
      </div>
      <div class="agenda-columnas">
  `;

  Object.values(porEmpleado).forEach(({ emp, reservas: rsv }) => {
    html += `
      <div class="agenda-col">
        <div class="agenda-col-header" style="background:${emp.color}">
          ${emp.nombre}
        </div>
        <div class="agenda-col-body" style="position:relative;height:${horas.length*60}px">
    `;

    rsv.forEach(r => {
      const top    = (_horaAMin(r.horaInicio) - 9*60);
      const height = r.duracion;
      const color  = _colorEstado(r.estado);
      html += `
        <div class="agenda-evento" style="top:${top}px;height:${height}px;background:${color};border-left:3px solid ${emp.color}"
             onclick="verDetalleReserva('${r.id}')">
          <div class="agenda-evento-hora">${r.horaInicio}</div>
          <div class="agenda-evento-nombre">${r.nombre}</div>
          <div class="agenda-evento-srv">${r.servicioNombre}</div>
        </div>
      `;
    });

    html += '</div></div>';
  });

  html += '</div></div>';
  cont.innerHTML = html;
}

// ── HELPERS ───────────────────────────────────────────────────
function _fechaToStr(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth()+1).padStart(2,'0');
  const d = String(fecha.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function _horaAMin(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h*60 + m;
}

function _colorEstado(estado) {
  const map = {
    'Confirmada': '#D1FAE5',
    'Completada': '#DBEAFE',
    'Cancelada':  '#FEE2E2',
    'Pendiente':  '#FEF3C7'
  };
  return map[estado] || '#F3F4F6';
}
