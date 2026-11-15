import React, {useEffect, useRef, useId} from 'react';

import {thinkingContour} from './thinking-contour.js';
import {beamPath} from './thinking-beam.js';

// While NEXUS answers, a soft beam of light flows from the persona to the message being written; the
// message itself carries a slowly turning aurora rim (CSS on [data-thinking-target]). Decorative only,
// scoped to the active chat, never in pointer hit-testing, still with reduced motion.
export function ThinkingLightning({active, chatId}) {
  const id = useId().replace(/:/g, ''),
    svg = useRef(null),
    gradient = useRef(null),
    clip = useRef(null),
    halo = useRef(null),
    core = useRef(null),
    pulses = useRef(null),
    spark = useRef(null),
    source = useRef(null);
  useEffect(() => {
    if (!active) return;
    const el = svg.current,
      app = el.closest('.app'),
      viewport = app.querySelector('.chat-thread');
    const canvas = app.querySelector('.workspace-persona canvas');
    if (!viewport || !canvas) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      disposed = false;
    const hide = () => {
      el.style.opacity = '0';
    };
    const draw = now => {
      frame = 0;
      if (disposed || document.hidden) return hide();
      const target = viewport.querySelector('[data-thinking-target="true"]');
      const hx = Number(canvas.dataset.lightningX),
        hy = Number(canvas.dataset.lightningY);
      if (!target || !Number.isFinite(hx) || !Number.isFinite(hy) || !canvas.dataset.lightningX)
        return hide();
      const vr = viewport.getBoundingClientRect(),
        tr = target.getBoundingClientRect(),
        cr = canvas.getBoundingClientRect(),
        sr = el.getBoundingClientRect();
      const s = {x: cr.left + hx - sr.left, y: cr.top + hy - sr.top};
      const contour = thinkingContour(
        {
          left: tr.left - sr.left,
          right: tr.right - sr.left,
          top: tr.top - sr.top,
          bottom: tr.bottom - sr.top,
        },
        s,
        {top: vr.top - sr.top, bottom: vr.bottom - sr.top},
        parseFloat(getComputedStyle(target).borderTopLeftRadius) || 12
      );
      if (!contour) return hide();
      el.style.opacity = '1';
      const t = media.matches ? 0 : now / 1000,
        e = contour.contact,
        d = beamPath(s, e, t);
      for (const [name, value] of Object.entries({
        x: vr.left - sr.left,
        y: vr.top - sr.top,
        width: vr.width,
        height: vr.height,
      }))
        clip.current.setAttribute(name, value);
      for (const [name, value] of Object.entries({x1: s.x, y1: s.y, x2: e.x, y2: e.y}))
        gradient.current.setAttribute(name, value.toFixed(1));
      for (const path of [halo.current, core.current, pulses.current]) path.setAttribute('d', d);
      pulses.current.style.strokeDashoffset = String(-(t * 0.42) % 1);
      spark.current.setAttribute('transform', `translate(${e.x.toFixed(1)} ${e.y.toFixed(1)})`);
      source.current.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`);
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
        <linearGradient ref={gradient} id={id + 'g'} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7fe3f2" stopOpacity="0.15" />
          <stop offset="0.35" stopColor="#8fd8ff" />
          <stop offset="0.75" stopColor="#a99bff" />
          <stop offset="1" stopColor="#d6a8ff" />
        </linearGradient>
        <radialGradient id={id + 's'}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c7b8ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#8f7dff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id + 'c'}>
          <rect ref={clip} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <path ref={halo} className="thinking-beam-halo" stroke={`url(#${id}g)`} />
        <path ref={core} className="thinking-beam-core" stroke={`url(#${id}g)`} />
        <path ref={pulses} pathLength="1" className="thinking-beam-pulses" />
        <g ref={spark}>
          <circle className="thinking-beam-spark" r="9" fill={`url(#${id}s)`} />
        </g>
      </g>
      <g ref={source}>
        <circle className="thinking-beam-source" r="6" fill={`url(#${id}s)`} />
      </g>
    </svg>
  ) : null;
}
