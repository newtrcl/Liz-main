/**
 * LIZ SaaS — Multi-Tenant Worker
 *
 * Este es el entry point principal que:
 * 1. Detecta el tenant por subdominio
 * 2. Carga su configuración desde Supabase
 * 3. Enruta requests según el pathname
 * 4. Responde 404 si no hay tenant válido
 */

import { getTenantFromRequest, loadTenantConfig } from './middleware/tenant-detection.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    console.log(`[Worker] ${request.method} ${url.hostname}${url.pathname}`);

    try {
      // PASO 1: Detectar tenant por subdominio
      const slug = getTenantFromRequest(request);

      // Si no hay tenant slug → Servir landing page
      if (!slug) {
        return serveRoot(request, env);
      }

      // PASO 2: Cargar configuración del tenant
      const tenant = await loadTenantConfig(env, slug);
      if (!tenant) {
        return json({ error: 'Tenant not found' }, 404);
      }

      // Inyectar tenant en contexto (para handlers)
      request.tenant = tenant;
      request.tenantId = tenant.id;

      // PASO 3: Routing según pathname
      const pathname = url.pathname;

      // Endpoints públicos
      if (pathname === '/' || pathname === '') {
        return serveIndex(request, tenant);
      }
      if (pathname === '/api/health') {
        return json({ ok: true, tenant: tenant.slug }, 200);
      }
      if (pathname === '/api/config') {
        return json({
          tenant: tenant.slug,
          name: tenant.name,
          config: tenant.config_json || {}
        }, 200);
      }

      // Endpoints protegidos (por implementar en Fase 3)
      if (pathname.startsWith('/api/')) {
        return json({ error: 'API endpoint not implemented yet' }, 501);
      }

      // Archivos estáticos HTML
      if (pathname === '/cliente.html') {
        return serveCliente(request, tenant);
      }
      if (pathname.startsWith('/admin/')) {
        return serveAdmin(request, env, tenant);
      }

      return json({ error: 'Not found' }, 404);

    } catch (error) {
      console.error('[Worker] Error:', error);
      return json({ error: error.message }, 500);
    }
  }
};

/**
 * ═════════════════════════════════════════════════════════════
 * HANDLERS (PLACEHOLDERS - Por implementar en Fase 3)
 * ═════════════════════════════════════════════════════════════
 */

function serveRoot(request, env) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>LIZ SaaS — Multi-Tenant Platform</title>
        <style>
          body { font-family: sans-serif; margin: 40px; }
          .container { max-width: 800px; }
          h1 { color: #333; }
          code { background: #f0f0f0; padding: 2px 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏢 LIZ SaaS</h1>
          <p>Multi-tenant platform for salon management</p>

          <h2>Available Tenants</h2>
          <ul>
            <li><code>demo.newt.newtraderchiles.workers.dev</code> — Demo tenant</li>
            <li><code>liz-belleza.newt.newtraderchiles.workers.dev</code> — Belleza Integral</li>
          </ul>

          <h2>Status</h2>
          <p>✅ Worker is running</p>
          <p>⚙️ Tenant detection working</p>
          <p>🔧 Endpoints being implemented...</p>
        </div>
      </body>
    </html>
  `;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function serveIndex(request, tenant) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${tenant.name} — Reserva tu cita</title>
      </head>
      <body>
        <h1>${tenant.name}</h1>
        <p>Plataforma de reservas</p>
        <p>Estado: En desarrollo (Fase 3)</p>
      </body>
    </html>
  `;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function serveCliente(request, tenant) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Mi cuenta — ${tenant.name}</title>
      </head>
      <body>
        <h1>Portal de Cliente</h1>
        <p>Tenant: ${tenant.name}</p>
        <p>Estado: En desarrollo (Fase 3)</p>
      </body>
    </html>
  `;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function serveAdmin(request, env, tenant) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Admin — ${tenant.name}</title>
      </head>
      <body>
        <h1>Panel de Administración</h1>
        <p>Tenant: ${tenant.name}</p>
        <p>Status: En desarrollo (Fase 4)</p>
      </body>
    </html>
  `;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
