/* ================================================================
   BELLEZA INTEGRAL — calendar.gs
   Crea y elimina eventos en Google Calendar.
   ================================================================ */

function crearEventoCalendar(p) {
  try {
    var cal = CalendarApp.getCalendarById(CALENDAR_ID)
           || CalendarApp.getDefaultCalendar();

    var parts = String(p.fecha||"").split("-");
    var base  = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));

    var pI = String(p.horaInicio||"09:00").split(":");
    var pF = String(p.horaFin   ||"10:00").split(":");

    var inicio = new Date(base); inicio.setHours(parseInt(pI[0]), parseInt(pI[1]), 0, 0);
    var fin    = new Date(base); fin.setHours(parseInt(pF[0]),   parseInt(pF[1]), 0, 0);

    var titulo = "✨ " + (p.servicioNombre||"") + " — " + (p.nombre||"");
    var desc   =
      "📋 Reserva: " + (p.reservaID||"") + "\n" +
      "👤 Cliente: " + (p.nombre||"") + "\n" +
      "📧 Email: "   + (p.email||"") + "\n" +
      "📞 Tel: "     + (p.telefono||"N/A") + "\n" +
      "✨ Servicio: " + (p.servicioNombre||"") + "\n" +
      "💆 Especialista: " + (p.empleadoNombre||"") + "\n" +
      "💰 Precio: $" + parseFloat(p.precio||0).toLocaleString("es-CL") + "\n" +
      (p.notas ? "📝 Notas: " + p.notas : "");

    var evento = cal.createEvent(titulo, inicio, fin, {
      description: desc,
      location:    NEGOCIO_DIR,
      guests:      p.email,
      sendInvites: true,
    });

    log("INFO","crearEventoCalendar",p.reservaID||"",p.nombre||"",{ eventoID: evento.getId() },"");
    return evento.getId();
  } catch(e) {
    log("ERROR","crearEventoCalendar",p.reservaID||"",p.nombre||"",{},e.message);
    return "";
  }
}

function eliminarEventoCalendar(eventID) {
  if (!eventID) return;
  try {
    var cal    = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    var evento = cal.getEventById(eventID);
    if (evento) evento.deleteEvent();
  } catch(e) {
    log("ERROR","eliminarEventoCalendar","","",{ eventID: eventID },e.message);
  }
}
