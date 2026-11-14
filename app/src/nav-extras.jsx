import React, {useEffect, useRef} from 'react';
import {highlightParts} from './chat-search.js';
import {MessageSquare, Search, X} from 'lucide-react';
import {shortcutText} from './shortcuts.js';
import {loc} from './i18n.js';

export function Highlight({text, query}) {
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.match ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>
      )}
    </>
  );
}

// Sidebar search field. ⌘K focuses it from anywhere (see App); ↑/↓ move through results, Enter opens.
export function NavSearch({value, onChange, inputRef, onKeyDown}) {
  return (
    <div className="nav-search">
      <Search size={14} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label={loc('Поиск чатов')}
        placeholder={loc('Поиск чатов')}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className="nav-search-clear"
          aria-label={loc('Очистить поиск')}
          title={loc('Очистить поиск')}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <X size={13} />
        </button>
      ) : (
        <kbd aria-hidden="true">{shortcutText('search')}</kbd>
      )}
    </div>
  );
}

export function NavSearchResults({results, query, active, onOpen, onHover}) {
  if (!results.length)
    return (
      <p className="nav-search-empty" role="status">
        {loc('Ничего не найдено. Проверьте написание или ищите по названию папки.')}
      </p>
    );
  return (
    <div className="nav-search-results" role="listbox" aria-label={loc('Найденные чаты')}>
      {results.map((r, i) => (
        <button
          key={r.chat.id}
          id={'nav-result-' + r.chat.id}
          role="option"
          aria-selected={i === active}
          className={'nav-search-result' + (i === active ? ' active' : '')}
          onMouseEnter={() => onHover(i)}
          onClick={() => onOpen(r)}
        >
          <MessageSquare size={14} aria-hidden="true" />
          <span>
            <strong>
              <Highlight text={r.chat.title} query={query} />
            </strong>
            <small>
              <Highlight text={r.path.join(' / ')} query={query} />
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}

// Short-lived message with an undo action. Keeps focus where it was; announced politely.
export function UndoToast({toast, onUndo, onClose, timeout = 6000}) {
  const timer = useRef();
  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(onClose, timeout);
    return () => clearTimeout(timer.current);
  }, [toast]);
  if (!toast) return null;
  return (
    <div
      className="undo-toast"
      role="status"
      aria-live="polite"
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={() => {
        timer.current = setTimeout(onClose, 2500);
      }}
    >
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" onClick={onUndo} disabled={toast.busy}>
          {toast.busy ? loc('Возвращаю…') : loc('Отменить')}
        </button>
      )}
      <button
        type="button"
        className="undo-toast-close"
        aria-label={loc('Скрыть сообщение')}
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function NavSkeleton({rows = 6}) {
  return (
    <div className="nav-skeleton" aria-hidden="true">
      {Array.from({length: rows}, (_, i) => (
        <span
          key={i}
          style={{'--w': [72, 58, 64, 46, 68, 52][i % 6] + '%', '--indent': (i % 3) * 14 + 'px'}}
        />
      ))}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="chat-skeleton" aria-hidden="true">
      <span className="user" />
      <span className="assistant" />
      <span className="assistant short" />
      <span className="user short" />
    </div>
  );
}
