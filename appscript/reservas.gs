/* ================================================================
   BELLEZA INTEGRAL — 3_reservas.gs
   Templates de email (XHTML), notificaciones Slack y admin.
   ================================================================ */

// ═══════════════════════════════════════════════════════════════
// PLANTILLA XHTML BASE
// ═══════════════════════════════════════════════════════════════

/**
 * Genera el envelope XHTML completo para todos los emails.
 * @param {string} tituloSeccion  — texto del header (ej. "Reserva Confirmada")
 * @param {string} cuerpo         — HTML del cuerpo interior
 * @param {string} colorAccent    — color HEX del badge/header (opcional)
 */
function _xhtmlEnvelope(tituloSeccion, cuerpo, colorAccent) {
  var accent = colorAccent || COLOR_PRIMARY;
  return (
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"' +
    ' "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
    '<html dir="ltr" lang="es">' +
    '<head>' +
      '<meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />' +
      '<meta name="x-apple-disable-message-reformatting" />' +
      '<style>' +
        '@font-face{font-family:"Inter";font-style:normal;font-weight:400;mso-font-alt:"Helvetica";' +
        'src:url(https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2) format("woff2")}' +
        '@font-face{font-family:"Inter";font-style:normal;font-weight:600;mso-font-alt:"Helvetica";' +
        'src:url(https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_fjbvMwCp50PDca1ZL7.woff2) format("woff2")}' +
        '*{font-family:"Inter",Helvetica,Arial,sans-serif}' +
      '</style>' +
    '</head>' +
    '<body style="margin:0;background:#f5f0e8;">' +

    '<table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation">' +
    '<tbody><tr><td style="padding:32px 12px">' +

      '<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"' +
      ' style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;' +
      'box-shadow:0 4px 32px rgba(115,92,0,.12);">' +
      '<tbody>' +

        // Header
        '<tr><td style="background:linear-gradient(135deg,' + COLOR_PRIMARY_DARK + ' 0%,' + accent + ' 100%);' +
        'padding:36px 24px 28px;text-align:center;">' +
          (LOGO_URL
            ? '<img src="' + LOGO_URL + '" alt="' + NEGOCIO_NOMBRE + '" width="64" height="64"' +
              ' style="display:block;margin:0 auto 14px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.25);">'
            : '<div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.15);' +
              'margin:0 auto 14px;line-height:64px;text-align:center;font-size:28px;">✨</div>'
          ) +
          '<h1 style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:normal;' +
          'font-style:italic;color:#ffffff;letter-spacing:.5px;">' + NEGOCIO_NOMBRE + '</h1>' +
          '<p style="margin:6px 0 0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;' +
          'color:rgba(255,255,255,.65);">' + tituloSeccion + '</p>' +
        '</td></tr>' +

        // Cuerpo
        '<tr><td style="padding:28px 32px 20px;">' + cuerpo + '</td></tr>' +

        // Separador
        '<tr><td style="padding:0 32px;">' +
          '<div style="height:1px;background:linear-gradient(90deg,transparent,#d4af37,transparent);"></div>' +
        '</td></tr>' +

        // Footer
        '<tr><td style="background:#fdf9f0;border-top:1px solid #e8dece;padding:20px 24px;text-align:center;">' +
          '<p style="margin:0 0 4px;font-family:Georgia,serif;font-style:italic;font-size:14px;color:' + COLOR_PRIMARY + ';">' + NEGOCIO_NOMBRE + '</p>' +
          '<p style="margin:0 0 3px;font-size:12px;color:#9ca3af;">' + NEGOCIO_DIR + '</p>' +
          '<p style="margin:0 0 10px;font-size:12px;color:#9ca3af;">' + NEGOCIO_TEL + ' &nbsp;·&nbsp; ' + NEGOCIO_EMAIL + '</p>' +
          '<a href="https://wa.me/' + NEGOCIO_WHATSAPP + '"' +
          ' style="font-size:11px;color:' + COLOR_PRIMARY + ';text-decoration:none;font-weight:600;margin-right:12px;">💬 WhatsApp</a>' +
          '<a href="' + NEGOCIO_INSTAGRAM + '"' +
          ' style="font-size:11px;color:' + COLOR_PRIMARY + ';text-decoration:none;font-weight:600;">📸 Instagram</a>' +
          '<p style="margin:14px 0 0;font-size:11px;color:#d1d5db;">Email generado automáticamente. No respondas directamente.</p>' +
        '</td></tr>' +

      '</tbody></table>' +
    '</td></tr></tbody></table>' +
    '</body></html>'
  );
}

/**
 * Tabla de detalles de reserva — filas alternadas.
 * @param {Array} filas  — array de [label, valor]
 */
