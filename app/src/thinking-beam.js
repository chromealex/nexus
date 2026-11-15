// A smooth, gently breathing cubic curve from the persona (s) to the message edge (e).
// The curve leaves the head horizontally towards the message and arrives along the vertical, so it reads
// as a single elegant arc; `t` (seconds) only sways the control points a few pixels — no jitter.
export function beamPath(s, e, t = 0) {
  const dx = e.x - s.x,
    dy = e.y - s.y,
    length = Math.hypot(dx, dy) || 1,
    sway = Math.min(14, length * 0.05),
    a = Math.sin(t * 0.9) * sway,
    b = Math.cos(t * 0.7) * sway;
  const c1 = {x: s.x + dx * 0.55, y: s.y + dy * 0.05 + a},
    c2 = {x: e.x - dx * 0.08 + b, y: e.y - dy * 0.6};
  const f = n => n.toFixed(1);
  return `M${f(s.x)} ${f(s.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(e.x)} ${f(e.y)}`;
}
