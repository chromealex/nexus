// Screen-space effects anchored to the visible, fixed 3D surface.
export function hitPersona(data, x, y, width, height, scale, radius = 22) {
  let hit = null,
    best = radius * radius,
    front = -Infinity;
  for (let i = 0; i < 64000 * 18; i += 18) {
    if (data[i + 17] < 0.12) continue;
    const px = width / 2 + (data[i] * scale * height) / 2,
      py = height / 2 - (data[i + 1] * scale * height) / 2;
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < best || (d === best && data[i + 2] > front)) {
      best = d;
      front = data[i + 2];
      hit = {x: px, y: py};
    }
  }
  return hit;
}
export function lightningPaths(origin, width, height, random = Math.random) {
  const clamp = ([x, y]) => [Math.max(4, Math.min(width - 4, x)), Math.max(4, Math.min(height - 4, y))];
  let dx = origin.x - width / 2,
    dy = (origin.y - height / 2) * 0.65;
  if (Math.hypot(dx, dy) < 30) {
    dx = random() < 0.5 ? -1 : 1;
    dy = -0.5;
  }
  const angle = Math.atan2(dy, dx) + (random() - 0.5) * 0.65;
  const reach = Math.min(width * 0.32, height * 0.32, 145 + random() * 105);
  const start = [origin.x, origin.y],
    end = clamp([start[0] + Math.cos(angle) * reach, start[1] + Math.sin(angle) * reach]);
  // Midpoint displacement on several scales creates a crooked channel, not
  // a regular sawtooth. Endpoints remain shared exactly at branching nodes.
  function channel(a, b, roughness, depth) {
    if (!depth) return [a, b];
    const x = b[0] - a[0],
      y = b[1] - a[1],
      length = Math.hypot(x, y) || 1;
    const t = 0.35 + random() * 0.3,
      offset = (random() - 0.5) * roughness;
    const mid = clamp([a[0] + x * t - (y / length) * offset, a[1] + y * t + (x / length) * offset]);
    const left = channel(a, mid, roughness * 0.53, depth - 1),
      right = channel(mid, b, roughness * 0.53, depth - 1);
    return [...left.slice(0, -1), ...right];
  }
  const main = channel(start, end, reach * 0.45, 5),
    paths = [];
  const encode = points =>
    points.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join(' ');
  function add(points, thickness, delay, branch) {
    paths.push({d: encode(points), width: thickness, delay, branch});
  }
  // Taper the trunk and reveal its successive sections outward from the face.
  for (let i = 0; i < 4; i++) add(main.slice(i * 8, i * 8 + 9), 1.55 - i * 0.3, i * 15, false);
  const branches = 3 + Math.floor(random() * 3);
  for (let branch = 0; branch < branches; branch++) {
    const index = 5 + Math.floor(random() * 22),
      p = main[index],
      next = main[index + 1];
    const heading =
      Math.atan2(next[1] - p[1], next[0] - p[0]) + (random() < 0.5 ? -1 : 1) * (0.45 + random() * 0.7);
    const distance = reach * (0.13 + random() * 0.24) * (1 - index / 48);
    const tip = clamp([p[0] + Math.cos(heading) * distance, p[1] + Math.sin(heading) * distance]);
    const fork = channel(p, tip, distance * 0.5, 3),
      delay = index * 1.9 + 12;
    add(fork.slice(0, 5), 0.75, delay, true);
    add(fork.slice(4), 0.35, delay + 18, true);
    if (branch % 2 === 0) {
      const node = fork[4],
        a = heading + (random() < 0.5 ? -0.7 : 0.7);
      add(
        channel(
          node,
          clamp([node[0] + Math.cos(a) * distance * 0.4, node[1] + Math.sin(a) * distance * 0.4]),
          distance * 0.15,
          2
        ),
        0.25,
        delay + 25,
        true
      );
    }
  }
  return paths;
}

export const CHARGE_DURATION_MS = 8000;
export function excitationEnvelope(age) {
  return age < 0 || age >= 8 ? 0 : (1 - Math.exp(-age * 12)) * Math.pow(1 - age / 8, 1.5);
}
export function internalDischarge(data, origin, width, height, scale, random = Math.random) {
  const side = origin.x < width / 2 ? -1 : 1;
  let exit = origin,
    best = 0;
  for (let i = 0; i < 64000 * 18; i += 18) {
    if (data[i + 17] < 0.1) continue;
    const x = width / 2 + (data[i] * scale * height) / 2,
      y = height / 2 - (data[i + 1] * scale * height) / 2;
    const score = (x - origin.x) * side - Math.abs(y - origin.y) * 1.6;
    if (score > best) {
      best = score;
      exit = {x, y};
    }
  }
  const nodes = [origin];
  for (let i = 1; i < 11; i++) {
    const t = i / 11,
      x = origin.x + (exit.x - origin.x) * t,
      y = origin.y + (exit.y - origin.y) * t + (random() - 0.5) * 20 * Math.sin(t * Math.PI);
    nodes.push(hitPersona(data, x, y, width, height, scale, 28) || nodes[nodes.length - 1]);
  }
  nodes.push(exit);
  const chargePath = new Float32Array(36),
    paths = [];
  for (let i = 0; i < 12; i++) {
    chargePath[i * 3] = ((nodes[i].x - width / 2) * 2) / (scale * height);
    chargePath[i * 3 + 1] = ((height / 2 - nodes[i].y) * 2) / (scale * height);
    chargePath[i * 3 + 2] = i * 0.055;
    if (i)
      paths.push({
        d: `M${nodes[i - 1].x.toFixed(2)} ${nodes[i - 1].y.toFixed(2)} L${nodes[i].x.toFixed(2)} ${nodes[i].y.toFixed(2)}`,
        width: 1.1,
        delay: (i - 1) * 55,
        branch: false,
        internal: true,
      });
  }
  paths.push(...lightningPaths(exit, width, height, random).map(p => ({...p, delay: p.delay + 605})));
  return {paths, chargePath, exit};
}
