import React, {useEffect, useRef, useId} from 'react';

import {thinkingContour} from './thinking-contour.js';

// Decorative, scoped to the active chat; never participates in pointer hit-testing.
export function ThinkingLightning({active, chatId}) {
  const clipId = useId().replace(/:/g, ''),
    border = useRef(null),
    clip = useRef(null);
  const svg = useRef(null),
    glow = useRef(null),
    core = useRef(null),
    energy = useRef(null);
  useEffect(() => {
    if (!active) return;
    const el = svg.current,
      app = el.closest('.app'),
      viewport = app.querySelector('.chat-thread');
    const canvas = app.querySelector('.workspace-persona canvas');
    if (!viewport || !canvas) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      last = -Infinity,
      disposed = false;
    const draw = now => {
      frame = 0;
      if (disposed || document.hidden) {
        el.style.visibility = 'hidden';
        return;
      }
      const target = viewport.querySelector('[data-thinking-target="true"]');
      if (!target) {
        el.style.visibility = 'hidden';
        return;
      }
      const vr = viewport.getBoundingClientRect(),
        tr = target.getBoundingClientRect(),
        cr = canvas.getBoundingClientRect();
      const top = Math.max(tr.top, vr.top),
        bottom = Math.min(tr.bottom, vr.bottom);
      const hx = Number(canvas.dataset.lightningX),
        hy = Number(canvas.dataset.lightningY);
      if (bottom <= top || !Number.isFinite(hx) || !Number.isFinite(hy) || !canvas.dataset.lightningX) {
        el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      if (now - last > 33 || media.matches) {
        last = now;
        const sr = el.getBoundingClientRect(),
          sx = cr.left + hx - sr.left,
          sy = cr.top + hy - sr.top;
        // Meet the edge of the visible message, not its text or buttons.
        const bounds = {
          left: tr.left - sr.left - 2,
          right: tr.right - sr.left + 2,
          top: tr.top - sr.top - 2,
          bottom: tr.bottom - sr.top + 2,
        };
        const contour = thinkingContour(
          bounds,
          {x: sx, y: sy},
          {top: vr.top - sr.top, bottom: vr.bottom - sr.top},
          (parseFloat(getComputedStyle(target).borderTopLeftRadius) || 8) + 2
        );
        if (!contour) {
          el.style.visibility = 'hidden';
          return;
        }
        const {x: tx, y: ty} = contour.contact;
        for (const [name, value] of Object.entries({
          x: vr.left - sr.left,
          y: vr.top - sr.top,
          width: vr.width,
          height: vr.height,
        }))
          clip.current.setAttribute(name, value);
        [...border.current.children].forEach((group, i) => {
          for (const path of group.children) {
            path.setAttribute('d', contour.paths[i]);
            if (path.classList.contains('thinking-lightning-energy'))
              path.style.strokeDashoffset = String(-(media.matches ? 0 : now / 1000) * 0.35);
          }
        });
        const dx = tx - sx,
          dy = ty - sy,
          length = Math.hypot(dx, dy) || 1,
          t = media.matches ? 0 : now / 1000;
        let d = `M${sx.toFixed(2)} ${sy.toFixed(2)}`;
        for (let i = 1; i <= 28; i++) {
          const u = i / 28,
            envelope = Math.sin(u * Math.PI),
            bend =
              (Math.sin(u * 12 + t * 1.3) * 7 +
                Math.sin(u * 43 - t * 2.1) * 3 +
                Math.sin(u * 91 + t * 3) * 1.3) *
              envelope *
              Math.min(1, length / 100);
          d += ` L${(sx + dx * u - (dy / length) * bend).toFixed(2)} ${(sy + dy * u + (dx / length) * bend).toFixed(2)}`;
        }
        for (const path of [glow.current, core.current, energy.current]) path.setAttribute('d', d);
        energy.current.style.strokeDashoffset = String(-t * 0.55);
      }
      if (!media.matches) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(draw);
    };
    const resize = new ResizeObserver(wake);
    resize.observe(viewport);
    resize.observe(canvas);
    const changes = new MutationObserver(wake);
    changes.observe(viewport, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-thinking-target'],
    });
    const anchor = new MutationObserver(wake);
    anchor.observe(canvas, {attributes: true, attributeFilter: ['data-lightning-x', 'data-lightning-y']});
    viewport.addEventListener('scroll', wake, {passive: true});
    window.addEventListener('resize', wake);
    document.addEventListener('visibilitychange', wake);
    media.addEventListener('change', wake);
    wake();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
      anchor.disconnect();
      viewport.removeEventListener('scroll', wake);
      window.removeEventListener('resize', wake);
      document.removeEventListener('visibilitychange', wake);
      media.removeEventListener('change', wake);
    };
  }, [active, chatId]);
  return active ? (
    <svg ref={svg} className="thinking-lightning" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect ref={clip} />
        </clipPath>
      </defs>
      <g ref={border} clipPath={`url(#${clipId})`}>
        {[0, 1].map(i => (
          <g key={i}>
            <path className="thinking-lightning-glow" />
            <path className="thinking-lightning-core" />
            <path pathLength="1" className="thinking-lightning-energy" />
          </g>
        ))}
      </g>
      <path ref={glow} className="thinking-lightning-glow" />
      <path ref={core} className="thinking-lightning-core" />
      <path ref={energy} pathLength="1" className="thinking-lightning-energy" />
    </svg>
  ) : null;
}
