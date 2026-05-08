// ═══════════════════════════════════════════════════════════════
// ADMIN PDF UTILITIES — Funciones para generar y descargar PDFs
// Usa html2pdf.js (CDN)
// ═══════════════════════════════════════════════════════════════

// ── PDF GIFT CARD ──────────────────────────────────────────────

function descargarPDFGiftCard(giftCardID, giftCard) {
  try {
    const html = `
      <div style="width: 280px; padding: 40px 30px; font-family: Arial, sans-serif; text-align: center; background: linear-gradient(135deg, #d4af37 0%, #f5d547 100%); color: #1f2937;">
        <h1 style="font-size: 32px; font-weight: 700; margin: 0 0 15px; letter-spacing: 2px;">GIFT CARD</h1>
        <p style="font-size: 18px; font-weight: 700; letter-spacing: 3px; margin: 0 0 25px; font-family: monospace;">${giftCard.codigo}</p>
        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="font-size: 12px; color: rgba(0,0,0,0.6); margin: 0 0 5px;">MONTO</p>
          <p style="font-size: 28px; font-weight: 700; margin: 0;">$${(giftCard.monto || 0).toLocaleString('es-CL')}</p>
          <p style="font-size: 11px; color: rgba(0,0,0,0.6); margin: 5px 0 0;">CLP</p>
        </div>
        ${giftCard.fechaVencimiento ? `
          <p style="font-size: 11px; margin: 0 0 20px; color: rgba(0,0,0,0.7);">Válida hasta<br><strong>${giftCard.fechaVencimiento}</strong></p>
        ` : `
          <p style="font-size: 11px; margin: 0 0 20px; color: rgba(0,0,0,0.7);">Sin fecha de vencimiento</p>
        `}
        <div style="margin: 30px 0; padding-top: 20px; border-top: 2px dashed rgba(0,0,0,0.2);">
          <p style="font-size: 10px; color: rgba(0,0,0,0.7); margin: 0; font-weight: 600;">Presentar en reserva o mencionar al pagar</p>
        </div>
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = html;
    document.body.appendChild(element);

    const opt = {
      margin: 5,
      filename: `giftcard-${giftCard.codigo}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: [100, 150] },
    };

    html2pdf().set(opt).from(element).save().then(() => {
      document.body.removeChild(element);
    });
  } catch (e) {
    console.error('PDF Gift Card error:', e);
    toast('Error al generar PDF: ' + e.message, 'error');
  }
}

// ── PDF COMPROBANTE DE RESERVA ────────────────────────────────

function descargarPDFComprobante(reserva) {
  try {
    const fecha = new Date(`${reserva.fecha}T12:00:00`);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const fechaFormato = `${dias[fecha.getDay()]}, ${fecha.getDate()} de ${meses[fecha.getMonth()]} de ${fecha.getFullYear()}`;

    const html = `
      <div style="padding: 40px; font-family: Arial, sans-serif; color: #333; max-width: 600px;">
        <!-- HEADER -->
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #d4af37;">
          <h1 style="font-size: 24px; color: #d4af37; margin: 0; font-weight: 700;">COMPROBANTE DE RESERVA</h1>
          <p style="font-size: 12px; color: #666; margin: 8px 0 0;">Belleza Integral</p>
        </div>

        <!-- NÚMERO DE RESERVA -->
        <div style="text-align: center; margin-bottom: 30px;">
          <p style="font-size: 13px; color: #666; margin: 0 0 5px; text-transform: uppercase;">Número de Reserva</p>
          <p style="font-size: 20px; font-weight: 700; color: #1f2937; margin: 0; font-family: monospace;">${reserva.id}</p>
        </div>

        <!-- INFORMACIÓN DEL CLIENTE -->
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="font-size: 13px; font-weight: 700; color: #374151; margin: 0 0 12px; text-transform: uppercase;">Datos del Cliente</h3>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Nombre:</strong> ${reserva.nombre}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Email:</strong> ${reserva.email}</p>
          ${reserva.telefono ? `<p style="margin: 5px 0; font-size: 13px;"><strong>Teléfono:</strong> ${reserva.telefono}</p>` : ''}
        </div>

        <!-- DETALLES DE LA CITA -->
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="font-size: 13px; font-weight: 700; color: #374151; margin: 0 0 12px; text-transform: uppercase;">Detalles de la Cita</h3>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Servicio:</strong> ${reserva.servicioNombre}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Especialista:</strong> ${reserva.empleadoNombre}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Fecha:</strong> ${fechaFormato}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Hora:</strong> ${reserva.horaInicio} - ${reserva.horaFin}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Estado:</strong> ${reserva.estado}</p>
        </div>

        <!-- PRECIO -->
        <div style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); padding: 15px; border-radius: 8px; border: 2px solid #d4af37; margin-bottom: 30px; text-align: center;">
          <p style="font-size: 12px; color: #666; margin: 0 0 5px; text-transform: uppercase;">Total a Pagar</p>
          <p style="font-size: 28px; font-weight: 700; color: #d4af37; margin: 0;">$${(reserva.precio || 0).toLocaleString('es-CL')}</p>
          <p style="font-size: 12px; color: #666; margin: 5px 0 0;">CLP</p>
        </div>

        <!-- FOOTER -->
        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 11px; color: #6b7280; text-align: center;">
          <p style="margin: 0 0 5px;">Este documento fue generado automáticamente y es válido sin firma.</p>
          <p style="margin: 0;">Belleza Integral • Contacto: contacto@bellezaintegral.com</p>
        </div>
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = html;
    document.body.appendChild(element);

    const opt = {
      margin: 10,
      filename: `comprobante-${reserva.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
    };

    html2pdf().set(opt).from(element).save().then(() => {
      document.body.removeChild(element);
    });
  } catch (e) {
    console.error('PDF Comprobante error:', e);
    toast('Error al generar PDF: ' + e.message, 'error');
  }
}
