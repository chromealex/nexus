// Soft fades at the edges of scrolling panels, like the chat history: the top edge fades once the content
// is scrolled, the bottom edge while there is more below. Works for every scrolling element in the app
// (dialogs, lists, popups) without per-component code: scroll events are caught at the document.
const CANDIDATES = '[role="dialog"] *, nav *, aside *, .composer-params-popover, .more-menu';
const SKIP = 'textarea, input, .chat-thread, .browser-body, .file-code, .nexus-select-popup, iframe';

// Pure: which edges should fade for a scroll position.
export function fadeEdges({scrollTop, scrollHeight, clientHeight}) {
  const overflow = scrollHeight - clientHeight > 2;
  return {top: overflow && scrollTop > 2, bottom: overflow && scrollTop + clientHeight < scrollHeight - 2};
}

function scrolls(el) {
  if (!(el instanceof HTMLElement) || el.matches(SKIP)) return false;
  const y = getComputedStyle(el).overflowY;
  return (y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 2;
}
function update(el) {
  const {top, bottom} = fadeEdges(el);
  el.toggleAttribute('data-fade-top', top);
  el.toggleAttribute('data-fade-bottom', bottom);
}

export function installScrollFades(root = document) {
  let frame = 0;
  const scan = () => {
    frame = 0;
    root.querySelectorAll('[data-fade-top],[data-fade-bottom]').forEach(el => {
      if (!scrolls(el)) {
        el.removeAttribute('data-fade-top');
        el.removeAttribute('data-fade-bottom');
      }
    });
    // Panels, dialogs and popovers only (the chat history has its own fade); checked after changes settle.
    root.querySelectorAll(CANDIDATES).forEach(el => {
      if (el.scrollHeight > el.clientHeight + 2 && scrolls(el)) update(el);
    });
  };
  let timer = 0;
  const later = () => {
    if (frame || timer) return;
    timer = setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(scan);
    }, 300);
  };
  const onScroll = e => {
    if (scrolls(e.target)) update(e.target);
  };
  root.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', later);
  const observer = new MutationObserver(later);
  observer.observe(root.body || root, {childList: true, subtree: true});
  later();
  return () => {
    root.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', later);
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}
