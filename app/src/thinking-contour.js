// Uniform samples of a rounded rectangle, clockwise from the top edge.
export function thinkingContour(rect, source, viewport, radius = 24) {
  const {left: l, top: t, right: r, bottom: b} = rect,
    w = r - l,
    h = b - t;
  if (w <= 0 || h <= 0 || b <= viewport.top || t >= viewport.bottom) return null;
  const rad = Math.max(0, Math.min(radius, w / 2, h / 2)),
    a = w - 2 * rad,
    c = h - 2 * rad,
    q = (Math.PI * rad) / 2;
  const lengths = [a, q, c, q, a, q, c, q],
    total = lengths.reduce((x, y) => x + y, 0);
  const point = s => {
    let i = 0;
    while (i < 7 && s > lengths[i]) s -= lengths[i++];
    const u = lengths[i] ? s / lengths[i] : 0;
    if (i === 0) return {x: l + rad + s, y: t};
    if (i === 2) return {x: r, y: t + rad + s};
    if (i === 4) return {x: r - rad - s, y: b};
    if (i === 6) return {x: l, y: b - rad - s};
    const centers = [
        [r - rad, t + rad],
        [r - rad, b - rad],
        [l + rad, b - rad],
        [l + rad, t + rad],
      ],
      j = (i - 1) / 2,
      angle = (-0.5 + j * 0.5 + u * 0.5) * Math.PI;
    return {x: centers[j][0] + Math.cos(angle) * rad, y: centers[j][1] + Math.sin(angle) * rad};
  };
  const n = 240,
    points = Array.from({length: n}, (_, i) => point((total * i) / n));
  let nearest = -1,
    distance = Infinity;
  points.forEach((p, i) => {
    if (p.y < viewport.top || p.y > viewport.bottom) return;
    const d = (p.x - source.x) ** 2 + (p.y - source.y) ** 2;
    if (d < distance) {
      distance = d;
      nearest = i;
    }
  });
  if (nearest < 0) return null;
  const path = direction =>
    Array.from({length: n / 2 + 1}, (_, i) => {
      const p = points[(nearest + direction * i + n) % n];
      return `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }).join(' ');
  return {contact: points[nearest], paths: [path(1), path(-1)]};
}