function _detalleTabla(filas) {
  var rows = filas.map(function(f, i) {
    var bg = i % 2 === 0 ? '#ffffff' : '#fdf9f0';
    return (
      '<tr style="background:' + bg + ';">' +
        '<td style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.8px;' +
        'text-transform:uppercase;color:#9ca3af;width:38%;border-bottom:1px solid #f3f0e8;">' + f[0] + '</td>' +
        '<td style="padding:10px 16px;font-size:14px;color:#1f2937;border-bottom:1px solid #f3f0e8;">' + f[1] + '</td>' +
      '</tr>'
    );
  }).join('');
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"' +
    ' style="border:1px solid #f3f0e8;border-radius:10px;overflow:hidden;margin-top:16px;">' +
      rows +
    '</table>'
  );
}

function _esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function _fmtFecha(fechaStr) {
  if (!fechaStr) return "";
  try {
    var p = String(fechaStr).split("-");
    var d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
    var dias  = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    var meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return dias[d.getDay()] + " " + d.getDate() + " de " + meses[d.getMonth()] + " de " + d.getFullYear();
  } catch(e) { return String(fechaStr); }
}

// ═══════════════════════════════════════════════════════════════
// EMAILS AL CLIENTE
// ═══════════════════════════════════════════════════════════════

function enviarConfirmacion(p) {
  if (!p.email) return;
  var precioFmt = "$" + (p.precio||0).toLocaleString("es-CL") + " CLP";
  var filas = [
    ["Servicio",    _esc(p.servicioNombre)],
    ["Especialista",_esc(p.empleadoNombre)],
    ["Fecha",       _fmtFecha(p.fecha)],
    ["Horario",     _esc(p.horaInicio) + " – " + _esc(p.horaFin)],
    ["Precio",      "<strong style='color:" + COLOR_PRIMARY + ";'>" + precioFmt + "</strong>"],
  ];
  if (p.notas) filas.push(["Notas", "<em style='color:#6b7280;'>" + _esc(p.notas) + "</em>"]);

  var cuerpo =
    "<p style='font-size:15px;color:#374151;margin:0 0 8px'>Hola, <strong>" + _esc(p.nombre) + "</strong> 👋</p>" +
    "<p style='font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 16px'>Tu reserva está confirmada. Te esperamos con todo listo.</p>" +
    "<table cellpadding='0' cellspacing='0' border='0'><tr>" +
      "<td style='background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:8px 14px;'>" +
        "<span style='font-size:13px;font-weight:700;color:#16a34a;'>✅ &nbsp;Reserva " + _esc(p.reservaID||"") + "</span>" +
      "</td>" +
    "</tr></table>" +
    _detalleTabla(filas) +
    "<p style='margin:20px 0 0;font-size:13px;color:#9ca3af;text-align:center;'>" +
    "¿Necesitas cancelar? Responde este email con tu número de reserva.</p>";

  var html = _xhtmlEnvelope("Reserva Confirmada", cuerpo, COLOR_PRIMARY);
  try {
    MailApp.sendEmail({ to:p.email, subject:"✅ Tu reserva está confirmada — "+NEGOCIO_NOMBRE,
      htmlBody:html, name:NEGOCIO_NOMBRE, replyTo:NEGOCIO_EMAIL });
  } catch(e) { log("ERROR","enviarConfirmacion",p.reservaID||"",p.email,{},e.message); }
}

