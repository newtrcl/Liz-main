/* ================================================================
   BARBERÍA PRO — 3_disponibilidad.gs
   Lógica de disponibilidad y slots de agenda
   ================================================================ */

/**
 * Retorna los slots disponibles para un empleado en una fecha dada.
 * Considera:
 *  - Horario laboral del empleado ese día
 *  - Reservas ya existentes (bloquea el tiempo ocupado)
 *  - Duración del servicio solicitado
 *
 * @param {string} empleadoID
 * @param {string} fecha       "yyyy-MM-dd"
 * @param {number} duracionMin duración del servicio en minutos
 * @returns {Array} lista de slots { horaInicio, horaFin, disponible }
 */
function getSlotsDisponibles(empleadoID, fecha, duracionMin) {
  try {
    var fechaObj = new Date(fecha + "T00:00:00");
    var diaSemana = fechaObj.getDay(); // 0=Dom ... 6=Sab

    // 1. Verificar horario del empleado ese día
    var horario = _getHorarioEmpleado(empleadoID, diaSemana);
    if (!horario || !horario.disponible) return [];

    // 2. Obtener reservas activas del empleado ese día
    var reservas = getReservasPorEmpleadoFecha(empleadoID, fecha);

    // 3. Calcular minutos actuales si la fecha es hoy (para filtrar pasados)
    var ahoraMin = -1;
    var hoy = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
    if (fecha === hoy) {
      var ahora = new Date();
      // Añadir margen de 30 min: no mostrar slots que empiezan en menos de 30 min
      ahora.setMinutes(ahora.getMinutes() + 30);
      ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    }

    // 4. Generar todos los slots posibles
    var slots     = _generarSlots(horario.horaInicio, horario.horaFin, SLOT_MINUTOS);
    var resultado = [];

    for (var i = 0; i < slots.length; i++) {
      var slot    = slots[i];
      var finSlot = _sumarMinutos(slot, duracionMin);

      // Descartar si el bloque completo no cabe en el horario
      if (_compararHoras(finSlot, horario.horaFin) > 0) break;

      // Descartar horas pasadas (o con menos de 30 min de anticipación) cuando es hoy
      if (ahoraMin >= 0 && _horaAMinutos(slot) < ahoraMin) continue;

      var libre = _slotEsLibre(slot, finSlot, reservas);
      resultado.push({
        horaInicio: slot,
        horaFin:    finSlot,
        disponible: libre
      });
    }

    return resultado;
  } catch(e) {
    log("ERROR","getSlotsDisponibles","","",{empleadoID,fecha,duracionMin},e.message);
    return [];
  }
}

/**
 * Retorna la disponibilidad de todos los empleados para un servicio
 * en una fecha dada. Filtra por skill si el servicio lo requiere.
 */
function getDisponibilidadCompleta(fecha, servicioID) {
  var servicios = getServicios();
  var servicio  = servicios.find(function(s){ return s.id === servicioID; });
  if (!servicio) return { ok:false, error:"Servicio no encontrado" };

  var empleados = getEmpleados(true); // solo activos
  var resultado = {};

  empleados.forEach(function(emp) {
    // Filtrar por skill si el servicio lo requiere
    if (servicio.requiereSkill && servicio.requiereSkill !== "") {
      var tieneSkill = emp.skills.indexOf(servicio.requiereSkill) !== -1;
      if (!tieneSkill) return;
    }

    var slots = getSlotsDisponibles(emp.id, fecha, servicio.duracion);
    resultado[emp.id] = {
      empleado: emp,
      slots:    slots,
      hayDisponibilidad: slots.some(function(s){ return s.disponible; })
    };
  });

  return { ok:true, servicio:servicio, fecha:fecha, empleados:resultado };
}

/**
 * Check puro de disponibilidad — sin lock.
 * Se llama desde dentro de crearReserva() que ya posee el lock.
 */
function _checkSlotDisponible(empleadoID, fecha, horaInicio, duracionMin) {
  var reservas = getReservasPorEmpleadoFecha(empleadoID, fecha);
  var horaFin  = _sumarMinutos(horaInicio, duracionMin);
  var libre    = _slotEsLibre(horaInicio, horaFin, reservas);
  return { disponible: libre, horaFin: horaFin };
}

/**
 * @deprecated — mantener por compatibilidad con llamadas directas.
 * crearReserva() ya no la usa; usa _checkSlotDisponible() con lock propio.
 */
function verificarYReservarSlot(empleadoID, fecha, horaInicio, duracionMin) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    return _checkSlotDisponible(empleadoID, fecha, horaInicio, duracionMin);
  } catch(e) {
    return { disponible: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ── HELPERS PRIVADOS ──────────────────────────────────────────

function _getHorarioEmpleado(empleadoID, diaSemana) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_HORARIOS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === empleadoID && parseInt(data[i][1]) === diaSemana) {
      return {
        horaInicio:  _normalizeHora(data[i][2]),
        horaFin:     _normalizeHora(data[i][3]),
        disponible:  data[i][4] === "SI"
      };
    }
  }
  return null;
}

function _generarSlots(horaInicio, horaFin, intervaloMin) {
  var slots   = [];
  var actual  = horaInicio;
  while (_compararHoras(actual, horaFin) < 0) {
    slots.push(actual);
    actual = _sumarMinutos(actual, intervaloMin);
  }
  return slots;
}

function _slotEsLibre(horaInicioSlot, horaFinSlot, reservas) {
  for (var i = 0; i < reservas.length; i++) {
    var r = reservas[i];
    // Hay conflicto si los rangos se superponen
    if (_compararHoras(horaInicioSlot, r.horaFin)  < 0 &&
        _compararHoras(horaFinSlot,    r.horaInicio) > 0) {
      return false;
    }
  }
  return true;
}

// "09:30" → minutos totales desde medianoche
function _horaAMinutos(hora) {
  // Google Sheets puede entregar la hora como Date, número o string
  if (hora instanceof Date) {
    return hora.getHours() * 60 + hora.getMinutes();
  }
  if (typeof hora === "number") {
    // fracción de día (formato interno de Sheets): 0.375 = 09:00
    var totalMin = Math.round(hora * 24 * 60);
    return totalMin;
  }
  // string "HH:MM" o "H:MM"
  var partes = String(hora).split(":");
  return parseInt(partes[0]) * 60 + parseInt(partes[1]);
}

// minutos → "09:30"
function _minutosAHora(minutos) {
  var h = Math.floor(minutos / 60);
  var m = minutos % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

function _sumarMinutos(hora, minutos) {
  return _minutosAHora(_horaAMinutos(hora) + minutos);
}

function _compararHoras(horaA, horaB) {
  return _horaAMinutos(horaA) - _horaAMinutos(horaB);
}
