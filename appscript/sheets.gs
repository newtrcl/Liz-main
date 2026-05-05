/* ================================================================
   BARBERÍA PRO — 2_sheets.gs
   Lectura y escritura en Google Sheets
   ================================================================ */

// ── SETUP HOJAS ───────────────────────────────────────────────
function setupCompleto() {
  crearHojaReservas();
  crearHojaServicios();
  crearHojaEmpleados();
  crearHojaHorarios();
  crearHojaClientes();
  crearHojaLogs();
  SpreadsheetApp.getUi().alert(
    "✅ Belleza Integral — Setup completo\n\n" +
    "📋 Reservas ✓\n🔧 Servicios ✓\n👥 Empleados ✓\n" +
    "📅 Horarios ✓\n👤 Clientes ✓\n📝 Logs ✓\n\n" +
    "Siguiente paso:\nImplementar → Nueva implementación → App web\n" +
    "Acceso: Cualquier usuario"
  );
}

function crearHojaReservas() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  if (!sheet) sheet = ss.insertSheet(HOJA_RESERVAS);
  else sheet.clearContents();
  var h = ["ID Reserva","Nombre Cliente","Email","Teléfono",
           "Servicio ID","Servicio Nombre","Empleado ID","Empleado Nombre",
           "Fecha","Hora Inicio","Hora Fin","Duración Min",
           "Estado","Precio","Notas","Calendar Event ID",
           "Sesión N°","Sesiones Totales","Timestamp","Cancelado Por"];
  _cabecera(sheet, h, "#1A1A2E");
  sheet.setColumnWidth(1,110); sheet.setColumnWidth(2,160);
  sheet.setColumnWidth(3,200); sheet.setColumnWidth(4,130);
  sheet.setColumnWidth(9,110); sheet.setColumnWidth(10,100);
  sheet.setColumnWidth(11,100); sheet.setColumnWidth(16,220);
  sheet.setTabColor("#E8521A");
  _formatoEstado(sheet, "M2:M2000");
}

function crearHojaServicios() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_SERVICIOS);
  if (!sheet) sheet = ss.insertSheet(HOJA_SERVICIOS);
  else sheet.clearContents();
  var h = ["ID","Nombre","Duración Min","Precio CLP","Categoría",
           "Requiere Skill","Es Sesión","Max Sesiones","Activo","Descripción"];
  _cabecera(sheet, h, "#1A3A6B");
  var ts = tsNow();
  var filas = SERVICIOS_DEFAULT.map(function(s) {
    return [s.id, s.nombre, s.duracion, s.precio, s.categoria,
            s.requiereSkill, s.esSesion?"SI":"NO", s.maxSesiones, "SI", ""];
  });
  sheet.getRange(2,1,filas.length,h.length).setValues(filas);
  sheet.getRange("D2:D200").setNumberFormat("$#,##0");
  sheet.setTabColor("#1A73E8");
}

function crearHojaEmpleados() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_EMPLEADOS);
  if (!sheet) sheet = ss.insertSheet(HOJA_EMPLEADOS);
  else sheet.clearContents();
  var h = ["ID","Nombre","Email","Skills","Activo","Color Agenda","Foto URL","Descripción"];
  _cabecera(sheet, h, "#2D6A4F");
  var filas = EMPLEADOS_DEFAULT.map(function(e) {
    return [e.id, e.nombre, e.email, e.skills, e.activo, e.color, "", ""];
  });
  sheet.getRange(2,1,filas.length,h.length).setValues(filas);
  sheet.setTabColor("#22C55E");
}

function crearHojaHorarios() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_HORARIOS);
  if (!sheet) sheet = ss.insertSheet(HOJA_HORARIOS);
  else sheet.clearContents();
  var h = ["Empleado ID","Día Semana","Hora Inicio","Hora Fin","Disponible","Notas"];
  // 0=Dom,1=Lun...6=Sab
  _cabecera(sheet, h, "#7B2D8B");
  var dias = [1,2,3,4,5,6]; // Lun a Sab
  var filas = [];
  EMPLEADOS_DEFAULT.forEach(function(emp) {
    dias.forEach(function(dia) {
      filas.push([emp.id, dia, "09:00", "20:00", "SI", ""]);
    });
  });
  sheet.getRange(2,1,filas.length,h.length).setValues(filas);
  sheet.setTabColor("#8B5CF6");
}

