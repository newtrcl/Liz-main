/* ================================================================
   BELLEZA INTEGRAL — 2_main.gs
   Router HTTP. Solo recibe notificaciones del Worker (POST).
   El Worker es la fuente de verdad; GAS hace email+Calendar+Sheets.
   ================================================================ */

function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var accion = body.accion || "";

    switch (accion) {
      case "crearReserva":
        return _handleCrearReserva(body.payload || body);
      case "cancelarReserva":
        return _handleCancelarReserva(body.reservaID, body.canceladoPor || "cliente");
      case "actualizarEstado":
        var p = body.params || body;
        return _handleActualizarEstado(p.reservaID, p.estado);
      case "reagendarReserva":
        return _handleReagendar(body);
      default:
        return jsonOut({ ok: false, error: "Acción desconocida: " + accion });
    }
  } catch(err) {
    log("ERROR", "doPost", "", "", {}, "Router: " + err.message);
    return jsonOut({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return jsonOut({ ok: true, servicio: "Belleza Integral GAS", version: "2.0" });
}

// ── HANDLERS ─────────────────────────────────────────────────

function _handleCrearReserva(payload) {
  if (!payload || !payload.email) return jsonOut({ ok: false, error: "Payload vacío" });
  try {
    _logReservaEnSheet(payload);
    crearEventoCalendar(payload);
    enviarConfirmacion(payload);
    notificarAdmin(payload, "nueva");
    notificarSlack(payload, "nueva");
    log("INFO", "crearReserva", payload.reservaID || "", payload.nombre, {}, "GAS OK");
    return jsonOut({ ok: true });
  } catch(e) {
    log("ERROR", "crearReserva", payload.reservaID || "", payload.nombre || "", {}, e.message);
    return jsonOut({ ok: false, error: e.message });
  }
}

function _handleCancelarReserva(reservaID, canceladoPor) {
  try {
    var reserva = _getReservaDeSheet(reservaID);
    if (reserva) {
      enviarCancelacion(reserva);
      notificarAdmin(reserva, "cancelada");
      notificarSlack(reserva, "cancelada");
      _marcarCanceladaEnSheet(reservaID, canceladoPor);
    }
    log("INFO", "cancelarReserva", reservaID || "", "", {}, "GAS OK");
    return jsonOut({ ok: true });
  } catch(e) {
    log("ERROR", "cancelarReserva", reservaID || "", "", {}, e.message);
    return jsonOut({ ok: false, error: e.message });
  }
}

function _handleActualizarEstado(reservaID, estado) {
  try {
    _actualizarEstadoEnSheet(reservaID, estado);
    log("INFO", "actualizarEstado", reservaID || "", "", { estado: estado }, "");
    return jsonOut({ ok: true });
  } catch(e) {
    log("ERROR", "actualizarEstado", reservaID || "", "", {}, e.message);
    return jsonOut({ ok: false, error: e.message });
  }
}

function _handleReagendar(body) {
  try {
    if (body.email) _enviarReagendado(body);
    log("INFO", "reagendarReserva", body.reservaID || "", body.nombre || "", {}, "GAS OK");
    return jsonOut({ ok: true });
  } catch(e) {
    log("ERROR", "reagendarReserva", body.reservaID || "", "", {}, e.message);
    return jsonOut({ ok: false, error: e.message });
  }
}

// ── SHEETS ───────────────────────────────────────────────────

function _logReservaEnSheet(p) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA_RESERVAS);
    if (!sheet) return;
    sheet.appendRow([
      p.reservaID||"", p.nombre||"", p.email||"", p.telefono||"",
      p.servicioNombre||"", p.empleadoNombre||"",
      p.fecha||"", p.horaInicio||"", p.horaFin||"",
      p.precio||0, "Confirmada", p.notas||"", tsNow()
    ]);
  } catch(e) { log("ERROR","_logReservaEnSheet","","",{},e.message); }
}

