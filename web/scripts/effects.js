/** Small presentation effects, independent of the solver and its score. */
export const isPerfectScore = score => Number.isFinite(score) && score === 1;

/** One celebration per calculation, even when revisiting a perfect alternative. */
export function createCelebrationGate() {
  let celebrated = false;
  return {
    reset() { celebrated = false; },
    take(score) {
      if (celebrated || !isPerfectScore(score)) return false;
      celebrated = true;
      return true;
    },
  };
}

/** Red Stapler's local-canvas burst, implemented without a third-party runtime. */
export function burstAt(target) {
  const root = document.documentElement;
  if (root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'celebration-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const size = Math.min(600, innerWidth), dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = size * dpr; canvas.height = 500 * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = '500px';
  const position = () => {
    const rect = target.getBoundingClientRect();
    canvas.style.left = `${Math.max(0, Math.min(innerWidth-size, rect.left+rect.width/2-size/2))}px`;
    canvas.style.top = `${rect.top+rect.height/2-250}px`;
  };
  position();
  (target.closest('dialog') || document.body).append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return () => {}; }
  ctx.scale(dpr, dpr);
  const colors = ['#C66B3D','#8B9D83','#D4B895','#619EC4','#C48AAD'];
  const particles = Array.from({length:95}, (_,i) => ({
    x:size/2,y:250,vx:(Math.random()-.5)*10,vy:-4-Math.random()*9,
    rotation:Math.random()*6,spin:(Math.random()-.5)*.22,color:colors[i%colors.length],
  }));
  let frame, previous, age = 0;
  const stop = () => { cancelAnimationFrame(frame); canvas.remove(); document.removeEventListener('visibilitychange', hidden); };
  const hidden = () => { if (document.hidden) stop(); };
  document.addEventListener('visibilitychange', hidden);
  function tick(now) {
    if (!target.isConnected || root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return stop();
    const dt = previous ? Math.min(2,(now-previous)/16.67) : 1;
    previous=now; age+=dt;
    // The results panel can still be smoothly scrolling into view.
    position();
    ctx.clearRect(0,0,size,500);
    particles.forEach(p=>{
      p.vx*=Math.pow(.99,dt);p.vy+=.15*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt;
      ctx.save();ctx.globalAlpha=Math.max(0,1-age/120);ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
      ctx.fillStyle=p.color;ctx.fillRect(-3,-4,6,8);ctx.restore();
    });
    if(age<120) frame=requestAnimationFrame(tick); else stop();
  }
  frame=requestAnimationFrame(tick);
  return stop;
}
