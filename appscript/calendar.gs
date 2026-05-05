/* ================================================================
   BARBERÍA PRO — 4_calendar.gs
   Integración con Google Calendar
   ================================================================ */

/**
 * Crea un evento en Google Calendar para la reserva.
 * @returns {string} ID del evento creado
 */
function crearEventoCalendar(reserva, servicio) {
  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID)
                || CalendarApp.getDefaultCalendar();

    var fechaObj   = new Date(reserva.fecha + "T00:00:00");
    var partsI     = reserva.horaInicio.split(":");
    var partsF     = reserva.horaFin.split(":");

    var inicio = new Date(fechaObj);
    inicio.setHours(parseInt(partsI[0]), parseInt(partsI[1]), 0, 0);

    var fin = new Date(fechaObj);
    fin.setHours(parseInt(partsF[0]), parseInt(partsF[1]), 0, 0);

    var sesionInfo = servicio.esSesion
      ? " (Sesión " + reserva.sesionNum + "/" + reserva.sesionesTotales + ")"
      : "";

    var titulo = "✨ " + reserva.servicioNombre + sesionInfo +
                 " — " + reserva.nombre;

    var descripcion =
      "📋 Reserva: " + reserva.id + "\n" +
      "👤 Cliente: " + reserva.nombre + "\n" +
      "📧 Email: "   + reserva.email  + "\n" +
      "📞 Tel: "     + (reserva.telefono||"N/A") + "\n" +
      "✨ Servicio: " + reserva.servicioNombre + sesionInfo + "\n" +
      "💆 Especialista: "  + reserva.empleadoNombre + "\n" +
      "💰 Precio: $"  + (reserva.precio||0).toLocaleString("es-CL") + "\n" +
      (reserva.notas ? "📝 Notas: " + reserva.notas : "");

    var evento = calendar.createEvent(titulo, inicio, fin, {
      description: descripcion,
      location:    NEGOCIO_DIR,
      guests:      reserva.email,
      sendInvites: true
    });

    log("INFO","crearEventoCalendar",reserva.id,reserva.nombre,
        { eventoID: evento.getId() },"");

    return evento.getId();
  } catch(e) {
    log("ERROR","crearEventoCalendar",reserva.id,reserva.nombre,{},"Calendar: "+e.message);
    return "";
  }
}

/**
 * Elimina el evento de Calendar al cancelar la reserva.
 */
function eliminarEventoCalendar(eventID) {
  if (!eventID) return;
  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID)
                || CalendarApp.getDefaultCalendar();
    var evento = calendar.getEventById(eventID);
    if (evento) {
      evento.deleteEvent();
      log("INFO","eliminarEventoCalendar","","",{ eventID },"");
    }
  } catch(e) {
    log("ERROR","eliminarEventoCalendar","","",{ eventID },"Calendar: "+e.message);
  }
}

/**
 * Obtiene los eventos del calendario para un día específico.
 * Útil para el dashboard admin.
 */
function getEventosCalendarPorFecha(fecha) {
  try {
    var calendar  = CalendarApp.getCalendarById(CALENDAR_ID)
                 || CalendarApp.getDefaultCalendar();
    var fechaObj  = new Date(fecha + "T00:00:00");
    var finDia    = new Date(fecha + "T23:59:59");
    var eventos   = calendar.getEvents(fechaObj, finDia);

    return eventos.map(function(ev) {
      return {
        id:       ev.getId(),
        titulo:   ev.getTitle(),
        inicio:   Utilities.formatDate(ev.getStartTime(), TZ, "HH:mm"),
        fin:      Utilities.formatDate(ev.getEndTime(),   TZ, "HH:mm"),
        descripcion: ev.getDescription()
      };
    });
  } catch(e) {
    log("ERROR","getEventosCalendarPorFecha","","",{ fecha },"Calendar: "+e.message);
    return [];
  }
}
