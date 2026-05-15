/**
 * Tenant Detection Middleware
 *
 * Detecta el tenant por el subdominio de la URL:
 * - demo.newt.newtraderchiles.workers.dev → "demo"
 * - liz-belleza.newt.newtraderchiles.workers.dev → "liz-belleza"
 * - newt.newtraderchiles.workers.dev → null (landing page)
 */

/**
 * Extrae el slug del tenant del subdominio
 *
 * @param {Request} request - Objeto Request de Cloudflare
 * @returns {string|null} - Slug del tenant o null si no hay
 */
export function getTenantFromRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  console.log(`[TenantDetection] Hostname: ${hostname}`);

  // Extraer partes del hostname
  // Ejemplo: "liz-belleza.newt.newtraderchiles.workers.dev"
  // → ["liz-belleza", "newt", "newtraderchiles", "workers", "dev"]
  const parts = hostname.split('.');

  if (parts.length < 2) {
    return null;
  }

  const slug = parts[0]; // "liz-belleza"

  // Validar que sea un slug válido
  if (!slug || slug === 'newt' || slug === 'admin' || slug === 'www') {
    return null;
  }

  // Validar formato: solo letras, números y guiones
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return null;
  }

  console.log(`[TenantDetection] ✅ Tenant slug: ${slug}`);
  return slug;
}

/**
 * Carga la configuración del tenant desde Supabase
 *
 * @param {Object} env - Variables de entorno (SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.)
 * @param {string} slug - Slug del tenant ("demo", "liz-belleza", etc.)
 * @returns {Object|null} - Objeto tenant con id, name, config, etc. o null si no existe
 */
export async function loadTenantConfig(env, slug) {
  if (!slug) {
    return null;
  }

  try {
    // Query Supabase para obtener tenant por slug
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/tenants`);
    url.searchParams.append('slug', `eq.${slug}`);
    url.searchParams.append('select', '*');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[TenantDetection] Supabase error: ${response.status}`);
      return null;
    }

    const tenants = await response.json();

    if (!tenants || tenants.length === 0) {
      console.warn(`[TenantDetection] ⚠️ Tenant not found: ${slug}`);
      return null;
    }

    const tenant = tenants[0];
    console.log(`[TenantDetection] ✅ Loaded tenant: ${tenant.name}`);

    return tenant;

  } catch (error) {
    console.error(`[TenantDetection] Error loading tenant:`, error);
    return null;
  }
}

/**
 * Cachea tenants en KV para evitar queries repetidas (opcional)
 * Por ahora, cada request hace un query a Supabase
 * TODO: Implementar caché en KV si performance lo requiere
 */
