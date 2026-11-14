import React, {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {ArrowLeft, ArrowRight, RotateCw, Plus, X, PanelRightClose, Globe, Maximize2} from 'lucide-react';
import {BrowserParam} from './browser-param.jsx';
import {keyAction, normalizeMode, pageCoords, previewVisible, tabTitle} from './browser-mode.js';

// Last picture of every chat browser in this window session, so switching chats or closing the pane
// keeps something to show while the next frame arrives.
const lastFrames = new Map();

// Live state of the chat's built-in browser: tabs, frames, what the agent is doing, and which picture
// the backend should stream ("full" for the pane, "thumb" for the preview, "none" otherwise).
export function useChatBrowser({chatId, paneOpen, status, agentBusy}) {
  const [tabs, setTabs] = useState({running: false, tabs: [], active: null}),
    [frame, setFrame] = useState(null),
    [activity, setActivity] = useState(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [, tick] = useState(0);
  const chatRef = useRef(chatId);
  chatRef.current = chatId;
  const mode = normalizeMode(status?.mode),
    ready = !!(
      chatId &&
      status?.installed &&
      status?.node !== false &&
      status?.chrome !== false &&
      mode === 'builtin'
    );

  useEffect(() => {
    setFrame(lastFrames.get(chatId) || null);
    setActivity(null);
    setNotice('');
    setError('');
    setTabs({running: false, tabs: [], active: null});
    if (!chatId) return;
    invoke('browser_pane_state', {chatId})
      .then(v => chatRef.current === chatId && setTabs(v))
      .catch(() => {});
  }, [chatId]);

  useEffect(() => {
    const off = [];
    let live = true;
    const on = (event, handler) =>
      listen(event, e => {
        if (e.payload?.chatId === chatRef.current) handler(e.payload);
      }).then(u => (live ? off.push(u) : u()));
    on('browser-frame', p => {
      const value = {data: p.data, width: p.width, height: p.height, tab: p.tab};
      lastFrames.set(p.chatId, value);
      setFrame(value);
    });
    on('browser-tabs', p => setTabs({...p, saved: true}));
    on('browser-activity', p => setActivity({text: p.text, asks: p.asks, at: Date.now()}));
    on('browser-notice', p => setNotice(String(p.message || '')));
    return () => {
      live = false;
      off.forEach(u => u());
    };
  }, []);

  // The preview fades out by itself some time after the agent's last action.
  useEffect(() => {
    if (!activity) return;
    const t = setTimeout(() => tick(n => n + 1), 46000);
    return () => clearTimeout(t);
  }, [activity]);

  const preview = previewVisible({
    paneOpen,
    mode,
    agentBusy,
    activityAt: activity?.at,
    hasFrame: !!frame,
  });
  const view = paneOpen ? 'full' : preview ? 'thumb' : 'none';

  useEffect(() => {
    if (!chatId || !ready) return;
    let cancelled = false;
    if (view === 'full') {
      setError('');
      invoke('browser_pane_open', {chatId, view: 'full'})
        .then(v => !cancelled && setTabs(v))
        .catch(e => !cancelled && setError(String(e).replace(/^NEXUS_BROWSER_SETUP:\s*/, '')));
    } else invoke('browser_pane_view', {chatId, view}).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chatId, ready, view]);
  useEffect(
    () => () => {
      if (chatId) invoke('browser_pane_view', {chatId, view: 'none'}).catch(() => {});
    },
    [chatId]
  );

  const input = action => {
    if (!chatId) return Promise.resolve();
    return invoke('browser_pane_input', {chatId, action}).catch(e => setNotice(String(e)));
  };
  // The header shows «Браузер» only for chats whose browser exists (running now or with saved tabs).
  const available = ready && (tabs.running || tabs.saved || (tabs.tabs || []).length > 0);
  return {tabs, frame, activity, notice, error, ready, mode, preview, input, setNotice, available};
}

function Viewport({frame, input, running}) {
  const box = useRef(null),
    wheel = useRef({dx: 0, dy: 0, t: null, x: 0, y: 0});
  const coords = e => pageCoords(e.clientX, e.clientY, box.current?.getBoundingClientRect(), frame);
  if (!frame)
    return (
      <div className="browser-viewport is-empty">
        <Globe size={28} aria-hidden="true" />
        <span>{running ? 'Загружаю страницу…' : 'Запускаю браузер чата…'}</span>
      </div>
    );
  return (
    <div
      className="browser-viewport"
      tabIndex={0}
      role="application"
      aria-label="Страница во встроенном браузере. Клики и ввод передаются странице."
      onKeyDown={e => {
        if (e.metaKey && e.key.toLowerCase() === 'v') {
          e.preventDefault();
          navigator.clipboard
            ?.readText?.()
            .then(text => text && input({type: 'text', text: text.slice(0, 2000)}))
            .catch(() => {});
          return;
        }
        const action = keyAction(e);
        if (!action) return;
        e.preventDefault();
        input(action);
      }}
    >
      <img
        ref={box}
        src={'data:image/jpeg;base64,' + frame.data}
        alt=""
        draggable={false}
        onClick={e => {
          const p = coords(e);
          if (p) input({type: 'click', ...p, clickCount: Math.min(3, e.detail || 1)});
          e.currentTarget.parentElement?.focus();
        }}
        onContextMenu={e => {
          e.preventDefault();
          const p = coords(e);
          if (p) input({type: 'click', ...p, button: 'right'});
        }}
        onWheel={e => {
          const p = coords(e);
          if (!p) return;
          const w = wheel.current;
          w.dx += e.deltaX;
          w.dy += e.deltaY;
          w.x = p.x;
          w.y = p.y;
          if (w.t) return;
          w.t = setTimeout(() => {
            input({type: 'wheel', x: w.x, y: w.y, dx: Math.round(w.dx), dy: Math.round(w.dy)});
            w.dx = w.dy = 0;
            w.t = null;
          }, 60);
        }}
      />
    </div>
  );
}

export function BrowserPane({browser, status, chatId, width, onResize, onClose, settings}) {
  const {tabs, frame, activity, notice, error, ready, mode, input, setNotice} = browser;
  const active = tabs.tabs?.find(t => t.id === tabs.active);
  const [address, setAddress] = useState(''),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setAddress(active?.url && active.url !== 'about:blank' ? active.url : '');
  }, [active?.url, editing]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  // The page is laid out at the pane's real size, so text stays readable in a narrow pane.
  const body = useRef(null);
  useEffect(() => {
    const el = body.current;
    if (!el || !ready || !tabs.running) return;
    let timer = null,
      last = '';
    const report = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = Math.max(320, Math.round(el.clientWidth)),
          height = Math.max(240, Math.round(el.clientHeight)),
          scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const key = `${width}x${height}@${scale}`;
        if (key === last) return;
        last = key;
        input({type: 'resize', width, height, scale});
      }, 180);
    };
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tabs.running, chatId]);
  const recent = activity && Date.now() - activity.at < 6000;
  const drag = e => {
    e.preventDefault();
    const startX = e.clientX,
      start = width;
    const move = ev => onResize(start + (startX - ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <aside className="browser-pane" aria-label="Браузер чата">
      <div
        className="browser-pane-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ширина браузера"
        tabIndex={0}
        onPointerDown={drag}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') onResize(width + 24);
          if (e.key === 'ArrowRight') onResize(width - 24);
        }}
      />
      <div className="browser-tabs" role="tablist" aria-label="Вкладки">
        {(ready ? tabs.tabs || [] : []).map(tab => (
          <div
            key={tab.id}
            className={'browser-tab' + (tab.id === tabs.active ? ' is-active' : '')}
            role="tab"
            aria-selected={tab.id === tabs.active}
          >
            <button type="button" title={tab.url} onClick={() => input({type: 'selectTab', id: tab.id})}>
              {tabTitle(tab)}
            </button>
            <button
              type="button"
              className="browser-tab-close"
              aria-label={'Закрыть вкладку ' + tabTitle(tab)}
              onClick={() => input({type: 'closeTab', id: tab.id})}
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {ready && (
          <button
            type="button"
            className="browser-tab-new"
            aria-label="Новая вкладка"
            onClick={() => input({type: 'newTab'})}
          >
            <Plus size={13} />
          </button>
        )}
        <button
          type="button"
          className="browser-pane-close"
          aria-label="Скрыть браузер"
          title="Скрыть браузер"
          onClick={onClose}
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      {ready && (
        <form
          className="browser-address"
          onSubmit={e => {
            e.preventDefault();
            setEditing(false);
            if (address.trim()) input({type: 'navigate', url: address.trim()});
          }}
        >
          <button type="button" aria-label="Назад" onClick={() => input({type: 'back'})}>
            <ArrowLeft size={14} />
          </button>
          <button type="button" aria-label="Вперёд" onClick={() => input({type: 'forward'})}>
            <ArrowRight size={14} />
          </button>
          <button type="button" aria-label="Обновить" onClick={() => input({type: 'reload'})}>
            <RotateCw size={13} />
          </button>
          <input
            value={address}
            aria-label="Адрес или поиск"
            placeholder="Адрес или поиск"
            spellCheck={false}
            onFocus={e => {
              setEditing(true);
              e.target.select();
            }}
            onBlur={() => setEditing(false)}
            onChange={e => setAddress(e.target.value)}
          />
        </form>
      )}
      <div className="browser-body" ref={body}>
        {ready && !error ? (
          <Viewport frame={frame} input={input} running={tabs.running} />
        ) : (
          <div className="browser-setup">
            <Globe size={26} aria-hidden="true" />
            <strong>
              {!chatId
                ? 'Откройте чат'
                : mode === 'off'
                  ? 'Браузер выключен в этом чате'
                  : mode === 'chrome'
                    ? 'Агент работает в вашем Chrome'
                    : 'Браузер чата'}
            </strong>
            {error && <p role="alert">{error}</p>}
            {chatId && settings}
          </div>
        )}
        {recent && (
          <div className={'browser-activity' + (activity.asks ? ' is-asking' : '')} role="status">
            <span className="browser-activity-dot" aria-hidden="true" />
            Агент: {activity.text}
          </div>
        )}
        {notice && (
          <div className="browser-notice" role="status">
            {notice}
          </div>
        )}
      </div>
    </aside>
  );
}

// Small live picture over the chat while the pane is closed and an agent works in the browser.
export function BrowserPreview({browser, onOpen}) {
  const {frame, activity, tabs} = browser;
  const active = tabs.tabs?.find(t => t.id === tabs.active);
  return (
    <button type="button" className="browser-preview" onClick={onOpen} aria-label="Открыть браузер чата">
      {frame ? (
        <img src={'data:image/jpeg;base64,' + frame.data} alt="" draggable={false} />
      ) : (
        <span className="browser-preview-empty">
          <Globe size={18} aria-hidden="true" />
        </span>
      )}
      <span className="browser-preview-caption">
        <span className="browser-activity-dot" aria-hidden="true" />
        <span>{activity?.text ? 'Агент: ' + activity.text : tabTitle(active) || 'Агент в браузере'}</span>
        <Maximize2 size={12} aria-hidden="true" />
      </span>
    </button>
  );
}
