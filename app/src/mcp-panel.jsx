import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {Plug, Plus, Trash2, LogIn} from 'lucide-react';
import {loc} from './i18n.js';
import {useToastOn} from './toaster.jsx';

// «Агенты и подключения → MCP»: servers like Atlassian (Jira, Confluence) connected once in Nexus and
// given to every agent. Sign-in opens the provider's own page; tool calls are confirmed in the chat.
export function McpPanel({onBusy}) {
  const [state, setState] = useState({servers: [], presets: []}),
    [busy, setBusy] = useState(''),
    [stage, setStage] = useState(''),
    [form, setForm] = useState(null),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useToastOn(error, () => setError(''), 'error');
  useToastOn(notice, () => setNotice(''), 'info');
  useEffect(() => {
    invoke('mcp_servers')
      .then(setState)
      .catch(e => setError(String(e)));
    let off,
      live = true;
    listen('mcp-progress', e => setStage(e.payload?.stage || ''))
      .then(f => (live ? (off = f) : f()))
      .catch(() => {});
    return () => {
      live = false;
      off?.();
    };
  }, []);
  useEffect(() => {
    const server = state.servers.find(s => s.id === busy);
    onBusy?.(busy ? {name: server?.name || 'MCP', label: stage || loc('Выполняется…')} : null);
  }, [busy, stage]);
  async function run(id, fn, done) {
    setBusy(id);
    setStage('');
    try {
      setState(await fn());
      if (done) setNotice(done);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }
  const added = new Set(state.servers.map(s => s.id));
  return (
    <div className="mcp-panel">
      <p className="connection-hint">
        {loc(
          'MCP-серверы дают агентам доступ к внешним сервисам — например, к задачам Jira. Подключите сервер один раз: его получат Claude, Codex и другие агенты. Каждый вызов инструмента подтверждается карточкой в чате.'
        )}
      </p>
      {state.servers.map(s => (
        <article className="connection-account mcp-server" key={s.id}>
          <div className="catalog-agent-top">
            <span className="channel-icon" aria-hidden="true">
              <Plug size={16} />
            </span>
            <div>
              <h3>{s.name}</h3>
              <span className={s.signedIn && s.enabled ? 'connection-ready' : ''}>
                {!s.signedIn
                  ? loc('Требуется вход')
                  : s.enabled
                    ? loc('Подключён к агентам')
                    : loc('Выключен')}
                {' · '}
                <code>{s.url}</code>
              </span>
              {busy === s.id && (
                <span className="channel-busy" role="status">
                  <span className="connections-activity-spinner" aria-hidden="true" />
                  {stage || loc('Выполняется…')}
                </span>
              )}
            </div>
            <button
              className={confirm === s.id ? 'connection-remove confirm' : 'connection-remove'}
              title={confirm === s.id ? loc('Нажмите ещё раз, чтобы удалить') : loc('Удалить сервер')}
              aria-label={loc('Удалить сервер') + ' ' + s.name}
              disabled={!!busy}
              onBlur={() => setConfirm(v => (v === s.id ? '' : v))}
              onClick={() =>
                confirm === s.id
                  ? (setConfirm(''), run(s.id, () => invoke('mcp_server_remove', {id: s.id})))
                  : setConfirm(s.id)
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="connection-actions">
            <button
              className={s.signedIn ? '' : 'connection-primary'}
              disabled={!!busy}
              onClick={() =>
                run(s.id, () => invoke('mcp_server_login', {id: s.id}), loc('{0}: вход выполнен', s.name))
              }
            >
              <LogIn size={13} />
              {s.signedIn ? loc('Войти заново') : loc('Войти')}
            </button>
            {s.signedIn && (
              <label className="mcp-toggle">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  disabled={!!busy}
                  onChange={e =>
                    run(s.id, () => invoke('mcp_server_toggle', {id: s.id, enabled: e.target.checked}))
                  }
                />
                {loc('Давать агентам')}
              </label>
            )}
          </div>
        </article>
      ))}
      <h4 className="channel-group">{loc('Добавить сервер')}</h4>
      <div className="connection-actions">
        {state.presets
          .filter(p => !added.has(p.id))
          .map(p => (
            <button
              key={p.id}
              disabled={!!busy}
              onClick={() =>
                run(
                  p.id,
                  async () => {
                    await invoke('mcp_server_save', {id: p.id, name: p.name, url: p.url});
                    return invoke('mcp_server_login', {id: p.id});
                  },
                  loc('{0}: вход выполнен', p.name)
                )
              }
            >
              <Plus size={13} />
              {p.name}
            </button>
          ))}
        <button disabled={!!busy} onClick={() => setForm(f => (f ? null : {id: '', name: '', url: ''}))}>
          <Plus size={13} />
          {loc('Свой сервер по адресу')}
        </button>
      </div>
      {form && (
        <form
          className="connection-form mcp-form"
          onSubmit={e => {
            e.preventDefault();
            run(form.id, () => invoke('mcp_server_save', form)).then(() => setForm(null));
          }}
        >
          <label>
            {loc('Название')}
            <input
              required
              maxLength={60}
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
            />
          </label>
          <label>
            {loc('Идентификатор')}
            <input
              required
              maxLength={32}
              pattern="[a-z0-9-]+"
              value={form.id}
              placeholder="linear"
              onChange={e => setForm({...form, id: e.target.value.toLowerCase()})}
            />
          </label>
          <label>
            {loc('Адрес сервера')}
            <input
              required
              type="url"
              value={form.url}
              placeholder="https://mcp.example.com/mcp"
              onChange={e => setForm({...form, url: e.target.value})}
            />
          </label>
          <button className="connection-primary" disabled={!!busy}>
            {loc('Добавить')}
          </button>
        </form>
      )}
    </div>
  );
}
