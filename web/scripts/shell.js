import { burstAt, createCelebrationGate, isPerfectScore } from './effects.js';

/** Navigation and optional visual effects for the single cobalt interface. */
export function initShell() {
  const root = document.documentElement;
  const gate = createCelebrationGate();
  const nav = document.querySelector('.header-nav');
  const scoreNode = document.querySelector('#metric-score');
  let stopBurst = () => {};
  let currentScore = null;

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'menu-toggle';
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', 'main-navigation');
  menu.setAttribute('aria-label', 'פתיחת תפריט');
  menu.innerHTML = '<span></span><span></span>';
  nav.id = 'main-navigation';
  nav.before(menu);
  // Wide screens show the links in the bar; only the compact menu hides them.
  const compact = matchMedia('(max-width: 760px)');
  nav.inert = compact.matches;
  compact.addEventListener('change', () => setMenu(false));

  function setMenu(open) {
    root.dataset.menu = open ? 'open' : 'closed';
    nav.inert = compact.matches && !open;
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

  function maybeCelebrate() {
    if (!motionAllowed() || document.hidden || !isPerfectScore(currentScore)) return;
    const rect = scoreNode.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    if (gate.take(currentScore)) stopBurst = burstAt(scoreNode);
  }
  new IntersectionObserver(maybeCelebrate, { threshold: .5 }).observe(scoreNode);
  new MutationObserver(() => {
    if (!motionAllowed()) stopBurst();
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
