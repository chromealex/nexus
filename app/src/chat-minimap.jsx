import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {layoutMinimap} from './chat-layout.js';
import {loc} from './i18n.js';

// Overview of the loaded conversation, left of the message column.
// Bars are measured from the real DOM (message heights, code/graphic blocks inside answers),
// so it stays correct while an answer streams. Click or drag moves the reading position.
// Decorative for assistive tech: keyboard users have ⌘F, bookmarks and normal scrolling.
export function ChatMinimap({viewportRef, contentRef, bookmarks = [], onNavigate, version}) {
  const track = useRef(null),
    frame = useRef(0),
    drag = useRef(null);
  const [model, setModel] = useState(null);
  const measure = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const viewport = viewportRef.current,
        content = contentRef.current,
        box = track.current;
      if (!viewport || !content || !box) return;
      const origin = content.getBoundingClientRect().top;
      const items = [...content.querySelectorAll('[data-message-id]')].map(el => {
        const r = el.getBoundingClientRect();
        const blocks = [
          ...el.querySelectorAll('.code-block,.nexus-widget,.table-scroll,.answer-callout'),
        ].map(b => {
          const q = b.getBoundingClientRect();
          return {
            top: q.top - r.top,
            height: q.height,
            kind: b.classList.contains('code-block') ? 'code' : 'graphic',
          };
        });
        return {
          id: el.dataset.messageId,
          role: el.classList.contains('user')
            ? 'user'
            : el.classList.contains('system')
              ? 'system'
              : 'assistant',
          top: r.top - origin,
          height: r.height,
          blocks,
          excerpt: (el.querySelector('.chat-markdown')?.innerText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 90),
        };
      });
      setModel(
        layoutMinimap({
          items,
          contentHeight: content.scrollHeight,
          viewportHeight: viewport.clientHeight,
          scrollTop: viewport.scrollTop,
          trackHeight: box.clientHeight,
        })
      );
    });
  }, [viewportRef, contentRef]);
  useLayoutEffect(() => {
    measure();
  }, [version, bookmarks.length, measure]);
  useEffect(() => {
    const viewport = viewportRef.current,
      content = contentRef.current;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(viewport);
    if (track.current) observer.observe(track.current);
    viewport.addEventListener('scroll', measure, {passive: true});
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', measure);
      cancelAnimationFrame(frame.current);
    };
  }, [viewportRef, contentRef, measure]);
  function go(clientY, smooth) {
    const box = track.current?.getBoundingClientRect();
    if (!box || !model) return;
    const y = clientY - box.top - (drag.current?.grab ?? model.window.height / 2);
    onNavigate(Math.max(0, y / model.scale), smooth);
  }
  function down(e) {
    if (e.button !== 0 || !model) return;
    e.preventDefault();
    const box = track.current.getBoundingClientRect(),
      y = e.clientY - box.top;
    const inside = y >= model.window.top && y <= model.window.top + model.window.height;
    drag.current = {grab: inside ? y - model.window.top : model.window.height / 2};
    track.current.setPointerCapture?.(e.pointerId);
    go(e.clientY, !inside);
  }
  function move(e) {
    if (drag.current) go(e.clientY, false);
  }
  function up(e) {
    drag.current = null;
    track.current?.releasePointerCapture?.(e.pointerId);
  }
  const marked = new Set(bookmarks.map(b => b.id));
  return (
    <div className={'chat-minimap' + (model?.scrollable ? '' : ' is-idle')} aria-hidden="true">
      <div
        className="chat-minimap-track"
        ref={track}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {model?.bars.map(bar => (
          <div
            key={bar.id}
            className={'minimap-bar role-' + bar.role + (marked.has(bar.id) ? ' is-bookmarked' : '')}
            style={{top: bar.top, height: bar.height}}
            title={(bar.role === 'user' ? loc('Вы: ') : 'Nexus: ') + bar.excerpt}
          >
            {bar.blocks.map((b, i) => (
              <span
                key={i}
                className={'minimap-block kind-' + b.kind}
                style={{top: b.top, height: b.height}}
              />
            ))}
          </div>
        ))}
        {model?.scrollable && (
          <div className="minimap-window" style={{top: model.window.top, height: model.window.height}} />
        )}
      </div>
    </div>
  );
}
