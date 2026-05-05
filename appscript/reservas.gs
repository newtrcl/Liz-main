/* ================================================================
   BELLEZA INTEGRAL — 5_reservas.gs
   Lógica de negocio: crear y cancelar reservas
   ================================================================ */

/**
 * Crea una reserva nueva.
 * Proceso:
 *  1. Validar campos obligatorios
 *  2. Verificar que el servicio y empleado existen
 *  3. Validar hora no pasada
 *  4. CHECK + ESCRITURA bajo lock atómico
 *  5. Tareas post-escritura (Calendar, CRM, email, Slack) — aisladas
 */
function crearReserva(payload) {
  // ── 1. Validar ──────────────────────────────────────────────
  var errVal = _validarPayloadReserva(payload);
  if (errVal) return { ok:false, error:errVal };

  // ── 2. Obtener servicio y empleado ───────────────────────────
  var servicios = getServicios();
  var servicio  = servicios.find(function(s){ return s.id===payload.servicioID; });
  if (!servicio) return { ok:false, error:"Servicio no encontrado" };

  var empleados = getEmpleados(true);
  var empleado  = empleados.find(function(e){ return e.id===payload.empleadoID; });
  if (!empleado) return { ok:false, error:"Especialista no encontrada" };

  if (servicio.requiereSkill && empleado.skills.indexOf(servicio.requiereSkill)===-1) {
    return { ok:false, error:"La especialista seleccionada no realiza este servicio" };
  }

  // ── 3. Validar que no sea una hora pasada ────────────────────
  var hoy = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  if (payload.fecha === hoy) {
    var ahora    = new Date();
    var ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    var slotMin  = _horaAMinutos(payload.horaInicio);
    if (slotMin <= ahoraMin) {
      return { ok:false, error:"Esta hora ya pasó. Por favor elige una hora futura." };
    }
  }

  // ── 4. CHECK + ESCRITURA bajo un único lock ──────────────────
  var lock = LockService.getScriptLock();
  var reservaID, reserva, check;
  try {
    lock.waitLock(20000);

    check = _checkSlotDisponible(
      payload.empleadoID,
      payload.fecha,
      payload.horaInicio,
      servicio.duracion
    );
    if (!check.disponible) {
      return { ok:false, error:"El horario ya no está disponible. Elige otro." };
    }

    reservaID = generarReservaID();
    reserva   = {
      id:              reservaID,
      nombre:          _sanitizar(payload.nombre),
      email:           _sanitizar(payload.email).toLowerCase(),
      telefono:        _sanitizar(payload.telefono||""),
      servicioID:      servicio.id,
      servicioNombre:  servicio.nombre,
      empleadoID:      empleado.id,
      empleadoNombre:  empleado.nombre,
      fecha:           payload.fecha,
      horaInicio:      payload.horaInicio,
      horaFin:         check.horaFin,
      duracion:        servicio.duracion,
      precio:          servicio.precio,
      notas:           _sanitizar(payload.notas||""),
      sesionNum:       parseInt(payload.sesionNum)||1,
      sesionesTotales: servicio.esSesion ? servicio.maxSesiones : 1,
      calendarEventID: ""
    };

    escribirReserva(reserva);

  } catch(e) {
    log("ERROR","crearReserva","",payload?payload.nombre:"",payload,"Lock/write: "+e.message);
    return { ok:false, error:"Error interno al guardar la reserva: "+e.message };
  } finally {
    lock.releaseLock();
  }

  // ── 5. Tareas post-escritura — cada una aislada ──────────────
  try {
    var eventID = crearEventoCalendar(reserva, servicio);
    if (eventID) {
      _actualizarCalendarEventID(reservaID, eventID);
      reserva.calendarEventID = eventID;
    }
  } catch(e) { log("ERROR","postWrite_calendar",reservaID,reserva.nombre,{},""+e.message); }

  try {
    upsertCliente(reserva.nombre, reserva.email, reserva.telefono, reserva.precio);
  } catch(e) { log("ERROR","postWrite_crm",reservaID,reserva.nombre,{},""+e.message); }

  var emailClienteOk = false;
  try {
    emailClienteOk = _enviarConfirmacion(reserva, servicio);
  } catch(e) { log("ERROR","postWrite_email",reservaID,reserva.nombre,{},""+e.message); }

  try {
    _notificarSlack(reserva, servicio, empleado);
  } catch(e) { log("ERROR","postWrite_slack",reservaID,reserva.nombre,{},""+e.message); }

  try {
    _notificarAdmin(reserva, servicio, "nueva");
  } catch(e) { log("ERROR","postWrite_adminEmail",reservaID,reserva.nombre,{},""+e.message); }

  log("INFO","crearReserva",reservaID,reserva.nombre,{
    servicio: servicio.nombre, empleado: empleado.nombre,
    fecha: payload.fecha, hora: payload.horaInicio,
    emailEnviado: emailClienteOk
  },"");

  return { ok:true, reservaID:reservaID, reserva:reserva, emailEnviado:emailClienteOk };
}

