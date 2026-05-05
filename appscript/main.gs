/* ================================================================
   BARBERÍA PRO — 6_main.gs
   Router principal, autenticación y menú Sheets
   ================================================================ */

// ── ROUTER ────────────────────────────────────────────────────
function doGet(e) {
  var accion = e ? (e.parameter.accion || "") : "";

  // Endpoint de disponibilidad vía GET (más fácil de consumir)
  if (accion === "getDisponibilidad") {
    var fecha      = e.parameter.fecha;
    var servicioID = e.parameter.servicioID;
    if (!fecha || !servicioID) {
      return jsonOut({ ok:false, error:"Parámetros: fecha, servicioID" });
    }
    return jsonOut(getDisponibilidadCompleta(fecha, servicioID));
  }

  if (accion === "getServicios") return jsonOut(getServicios());
  if (accion === "getEmpleados") return jsonOut(getEmpleados(true));

  if (accion === "getReservasPorDia") {
    var fecha = e.parameter.fecha;
    if (!fecha) return jsonOut({ ok:false, error:"Parámetro: fecha" });
    if (!_esAdmin(e.parameter.token)) return jsonOut({ ok:false, error:"No autorizado" });
    return jsonOut(getReservasPorFecha(fecha));
  }

  if (accion === "getProximasReservas") {
    if (!_esAdmin(e.parameter.token)) return jsonOut({ ok:false, error:"No autorizado" });
    return jsonOut(getProximasReservas(50));
  }

  return jsonOut({ ok:true, servicio:"Belleza Integral API", version:"1.0" });
}

function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var accion = body.accion || "";
    var params = body.params || body;

    switch (accion) {

      case "crearReserva":
        return jsonOut(crearReserva(params.payload || params));

      case "cancelarReserva":
        return jsonOut(cancelarReserva(params.reservaID, params.canceladoPor||"cliente"));

      case "getDisponibilidad":
        return jsonOut(getDisponibilidadCompleta(params.fecha, params.servicioID));

      case "getServicios":
        return jsonOut(getServicios());

      case "getEmpleados":
        return jsonOut(getEmpleados(true));

      // ── Endpoints admin ───────────────────────────────────
      case "getReservasPorDia":
        if (!_esAdmin(body.token)) return jsonOut({ok:false,error:"No autorizado"});
        return jsonOut(getReservasPorFecha(params.fecha));

      case "getProximasReservas":
        if (!_esAdmin(body.token)) return jsonOut({ok:false,error:"No autorizado"});
        return jsonOut(getProximasReservas(params.limite||50));

      case "actualizarEstado":
        if (!_esAdmin(body.token)) return jsonOut({ok:false,error:"No autorizado"});
        return jsonOut({
          ok: actualizarEstadoReserva(params.reservaID, params.estado)
        });

      case "getDashboard":
        if (!_esAdmin(body.token)) return jsonOut({ok:false,error:"No autorizado"});
        return jsonOut(_getDashboardData());

      case "validarAdmin":
        return jsonOut({ ok: _esAdmin(body.token), esAdmin: _esAdmin(body.token) });

      default:
        return jsonOut({ ok:false, error:"Acción desconocida: "+accion });
    }

  } catch(err) {
    log("ERROR","doPost","","",{},"Router: "+err.message);
    return jsonOut({ ok:false, error:err.message });
  }
}

// ── AUTENTICACIÓN ADMIN ───────────────────────────────────────
function _esAdmin(token) {
  // Validación por token (simple, suficiente para este caso)
  return token === API_TOKEN;
}

