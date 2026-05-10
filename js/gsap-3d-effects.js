/**
 * GSAP 3D Effects — FASE 4
 * Galería de Servicios con efectos glassmorphism + 3D
 *
 * Basado en UI/UX Pro Max Skill:
 * - Easing: cubic-bezier(0.16, 1, 0.3, 1) — Expo.out cinematic
 * - Stagger: 40ms por card (rango recomendado 30–50ms)
 * - Duration: 0.7s entrada (micro: 150–300ms)
 * - prefers-reduced-motion: obligatorio
 * - transform/opacity únicamente (sin width/height/top/left)
 */

gsap.registerPlugin(ScrollTrigger);

// ── CONSTANTES DE DISEÑO (UI/UX Pro Max Skill) ────────────────
const EASING_CINEMATIC = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASING_ENTER     = 'power3.out';
const EASING_EXIT      = 'power2.in';
const DURATION_ENTER   = 0.7;
const DURATION_MICRO   = 0.25;
const STAGGER_CARDS    = 0.04; // 40ms — dentro del rango 30–50ms de la skill
const TILT_MAX_DEG     = 15;
const PARALLAX_DEPTH   = 30; // px de movimiento parallax en imagen

// ── DETECCIÓN reduced-motion ──────────────────────────────────
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// ── INICIALIZAR ───────────────────────────────────────────────
function initGSAP3DEffects() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('[GSAP] Librerías no cargadas, reintentando en 300ms...');
    setTimeout(initGSAP3DEffects, 300);
    return;
  }

  const cards = document.querySelectorAll('[data-gsap-effect="3d"]');
  if (!cards.length) {
    console.warn('[GSAP] No se encontraron tarjetas con data-gsap-effect="3d"');
    return;
  }

  console.log(`[GSAP] ✅ Iniciando efectos en ${cards.length} tarjetas`);
  console.log(`[GSAP] reduced-motion: ${prefersReducedMotion}`);

  if (prefersReducedMotion) {
    // Sin animaciones — mostrar todo visible de inmediato
    gsap.set(cards, { opacity: 1, y: 0, rotationX: 0, rotationY: 0 });
    console.log('[GSAP] reduced-motion activo — animaciones desactivadas');
    return;
  }

  _initScrollEntrance(cards);
  _initMouseTilt(cards);
  _initHoverGlow(cards);
}

// ── EFECTO 1: ENTRADA ESCALONADA CON SCROLL ───────────────────
function _initScrollEntrance(cards) {
  // Estado inicial: invisible y desplazadas hacia abajo
  gsap.set(cards, {
    opacity: 0,
    y: 60,
    rotationX: 8,
    transformPerspective: 1000,
    transformOrigin: 'center bottom',
  });

  // Animación de entrada disparada por ScrollTrigger
  ScrollTrigger.batch(cards, {
    start: 'top 88%',
    onEnter: (batch) => {
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        rotationX: 0,
        duration: DURATION_ENTER,
        ease: EASING_ENTER,
        stagger: STAGGER_CARDS,
      });
    },
    onLeaveBack: (batch) => {
      // Al salir por arriba — volver al estado inicial
      gsap.to(batch, {
        opacity: 0,
        y: 60,
        rotationX: 8,
        duration: DURATION_MICRO,
        ease: EASING_EXIT,
      });
    },
    once: false, // repetir al re-scrollear
  });

  // Parallax sutil en la imagen de cada card mientras se scrollea
  cards.forEach((card) => {
    const img = card.querySelector('[data-gsap-image]');
    if (!img) return;

    gsap.fromTo(
      img,
      { y: -PARALLAX_DEPTH },
      {
        y: PARALLAX_DEPTH,
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.5,
        },
      }
    );
  });
}

// ── EFECTO 2: TILT 3D AL MOVER EL MOUSE ─────────────────────
function _initMouseTilt(cards) {
  cards.forEach((card) => {
    const img = card.querySelector('[data-gsap-image]');
    if (!img) return;

    // Preparar perspectiva en la card
    gsap.set(card, { transformPerspective: 1000, transformStyle: 'preserve-3d' });

    card.addEventListener('mousemove', (e) => _onMouseMove(e, card, img));
    card.addEventListener('mouseleave', () => _onMouseLeave(card, img));
  });
}

function _onMouseMove(e, card, img) {
  const rect   = card.getBoundingClientRect();
  const relX   = (e.clientX - rect.left) / rect.width  - 0.5; // -0.5 a 0.5
  const relY   = (e.clientY - rect.top)  / rect.height - 0.5;

  const rotY   = relX * TILT_MAX_DEG;
  const rotX   = -relY * TILT_MAX_DEG;

  // Card entera: inclinación suave
  gsap.to(card, {
    rotationY: rotY * 0.5,
    rotationX: rotX * 0.5,
    duration: DURATION_MICRO,
    ease: EASING_CINEMATIC,
    overwrite: 'auto',
  });

  // Imagen: efecto más pronunciado (parallax inner)
  gsap.to(img, {
    rotationY: rotY,
    rotationX: rotX,
    x: relX * 8,
    y: relY * 8,
    scale: 1.04,
    duration: DURATION_MICRO,
    ease: EASING_CINEMATIC,
    overwrite: 'auto',
  });
}

function _onMouseLeave(card, img) {
  // Reset suave al salir — duración ligeramente mayor a la de entrada (MD: exit ~70% enter)
  const resetDuration = DURATION_MICRO * 1.4;

  gsap.to(card, {
    rotationY: 0,
    rotationX: 0,
    duration: resetDuration,
    ease: 'power2.out',
    overwrite: 'auto',
  });

  gsap.to(img, {
    rotationY: 0,
    rotationX: 0,
    x: 0,
    y: 0,
    scale: 1,
    duration: resetDuration,
    ease: 'power2.out',
    overwrite: 'auto',
  });
}

// ── EFECTO 3: GLOW DORADO EN HOVER ───────────────────────────
function _initHoverGlow(cards) {
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      gsap.to(card, {
        boxShadow: '0 20px 60px rgba(212, 175, 55, 0.35), 0 4px 20px rgba(0,0,0,0.4)',
        duration: DURATION_MICRO,
        ease: 'power2.out',
      });
    });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        duration: DURATION_MICRO * 1.4,
        ease: 'power2.out',
      });
    });
  });
}

// ── REFRESH al redimensionar ──────────────────────────────────
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
});

// ── ARRANQUE ─────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGSAP3DEffects);
} else {
  // DOM ya listo
  setTimeout(initGSAP3DEffects, 80);
}