function enviarCancelacion(p) {
  if (!p.email) return;
  var cuerpo =
    "<p style='font-size:15px;color:#374151;margin:0 0 8px'>Hola, <strong>" + _esc(p.nombre) + "</strong>.</p>" +
    "<p style='font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 16px'>Tu reserva ha sido cancelada exitosamente. Esperamos verte pronto.</p>" +
    "<table cellpadding='0' cellspacing='0' border='0'><tr>" +
      "<td style='background:#fff7ed;border:1.5px solid #fed7aa;border-radius:8px;padding:8px 14px;'>" +
        "<span style='font-size:13px;font-weight:700;color:#ea580c;'>❌ &nbsp;Reserva " + _esc(p.reservaID||"") + " cancelada</span>" +
      "</td>" +
    "</tr></table>" +
    _detalleTabla([
      ["Servicio", _esc(p.servicioNombre||"")],
      ["Fecha",    _fmtFecha(p.fecha)],
      ["Horario",  _esc(p.horaInicio||"") + " – " + _esc(p.horaFin||"")],
    ]) +
    "<p style='text-align:center;margin-top:24px;'>" +
      "<a href='" + SITIO_URL + "' style='display:inline-block;background:" + COLOR_PRIMARY + ";color:#fff;" +
      "font-size:13px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:9999px;'>Reservar de nuevo</a>" +
    "</p>";

  var html = _xhtmlEnvelope("Reserva Cancelada", cuerpo, "#ea580c");
  try {
    MailApp.sendEmail({ to:p.email, subject:"❌ Tu reserva fue cancelada — "+NEGOCIO_NOMBRE,
      htmlBody:html, name:NEGOCIO_NOMBRE, replyTo:NEGOCIO_EMAIL });
  } catch(e) { log("ERROR","enviarCancelacion",p.reservaID||"",p.email,{},e.message); }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICACIÓN ADMIN
// ═══════════════════════════════════════════════════════════════

function notificarAdmin(p, tipo) {
  if (!NEGOCIO_EMAIL) return;
  var esNueva = tipo === "nueva";
  var color   = esNueva ? "#16a34a" : "#ea580c";
  var asunto  = esNueva
    ? "🔔 Nueva reserva — " + (p.nombre||"") + " · " + (p.horaInicio||"")
    : "❌ Cancelación — " + (p.nombre||"") + " · " + (p.fecha||"");

  var filas = [
    ["Cliente",    _esc(p.nombre||"")],
    ["Email",      "<a href='mailto:" + _esc(p.email||"") + "' style='color:" + COLOR_PRIMARY + ";'>" + _esc(p.email||"") + "</a>"],
    ["Teléfono",   _esc(p.telefono||"—")],
    ["Servicio",   _esc(p.servicioNombre||"")],
    ["Especialista",_esc(p.empleadoNombre||"")],
    ["Fecha",      _fmtFecha(p.fecha)],
    ["Horario",    _esc(p.horaInicio||"") + " – " + _esc(p.horaFin||"")],
    ["N° Reserva", "<strong>" + _esc(p.reservaID||"") + "</strong>"],
  ];
  if (p.precio) filas.push(["Precio", "$" + parseFloat(p.precio).toLocaleString("es-CL") + " CLP"]);
  if (p.notas)  filas.push(["Notas",  "<em style='color:#6b7280;'>" + _esc(p.notas) + "</em>"]);

  var badge =
    "<table cellpadding='0' cellspacing='0' border='0'><tr>" +
      "<td style='background:" + (esNueva?"#f0fdf4":"#fff7ed") + ";border:1.5px solid " + (esNueva?"#bbf7d0":"#fed7aa") + ";border-radius:8px;padding:8px 14px;'>" +
        "<span style='font-size:13px;font-weight:700;color:" + color + ";'>" +
          (esNueva ? "✅  Nueva reserva confirmada" : "❌  Reserva cancelada") +
        "</span>" +
      "</td>" +
    "</tr></table>";

  var ts = "<p style='text-align:right;font-size:11px;color:#9ca3af;margin-top:12px;'>"+
    Utilities.formatDate(new Date(),TZ,"dd/MM/yyyy 'a las' HH:mm") + "</p>";

  var cuerpo = badge + _detalleTabla(filas) + ts;
  var html   = _xhtmlEnvelope(esNueva ? "Nueva Reserva" : "Reserva Cancelada", cuerpo, color);
  try {
    MailApp.sendEmail({ to:NEGOCIO_EMAIL, subject:asunto, htmlBody:html, name:NEGOCIO_NOMBRE+" · Admin" });
  } catch(e) { log("ERROR","notificarAdmin",p.reservaID||"",p.nombre||"",{},e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SLACK
// ═══════════════════════════════════════════════════════════════

function notificarSlack(p, tipo) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    var esNueva = tipo === "nueva";
    var texto = esNueva
      ? "✨ *Nueva reserva confirmada*\n*Cliente:* " + (p.nombre||"") +
        "\n*Servicio:* " + (p.servicioNombre||"") +
        "\n*Especialista:* " + (p.empleadoNombre||"") +
        "\n*Fecha:* " + (p.fecha||"") + " a las " + (p.horaInicio||"") +
        "\n*N° Reserva:* " + (p.reservaID||"") +
        "\n*Precio:* $" + parseFloat(p.precio||0).toLocaleString("es-CL") + " CLP"
      : "❌ *Reserva cancelada*\n*Cliente:* " + (p.nombre||"") +
        "\n*Reserva:* " + (p.reservaID||"") +
        "\n*Fecha:* " + (p.fecha||"");

    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        text: texto,
        blocks: [{ type:"section", text:{ type:"mrkdwn", text:texto } }],
      }),
      muteHttpExceptions: true,
    });
  } catch(e) { log("ERROR","notificarSlack",p.reservaID||"",p.nombre||"",{},e.message); }
}