/**
 * Cancela una reserva por ID.
 * @param {string} reservaID
 * @param {string} canceladoPor "cliente" | "admin"
 */
function cancelarReserva(reservaID, canceladoPor) {
  try {
    var reserva = getReservaPorID(reservaID);
    if (!reserva) return { ok:false, error:"Reserva no encontrada" };
    if (reserva.estado === ESTADO_CANCELADA) {
      return { ok:false, error:"La reserva ya está cancelada" };
    }

    var eventID = cancelarReservaEnSheet(reservaID, canceladoPor||"cliente");
    if (eventID) eliminarEventoCalendar(eventID);
    _enviarCancelacion(reserva);
    _notificarAdmin(reserva, null, "cancelada");

    log("INFO","cancelarReserva",reservaID,reserva.nombre,{ canceladoPor },"");
    return { ok:true };

  } catch(e) {
    log("ERROR","cancelarReserva",reservaID,"",{},"Error: "+e.message);
    return { ok:false, error:e.message };
  }
}

// ── VALIDACIÓN ────────────────────────────────────────────────
function _validarPayloadReserva(p) {
  if (!p) return "Datos vacíos";
  if (!p.nombre   || p.nombre.trim().length < 2) return "Nombre inválido";
  if (!p.email    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return "Email inválido";
  if (!p.servicioID)  return "Servicio requerido";
  if (!p.empleadoID)  return "Especialista requerida";
  if (!p.fecha)       return "Fecha requerida";
  if (!p.horaInicio)  return "Hora requerida";

  var fechaReserva = new Date(p.fecha + "T" + p.horaInicio + ":00");
  if (fechaReserva < new Date()) return "No puedes reservar en una fecha pasada";

  return null;
}

function _sanitizar(str) {
  if (typeof str !== "string") return String(str||"");
  return str.replace(/</g,"&lt;").replace(/>/g,"&gt;").trim().substring(0,300);
}

// ── ACTUALIZAR CALENDAR EVENT ID ──────────────────────────────
function _actualizarCalendarEventID(reservaID, eventID) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === reservaID) {
      sheet.getRange(i+1, 16).setValue(eventID);
      return;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATES DE EMAIL
// ═══════════════════════════════════════════════════════════════

/**
 * Retorna el bloque HTML del header común a todos los emails.
 * Logo centrado + nombre del negocio + subtítulo de contexto.
 */
function _emailHeader(subtitulo) {
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr>' +
        '<td align="center" style="background:linear-gradient(135deg,#4a3800 0%,#735c00 60%,#96780a 100%);padding:36px 24px 28px;">' +
          (LOGO_URL
            ? '<img src="' + LOGO_URL + '" alt="' + NEGOCIO_NOMBRE + '" width="72" height="72" style="display:block;margin:0 auto 14px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.25);">'
            : '<div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.15);margin:0 auto 14px;line-height:72px;text-align:center;font-size:32px;">✨</div>'
          ) +
          '<h1 style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:normal;font-style:italic;color:#ffffff;letter-spacing:0.5px;">' + NEGOCIO_NOMBRE + '</h1>' +
          '<p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.65);">' + subtitulo + '</p>' +
        '</td>' +
      '</tr>' +
    '</table>'
  );
}

/**
 * Retorna el bloque HTML del footer común.
 */
