import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  Search,
  Table2,
  Paperclip,
} from 'lucide-react';
import {languageOf, tokenize, tableToTsv} from './code-highlight.js';
import {normalizeSearch} from './chat-search.js';
import {QUICK_REPLIES, clock, stageLabel} from './chat-local.js';
import {countLabel} from './locale-format.js';
import {loc} from './i18n.js';

const textOf = node =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : React.isValidElement(node)
        ? textOf(node.props.children)
        : '';

function useCopied() {
  const [copied, setCopied] = useState(false),
    timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    () => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    },
  ];
}

// Fenced code: language label, copy button, token colouring. Text only — no HTML from the answer.
export function CodeBlock({className, children}) {
  const code = textOf(children).replace(/\n$/, ''),
    {raw, family} = languageOf(className),
    [copied, markCopied] = useCopied();
  const tokens = useMemo(() => tokenize(code, family), [code, family]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      markCopied();
    } catch {}
  }
  return (
    <div className="code-block">
      <div className="code-block-head">
        <span>{raw || loc('текст')}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? loc('Код скопирован') : loc('Копировать код')}
          title={copied ? loc('Скопировано') : loc('Копировать код')}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? loc('Скопировано') : loc('Копировать')}
        </button>
      </div>
      <pre>
        <code className={className}>
          {tokens.map((t, i) =>
            t.type === 'plain' ? (
              <React.Fragment key={i}>{t.text}</React.Fragment>
            ) : (
              <span key={i} className={'tok-' + t.type}>
                {t.text}
              </span>
            )
          )}
        </code>
      </pre>
    </div>
  );
}

// Wide tables scroll sideways inside the message; copy as tab-separated text for spreadsheets.
export function TableBlock({children, ...props}) {
  const table = useRef(null),
    [copied, markCopied] = useCopied();
  async function copy() {
    const rows = [...(table.current?.rows || [])].map(r => [...r.cells].map(c => c.innerText));
    try {
      await navigator.clipboard.writeText(tableToTsv(rows));
      markCopied();
    } catch {}
  }
  return (
    <div className="table-block">
      <div className="table-scroll">
        <table ref={table} {...props}>
          {children}
        </table>
      </div>
      <button
        type="button"
        className="table-copy"
        onClick={copy}
        title={loc('Копировать таблицу — вставляется в Numbers, Excel и Google Таблицы')}
      >
        {copied ? <Check size={13} /> : <Table2 size={13} />}
        {copied ? loc('Скопировано') : loc('Копировать таблицу')}
      </button>
    </div>
  );
}

export function CollapsibleMessage({long, children}) {
  const [open, setOpen] = useState(false);
  if (!long) return children;
  return (
    <div className={'collapsible-message' + (open ? ' is-open' : '')}>
      {children}
      <button
        type="button"
        className="collapsible-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {open ? (
          <>
            <ChevronUp size={14} />
            {loc('Свернуть')}
          </>
        ) : (
          <>
            <ChevronDown size={14} />
            {loc('Показать полностью')}
          </>
        )}
      </button>
    </div>
  );
}

export function VariantSwitcher({message, disabled, onSelect}) {
  const total = message.variants?.length || 0;
  if (total < 2) return null;
  const index = Math.min(message.variant || 0, total - 1);
  return (
    <span className="variant-switcher" role="group" aria-label={loc('Варианты ответа')}>
      <button
        type="button"
        disabled={disabled || index === 0}
        aria-label={loc('Предыдущий вариант')}
        title={loc('Предыдущий вариант')}
        onClick={() => onSelect(index - 1)}
      >
        <ChevronLeft size={14} />
      </button>
      <span aria-live="polite">
        {index + 1} / {total}
      </span>
      <button
        type="button"
        disabled={disabled || index >= total - 1}
        aria-label={loc('Следующий вариант')}
        title={loc('Следующий вариант')}
        onClick={() => onSelect(index + 1)}
      >
        <ChevronRight size={14} />
      </button>
    </span>
  );
}