function crearHojaClientes() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_CLIENTES);
  if (!sheet) sheet = ss.insertSheet(HOJA_CLIENTES);
  else sheet.clearContents();
  var h = ["Email","Nombre","Teléfono","Total Reservas","Última Visita",
           "Monto Total CLP","Etiqueta","Notas","Primer Contacto"];
  _cabecera(sheet, h, "#92400E");
  sheet.setTabColor("#F59E0B");
}

function crearHojaLogs() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_LOGS);
  if (!sheet) sheet = ss.insertSheet(HOJA_LOGS);
  else sheet.clearContents();
  var h = ["Timestamp","Nivel","Acción","ReservaID","Cliente","Detalle","Error"];
  _cabecera(sheet, h, "#1F2937");
  sheet.setTabColor("#6B7280");
}

// ── CABECERA HELPER ───────────────────────────────────────────
function _cabecera(sheet, headers, bg) {
  sheet.getRange(1,1,1,headers.length).setValues([headers])
       .setBackground(bg||"#1A1A2E").setFontColor("#FFF")
       .setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

function _formatoEstado(sheet, rango) {
  var r = [sheet.getRange(rango)];
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Confirmada")
      .setBackground("#D1FAE5").setFontColor("#065F46").setRanges(r).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Cancelada")
      .setBackground("#FEE2E2").setFontColor("#991B1B").setRanges(r).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Completada")
      .setBackground("#DBEAFE").setFontColor("#1E40AF").setRanges(r).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Pendiente")
      .setBackground("#FEF3C7").setFontColor("#92400E").setRanges(r).build()
  ]);
}

// ── LEER SERVICIOS ────────────────────────────────────────────
function getServicios() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_SERVICIOS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][8] !== "SI") continue; // solo activos
    result.push({
      id:           data[i][0],
      nombre:       data[i][1],
      duracion:     parseInt(data[i][2]),
      precio:       parseInt(data[i][3]),
      categoria:    data[i][4],
      requiereSkill:data[i][5],
      esSesion:     data[i][6]==="SI",
      maxSesiones:  parseInt(data[i][7])||1,
      descripcion:  data[i][9]
    });
  }
  return result;
}

// ── LEER EMPLEADOS ────────────────────────────────────────────
function getEmpleados(soloActivos) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_EMPLEADOS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data   = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (soloActivos && data[i][4] !== "SI") continue;
    result.push({
      id:          data[i][0],
      nombre:      data[i][1],
      email:       data[i][2],
      skills:      (data[i][3]||"").split(",").map(function(s){return s.trim();}),
      activo:      data[i][4]==="SI",
      color:       data[i][5]||"#6B7280",
      foto:        data[i][6]||"",
      descripcion: data[i][7]||""
    });
  }
  return result;
}

// ── LEER RESERVAS ─────────────────────────────────────────────
function getReservasPorFecha(fecha) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data   = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][12] === ESTADO_CANCELADA) continue;
    if (safeFormat(data[i][8], TZ, "yyyy-MM-dd") === fecha) {
      result.push(_rowToReserva(data[i]));
    }
  }
  return result;
}

function getReservasPorEmpleadoFecha(empleadoID, fecha) {
  return getReservasPorFecha(fecha).filter(function(r) {
    return r.empleadoID === empleadoID;
  });
}

function getReservaPorID(reservaID) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === reservaID) return _rowToReserva(data[i]);
  }
  return null;
}

function getProximasReservas(limite) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data   = sheet.getDataRange().getValues();
  var hoy    = new Date(); hoy.setHours(0,0,0,0);
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][12] === ESTADO_CANCELADA) continue;
    var fecha = new Date(data[i][8]);
    if (fecha >= hoy) result.push(_rowToReserva(data[i]));
  }
  result.sort(function(a,b){ return new Date(a.fecha+' '+a.horaInicio) - new Date(b.fecha+' '+b.horaInicio); });
  return limite ? result.slice(0, limite) : result;
}

