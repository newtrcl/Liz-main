/* ================================================================
   Belleza Integral — js/monitor.js
   Monitor de conexión: ping cada 30 s a /api/health.
   Muestra un dot verde/amarillo/rojo en la esquina inferior derecha.
   ================================================================ */

(function () {
  const PING_INTERVAL = 30_000;  // 30 segundos
  const ENDPOINT      = '/api/health';

  let _online  = true;
  let _timerId = null;

  function dot() {
    return document.getElementById('monitor-dot');
  }

  function setState(state) {
    const el = dot();
    if (!el) return;
    el.className = state === 'online'   ? '' :
                   state === 'offline'  ? 'offline' : 'checking';
    el.title     = state === 'online'   ? 'Conexión activa' :
                   state === 'offline'  ? 'Sin conexión — reintentando…' : 'Verificando…';
  }

  async function ping() {
    setState('checking');
    try {
      const res = await fetch(ENDPOINT, {
        method: 'GET',
        cache:  'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        _online = true;
        setState('online');
      } else {
        throw new Error('status ' + res.status);
      }
    } catch {
      _online = false;
      setState('offline');
    }
  }

  function start() {
    ping();
    _timerId = setInterval(ping, PING_INTERVAL);
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Reconectar inmediatamente cuando el navegador recupera red
  window.addEventListener('online',  () => { clearInterval(_timerId); ping(); _timerId = setInterval(ping, PING_INTERVAL); });
  window.addEventListener('offline', () => { setState('offline'); });

  // Exponer para uso externo (p.ej. pausar durante booking)
  window.Monitor = { isOnline: () => _online };
})();