function _emailFooter() {
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr>' +
        '<td align="center" style="background:#f9f6ef;border-top:1px solid #e8dece;padding:24px 24px 28px;">' +
          '<p style="margin:0 0 6px;font-family:Georgia,serif;font-style:italic;font-size:15px;color:#735c00;">' + NEGOCIO_NOMBRE + '</p>' +
          '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;">' + NEGOCIO_DIR + '</p>' +
          '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;">' + NEGOCIO_TEL + ' &nbsp;·&nbsp; ' + NEGOCIO_EMAIL + '</p>' +
          (NEGOCIO_INSTAGRAM
            ? '<a href="' + NEGOCIO_INSTAGRAM + '" style="font-family:Arial,sans-serif;font-size:11px;color:#735c00;text-decoration:none;font-weight:600;">📸 Instagram</a>'
            : ''
          ) +
          (typeof NEGOCIO_WHATSAPP !== 'undefined' && NEGOCIO_WHATSAPP
            ? '&nbsp;&nbsp;<a href="https://wa.me/' + NEGOCIO_WHATSAPP + '" style="font-family:Arial,sans-serif;font-size:11px;color:#735c00;text-decoration:none;font-weight:600;">💬 WhatsApp</a>'
            : ''
          ) +
          '<p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#d1d5db;">Este email fue generado automáticamente. Por favor no respondas directamente.</p>' +
        '</td>' +
      '</tr>' +
    '</table>'
  );
}

/**
 * Retorna una fila de la tabla de detalles de la reserva.
 * Alterna fondo para mayor legibilidad.
 */
function _detalleRow(label, valor, zebra) {
  var bg = zebra ? '#fdf9f0' : '#ffffff';
  return (
    '<tr style="background:' + bg + ';">' +
      '<td style="padding:11px 16px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#9ca3af;width:38%;border-bottom:1px solid #f3f0e8;">' + label + '</td>' +
      '<td style="padding:11px 16px;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;border-bottom:1px solid #f3f0e8;">' + valor + '</td>' +
    '</tr>'
  );
}

// ── EMAIL DE CONFIRMACIÓN ─────────────────────────────────────
function _enviarConfirmacion(reserva, servicio) {
  if (!reserva.email) return false;
  try {
    var precioFmt = '$' + (reserva.precio||0).toLocaleString('es-CL') + ' CLP';
    var sesionFila = servicio.esSesion
      ? _detalleRow('Sesión', reserva.sesionNum + ' de ' + reserva.sesionesTotales, true)
      : '';

    var html =
      '<!DOCTYPE html>' +
      '<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<title>Reserva Confirmada</title></head>' +
      '<body style="margin:0;padding:0;background:#f5f0e8;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;padding:32px 0;">' +
        '<tr><td align="center">' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(115,92,0,.12);">' +

            // Header
            '<tr><td>' + _emailHeader('Reserva Confirmada') + '</td></tr>' +

            // Saludo
            '<tr><td style="padding:32px 32px 0;">' +
              '<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:15px;color:#374151;">Hola, <strong>' + reserva.nombre + '</strong> 👋</p>' +
              '<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#6b7280;line-height:1.6;">Tu reserva está confirmada. Te esperamos con todo listo para brindarte la mejor experiencia.</p>' +
            '</td></tr>' +

            // Badge "Confirmada"
            '<tr><td style="padding:20px 32px 0;">' +
              '<table cellpadding="0" cellspacing="0" border="0">' +
                '<tr><td style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:8px 16px;">' +
                  '<span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#16a34a;">✅ &nbsp;Reserva ' + reserva.id + '</span>' +
                '</td></tr>' +
              '</table>' +
            '</td></tr>' +

            // Tabla de detalles
            '<tr><td style="padding:20px 32px 0;">' +
              '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #f3f0e8;border-radius:12px;overflow:hidden;">' +
                _detalleRow('Servicio',    reserva.servicioNombre, false) +
                sesionFila +
                _detalleRow('Especialista', reserva.empleadoNombre, true) +
                _detalleRow('Fecha',        _formatearFechaLegible(reserva.fecha), false) +
                _detalleRow('Horario',      reserva.horaInicio + ' – ' + reserva.horaFin, true) +
                _detalleRow('Precio',       '<strong style="color:#735c00;">' + precioFmt + '</strong>', false) +
                (reserva.notas
                  ? _detalleRow('Notas', '<em style="color:#6b7280;">' + reserva.notas + '</em>', true)
                  : ''
                ) +
              '</table>' +
            '</td></tr>' +

            // CTA — reagendar / cancelar
            '<tr><td style="padding:28px 32px 0;text-align:center;">' +
              '<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:13px;color:#9ca3af;">¿Necesitas cancelar? Responde este email con tu número de reserva y te ayudamos.</p>' +
            '</td></tr>' +

            // Separador decorativo
            '<tr><td style="padding:0 32px;">' +
              '<div style="height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);"></div>' +
            '</td></tr>' +

            // Footer
            '<tr><td>' + _emailFooter() + '</td></tr>' +

          '</table>' +
        '</td></tr>' +
      '</table>' +
      '</body></html>';

    MailApp.sendEmail({
      to:       reserva.email,
      subject:  '✅ Tu reserva está confirmada — ' + NEGOCIO_NOMBRE,
      htmlBody: html,
      name:     NEGOCIO_NOMBRE,
      replyTo:  NEGOCIO_EMAIL
    });
    return true;
  } catch(e) {
    log("ERROR","_enviarConfirmacion",reserva.id,reserva.email,{},"Mail: "+e.message);
    return false;
  }
}