function _rowToReserva(row) {
  return {
    id:            row[0],  nombre:        row[1],
    email:         row[2],  telefono:      row[3],
    servicioID:    row[4],  servicioNombre:row[5],
    empleadoID:    row[6],  empleadoNombre:row[7],
    fecha:         safeFormat(row[8], TZ, "yyyy-MM-dd"),
    horaInicio:    _normalizeHora(row[9]),  horaFin: _normalizeHora(row[10]),
    duracion:      parseInt(row[11])||0,
    estado:        row[12], precio:        parseInt(row[13])||0,
    notas:         row[14], calendarEventID:row[15],
    sesionNum:     parseInt(row[16])||1,
    sesionesTotales:parseInt(row[17])||1,
    timestamp:     row[18]
  };
}

// ── ESCRIBIR RESERVA ──────────────────────────────────────────
function escribirReserva(reserva) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  // Construir fecha como medianoche LOCAL para evitar desfase UTC→Santiago
  // new Date("2026-04-01") = UTC midnight = 2026-03-31 20:00 en Santiago → BUG
  // new Date(2026, 3, 1)   = medianoche local Santiago → correcto
  var fd = reserva.fecha.split("-");
  var fechaLocal = new Date(parseInt(fd[0]), parseInt(fd[1])-1, parseInt(fd[2]));
  sheet.appendRow([
    reserva.id,            reserva.nombre,      reserva.email,
    reserva.telefono||"",  reserva.servicioID,  reserva.servicioNombre,
    reserva.empleadoID,    reserva.empleadoNombre,
    fechaLocal,
    reserva.horaInicio,    reserva.horaFin,     reserva.duracion,
    ESTADO_CONFIRMADA,     reserva.precio,      reserva.notas||"",
    reserva.calendarEventID||"",
    reserva.sesionNum||1,  reserva.sesionesTotales||1,
    tsNow(),               ""
  ]);
}

// ── CANCELAR RESERVA ──────────────────────────────────────────
function cancelarReservaEnSheet(reservaID, canceladoPor) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === reservaID) {
      sheet.getRange(i+1, 13).setValue(ESTADO_CANCELADA);
      sheet.getRange(i+1, 20).setValue(canceladoPor||"cliente");
      return data[i][15]; // devuelve el calendarEventID para borrarlo
    }
  }
  return null;
}

// ── ACTUALIZAR ESTADO ─────────────────────────────────────────
function actualizarEstadoReserva(reservaID, nuevoEstado) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_RESERVAS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === reservaID) {
      sheet.getRange(i+1, 13).setValue(nuevoEstado);
      return true;
    }
  }
  return false;
}

// ── CLIENTES ─────────────────────────────────────────────────
function upsertCliente(nombre, email, telefono, precio) {
  if (!email) return;
  try {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(HOJA_CLIENTES);
  if (!sheet) { log("ERROR","upsertCliente","","",{},"Hoja Clientes no existe"); return; }
  var data  = sheet.getDataRange().getValues();
  var ts    = tsNow();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      var totRes  = (parseInt(data[i][3])||0) + 1;
      var montoT  = (parseFloat(data[i][5])||0) + precio;
      var etiq    = totRes >= 10 ? "⭐ VIP" : totRes >= 3 ? "🔁 Frecuente" : "🆕 Nuevo";
      sheet.getRange(i+1, 4).setValue(totRes);
      sheet.getRange(i+1, 5).setValue(ts);
      sheet.getRange(i+1, 6).setValue(montoT);
      sheet.getRange(i+1, 7).setValue(etiq);
      return;
    }
  }
  sheet.appendRow([email, nombre, telefono||"", 1, ts, precio, "🆕 Nuevo", "", ts]);
  } catch(e) { log("ERROR","upsertCliente","","",{},""+e.message); }
}

// ── LOGS ──────────────────────────────────────────────────────
function log(nivel, accion, reservaID, cliente, detalle, error) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(HOJA_LOGS);
    if (!sheet) return;
    sheet.appendRow([tsNow(), nivel||"INFO", accion||"",
      reservaID||"", cliente||"",
      typeof detalle==="object"?JSON.stringify(detalle):(detalle||""),
      error||""]);
  } catch(e) { Logger.log("LOG_FAIL: "+e.message); }
}
