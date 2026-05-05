/* ================================================================
   BELLEZA INTEGRAL — 1_config.gs
   Constantes globales del sistema.
   Para replicar este sistema en otro negocio, solo edita este bloque.
   ================================================================ */

// ── IDENTIDAD DEL NEGOCIO ─────────────────────────────────────
const NEGOCIO_NOMBRE    = "Belleza Integral";
const NEGOCIO_DUENA     = "Liz";
const NEGOCIO_EMAIL     = "newtraderchiles@gmail.com";
const NEGOCIO_TEL       = "+56 964 364 128";
const NEGOCIO_WHATSAPP  = "56964364128";          // sin + ni espacios
const NEGOCIO_INSTAGRAM = "https://www.instagram.com/bellezaintegral.liz?igsh=MWNua2d1d2R3aW83bA==";
const NEGOCIO_DIR       = "Santiago Centro, Santiago de Chile";
const SITIO_URL         = "https://liz-belleza.newtraderchiles.workers.dev/"; // URL pública del sitio

// ── BRANDING ──────────────────────────────────────────────────
const LOGO_URL          = "https://lh3.googleusercontent.com/d/1KegXjaRohFEhnPc-FxlaC-sa8esSI3QV";
const COLOR_PRIMARY     = "#735c00";
const COLOR_PRIMARY_DARK= "#4a3800";
const COLOR_BG_EMAIL    = "#f5f0e8";

// ── ZONA HORARIA ──────────────────────────────────────────────
const TZ = "America/Santiago";

// ── GOOGLE SHEETS ─────────────────────────────────────────────
const SHEET_ID      = "1dhUckoy7dCIGXgy1-QLT94cjY5Xk6cRK0xFzLJZt_zY";
const HOJA_RESERVAS = "Reservas";
const HOJA_LOGS     = "Logs";

// ── GOOGLE CALENDAR ───────────────────────────────────────────
const CALENDAR_ID   = "primary";

// ── SLACK ─────────────────────────────────────────────────────
const SLACK_WEBHOOK = "TU_URL_AQUI";

// ── SEGURIDAD ─────────────────────────────────────────────────
const API_TOKEN = "barberia-pro-2025-secret";

// ── ESTADOS ───────────────────────────────────────────────────
const ESTADO_CONFIRMADA = "Confirmada";
const ESTADO_CANCELADA  = "Cancelada";
const ESTADO_COMPLETADA = "Completada";
const ESTADO_PENDIENTE  = "Pendiente";
const ESTADO_PAGADA     = "Pagada";

// ── HORARIO (referencia) ───────────────────────────────────────
const HORA_APERTURA = 9;
const HORA_CIERRE   = 20;

// ─────────────────────────────────────────────────────────────
// UTILIDADES GLOBALES
// ─────────────────────────────────────────────────────────────

function safeFormat(fecha, zona, formato) {
  if (!fecha) return "";
  try { return Utilities.formatDate(new Date(fecha), zona || TZ, formato || "dd/MM/yyyy"); }
  catch(e) { return ""; }
}

function jsonOut(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function tsNow() {
  return safeFormat(new Date(), TZ, "dd/MM/yyyy HH:mm:ss");
}

function log(nivel, accion, reservaID, cliente, detalle, error) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(HOJA_LOGS);
    if (!sheet) return;
    sheet.appendRow([
      tsNow(), nivel || "INFO", accion || "",
      reservaID || "", cliente || "",
      typeof detalle === "object" ? JSON.stringify(detalle) : (detalle || ""),
      error || ""
    ]);
  } catch(e) { Logger.log("LOG_FAIL: " + e.message); }
}
