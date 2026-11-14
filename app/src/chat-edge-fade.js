// Chat history edges: content near the top and bottom of the history dissolves instead of being covered
// by a dark band. A mask on the history itself would make it a backdrop root and switch off the blur under
// message bubbles, so each element that touches an edge gets its own mask in its own coordinates.
// Bubbles (which blur the scene behind them) are masked themselves, never through an ancestor.
const FADE = 44;
const BLUR = '.chat-bubble';

// Pure: the mask for an element at `box` inside a viewport `view` ({top, bottom} in the same coordinates).
export function edgeMask(box, view, {top, bottom, size = FADE}) {
  const stops = [];
  if (top && box.top < view.top + size) {
    stops.push(
      `transparent ${Math.round(view.top - box.top)}px`,
      `#000 ${Math.round(view.top + size - box.top)}px`
    );
  }
  if (bottom && box.bottom > view.bottom - size) {
    if (!stops.length) stops.push('#000 0px');
    stops.push(
      `#000 ${Math.round(view.bottom - size - box.top)}px`,
      `transparent ${Math.round(view.bottom - box.top)}px`
    );
  }
  return stops.length ? `linear-gradient(to bottom, ${stops.join(', ')})` : '';
}

// Elements to mask for one row: the row itself, or, if it holds a bubble, the bubble and its siblings.
function pieces(node, out) {
  if (node.matches(BLUR) || !node.querySelector(BLUR)) {
    out.push(node);
    return out;
  }
  for (const child of node.children) pieces(child, out);
  return out;
}

// First child whose bottom is below y (children are stacked top to bottom).
function firstBelow(rows, y) {
  let lo = 0,
    hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].getBoundingClientRect().bottom <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function apply(el, mask) {
  el.style.webkitMaskImage = mask;
  el.style.maskImage = mask;
}

export function installChatEdgeFade(root = document) {
  let masked = new Set(),
    frame = 0;
  const update = () => {
    frame = 0;
    const view = root.querySelector('.chat-thread');
    const content = view?.firstElementChild;
    const next = new Set();
    if (view && content && !view.closest('.cinematic-home')) {
      const r = view.getBoundingClientRect();
      const top = view.scrollTop > 2,
        bottom = view.scrollTop + view.clientHeight < view.scrollHeight - 2;
      const rows = content.children;
      const consider = (from, until) => {
        for (let i = from; i < rows.length; i++) {
          const rb = rows[i].getBoundingClientRect();
          if (rb.top >= until) break;
          for (const el of pieces(rows[i], [])) {
            const mask = edgeMask(el.getBoundingClientRect(), r, {top, bottom});
            if (mask) {
              apply(el, mask);
              next.add(el);
            }
          }
        }
      };
      if (top) consider(firstBelow(rows, r.top), r.top + FADE);
      if (bottom) consider(firstBelow(rows, r.bottom - FADE), r.bottom);
    }
    for (const el of masked) if (!next.has(el)) apply(el, '');
    masked = next;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const onScroll = e => {
    if (e.target instanceof Element && e.target.matches('.chat-thread')) schedule();
  };
  root.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(root.body || root, {childList: true, subtree: true, characterData: true});
  schedule();
  return () => {
    root.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', schedule);
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    for (const el of masked) apply(el, '');
  };
}
