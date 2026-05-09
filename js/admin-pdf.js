function descargarPDFComprobante(reserva) {
  if (typeof html2pdf === 'undefined') {
    alert('HTML2PDF no está disponible. Intenta nuevamente.');
    return;
  }

  const html = generarHTMLComprobante(reserva);
  const opt = {
    margin: 10,
    filename: 'comprobante-' + reserva.id + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  };

  html2pdf().set(opt).from(html).save();
}

function generarHTMLComprobante(reserva) {
  const fechaFormato = new Date(reserva.fecha + 'T00:00:00').toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const precioFormato = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(reserva.precio);

  const estadoStyle = reserva.estado === 'Pagada' ? 'background: #dcfce7; color: #166534;' :
    reserva.estado === 'Completada' ? 'background: #dbeafe; color: #1e40af;' :
    reserva.estado === 'Pendiente' ? 'background: #fef3c7; color: #92400e;' :
    'background: #fee2e2; color: #991b1b;';

  const html = document.createElement('div');
  html.innerHTML = '<div style="width: 100%; max-width: 800px; margin: 0 auto; padding: 40px; font-family: Segoe UI, Arial, sans-serif; color: #1f2937;">' +
    '<div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #d4af37; padding-bottom: 20px;">' +
    '<h1 style="margin: 0; color: #d4af37; font-size: 28px;">COMPROBANTE DE RESERVA</h1>' +
    '<p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Belleza Integral</p>' +
    '</div>' +
    '<div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px;">' +
    '<p style="margin: 0 0 10px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">ID de Reserva</p>' +
    '<p style="margin: 0; font-size: 18px; font-weight: 700; color: #1f2937; font-family: monospace;">' + reserva.id + '</p>' +
    '</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">' +
    '<div>' +
    '<p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Cliente</p>' +
    '<p style="margin: 0; font-size: 14px; color: #1f2937;">' + (reserva.nombre || '') + '</p>' +
    '<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">' + (reserva.email || '') + '</p>' +
    '<p style="margin: 2px 0 0; font-size: 13px; color: #6b7280;">' + (reserva.telefono || 'Sin teléfono') + '</p>' +
    '</div>' +
    '<div>' +
    '<p style="margin: 0 0 8px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Estado</p>' +
    '<p style="margin: 0; font-size: 14px; font-weight: 600; padding: 6px 12px; border-radius: 4px; width: fit-content;' + estadoStyle + '">' + reserva.estado + '</p>' +
    '</div>' +
    '</div>' +
    '<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 30px;">' +
    '<p style="margin: 0 0 12px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Servicio</p>' +
    '<p style="margin: 0 0 15px; font-size: 16px; font-weight: 600; color: #1f2937;">' + (reserva.servicioNombre || '') + '</p>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">' +
    '<div><p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Especialista</p>' +
    '<p style="margin: 0; font-size: 14px; color: #1f2937;">' + (reserva.empleadoNombre || '') + '</p></div>' +
    '<div><p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Duración</p>' +
    '<p style="margin: 0; font-size: 14px; color: #1f2937;">' + (reserva.duracion || 60) + ' minutos</p></div>' +
    '</div>' +
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">' +
    '<div><p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Fecha</p>' +
    '<p style="margin: 0; font-size: 14px; color: #1f2937;">' + fechaFormato + '</p></div>' +
    '<div><p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Hora</p>' +
    '<p style="margin: 0; font-size: 14px; color: #1f2937;">' + (reserva.horaInicio || '') + ' - ' + (reserva.horaFin || '') + '</p></div>' +
    '</div>' +
    '</div>' +
    '<div style="background: linear-gradient(135deg, #d4af37 0%, #f5d547 100%); padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">' +
    '<p style="margin: 0 0 8px; font-size: 12px; color: rgba(31, 41, 55, 0.7); text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Monto</p>' +
    '<p style="margin: 0; font-size: 28px; font-weight: 700; color: #1f2937;">' + precioFormato + '</p>' +
    '</div>' +
    '<div style="border-top: 2px solid #e5e7eb; padding-top: 20px; text-align: center;">' +
    '<p style="margin: 0; font-size: 12px; color: #9ca3af;">Documento generado automáticamente</p>' +
    '<p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">' + new Date().toLocaleDateString('es-CL') + '</p>' +
    '</div>' +
    '</div>';

  return html;
}
