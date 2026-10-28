import { burstAt, createCelebrationGate, isPerfectScore } from './effects.js';

/** Navigation and optional visual effects for the single cobalt interface. */
export function initShell() {
  const root = document.documentElement;
  const gate = createCelebrationGate();
  const artwork = document.querySelector('.hero-artwork');
  const nav = document.querySelector('.header-nav');
  const scoreNode = document.querySelector('#metric-score');
  let stopBurst = () => {};
  let currentScore = null;
  let pointerFrame = 0;
  let px = 0;
  let py = 0;

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'menu-toggle';
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', 'main-navigation');
  menu.setAttribute('aria-label', 'פתיחת תפריט');
  menu.innerHTML = '<span></span><span></span>';
  nav.id = 'main-navigation';
  nav.before(menu);
  nav.inert = true;

  function setMenu(open) {
    root.dataset.menu = open ? 'open' : 'closed';
    nav.inert = !open;
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'סגירת תפריט' : 'פתיחת תפריט');
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.dataset.menu === 'open') {
      setMenu(false);
      menu.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) setMenu(false);
  });

  const heartbeat = document.createElement('span');
  heartbeat.className = 'heart-loader';
  heartbeat.hidden = true;
  heartbeat.setAttribute('aria-hidden', 'true');
  heartbeat.innerHTML = '<i></i>'.repeat(9);
  document.querySelector('#generate').prepend(heartbeat);
  const motionAllowed = () => root.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function drawParallax() {
    pointerFrame = 0;
    artwork.style.setProperty('--mx', `${px}px`);
    artwork.style.setProperty('--my', `${py}px`);
  }
  artwork.addEventListener('pointermove', event => {
    if (!motionAllowed() || event.pointerType === 'touch') return;
    const rect = artwork.getBoundingClientRect();
    px = (event.clientX - rect.left - rect.width / 2) * .055;
    py = (event.clientY - rect.top - rect.height / 2) * .05;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(drawParallax);
  });
  artwork.addEventListener('pointerleave', () => { px = py = 0; drawParallax(); });

  function maybeCelebrate() {
    if (!motionAllowed() || document.hidden || !isPerfectScore(currentScore)) return;
    const rect = scoreNode.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    if (gate.take(currentScore)) stopBurst = burstAt(scoreNode);
  }
  new IntersectionObserver(maybeCelebrate, { threshold: .5 }).observe(scoreNode);
  new MutationObserver(() => {
    if (!motionAllowed()) {
      stopBurst();
      px = py = 0;
      drawParallax();
    }
  }).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  document.addEventListener('visibilitychange', maybeCelebrate);

  return {
    busy(value) { heartbeat.hidden = !value; },
    clear() {
      currentScore = null;
      gate.reset();
      stopBurst();
      scoreNode.closest('.metric').classList.remove('perfect-match');
    },
    result(score) {
      currentScore = score;
      if (!isPerfectScore(score)) stopBurst();
      scoreNode.closest('.metric').classList.toggle('perfect-match', isPerfectScore(score));
      maybeCelebrate();
    },
  };
}