// ── EMAIL DE CANCELACIÓN ──────────────────────────────────────
function _enviarCancelacion(reserva) {
  if (!reserva.email) return;
  try {
    var html =
      '<!DOCTYPE html>' +
      '<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<title>Reserva Cancelada</title></head>' +
      '<body style="margin:0;padding:0;background:#f5f0e8;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;padding:32px 0;">' +
        '<tr><td align="center">' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(115,92,0,.12);">' +

            // Header
            '<tr><td>' + _emailHeader('Reserva Cancelada') + '</td></tr>' +

            // Saludo
            '<tr><td style="padding:32px 32px 0;">' +
              '<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:15px;color:#374151;">Hola, <strong>' + reserva.nombre + '</strong></p>' +
              '<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#6b7280;line-height:1.6;">Tu reserva ha sido cancelada exitosamente. Esperamos verte pronto.</p>' +
            '</td></tr>' +

            // Badge "Cancelada"
            '<tr><td style="padding:20px 32px 0;">' +
              '<table cellpadding="0" cellspacing="0" border="0">' +
                '<tr><td style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:8px;padding:8px 16px;">' +
                  '<span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#ea580c;">❌ &nbsp;Reserva ' + reserva.id + ' cancelada</span>' +
                '</td></tr>' +
              '</table>' +
            '</td></tr>' +

            // Resumen compacto
            '<tr><td style="padding:20px 32px 0;">' +
              '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #f3f0e8;border-radius:12px;overflow:hidden;">' +
                _detalleRow('Servicio', reserva.servicioNombre, false) +
                _detalleRow('Fecha',    _formatearFechaLegible(reserva.fecha), true) +
                _detalleRow('Horario',  reserva.horaInicio + ' – ' + reserva.horaFin, false) +
              '</table>' +
            '</td></tr>' +

            // CTA — volver a reservar
            '<tr><td style="padding:28px 32px 0;text-align:center;">' +
              '<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#374151;">¿Quieres reagendar? Puedes hacerlo en cualquier momento.</p>' +
              '<a href="' + (typeof SITIO_URL !== 'undefined' && SITIO_URL ? SITIO_URL : 'https://bellezaintegral.liz') + '" ' +
                'style="display:inline-block;background:#735c00;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;padding:13px 28px;border-radius:9999px;">' +
                'Reservar de nuevo' +
              '</a>' +
            '</td></tr>' +

            // Separador
            '<tr><td style="padding:28px 32px 0;">' +
              '<div style="height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);"></div>' +
            '</td></tr>' +

            // Footer
            '<tr><td>' + _emailFooter() + '</td></tr>' +

          '</table>' +
        '</td></tr>' +
      '</table>' +
      '</body></html>';

    MailApp.sendEmail({
      to:       reserva.email,
      subject:  '❌ Tu reserva fue cancelada — ' + NEGOCIO_NOMBRE,
      htmlBody: html,
      name:     NEGOCIO_NOMBRE,
      replyTo:  NEGOCIO_EMAIL
    });
  } catch(e) {
    log("ERROR","_enviarCancelacion",reserva.id,reserva.email,{},"Mail: "+e.message);
  }
}

// ── HELPER: fecha legible ─────────────────────────────────────
function _formatearFechaLegible(fechaStr) {
  // "2026-04-01" → "miércoles 1 de abril de 2026"
  try {
    var partes = fechaStr.split('-');
    var d = new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2]));
    var dias   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    var meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  } catch(e) {
    return fechaStr;
  }
}

