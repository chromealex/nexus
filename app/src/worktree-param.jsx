import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {GitBranch} from 'lucide-react';
import {CustomSelect} from './custom-select.jsx';
import {notify} from './toasts.js';
import {loc} from './i18n.js';

// «Параметры → Рабочая копия»: run this chat's agents in the project folder or in a separate
// git worktree on its own branch. Leaving the worktree with uncommitted changes needs a second click.
export function useChatWorktree(chatId) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let live = true;
    setState(null);
    if (chatId)
      invoke('chat_worktree_status', {chatId})
        .then(s => live && setState(s))
        .catch(() => live && setState({repo: false}));
    return () => {
      live = false;
    };
  }, [chatId]);
  return [state, setState];
}

export function WorktreeParam({chatId, state, setState, disabled}) {
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [chatId]);
  if (!state?.repo) return null;
  const mode = state.worktree ? 'worktree' : 'project';
  async function change(next, force = false) {
    if (next === mode && !force) return;
    setBusy(true);
    try {
      if (next === 'worktree') {
        const res = await invoke('chat_worktree_enable', {chatId});
        setState({repo: true, worktree: res.worktree});
        notify(
          loc('Чат работает в ветке {0}', res.worktree.branch) +
            (res.copied?.length
              ? ' · ' + loc('скопировано из .worktreeinclude: {0}', res.copied.length)
              : ''),
          {tone: 'success'}
        );
      } else {
        await invoke('chat_worktree_remove', {chatId, force, deleteBranch: false});
        notify(loc('Рабочая копия удалена, ветка {0} сохранена', state.worktree.branch), {tone: 'success'});
        setState({repo: true, worktree: null});
        setDirty(false);
      }
    } catch (e) {
      if (String(e) === 'WORKTREE_DIRTY') setDirty(true);
      else notify(String(e), {tone: 'error'});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="composer-param-row worktree-param">
      <span className="composer-param-label">
        <GitBranch size={12} aria-hidden="true" />
        {loc('Рабочая копия')}
      </span>
      <CustomSelect
        className="reasoning-mode"
        aria-label={loc('Рабочая копия')}
        value={mode}
        disabled={disabled || busy}
        onChange={e => change(e.target.value)}
      >
        <option value="project">{loc('Папка проекта')}</option>
        <option value="worktree">{loc('Отдельная ветка (git worktree)')}</option>
      </CustomSelect>
      <small>
        {state.worktree
          ? loc(
              'Ветка {0}. Основная копия не меняется; изменения — во вкладке «Изменения».',
              state.worktree.branch
            )
          : loc('Отдельная ветка позволяет нескольким чатам менять проект параллельно.')}
      </small>
      {dirty && (
        <span className="browser-actions">
          <small className="worktree-warn">
            {loc('В ветке есть незакоммиченные изменения — они пропадут. Ветка с коммитами останется.')}
          </small>
          <button type="button" disabled={busy} onClick={() => change('project', true)}>
            {loc('Удалить рабочую копию')}
          </button>
        </span>
      )}
    </div>
  );
}
