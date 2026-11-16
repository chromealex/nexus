import React, {useCallback, useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {
  RefreshCw,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Undo2,
  ChevronRight,
  FileText,
} from 'lucide-react';
import {notify} from './toasts.js';
import {loc} from './i18n.js';
import {diffLines, changeLabel, changesSummary} from './changes-format.js';
import {countLabel} from './locale-format.js';

// «Изменения» tab of the side panel: what the chat changed in its git working copy.
// With a separate branch (worktree) it compares with the commit the branch started from,
// otherwise with HEAD of the project folder. Commit, discard and merge are explicit actions.
export function ChangesView({chatId, busy}) {
  const [state, setState] = useState({loading: true}),
    [open, setOpen] = useState({}),
    [diffs, setDiffs] = useState({}),
    [message, setMessage] = useState(''),
    [confirm, setConfirm] = useState(null),
    [working, setWorking] = useState(false);
  const load = useCallback(async () => {
    if (!chatId) return;
    try {
      const res = await invoke('chat_changes', {chatId});
      setState({loading: false, ...res});
      setDiffs({});
    } catch (e) {
      setState({loading: false, error: String(e)});
    }
  }, [chatId]);
  useEffect(() => {
    setState({loading: true});
    setOpen({});
    setConfirm(null);
    load();
  }, [load]);
  // Refresh after every answer of this chat: that is when the agent has changed files.
  useEffect(() => {
    let off;
    listen('chat-activity', e => {
      if (e.payload?.chatId === chatId && e.payload?.status !== 'running') load();
    }).then(f => (off = f));
    return () => off?.();
  }, [chatId, load]);
  async function toggle(path) {
    const next = !open[path];
    setOpen(o => ({...o, [path]: next}));
    if (next && !diffs[path]) {
      try {
        const res = await invoke('chat_file_diff', {chatId, path});
        setDiffs(d => ({...d, [path]: res}));
      } catch (e) {
        setDiffs(d => ({...d, [path]: {error: String(e)}}));
      }
    }
  }
  async function act(command, args, done) {
    setWorking(true);
    try {
      const res = await invoke(command, {chatId, ...args});
      if (done) notify(done(res), {tone: 'success'});
      setConfirm(null);
      await load();
    } catch (e) {
      notify(String(e), {tone: 'error'});
    } finally {
      setWorking(false);
    }
  }
  if (state.loading) return <div className="file-view is-empty">{loc('Читаю изменения…')}</div>;
  if (state.error)
    return (
      <div className="file-view is-empty">
        <span>{state.error}</span>
        <button type="button" onClick={load}>
          {loc('Повторить')}
        </button>
      </div>
    );
  if (!state.repo)
    return (
      <div className="file-view is-empty">
        {loc('Папка проекта не в git-репозитории — изменения здесь не отслеживаются.')}
      </div>
    );
  const files = state.files || [],
    summary = changesSummary(files),
    locked = busy || working;
  return (
    <div className="file-view changes-view">
      <div className="file-view-bar">
        <span className="file-view-path">
          <GitBranch size={12} aria-hidden="true" /> {state.branch || 'HEAD'}{' '}
          <small>
            {state.worktree ? loc('отдельная ветка') : loc('папка проекта')}
            {state.commits ? ' · ' + loc('коммитов: {0}', state.commits) : ''}
          </small>
        </span>
        <button type="button" title={loc('Обновить')} aria-label={loc('Обновить')} onClick={load}>
          <RefreshCw size={13} />
        </button>
      </div>
      <p className="file-view-note">
        {files.length
          ? loc(
              '{0} · +{1} −{2}',
              countLabel(files.length, loc('файл'), loc('файла'), loc('файлов')),
              summary.added,
              summary.removed
            ) + (state.worktree ? ' · ' + loc('с начала ветки') : ' · ' + loc('не закоммичено'))
          : loc('Изменений нет')}
        {state.total > files.length ? ' · ' + loc('показаны первые {0}', files.length) : ''}
      </p>
      <div className="file-view-body changes-list">
        {files.map(f => (
          <div key={f.path} className={'changes-file' + (open[f.path] ? ' is-open' : '')}>
            <div className="changes-row">
              <button
                type="button"
                className="changes-name"
                aria-expanded={!!open[f.path]}
                onClick={() => toggle(f.path)}
              >
                <ChevronRight size={12} aria-hidden="true" />
                <span className={'changes-status is-' + (f.status === '?' ? 'new' : f.status.toLowerCase())}>
                  {f.status === '?' ? 'U' : f.status}
                </span>
                <span className="changes-path" title={changeLabel(f.status)}>
                  {f.path}
                </span>
                {f.added != null && (
                  <span className="changes-count">
                    <em className="is-add">+{f.added}</em> <em className="is-del">−{f.removed}</em>
                  </span>
                )}
              </button>
              <button
                type="button"
                className="changes-icon"
                title={loc('Открыть файл')}
                aria-label={loc('Открыть файл')}
                disabled={f.status === 'D'}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('nexus-open-file', {detail: {path: (state.root || '') + '/' + f.path}})
                  )
                }
              >
                <FileText size={12} />
              </button>
              <button
                type="button"
                className={'changes-icon' + (confirm === 'discard:' + f.path ? ' is-confirm' : '')}
                title={
                  confirm === 'discard:' + f.path
                    ? loc('Нажмите ещё раз, чтобы отменить изменения файла')
                    : loc('Отменить незакоммиченные изменения')
                }
                aria-label={loc('Отменить незакоммиченные изменения')}
                disabled={locked}
                onClick={() =>
                  confirm === 'discard:' + f.path
                    ? act('chat_changes_discard', {path: f.path}, () => loc('Изменения файла отменены'))
                    : setConfirm('discard:' + f.path)
                }
              >
                <Undo2 size={12} />
              </button>
            </div>
            {open[f.path] && <DiffBlock data={diffs[f.path]} />}
          </div>
        ))}
      </div>
      {(state.uncommitted || (state.worktree && state.commits > 0)) && (
        <form
          className="changes-actions"
          onSubmit={e => {
            e.preventDefault();
            if (message.trim())
              act('chat_changes_commit', {message}, r => {
                setMessage('');
                return loc('Коммит {0} создан', r.commit);
              });
          }}
        >
          {state.uncommitted && (
            <>
              <input
                value={message}
                disabled={locked}
                maxLength={2000}
                placeholder={loc('Сообщение коммита')}
                aria-label={loc('Сообщение коммита')}
                onChange={e => setMessage(e.target.value)}
              />
              <button type="submit" disabled={locked || !message.trim()}>
                <GitCommitHorizontal size={13} aria-hidden="true" />
                {loc('Коммит')}
              </button>
            </>
          )}
          {state.worktree && !state.uncommitted && state.commits > 0 && (
            <button
              type="button"
              className={confirm === 'merge' ? 'is-confirm' : 'primary'}
              disabled={locked}
              onClick={() =>
                confirm === 'merge'
                  ? act('chat_worktree_merge', {}, r => loc('Ветка слита в {0}', r.into))
                  : setConfirm('merge')
              }
            >
              <GitMerge size={13} aria-hidden="true" />
              {confirm === 'merge'
                ? loc('Подтвердите слияние в основную копию')
                : loc('Слить в основную ветку')}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function DiffBlock({data}) {
  if (!data) return <p className="file-view-note">{loc('Загружаю…')}</p>;
  if (data.error) return <p className="file-view-message">{data.error}</p>;
  const lines = diffLines(data.diff);
  if (!lines.length)
    return <p className="file-view-note">{loc('Двоичный файл или нет текстовых различий')}</p>;
  return (
    <pre className="changes-diff">
      {lines.map((l, i) => (
        <span key={i} className={'diff-line is-' + l.kind}>
          {l.text || ' '}
          {'\n'}
        </span>
      ))}
      {data.truncated && <span className="diff-line is-meta">{loc('… дифф обрезан')}</span>}
    </pre>
  );
}