// ── DASHBOARD DATA ────────────────────────────────────────────
function _getDashboardData() {
  var hoy        = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  var reservasHoy= getReservasPorFecha(hoy);
  var proximas   = getProximasReservas(20);
  var empleados  = getEmpleados(true);
  var servicios  = getServicios();

  // Estadísticas del día
  var stats = {
    totalHoy:       reservasHoy.length,
    confirmadas:    reservasHoy.filter(function(r){return r.estado===ESTADO_CONFIRMADA;}).length,
    completadas:    reservasHoy.filter(function(r){return r.estado===ESTADO_COMPLETADA;}).length,
    canceladas:     reservasHoy.filter(function(r){return r.estado===ESTADO_CANCELADA;}).length,
    ingresoEstimado:reservasHoy
      .filter(function(r){return r.estado!==ESTADO_CANCELADA;})
      .reduce(function(s,r){return s+r.precio;},0)
  };

  return {
    ok:        true,
    fecha:     hoy,
    stats:     stats,
    reservasHoy: reservasHoy,
    proximas:  proximas,
    empleados: empleados,
    servicios: servicios
  };
}

// ── MENÚ SHEETS ───────────────────────────────────────────────
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu("✨ Belleza Integral")
      .addItem("⚙️ Setup completo (primera vez)", "setupCompleto")
      .addSeparator()
      .addItem("📅 Reservas de hoy",              "verReservasHoy")
      .addItem("📋 Próximas reservas",             "verProximasReservas")
      .addSeparator()
      .addItem("❌ Cancelar reserva",              "cancelarDesdeMenu")
      .addItem("✅ Marcar como completada",         "completarDesdeMenu")
      .addSeparator()
      .addItem("📊 Resumen del día",               "resumenDia")
      .addToUi();
  } catch(e) { Logger.log("onOpen: "+e.message); }
}

// ── FUNCIONES DEL MENÚ ────────────────────────────────────────
function verReservasHoy() {
  var ui      = SpreadsheetApp.getUi();
  var hoy     = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  var reservas= getReservasPorFecha(hoy);

  if (!reservas.length) { ui.alert("No hay reservas para hoy."); return; }

  var msg = "📅 Reservas de hoy (" + hoy + "):\n\n";
  reservas.sort(function(a,b){ return a.horaInicio.localeCompare(b.horaInicio); });
  reservas.forEach(function(r) {
    msg += r.horaInicio + " — " + r.empleadoNombre + " | " +
           r.nombre + " | " + r.servicioNombre + " [" + r.estado + "]\n";
  });
  ui.alert(msg);
}

function verProximasReservas() {
  var ui      = SpreadsheetApp.getUi();
  var proximas= getProximasReservas(10);
  if (!proximas.length) { ui.alert("No hay próximas reservas."); return; }
  var msg = "📋 Próximas 10 reservas:\n\n";
  proximas.forEach(function(r) {
    msg += r.fecha + " " + r.horaInicio + " — " + r.nombre +
           " (" + r.servicioNombre + ") con " + r.empleadoNombre + "\n";
  });
  ui.alert(msg);
}

function cancelarDesdeMenu() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("❌ Cancelar Reserva",
    "Ingresa el ID de la reserva (ej: RES-01001):", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var id  = res.getResponseText().trim().toUpperCase();
  var r   = cancelarReserva(id, "admin");
  ui.alert(r.ok ? "✅ Reserva " + id + " cancelada." : "❌ " + r.error);
}

function completarDesdeMenu() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("✅ Marcar como Completada",
    "Ingresa el ID de la reserva:", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var id  = res.getResponseText().trim().toUpperCase();
  var ok  = actualizarEstadoReserva(id, ESTADO_COMPLETADA);
  ui.alert(ok ? "✅ Reserva marcada como completada." : "❌ Reserva no encontrada.");
}

function resumenDia() {
  var ui      = SpreadsheetApp.getUi();
  var data    = _getDashboardData();
  var s       = data.stats;
  ui.alert(
    "📊 Resumen del Día — " + data.fecha + "\n\n" +
    "Total reservas: "  + s.totalHoy + "\n" +
    "✅ Confirmadas: "  + s.confirmadas + "\n" +
    "🏁 Completadas: "  + s.completadas + "\n" +
    "❌ Canceladas: "   + s.canceladas  + "\n" +
    "💰 Ingreso est.: $"+ s.ingresoEstimado.toLocaleString("es-CL") + " CLP"
  );
}
