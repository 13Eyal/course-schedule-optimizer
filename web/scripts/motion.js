/** Optional visual effects. All scheduling and data state live elsewhere. */
export function initMotion() {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.hero');
  let frame = 0;

  function update() {
    frame = 0;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function sync() {
    // Motion follows the system's reduced-motion setting; there is no separate switch.
    const off = reduced.matches;
    root.dataset.motion = off ? 'off' : 'on';
    if (off) {
      document.querySelectorAll('.is-waiting').forEach(node => node.classList.remove('is-waiting'));
    }
    schedule();
  }
  reduced.addEventListener('change', sync);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  sync();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) document.querySelectorAll('.header-nav a').forEach(link => link.removeAttribute('aria-current'));
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
