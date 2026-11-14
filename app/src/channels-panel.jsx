import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {MessageCircle, ChevronLeft, Trash2, RefreshCw, GitBranch, Mic, Bell, Copy} from 'lucide-react';
import {CustomSelect} from './custom-select.jsx';
import {
  CHANNELS,
  EXTRA,
  ORDER,
  stateLabel,
  parseAllowed,
  allowedText,
  formProblems,
  eventLine,
  shortcutBody,
  curlExample,
  stepParts,
} from './channels-format.js';
import './channels-panel.css';
import {useToastOn} from './toaster.jsx';

const ICONS = {github: GitBranch, linear: GitBranch, api: Mic, push: Bell};
// Remote tasks: messengers, email, iMessage, issue trackers and a local API feed regular Nexus chats; push reports back.
export function ChannelsPanel() {
  const [views, setViews] = useState([]),
    [projects, setProjects] = useState([]),
    [events, setEvents] = useState([]),
    [edit, setEdit] = useState(null),
    [draft, setDraft] = useState(null),
    [allowed, setAllowed] = useState(''),
    [secret, setSecret] = useState(''),
    [generated, setGenerated] = useState(''),
    [bg, setBg] = useState(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useToastOn(error, () => setError(''), 'error');
  useToastOn(notice, () => setNotice(''), 'info');
  async function refresh() {
    try {
      const [v, p, l, b] = await Promise.all([
        invoke('channels_list'),
        invoke('list_projects'),
        invoke('channels_log'),
        invoke('background_settings'),
      ]);
      setViews(v);
      setProjects(p.filter(x => x.id !== 'nexus-system'));
      setEvents(l);
      setBg(b);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    refresh();
    let off,
      live = true;
    listen('channels-event', () => refresh())
      .then(f => {
        if (live) off = f;
        else f();
      })
      .catch(() => {});
    const t = setInterval(refresh, 15000);
    return () => {
      live = false;
      off?.();
      clearInterval(t);
    };
  }, []);
  async function open(view) {
    const kind = view.config.kind;
    setEdit(kind);
    setDraft({...view.config, projectId: view.config.projectId || projects[0]?.id || ''});
    setAllowed(allowedText(view.config.allowed));
    setSecret('');
    setGenerated('');
    setError('');
    setNotice('');
    if (kind === 'api' || kind === 'push') {
      try {
        setGenerated(await invoke('channels_secret', {kind, regenerate: false}));
      } catch (e) {
        setError(String(e));
      }
    }
  }
  const view = views.find(v => v.config.kind === edit),
    meta = CHANNELS[edit] || EXTRA[edit] || {};
  const config = draft && {...draft, allowed: parseAllowed(allowed)};
  const problems = config ? formProblems(edit, config, {hasSecret: view?.hasSecret, secret}) : [];
  async function work(name, fn) {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }
  const set = (k, v) => setDraft(d => ({...d, [k]: v}));
  const copy = (text, what) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => setNotice(`${what} скопирован`))
      .catch(() => setError('Не удалось скопировать'));
  const toggle = (k, label, hint) => (
    <label className="channel-toggle">
      <input type="checkbox" checked={!!draft[k]} onChange={e => set(k, e.target.checked)} />
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
  const baseUrl = draft ? `http://${draft.lan ? 'имя-mac.local' : '127.0.0.1'}:${draft.port || 4719}` : '';
  if (edit && draft) {
    const source = !!CHANNELS[edit];
    return (
      <form
        className="connection-form channel-form"
        onSubmit={e => {
          e.preventDefault();
          if (problems.length) return setError(problems.join('. '));
          work('save', async () => {
            await invoke('channels_save', {config, secret: secret || null});
            setSecret('');
            await refresh();
            setEdit(null);
            setNotice(`${meta.name}: настройки сохранены`);
          });
        }}
      >
        <button type="button" className="connection-back" disabled={!!busy} onClick={() => setEdit(null)}>
          <ChevronLeft size={15} />К каналам
        </button>
        <h3>{meta.name}</h3>
        <ol className="channel-steps">
          {meta.steps.map((step, i) => {
            const {text, actions} = stepParts(step);
            return (
              <li key={i}>
                {text}
                {actions.length > 0 && (
                  <span className="channel-step-actions">
                    {actions.map(a => (
                      <button
                        key={a.label}
                        type="button"
                        disabled={!!a.toggle && !!draft?.[a.toggle]}
                        onClick={() => {
                          if (a.open)
                            invoke('open_system_target', {target: a.open}).catch(e => setError(String(e)));
                          if (a.focus) {
                            const field = document.getElementById(a.focus);
                            field?.scrollIntoView({block: 'center', behavior: 'smooth'});
                            field?.focus();
                          }
                          if (a.toggle) set(a.toggle, true);
                        }}
                      >
                        {a.toggle && draft?.[a.toggle]
                          ? '✓ ' + a.label.replace(/^Включить /, '') + ' включён'
                          : a.label}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {meta.secret && (
          <label>
            {meta.secret}
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder={
                view?.hasSecret
                  ? 'Сохранён в связке ключей macOS · оставьте пустым, чтобы не менять'
                  : 'Хранится только в связке ключей macOS'
              }
            />
            <small>{meta.secretHint}</small>
          </label>
        )}
        {meta.channel && (
          <label>
            {meta.channel}
            <input
              value={draft.channelId}
              onChange={e => set('channelId', e.target.value.trim())}
              placeholder={edit === 'slack' ? 'C0123ABCD' : '123456789012345678'}
            />
            <small>{meta.channelHint}</small>
          </label>
        )}
        {edit === 'github' && (
          <div className="channel-grid wide">
            <label>
              Репозиторий
              <input
                value={draft.repo}
                onChange={e => set('repo', e.target.value.trim())}
                placeholder="owner/name"
              />
            </label>
            <label>
              Метка задач
              <input value={draft.label} onChange={e => set('label', e.target.value)} placeholder="nexus" />
            </label>
          </div>
        )}
        {edit === 'linear' && (
          <label>
            Метка задач
            <input value={draft.label} onChange={e => set('label', e.target.value)} placeholder="nexus" />
            <small>Учитываются issues, созданные после включения канала.</small>
          </label>
        )}
        {edit === 'email' && (
          <>
            <div className="channel-grid">
              <label>
                Сервер IMAP
                <input
                  value={draft.imapHost}
                  onChange={e => set('imapHost', e.target.value)}
                  placeholder="imap.gmail.com"
                />
              </label>
              <label>
                Порт
                <input
                  inputMode="numeric"
                  value={draft.imapPort || 993}
                  onChange={e => set('imapPort', Number(e.target.value) || 0)}
                />
              </label>
              <label>
                Сервер SMTP
                <input
                  value={draft.smtpHost}
                  onChange={e => set('smtpHost', e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </label>
              <label>
                Порт
                <input
                  inputMode="numeric"
                  value={draft.smtpPort || 465}
                  onChange={e => set('smtpPort', Number(e.target.value) || 0)}
                />
              </label>
            </div>
            <div className="channel-grid wide">
              <label>
                Логин
                <input
                  value={draft.username}
                  onChange={e => set('username', e.target.value)}
                  placeholder="nexus@example.com"
                  autoComplete="off"
                />
              </label>
              <label>
                Адрес отправителя · необязательно
                <input
                  value={draft.fromAddress}
                  onChange={e => set('fromAddress', e.target.value)}
                  placeholder="как логин"
                />
              </label>
            </div>
          </>
        )}
        {edit === 'api' && (
          <>
            <div className="channel-grid">
              <label>
                Адрес
                <input readOnly value={baseUrl + '/v1/message'} />
              </label>
              <label>
                Порт
                <input
                  inputMode="numeric"
                  value={draft.port || 4719}
                  onChange={e => set('port', Number(e.target.value) || 0)}
                />
              </label>
            </div>
            <div className="channel-secret">
              <span>Токен</span>
              <code>{generated ? generated.slice(0, 6) + '…' + generated.slice(-4) : '—'}</code>
              <button type="button" disabled={!generated} onClick={() => copy(generated, 'Токен')}>
                <Copy size={13} />
                Копировать
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  work('regen', async () => {
                    setGenerated(await invoke('channels_secret', {kind: 'api', regenerate: true}));
                    setNotice('Новый токен создан — обновите его в «Командах»');
                  })
                }
              >
                Новый токен
              </button>
            </div>
            <details className="channel-commands">
              <summary>Тело запроса и проверка</summary>
              <p>
                JSON: <code>{shortcutBody()}</code>. <code>wait</code> — сколько секунд ждать ответа (до 55);
                без ожидания придёт «Принято», итог — в <code>GET /v1/messages?after=cursor</code> и в
                уведомлении. <code>?format=text</code> вернёт простой текст для «Произнести».
              </p>
              {generated && (
                <button type="button" onClick={() => copy(curlExample(baseUrl, generated), 'Пример')}>
                  <Copy size={13} />
                  Скопировать пример curl
                </button>
              )}
            </details>
          </>
        )}
        {edit === 'push' && (
          <>
            <label>
              Сервер ntfy
              <input
                value={draft.pushServer}
                onChange={e => set('pushServer', e.target.value)}
                placeholder="https://ntfy.sh"
              />
              <small>Можно указать свой сервер ntfy. Нужен HTTPS.</small>
            </label>
            <div className="channel-secret">
              <span>Тема</span>
              <code>{generated || '—'}</code>
              <button type="button" disabled={!generated} onClick={() => copy(generated, 'Тема')}>
                <Copy size={13} />
                Копировать
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  work('regen', async () => {
                    setGenerated(await invoke('channels_secret', {kind: 'push', regenerate: true}));
                    setNotice('Новая тема создана — переподпишитесь в ntfy');
                  })
                }
              >
                Новая тема
              </button>
            </div>
            <label>
              Какие задачи
              <CustomSelect
                value={draft.pushScope || 'remote'}
                onChange={e => set('pushScope', e.target.value)}
              >
                <option value="remote">Только поставленные из каналов</option>
                <option value="all">Все задачи Nexus</option>
              </CustomSelect>
              <small>
                Уведомление приходит при завершении задачи и когда агент ждёт разрешения. Текст ответа
                обрезается до 300 символов.
              </small>
            </label>
          </>
        )}
        {source && (
          <label>
            {meta.allowed}
            <textarea
              id="channel-allowed"
              rows={3}
              value={allowed}
              onChange={e => setAllowed(e.target.value)}
              placeholder="По одному в строке"
            />
            <small>{meta.allowedHint} Сообщения остальных игнорируются.</small>
          </label>
        )}
        {edit !== 'push' && (
          <label>
            Проект для новых задач
            <CustomSelect value={draft.projectId} onChange={e => set('projectId', e.target.value)}>
              {!projects.length && <option value="">Нет проектов</option>}
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </CustomSelect>
            <small>Из канала можно переключиться командой /project.</small>
          </label>
        )}
        <div className="channel-toggles">
          {source &&
            toggle(
              'notifyProgress',
              'Сообщать о ходе выполнения',
              'Этапы: выбор агента, инструменты, проверки — не чаще раза в 20 секунд.'
            )}
          {edit !== 'push' &&
            toggle(
              'allowExecute',
              'Разрешить режим «Выполнение»',
              'По умолчанию задачи идут в «Обсуждение». С этим флагом команда /mode execute даёт агенту менять файлы; каждый запрос разрешения подтверждается однократно через /allow КОД.'
            )}
          {edit === 'imessage' &&
            toggle(
              'selfChat',
              'Чат с собой',
              'Принимать задачи, которые вы пишете на собственный номер/Apple ID из списка выше.'
            )}
          {edit === 'email' &&
            toggle(
              'allowUnsigned',
              'Принимать письма без DKIM/DMARC',
              'Небезопасно: адрес отправителя легко подделать. Включайте только для собственного почтового сервера.'
            )}
          {edit === 'api' &&
            toggle(
              'lan',
              'Доступ из локальной сети',
              'Нужен для iPhone в той же Wi-Fi. Запросы идут по HTTP без шифрования — включайте только в доверенной сети. Задачи из сети всегда выполняются в режиме «Обсуждение». Без флага API доступен только на этом Mac.'
            )}
          {edit === 'push' &&
            toggle(
              'macNotify',
              'Уведомления macOS при скрытом окне',
              'Системное уведомление на этом Mac, когда окно Nexus закрыто или свёрнуто.'
            )}
          {toggle(
            'enabled',
            edit === 'push' ? 'Уведомления включены' : edit === 'api' ? 'API включён' : 'Канал включён',
            source ? 'После включения старые сообщения пропускаются — задачами станут только новые.' : ''
          )}
        </div>
        {problems.length > 0 && (
          <p className="connection-hint" role="status">
            {problems.join(' · ')}
          </p>
        )}
        <div className="channel-actions">
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              work('test', async () =>
                setNotice(await invoke('channels_test', {config, secret: secret || null}))
              )
            }
          >
            {busy === 'test' ? 'Проверяю…' : edit === 'push' ? 'Отправить тест' : 'Проверить подключение'}
          </button>
          <button className="connection-primary" disabled={!!busy}>
            {busy === 'save' ? 'Сохраняю…' : 'Сохранить'}
          </button>
          {view && ((view.hasSecret && meta.secret) || view.config.enabled) && (
            <button
              type="button"
              title="Удалить канал и ключ"
              aria-label={'Удалить ' + meta.name}
              disabled={!!busy}
              onClick={() =>
                work('remove', async () => {
                  await invoke('channels_remove', {kind: edit});
                  await refresh();
                  setEdit(null);
                  setNotice(`${meta.name}: удалено`);
                })
              }
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </form>
    );
  }
  const card = kind => {
    const v = views.find(x => x.config.kind === kind);
    const m = CHANNELS[kind] || EXTRA[kind];
    const state = v?.config.enabled ? v.status?.state : 'off';
    const Icon = ICONS[kind] || MessageCircle;
    return (
      <article className="connection-account channel-card" key={kind}>
        <div className="catalog-agent-top">
          <span className={'channel-icon channel-' + kind} aria-hidden="true">
            <Icon size={16} />
          </span>
          <div>
            <h3>{m.name}</h3>
            <span
              className={state === 'running' ? 'connection-ready' : state === 'error' ? 'channel-error' : ''}
            >
              {kind === 'push'
                ? v?.config.enabled
                  ? v.config.pushScope === 'all'
                    ? 'Все задачи'
                    : 'Задачи из каналов'
                  : 'Выключены'
                : stateLabel(v)}
              {v?.config.enabled && v.config.allowExecute ? ' · выполнение разрешено' : ''}
            </span>
          </div>
          <button
            className={v?.config.enabled ? '' : 'connection-primary'}
            disabled={!v}
            onClick={() => open(v)}
          >
            {v?.config.enabled ? 'Настроить' : 'Подключить'}
          </button>
        </div>
        {state === 'error' && v?.status?.detail && <p className="connection-error">{v.status.detail}</p>}
      </article>
    );
  };
  return (
    <div className="channels-panel">
      <p className="connection-hint">
        Ставьте задачи агентам из мессенджеров, почты, трекеров и голосом, следите за выполнением. Каждая
        задача — обычный чат Nexus.
      </p>
      {bg && (
        <section className="channel-background" aria-label="Работа в фоне">
          <label className="channel-toggle">
            <input
              type="checkbox"
              checked={bg.keepRunning}
              disabled={!!busy}
              onChange={e =>
                work('bg', async () =>
                  setBg(
                    await invoke('background_save', {
                      keepRunning: e.target.checked,
                      launchAtLogin: bg.launchAtLogin,
                    })
                  )
                )
              }
            />
            <span>
              <strong>Работать при закрытом окне</strong>
              <small>
                {bg.activeChannels
                  ? `Закрытие окна скроет Nexus, каналы продолжат работу (${bg.activeChannels}). Открыть — значок в Dock, выйти — ⌘Q.`
                  : 'Сработает, когда включён хотя бы один канал.'}
              </small>
            </span>
          </label>
          <label className="channel-toggle">
            <input
              type="checkbox"
              checked={bg.launchAtLogin}
              disabled={!!busy}
              onChange={e =>
                work('bg', async () =>
                  setBg(
                    await invoke('background_save', {
                      keepRunning: bg.keepRunning,
                      launchAtLogin: e.target.checked,
                    })
                  )
                )
              }
            />
            <span>
              <strong>Запускать при входе в систему</strong>
              <small>{bg.loginStatus}</small>
            </span>
          </label>
        </section>
      )}
      <h4 className="channel-group">Мессенджеры и почта</h4>
      {ORDER.filter(k => !['github', 'linear'].includes(k)).map(card)}
      <h4 className="channel-group">Трекеры задач</h4>
      {['github', 'linear'].map(card)}
      <h4 className="channel-group">Голос и уведомления</h4>
      {['api', 'push'].map(card)}
      <details className="channel-commands">
        <summary>Команды в чате</summary>
        <ul>
          <li>
            <code>текст задачи</code> — новая задача в выбранном проекте
          </li>
          <li>
            <code>/status</code> — текущий этап и последние задачи проекта
          </li>
          <li>
            <code>/stop</code>, <code>/continue</code> — остановить или дописать ответ
          </li>
          <li>
            <code>/projects</code>, <code>/project 2</code> — выбрать проект
          </li>
          <li>
            <code>/agent</code>, <code>/agent auto</code> — выбрать агента или автовыбор
          </li>
          <li>
            <code>/mode discuss</code>, <code>/mode execute</code> — обсуждение или выполнение
          </li>
          <li>
            <code>/allow КОД</code>, <code>/deny КОД</code> — ответ на запрос разрешения агента
          </li>
          <li>
            <code>/new</code> — следующая задача в новом чате
          </li>
        </ul>
        <p>В GitHub и Linear задача — новое issue с меткой, команды — комментарии в нём.</p>
      </details>
      <details className="channel-log">
        <summary>
          <RefreshCw size={12} />
          Журнал каналов · {events.length}
        </summary>
        {events.length ? (
          <ul>
            {events.slice(0, 60).map((e, i) => (
              <li key={i} className={'channel-event-' + e.direction}>
                {eventLine(e)}
              </li>
            ))}
          </ul>
        ) : (
          <p>Событий пока нет.</p>
        )}
      </details>
    </div>
  );
}
