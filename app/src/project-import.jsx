import React, {useEffect, useMemo, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {X, Search} from 'lucide-react';
import {AgentIcon} from './agent-icon.jsx';
import {countLabel} from './locale-format.js';
import {notify} from './toasts.js';
import {appLocale, loc} from './i18n.js';

const SOURCE = {claude: 'Claude Code', codex: 'Codex'};

function ago(seconds) {
  if (!seconds) return '';
  const days = Math.floor((Date.now() / 1000 - seconds) / 86400);
  if (days <= 0) return loc('сегодня');
  if (days === 1) return loc('вчера');
  if (days < 30) return countLabel(days, loc('день'), loc('дня'), loc('дней')) + loc(' назад');
  return new Date(seconds * 1000).toLocaleDateString(appLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// «Импорт из Claude Code и Codex»: folders those agents already worked in, ready to become Nexus projects.
export function ProjectImport({onClose, onImported}) {
  const [rows, setRows] = useState(null),
    [picked, setPicked] = useState(() => new Set()),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    invoke('import_candidates')
      .then(list => {
        setRows(list);
        // Recent folders are pre-selected; already added ones cannot be picked.
        setPicked(
          new Set(
            list
              .filter(r => !r.added)
              .slice(0, 8)
              .map(r => r.path)
          )
        );
      })
      .catch(e => {
        setRows([]);
        notify(String(e), {tone: 'error'});
      });
  }, []);
  useEffect(() => {
    const esc = e => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onClose]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter(
      r => !q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
    );
  }, [rows, query]);
  const toggle = path =>
    setPicked(s => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  async function run() {
    setBusy(true);
    try {
      const result = await invoke('import_projects', {paths: [...picked]});
      const added = result.added.length,
        skipped = result.skipped.length;
      notify(
        countLabel(added, loc('проект добавлен'), loc('проекта добавлено'), loc('проектов добавлено')) +
          (skipped
            ? ` · ${countLabel(skipped, loc('пропущен'), loc('пропущено'), loc('пропущено'))}: ${result.skipped[0].reason}`
            : ''),
        {tone: added ? 'success' : 'warn'}
      );
      await onImported(result.added);
      onClose();
    } catch (e) {
      notify(String(e), {tone: 'error'});
      setBusy(false);
    }
  }
  return (
    <div className="settings-overlay" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <section
        className="project-settings project-import"
        role="dialog"
        aria-modal="true"
        aria-label={loc('Импорт проектов')}
      >
        <div className="settings-header">
          <div>
            <h2>{loc('Импорт из Claude Code и Codex')}</h2>
            <small>
              {loc(
                'Папки, в которых эти агенты уже работали на этом Mac. Переписка и настройки агентов не переносятся.'
              )}
            </small>
          </div>
          <button type="button" disabled={busy} aria-label={loc('Закрыть')} onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="settings-body">
          <label className="project-import-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={loc('Поиск по названию или пути')}
              aria-label={loc('Поиск папок')}
            />
          </label>
          {rows === null ? (
            <p className="project-import-empty">{loc('Ищу проекты…')}</p>
          ) : !rows.length ? (
            <p className="project-import-empty">
              {loc(
                'Не нашлось папок из Claude Code или Codex. Проекты появятся здесь после того, как вы поработаете в них этими агентами.'
              )}
            </p>
          ) : (
            <ul className="project-import-list">
              {shown.map(r => (
                <li key={r.path} className={r.added ? 'is-added' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={r.added || busy}
                      checked={r.added || picked.has(r.path)}
                      onChange={() => toggle(r.path)}
                    />
                    <span className="project-import-main">
                      <strong>{r.name}</strong>
                      <small title={r.path}>{r.path}</small>
                    </span>
                    <span className="project-import-meta">
                      {r.sources.map(s => (
                        <span key={s} className="project-import-source" title={SOURCE[s]}>
                          <AgentIcon provider={s} />
                        </span>
                      ))}
                      <small>{r.added ? loc('уже в Nexus') : ago(r.lastUsed)}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="settings-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            {loc('Отмена')}
          </button>
          <button type="button" className="primary" disabled={busy || !picked.size} onClick={run}>
            {busy
              ? loc('Добавляю…')
              : picked.size
                ? loc('Импортировать ') +
                  countLabel(picked.size, loc('проект'), loc('проекта'), loc('проектов'))
                : loc('Выберите проекты')}
          </button>
        </div>
      </section>
    </div>
  );
}
