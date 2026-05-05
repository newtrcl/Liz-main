/* ================================================================
   BELLEZA INTEGRAL — 7_email_test.gs
   Diagnóstico y prueba de envío de correos
   ================================================================

   INSTRUCCIONES PARA SOLUCIONAR EL PROBLEMA DE CORREOS:

   1. En el editor de Apps Script ve a Ejecutar → testEnviarCorreo
   2. Si aparece un popup de permisos, ACEPTA TODOS.
   3. Verifica que aparezca "OK" en los logs de ejecución.
   4. Vuelve a desplegar el Web App:
        Implementar → Administrar implementaciones → Editar (lápiz)
        → "Nueva versión" → Guardar
      Asegúrate que "Ejecutar como" sea "Yo (mi correo)" y
      "Quién tiene acceso" sea "Cualquier usuario".

   ================================================================ */

/**
 * Ejecuta esta función MANUALMENTE desde el editor de Apps Script
 * para verificar que el envío de correos funciona.
 * Abre Ejecutar → testEnviarCorreo y acepta los permisos que pida.
 */
function testEnviarCorreo() {
  var destinatario = NEGOCIO_EMAIL; // cambia a tu correo si quieres probar con otro

  var html =
    '<div style="font-family:Arial,sans-serif;padding:24px;max-width:480px;">' +
      '<h2 style="color:#735c00;">✅ Test de correo — ' + NEGOCIO_NOMBRE + '</h2>' +
      '<p>Este es un correo de prueba enviado el ' +
        Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy 'a las' HH:mm") + '.</p>' +
      '<p>Si ves este mensaje, el envío de correos funciona correctamente.</p>' +
      '<hr>' +
      '<p style="color:#9ca3af;font-size:12px;">Cuenta que envía: ' + Session.getEffectiveUser().getEmail() + '</p>' +
    '</div>';

  try {
    MailApp.sendEmail({
      to:       destinatario,
      subject:  '[TEST] Correo de prueba — ' + NEGOCIO_NOMBRE,
      htmlBody: html,
      name:     NEGOCIO_NOMBRE
    });
    Logger.log("✅ Correo enviado correctamente a: " + destinatario);
    Logger.log("   Cuota restante: " + MailApp.getRemainingDailyQuota() + " correos");
    SpreadsheetApp.getUi && SpreadsheetApp.getUi().alert(
      "✅ Correo de prueba enviado a " + destinatario + "\n" +
      "Cuota restante: " + MailApp.getRemainingDailyQuota() + " correos/día"
    );
  } catch(e) {
    Logger.log("❌ ERROR al enviar correo: " + e.message);
    try {
      SpreadsheetApp.getUi().alert("❌ Error: " + e.message);
    } catch(_) {}
  }
}

/**
 * Muestra información de diagnóstico en los logs.
 * Ejecutar manualmente desde el editor.
 */
function diagnosticarSistema() {
  Logger.log("=== DIAGNÓSTICO BELLEZA INTEGRAL ===");
  Logger.log("Usuario activo: " + Session.getEffectiveUser().getEmail());
  Logger.log("Cuota email restante: " + MailApp.getRemainingDailyQuota());

  // Verificar acceso a la hoja
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    Logger.log("✅ Hoja OK: " + ss.getName());
  } catch(e) {
    Logger.log("❌ Hoja ERROR: " + e.message);
  }

  // Verificar calendario
  try {
    var cal = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
    Logger.log("✅ Calendario OK: " + cal.getName() + " (" + cal.getId() + ")");
  } catch(e) {
    Logger.log("❌ Calendario ERROR: " + e.message);
  }

  // Verificar servicios
  try {
    var servicios = getServicios();
    Logger.log("✅ Servicios: " + servicios.length + " activos");
  } catch(e) {
    Logger.log("❌ Servicios ERROR: " + e.message);
  }

  // Verificar empleados
  try {
    var empleados = getEmpleados(true);
    Logger.log("✅ Empleados: " + empleados.length + " activos");
  } catch(e) {
    Logger.log("❌ Empleados ERROR: " + e.message);
  }

  Logger.log("=== FIN DIAGNÓSTICO ===");
}

/**
 * Simula el envío de correo de confirmación para una reserva de prueba.
 * Útil para verificar el HTML del email antes de publicar.
 */
function testConfirmacionEmail() {
  var reservaFalsa = {
    id:              "RES-09999",
    nombre:          "Cliente Prueba",
    email:           NEGOCIO_EMAIL,
    telefono:        "+56 9 1234 5678",
    servicioID:      "SRV001",
    servicioNombre:  "Corte de pelo",
    empleadoID:      "EMP001",
    empleadoNombre:  "Liz",
    fecha:           Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"),
    horaInicio:      "10:00",
    horaFin:         "11:00",
    duracion:        60,
    precio:          12000,
    notas:           "Prueba de sistema",
    sesionNum:       1,
    sesionesTotales: 1,
    calendarEventID: ""
  };
  var servicioFalso = { esSesion: false };

  _enviarConfirmacion(reservaFalsa, servicioFalso);
  Logger.log("✅ testConfirmacionEmail ejecutado — revisa " + NEGOCIO_EMAIL);
}