// ── NOTIFICACIÓN INTERNA ADMIN ────────────────────────────────
function _notificarAdmin(reserva, servicio, tipo) {
  if (!NEGOCIO_EMAIL) return;
  try {
    var esNueva     = tipo === "nueva";
    var asunto      = esNueva
      ? "🔔 Nueva reserva — " + reserva.nombre + " · " + reserva.horaInicio
      : "❌ Cancelación — " + reserva.nombre + " · " + reserva.fecha;
    var colorBadge  = esNueva ? "#16a34a" : "#ea580c";
    var bgBadge     = esNueva ? "#f0fdf4" : "#fff7ed";
    var borderBadge = esNueva ? "#bbf7d0" : "#fed7aa";
    var textoEstado = esNueva ? "✅  Nueva reserva confirmada" : "❌  Reserva cancelada";

    var html =
      '<!DOCTYPE html>' +
      '<html lang="es"><head><meta charset="UTF-8"></head>' +
      '<body style="margin:0;padding:0;background:#f5f0e8;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;padding:24px 0;">' +
        '<tr><td align="center">' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(115,92,0,.1);">' +

            // Header compacto
            '<tr><td style="background:linear-gradient(135deg,#4a3800,#735c00);padding:20px 24px;text-align:center;">' +
              '<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.6);">Belleza Integral · Panel Admin</p>' +
              '<p style="margin:4px 0 0;font-family:Georgia,serif;font-style:italic;font-size:20px;color:#ffffff;">' + (esNueva ? 'Nueva Reserva' : 'Reserva Cancelada') + '</p>' +
            '</td></tr>' +

            // Badge estado
            '<tr><td style="padding:20px 24px 0;">' +
              '<table cellpadding="0" cellspacing="0" border="0"><tr>' +
                '<td style="background:' + bgBadge + ';border:1.5px solid ' + borderBadge + ';border-radius:8px;padding:8px 14px;">' +
                  '<span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:' + colorBadge + ';">' + textoEstado + '</span>' +
                '</td>' +
              '</tr></table>' +
            '</td></tr>' +

            // Tabla de detalles
            '<tr><td style="padding:16px 24px 0;">' +
              '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #f3f0e8;border-radius:12px;overflow:hidden;">' +
                _detalleRow('Cliente',    reserva.nombre, false) +
                _detalleRow('Email',      '<a href="mailto:' + reserva.email + '" style="color:#735c00;">' + reserva.email + '</a>', true) +
                (reserva.telefono ? _detalleRow('Teléfono', reserva.telefono, false) : '') +
                _detalleRow('Servicio',   reserva.servicioNombre, reserva.telefono ? true : false) +
                _detalleRow('Fecha',      _formatearFechaLegible(reserva.fecha), true) +
                _detalleRow('Horario',    reserva.horaInicio + ' – ' + reserva.horaFin, false) +
                _detalleRow('N° Reserva', '<strong>' + reserva.id + '</strong>', true) +
                (reserva.notas ? _detalleRow('Notas', '<em style="color:#6b7280;">' + reserva.notas + '</em>', false) : '') +
              '</table>' +
            '</td></tr>' +

            // Timestamp
            '<tr><td style="padding:16px 24px 24px;text-align:right;">' +
              '<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;">Generado el ' + Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy 'a las' HH:mm") + '</p>' +
            '</td></tr>' +

          '</table>' +
        '</td></tr>' +
      '</table>' +
      '</body></html>';

    MailApp.sendEmail({
      to:       NEGOCIO_EMAIL,
      subject:  asunto,
      htmlBody: html,
      name:     NEGOCIO_NOMBRE + ' · Sistema'
    });
  } catch(e) {
    log("ERROR","_notificarAdmin",reserva.id,reserva.nombre,{},"Mail: "+e.message);
  }
}

// ── NOTIFICACIÓN SLACK ────────────────────────────────────────
function _notificarSlack(reserva, servicio, empleado) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    var mensaje = {
      text: "✨ *Nueva reserva — " + NEGOCIO_NOMBRE + "*",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "✨ *Nueva reserva confirmada*\n" +
                  "*Cliente:* " + reserva.nombre + "\n" +
                  "*Servicio:* " + servicio.nombre + "\n" +
                  "*Especialista:* " + empleado.nombre + "\n" +
                  "*Fecha:* " + reserva.fecha + " a las " + reserva.horaInicio + "\n" +
                  "*N° Reserva:* " + reserva.id
          }
        }
      ]
    };
    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(mensaje),
      muteHttpExceptions: true
    });
  } catch(e) { log("ERROR","_notificarSlack",reserva.id,reserva.nombre,{},"Slack: "+e.message); }
}
