import React, {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {Square, Eraser, CornerDownLeft} from 'lucide-react';
import {loc} from './i18n.js';
import {stripAnsi, pushHistory, appendOutput} from './terminal-format.js';

// Output and command history live per chat for the whole session, so switching tabs keeps them.
const sessions = new Map();
function session(chatId) {
  if (!sessions.has(chatId)) sessions.set(chatId, {blocks: [], history: [], running: {}});
  return sessions.get(chatId);
}

// «Терминал» tab: run commands in the chat's working folder (its separate branch, if it has one).
export function TerminalView({chatId}) {
  const s = session(chatId);
  const [, redraw] = useState(0),
    [input, setInput] = useState(''),
    [cwd, setCwd] = useState(''),
    [cursor, setCursor] = useState(-1),
    body = useRef(null),
    follow = useRef(true);
  const refresh = () => redraw(n => n + 1);
  useEffect(() => {
    invoke('terminal_cwd', {chatId})
      .then(setCwd)
      .catch(() => setCwd(''));
  }, [chatId]);
  useEffect(() => {
    const offs = [];
    listen('terminal-output', e => {
      const p = e.payload;
      if (p?.chatId !== chatId) return;
      const block = s.blocks.find(b => b.runId === p.runId);
      if (block) block.output = appendOutput(block.output, stripAnsi(p.text));
      refresh();
    }).then(f => offs.push(f));
    listen('terminal-exit', e => {
      const p = e.payload;
      if (p?.chatId !== chatId) return;
      const block = s.blocks.find(b => b.runId === p.runId);
      if (block) Object.assign(block, {done: true, code: p.code, ms: p.ms});
      delete s.running[p.runId];
      refresh();
    }).then(f => offs.push(f));
    return () => offs.forEach(f => f());
  }, [chatId]);
  useEffect(() => {
    if (follow.current && body.current) body.current.scrollTop = body.current.scrollHeight;
  });
  async function run(e) {
    e?.preventDefault();
    const command = input.trim();
    if (!command) return;
    s.history = pushHistory(s.history, command);
    setCursor(-1);
    setInput('');
    if (command === 'clear') {
      s.blocks = s.blocks.filter(b => !b.done);
      return refresh();
    }
    const block = {key: Date.now() + Math.random(), command, output: '', done: false};
    s.blocks.push(block);
    s.blocks = s.blocks.slice(-60);
    follow.current = true;
    refresh();
    try {
      block.runId = await invoke('terminal_run', {chatId, command});
      s.running[block.runId] = true;
    } catch (err) {
      Object.assign(block, {done: true, code: null, output: String(err)});
    }
    refresh();
  }
  function onKey(e) {
    if (e.key === 'ArrowUp' && s.history.length) {
      e.preventDefault();
      const next = Math.min(cursor + 1, s.history.length - 1);
      setCursor(next);
      setInput(s.history[s.history.length - 1 - next]);
    } else if (e.key === 'ArrowDown' && cursor >= 0) {
      e.preventDefault();
      const next = cursor - 1;
      setCursor(next);
      setInput(next < 0 ? '' : s.history[s.history.length - 1 - next]);
    } else if (e.key === 'c' && e.ctrlKey) {
      Object.keys(s.running).forEach(runId => invoke('terminal_stop', {runId}).catch(() => {}));
    }
  }
  const busy = Object.keys(s.running).length > 0;
  return (
    <div className="file-view terminal-view">
      <div className="file-view-bar">
        <span className="file-view-path" title={cwd}>
          <small>{cwd || loc('Папка чата')}</small>
        </span>
        {busy && (
          <button
            type="button"
            title={loc('Остановить команды (Ctrl+C)')}
            aria-label={loc('Остановить команды')}
            onClick={() =>
              Object.keys(s.running).forEach(runId => invoke('terminal_stop', {runId}).catch(() => {}))
            }
          >
            <Square size={12} />
          </button>
        )}
        <button
          type="button"
          title={loc('Очистить')}
          aria-label={loc('Очистить')}
          onClick={() => {
            s.blocks = s.blocks.filter(b => !b.done);
            refresh();
          }}
        >
          <Eraser size={13} />
        </button>
      </div>
      <div
        className="file-view-body terminal-output"
        ref={body}
        onScroll={e => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {!s.blocks.length && (
          <p className="file-view-note">
            {loc(
              'Команды выполняются в папке чата (в его отдельной ветке, если она включена). Агенты этот терминал не используют.'
            )}
          </p>
        )}
        {s.blocks.map(b => (
          <section key={b.key} className="terminal-block">
            <div className="terminal-command">
              <span aria-hidden="true">$</span> {b.command}
              {b.done ? (
                <small className={b.code === 0 ? 'is-ok' : 'is-fail'}>
                  {b.code === null || b.code === undefined ? loc('прервано') : loc('код {0}', b.code)}
                  {b.ms != null ? ' · ' + (b.ms / 1000).toFixed(1) + ' s' : ''}
                </small>
              ) : (
                <small>{loc('выполняется…')}</small>
              )}
            </div>
            {b.output && <pre>{b.output}</pre>}
          </section>
        ))}
      </div>
      <form className="terminal-input" onSubmit={run}>
        <span aria-hidden="true">$</span>
        <input
          value={input}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={loc('Команда терминала')}
          placeholder={loc('Команда, например git status')}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="submit" aria-label={loc('Выполнить')} title={loc('Выполнить')} disabled={!input.trim()}>
          <CornerDownLeft size={13} />
        </button>
      </form>
    </div>
  );
}
