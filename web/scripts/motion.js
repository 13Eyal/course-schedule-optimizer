/** Optional visual effects. All scheduling and data state live elsewhere. */
export function initMotion() {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const toggle = document.querySelector('#motion-toggle');
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.hero');
  const art = document.querySelector('.hero-art');
  let paused = false;
  let frame = 0;
  let tiltX = 0;
  let tiltY = 0;
  let heroVisible = true;
  try { paused = localStorage.getItem('carpedio-motion') === 'off'; } catch { /* Optional storage. */ }

  function update() {
    frame = 0;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    if (root.dataset.motion !== 'on' || !heroVisible) return;
    const progress = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / hero.offsetHeight));
    art.style.setProperty('--art-scroll', `${progress * 35}px`);
    art.style.setProperty('--tilt-x', `${tiltX}deg`);
    art.style.setProperty('--tilt-y', `${tiltY}deg`);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function sync() {
    const off = reduced.matches || paused;
    root.dataset.motion = off ? 'off' : 'on';
    toggle.setAttribute('aria-pressed', String(off));
    toggle.setAttribute('aria-label', off ? 'הפעלת אפקטי תנועה' : 'עצירת אפקטי תנועה');
    toggle.title = reduced.matches ? 'תנועה מופחתת לפי הגדרות המערכת' : (off ? 'הפעלת תנועה' : 'עצירת תנועה');
    toggle.disabled = reduced.matches;
    toggle.querySelector('span').textContent = off ? '▷' : 'Ⅱ';
    if (off) {
      art.style.removeProperty('--art-scroll');
      art.style.removeProperty('--tilt-x');
      art.style.removeProperty('--tilt-y');
      document.querySelectorAll('.is-waiting').forEach(node => node.classList.remove('is-waiting'));
    }
    schedule();
  }
  toggle.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('carpedio-motion', paused ? 'off' : 'on'); } catch { /* Optional storage. */ }
    sync();
  });
  reduced.addEventListener('change', sync);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  hero.addEventListener('pointermove', event => {
    if (root.dataset.motion !== 'on' || !finePointer.matches) return;
    const rect = hero.getBoundingClientRect();
    tiltX = ((event.clientX - rect.left) / rect.width - .5) * 12;
    tiltY = ((event.clientY - rect.top) / rect.height - .5) * -8;
    schedule();
  });
  hero.addEventListener('pointerleave', () => { tiltX = 0; tiltY = 0; schedule(); });
  sync();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      if (heroVisible) document.querySelectorAll('.header-nav a').forEach(link => link.removeAttribute('aria-current'));
      schedule();
    }).observe(hero);
    const reveals = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.remove('is-waiting');
        reveals.unobserve(entry.target);
      }
    }, { threshold: .12 });
    document.querySelectorAll('.reveal').forEach(node => {
      if (root.dataset.motion === 'on' && node.getBoundingClientRect().top > innerHeight) node.classList.add('is-waiting');
      reveals.observe(node);
    });
    const sections = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        document.querySelectorAll('.header-nav a').forEach(link => {
          if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-15% 0px -55% 0px' });
    document.querySelectorAll('#planner, #rhythms, #approach').forEach(section => sections.observe(section));
  }
}
