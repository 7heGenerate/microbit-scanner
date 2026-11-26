// Small 3D point viewer (no libraries). The camera orbits a fixed vertical base axis.
export function createView(canvas) {
  const ctx = canvas.getContext('2d');
  const HOME = { yaw: 0, pitch: 0.7, dist: 7 };
  const cam = { ...HOME };
  const limit = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let cloud = [], w = 0, h = 0, queued = false;

  function request() {
    if (!queued) { queued = true; requestAnimationFrame(draw); }
  }
  function project([x, y, z]) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;           // spin about vertical axis
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;         // look down on it
    const depth = cam.dist - z2;
    if (depth < 0.1) return null;
    const f = Math.min(w, h) * 1.1 / depth;
    return [w / 2 + x1 * f, h / 2 - y2 * f, depth, f];
  }
  function line(a, b, colour, width = 1) {
    const p = project(a), q = project(b);
    if (!p || !q) return;
    ctx.strokeStyle = colour; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  }
  function label(text, at, colour) {
    const p = project(at);
    if (p) { ctx.fillStyle = colour; ctx.fillText(text, p[0] + 4, p[1] - 4); }
  }
  function draw() {
    queued = false;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '13px system-ui, sans-serif';
    // base: 0.5 m grid and 1/2/3 m range rings, at sensor height
    for (let i = -3; i <= 3.001; i += 0.5) {
      line([i, 0, -3], [i, 0, 3], '#222b4d');
      line([-3, 0, i], [3, 0, i], '#222b4d');
    }
    for (let r = 1; r <= 3; r++) {
      for (let k = 0; k < 72; k++) {
        const a = k * Math.PI / 36, b = (k + 1) * Math.PI / 36;
        line([r * Math.sin(a), 0, r * Math.cos(a)], [r * Math.sin(b), 0, r * Math.cos(b)], '#46568c');
      }
      label(r + ' m', [r, 0, 0], '#8794c4');
    }
    line([0, 0, 0], [0, 1.5, 0], '#6dff9c', 3);   label('base axis', [0, 1.5, 0], '#6dff9c');
    line([0, 0, 0], [0, 0, -1], '#ffb347', 3);    label('front', [0, 0, -1], '#ffb347');
    // points, far ones first
    const shown = cloud.map(c => ({ p: project(c.xyz), colour: c.colour }))
      .filter(c => c.p).sort((a, b) => b.p[2] - a.p[2]);
    for (const { p, colour } of shown) {
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(p[0], p[1], limit(p[3] * 0.025, 1.5, 8), 0, 2 * Math.PI); ctx.fill();
    }
  }
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * ratio; canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    request();
  }

  // ---- fingers: 1 = rotate/tilt, 2 = pinch zoom and twist ----
  const fingers = new Map();
  let lastTap = 0, moved = 0;
  const pair = () => {
    const [a, b] = [...fingers.values()];
    return { gap: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const reset = () => { Object.assign(cam, HOME); request(); };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = fingers.size > 1 ? 99 : 0;
  });
  canvas.addEventListener('pointermove', e => {
    const old = fingers.get(e.pointerId);
    if (!old) return;
    const before = fingers.size === 2 ? pair() : null;
    const dx = e.clientX - old.x, dy = e.clientY - old.y;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (fingers.size === 1) {
      cam.yaw += dx * 0.008;
      cam.pitch = limit(cam.pitch + dy * 0.008, 0, Math.PI / 2);   // never goes under the base
    } else if (before) {
      const after = pair();
      if (before.gap > 10 && after.gap > 10) cam.dist = limit(cam.dist * before.gap / after.gap, 1.5, 15);
      let turn = after.angle - before.angle;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      cam.yaw -= turn;
    }
    request();
  });
  const lift = e => {
    if (!fingers.delete(e.pointerId)) return;
    if (e.type === 'pointerup' && fingers.size === 0 && moved < 8) {
      if (e.timeStamp - lastTap < 350) reset();                    // double tap
      lastTap = e.timeStamp;
    }
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.dist = limit(cam.dist * Math.exp(e.deltaY * 0.001), 1.5, 15);
    request();
  }, { passive: false });
  window.addEventListener('resize', resize);
  resize();

  return { setPoints(list) { cloud = list; request(); }, reset, cam };
}
