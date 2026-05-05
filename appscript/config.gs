/* ================================================================
   BARBERÍA PRO — 1_config.gs
   Constantes globales del sistema
   ================================================================ */

const SHEET_ID        = "1t3Bt0YKoZ9pEOOdpv39qdRf-8ty1E3c-7jAIjb_-Hp0";
const NEGOCIO_NOMBRE  = "Belleza Integral";
const LOGO_URL        = "https://lh3.googleusercontent.com/d/1KegXjaRohFEhnPc-FxlaC-sa8esSI3QV";
const NEGOCIO_DUENA   = "Liz";
const NEGOCIO_EMAIL   = "voycontigo.licencia@gmail.com";
const NEGOCIO_TEL     = "+56 964 364 128";
const NEGOCIO_WHATSAPP = "+56964364128";
const NEGOCIO_INSTAGRAM = "https://www.instagram.com/bellezaintegral.liz?igsh=MWNua2d1d2R3aW83bA==";
const NEGOCIO_DIR     = "Santiago Centro, Santiago de Chile";
const SLACK_WEBHOOK_URL = ""; // Pega aquí tu Slack Incoming Webhook URL (no subir a GitHub)
const TZ              = "America/Santiago";

// Emails autorizados para el dashboard admin
const ADMIN_EMAILS    = ["voycontigo.licencia@gmail.com"];

// Token API — debe coincidir con js/api.js → API_TOKEN
const API_TOKEN       = "barberia-pro-2025-secret";

// Google Calendar — cambiar al ID real del calendario
const CALENDAR_ID     = "primary";

// Nombres de hojas
const HOJA_RESERVAS   = "Reservas";
const HOJA_SERVICIOS  = "Servicios";
const HOJA_EMPLEADOS  = "Empleados";
const HOJA_HORARIOS   = "Horarios";
const HOJA_CLIENTES   = "Clientes";
const HOJA_LOGS       = "Logs";

// Correlativo de reservas
const RESERVA_KEY     = "barberia_ultima_reserva";
const RESERVA_INICIO  = 1000;

// Horario del negocio
const HORA_APERTURA   = 9;   // 09:00
const HORA_CIERRE     = 20;  // 20:00
const SLOT_MINUTOS    = 15;  // granularidad mínima

// Estados
const ESTADO_CONFIRMADA = "Confirmada";
const ESTADO_CANCELADA  = "Cancelada";
const ESTADO_COMPLETADA = "Completada";
const ESTADO_PENDIENTE  = "Pendiente";

// Servicios por defecto para setupCompleto()
const SERVICIOS_DEFAULT = [
  {id:"SRV001",nombre:"Corte de pelo",          duracion:60, precio:12000,categoria:"Cabello",  requiereSkill:"",       esSesion:false,maxSesiones:1},
  {id:"SRV002",nombre:"Coloración completa",     duracion:120,precio:35000,categoria:"Color",    requiereSkill:"color",  esSesion:false,maxSesiones:1},
  {id:"SRV003",nombre:"Mechas / Balayage",       duracion:150,precio:50000,categoria:"Color",    requiereSkill:"color",  esSesion:false,maxSesiones:1},
  {id:"SRV004",nombre:"Tratamiento capilar",     duracion:60, precio:18000,categoria:"Cuidado",  requiereSkill:"",       esSesion:false,maxSesiones:1},
  {id:"SRV005",nombre:"Lissado / Alisado",       duracion:180,precio:60000,categoria:"Cuidado",  requiereSkill:"",       esSesion:false,maxSesiones:1},
  {id:"SRV006",nombre:"Maquillaje social",       duracion:60, precio:25000,categoria:"Maquillaje",requiereSkill:"makeup",esSesion:false,maxSesiones:1},
  {id:"SRV007",nombre:"Maquillaje de novia",     duracion:90, precio:60000,categoria:"Maquillaje",requiereSkill:"makeup",esSesion:false,maxSesiones:1},
  {id:"SRV008",nombre:"Depilación cejas",        duracion:20, precio:6000, categoria:"Depilación",requiereSkill:"",       esSesion:false,maxSesiones:1},
  {id:"SRV009",nombre:"Depilación facial",       duracion:30, precio:10000,categoria:"Depilación",requiereSkill:"",       esSesion:false,maxSesiones:1},
  {id:"SRV010",nombre:"Manicure",                duracion:45, precio:12000,categoria:"Uñas",     requiereSkill:"unas",   esSesion:false,maxSesiones:1}
];

// Especialistas por defecto
const EMPLEADOS_DEFAULT = [
  {id:"EMP001",nombre:"Liz",     email:"voycontigo.licencia@gmail.com", skills:"color,makeup,unas", activo:"SI",color:"#E8521A"}
];

// ── UTILIDADES GLOBALES ───────────────────────────────────────

// Convierte cualquier valor de hora de Sheets a string "HH:MM"
// getValues() puede devolver Date, número (fracción de día 0.375=09:00) o string
function _normalizeHora(hora) {
  if (!hora && hora !== 0) return "";
  if (hora instanceof Date) {
    var h = hora.getHours(), m = hora.getMinutes();
    return (h<10?"0":"")+h+":"+(m<10?"0":"")+m;
  }
  if (typeof hora === "number") {
    var totalMin = Math.round(hora * 24 * 60);
    var hh = Math.floor(totalMin/60), mm = totalMin%60;
    return (hh<10?"0":"")+hh+":"+(mm<10?"0":"")+mm;
  }
  return String(hora).trim();
}

function safeFormat(fecha, zona, formato) {
  if (!fecha) return "";
  try { return Utilities.formatDate(new Date(fecha), zona||TZ, formato||"dd/MM/yyyy"); }
  catch(e) { return ""; }
}

function jsonOut(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function tsNow() {
  return safeFormat(new Date(), TZ, "dd/MM/yyyy HH:mm:ss");
}

function generarReservaID() {
  var lock  = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var props  = PropertiesService.getScriptProperties();
    var actual = parseInt(props.getProperty(RESERVA_KEY) || "0");
    if (actual < RESERVA_INICIO) actual = RESERVA_INICIO;
    var siguiente = actual + 1;
    props.setProperty(RESERVA_KEY, String(siguiente));
    return "RES-" + String(siguiente).padStart(5,"0");
  } finally { lock.releaseLock(); }
}