function _getReservaDeSheet(reservaID) {
  try {
    var data = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA_RESERVAS).getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === reservaID) {
        return { reservaID:data[i][0], nombre:data[i][1], email:data[i][2], telefono:data[i][3],
                 servicioNombre:data[i][4], empleadoNombre:data[i][5],
                 fecha:data[i][6], horaInicio:data[i][7], horaFin:data[i][8], precio:data[i][9] };
      }
    }
  } catch(e) { log("ERROR","_getReservaDeSheet",reservaID,"",{},e.message); }
  return null;
}

function _marcarCanceladaEnSheet(reservaID, canceladoPor) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA_RESERVAS);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === reservaID) { sheet.getRange(i+1,11).setValue("Cancelada"); return; }
    }
  } catch(e) {}
}

function _actualizarEstadoEnSheet(reservaID, estado) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA_RESERVAS);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === reservaID) { sheet.getRange(i+1,11).setValue(estado); return; }
    }
  } catch(e) {}
}

// ── EMAIL REAGENDADO ──────────────────────────────────────────

function _enviarReagendado(body) {
  var html = _xhtmlEnvelope(
    "Cita Reagendada",
    "<p style='font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#374151;margin:0 0 8px'>Hola, <strong>" + _esc(body.nombre) + "</strong>.</p>" +
    "<p style='font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6b7280;margin:0 0 20px'>Tu cita ha sido reagendada exitosamente.</p>" +
    _detalleTabla([
      ["Servicio",    body.servicioNombre || ""],
      ["Nueva Fecha", _fmtFecha(body.nuevaFecha)],
      ["Nueva Hora",  body.nuevaHora || ""],
    ]),
    "#d97706"
  );
  try {
    MailApp.sendEmail({ to:body.email, subject:"📅 Tu cita fue reagendada — "+NEGOCIO_NOMBRE, htmlBody:html, name:NEGOCIO_NOMBRE, replyTo:NEGOCIO_EMAIL });
  } catch(e) { log("ERROR","_enviarReagendado","",body.email,{},e.message); }
}

// ── DIAGNÓSTICO (ejecutar manualmente desde el editor) ────────

function testEnviarCorreo() {
  var html = _xhtmlEnvelope("Test de Correo",
    "<p style='font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#374151;margin:0 0 12px'>" +
    "Correo de prueba enviado el " + Utilities.formatDate(new Date(),TZ,"dd/MM/yyyy 'a las' HH:mm") + ".</p>" +
    "<p style='font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#9ca3af;margin:0'>Desde: " +
    Session.getEffectiveUser().getEmail() + "</p>",
    COLOR_PRIMARY
  );
  MailApp.sendEmail({ to:NEGOCIO_EMAIL, subject:"[TEST] Correo de prueba — "+NEGOCIO_NOMBRE, htmlBody:html, name:NEGOCIO_NOMBRE });
  Logger.log("✅ Test enviado a " + NEGOCIO_EMAIL + " | Cuota restante: " + MailApp.getRemainingDailyQuota());
}

// ── MENÚ ─────────────────────────────────────────────────────

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu("✨ " + NEGOCIO_NOMBRE)
      .addItem("⚙️ Crear hojas", "setupHojas")
      .addSeparator()
      .addItem("📧 Test correo", "testEnviarCorreo")
      .addToUi();
  } catch(e) {}
}

function setupHojas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var crearSiNoExiste = function(nombre, headers, bg) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    else return;
    sh.getRange(1,1,1,headers.length).setValues([headers])
      .setBackground(bg||"#1e1b2e").setFontColor("#fff").setFontWeight("bold");
    sh.setFrozenRows(1);
  };
  crearSiNoExiste(HOJA_RESERVAS, ["ID Reserva","Nombre","Email","Teléfono","Servicio","Especialista","Fecha","Hora Inicio","Hora Fin","Precio","Estado","Notas","Timestamp"], "#1e1b2e");
  crearSiNoExiste(HOJA_LOGS,    ["Timestamp","Nivel","Acción","ReservaID","Cliente","Detalle","Error"], "#374151");
  SpreadsheetApp.getUi().alert("✅ Hojas listas.");
}
