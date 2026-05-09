/**
 * PDF Utilities — Admin Dashboard
 * Funciones para generar y descargar PDFs
 */

function descargarPDFComprobante(reserva) {
  if (!reserva) { toast('Reserva no encontrada', 'error'); return; }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #333; background: #f5f5f5; }
    .container { background: white; padding: 40px; border-radius: 8px; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    h1 { color: #b8952a; text-align: center; margin: 0 0 30px; }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #eee; border-radius: 6px; }
    .label { color: #999; font-size: 12px; text-transform: uppercase; font-weight: bold; }
    .value { font-size: 14px; font-weight: 600; color: #333; margin-top: 4px; }
    .price { color: #b8952a; font-size: 18px; font-weight: bold; }
    .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
    @media print { body { background: white; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>COMPROBANTE DE RESERVA</h1>
    <p style="text-align: center; color: #999; margin: 0 0 20px;">Ref: ${reserva.id}</p>
    
    <div class="section">
      <div class="label">Cliente</div>
      <div class="value">${reserva.nombre}</div>
    </div>
    
    <div class="section">
      <div class="label">Email</div>
      <div class="value">${reserva.email}</div>
    </div>
    
    <div class="section">
      <div class="label">Teléfono</div>
      <div class="value">${reserva.telefono || '—'}</div>
    </div>
    
    <div class="section">
      <div class="label">Servicio</div>
      <div class="value">${reserva.servicioNombre}</div>
    </div>
    
    <div class="section">
      <div class="label">Especialista</div>
      <div class="value">${reserva.empleadoNombre}</div>
    </div>
    
    <div class="section">
      <div class="label">Fecha</div>
      <div class="value">${reserva.fecha}</div>
    </div>
    
    <div class="section">
      <div class="label">Hora</div>
      <div class="value">${reserva.horaInicio} – ${reserva.horaFin}</div>
    </div>
    
    <div class="section">
      <div class="label">Monto</div>
      <div class="value price">$${(reserva.precio || 0).toLocaleString('es-CL')} CLP</div>
    </div>
    
    <div class="section">
      <div class="label">Estado</div>
      <div class="value">${reserva.estado}</div>
    </div>
    
    <div class="footer">
      <p>Belleza Integral — Documento generado automáticamente</p>
      <p>${new Date().toLocaleDateString('es-CL')}</p>
    </div>
  </div>
</body>
</html>
  `;

  const opt = {
    margin: 10,
    filename: `comprobante-${reserva.id}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  };

  try {
    html2pdf().set(opt).from(html).save();
    toast('✅ Comprobante descargado', 'success');
  } catch (e) {
    console.error('PDF error:', e);
    toast('Error al generar PDF', 'error');
  }
}

function descargarPDFGiftCard(codigo, giftCard) {
  if (!giftCard) { toast('Gift card no encontrada', 'error'); return; }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f5f5f5; }
    .card { 
      width: 210mm;
      height: 120mm;
      background: linear-gradient(135deg, #b8952a 0%, #d4af37 100%);
      border-radius: 12px;
      padding: 30px;
      color: #1e1b2e;
      box-shadow: 0 8px 16px rgba(0,0,0,.2);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, rgba(255,255,255,.1) 0%, transparent 70%);
    }
    .content { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
    h1 { margin: 0; font-size: 32px; font-weight: bold; }
    .subtitle { font-size: 14px; opacity: 0.9; }
    .code { 
      font-family: 'Courier New', monospace;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 2px;
      margin: 15px 0;
    }
    .amount { font-size: 24px; font-weight: bold; }
    .info { font-size: 12px; opacity: 0.8; }
    @media print { body { background: white; padding: 0; } .card { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="content">
      <div>
        <h1>GIFT CARD</h1>
        <div class="subtitle">Belleza Integral</div>
      </div>
      <div style="text-align: center;">
        <div class="code">${codigo}</div>
        <div class="amount">$${(giftCard.monto || 0).toLocaleString('es-CL')} CLP</div>
      </div>
      <div class="info">
        <p style="margin: 0;">Válida hasta: ${giftCard.fecha_vencimiento || 'Sin vencimiento'}</p>
        <p style="margin: 0;">Presenta este código en tu próxima reserva</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const opt = {
    margin: 5,
    filename: `giftcard-${codigo}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
  };

  try {
    html2pdf().set(opt).from(html).save();
    toast('✅ Gift Card descargada', 'success');
  } catch (e) {
    console.error('PDF error:', e);
    toast('Error al generar PDF', 'error');
  }
}