export function GenerationStatus({startedAt, now, trace, streaming, regenerating}) {
  const verb = regenerating ? loc('Повторяю ответ') : streaming ? loc('Пишу ответ') : loc('Готовлю ответ');
  const stage = stageLabel(trace);
  return (
    <span className="generation-status">
      <span className="spinner" />
      <span>{verb}</span>
      {stage && <span className="generation-stage">{stage}</span>}
      {startedAt ? <time>{clock(now - startedAt)}</time> : null}
    </span>
  );
}

// ⌘F: matches across the whole chat (all pages), jump with Enter / ↑↓, highlight via CSS Custom Highlight API.
export function ChatFind({chatId, loadAll, onJump, onClose, containerSelector}) {
  const [query, setQuery] = useState(''),
    [all, setAll] = useState(null),
    [index, setIndex] = useState(0),
    [error, setError] = useState(''),
    input = useRef(null);
  useEffect(() => {
    input.current?.focus();
    let live = true;
    loadAll(chatId)
      .then(rows => live && setAll(rows))
      .catch(e => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [chatId]);
  const needle = normalizeSearch(query);
  const matches = useMemo(
    () =>
      !needle || !all
        ? []
        : all.filter(m => m.role !== 'system' && normalizeSearch(m.content).includes(needle)),
    [needle, all]
  );
  useEffect(() => {
    setIndex(matches.length ? matches.length - 1 : 0);
  }, [needle, all]);
  useEffect(() => {
    if (matches[index]) onJump(matches[index].id);
  }, [index, matches]);
  useLayoutEffect(() => {
    const registry = globalThis.CSS?.highlights;
    if (!registry || typeof Highlight === 'undefined') return;
    registry.delete('nexus-find');
    if (!needle) return;
    const root = document.querySelector(containerSelector);
    if (!root) return;
    const ranges = [],
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && ranges.length < 500; node = walker.nextNode()) {
      if (node.parentElement?.closest('.message-footer,.chat-role,button')) continue;
      const text = node.data.toLowerCase().replace(/ё/g, 'е');
      let at = text.indexOf(needle);
      while (at >= 0 && ranges.length < 500) {
        const r = new Range();
        r.setStart(node, at);
        r.setEnd(node, at + needle.length);
        ranges.push(r);
        at = text.indexOf(needle, at + needle.length);
      }
    }
    registry.set('nexus-find', new Highlight(...ranges));
    return () => registry.delete('nexus-find');
  });
  function key(e) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length) setIndex(i => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length) setIndex(i => (i + 1) % matches.length);
    }
  }
  return (
    <div className="chat-find" role="search">
      <Search size={14} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label={loc('Найти в чате')}
        placeholder={loc('Найти в чате')}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={key}
        spellCheck={false}
      />
      <span className="chat-find-count" role="status">
        {error
          ? loc('Ошибка поиска')
          : !all
            ? loc('Загружаю…')
            : needle
              ? matches.length
                ? loc(
                    '{0} из {1}',
                    index + 1,
                    countLabel(matches.length, loc('сообщения'), loc('сообщений'), loc('сообщений'))
                  )
                : loc('Нет совпадений')
              : ''}
      </span>
      <button
        type="button"
        disabled={!matches.length}
        aria-label={loc('Предыдущее совпадение')}
        title={loc('Предыдущее (Shift+Enter)')}
        onClick={() => setIndex(i => (i - 1 + matches.length) % matches.length)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        disabled={!matches.length}
        aria-label={loc('Следующее совпадение')}
        title={loc('Следующее (Enter)')}
        onClick={() => setIndex(i => (i + 1) % matches.length)}
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        aria-label={loc('Закрыть поиск')}
        title={loc('Закрыть (Escape)')}
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function QuickReplies({onPick, disabled}) {
  return (
    <div className="quick-replies" role="group" aria-label={loc('Быстрые ответы')}>
      {QUICK_REPLIES.map(([label, text]) => (
        <button type="button" key={label} disabled={disabled} title={text} onClick={() => onPick(text)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function DropOverlay({active}) {
  return active ? (
    <div className="chat-drop-overlay" aria-hidden="true">
      <Paperclip size={22} />
      <strong>{loc('Отпустите, чтобы прикрепить')}</strong>
      <small>{loc('До 8 файлов, до 20 МБ каждый')}</small>
    </div>
  ) : null;
}
