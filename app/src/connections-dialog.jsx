import {ChannelsPanel} from './channels-panel.jsx';
import {McpPanel} from './mcp-panel.jsx';
import {Quota, ApiLimits} from './quota-view.jsx';
import {CustomSelect} from './custom-select.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {
  X,
  Plus,
  Search,
  Check,
  Trash2,
  RefreshCw,
  Plug,
  ChevronLeft,
  Download,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import {AgentIcon} from './agent-icon.jsx';
import {useToastOn} from './toaster.jsx';
import {PathPick} from './path-pick.jsx';
import {CATALOG, TAG_NAMES, connectionState} from './agent-catalog.js';
import {loc} from './i18n.js';
const active = phase => ['queued', 'checking', 'installing', 'verifying'].includes(phase);
const phaseLabel = {
  queued: loc('В очереди'),
  checking: loc('Проверка'),
  installing: loc('Установка'),
  verifying: loc('Проверка установки'),
  installed: loc('Установлен'),
  failed: loc('Ошибка установки'),
  cancelled: loc('Отменено'),
};
const redact = s =>
  String(s || '')
    .replace(/https?:\/\/\S+/g, '[ссылка скрыта]')
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/g, '[код скрыт]')
    .slice(-4000);
export function ConnectionsDialog({
  open,
  onClose,
  onReopen,
  agents,
  accounts,
  jobs,
  logs,
  checks,
  authJobs,
  quotas,
  statuslines,
  onInstall,
  onCancelInstall,
  onLogin,
  onCancelLogin,
  onCheck,
  onQuota,
  onRemove,
  onRefreshAccounts,
  onRefreshAgents,
  onModels,
  onProviderRows,
  initialProvider,
}) {
  const [tab, setTab] = useState('catalog'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [apis, setApis] = useState([]),
    [custom, setCustom] = useState([]),
    [form, setForm] = useState(null),
    [name, setName] = useState(''),
    [key, setKey] = useState(''),
    [url, setUrl] = useState(''),
    [executable, setExecutable] = useState(''),
    [args, setArgs] = useState('[]'),
    [pkg, setPkg] = useState(''),
    [auth, setAuth] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pendingInstall, setPendingInstall] = useState(null),
    [expanded, setExpanded] = useState(null),
    [registry, setRegistry] = useState([]),
    [registryBusy, setRegistryBusy] = useState(false),
    [localProgress, setLocalProgress] = useState(''),
    [afterLocal, setAfterLocal] = useState(null),
    [resumeAgent, setResumeAgent] = useState(null),
    [confirmRemove, setConfirmRemove] = useState(null),
    [apiLimits, setApiLimits] = useState({}),
    [busyForm, setBusyForm] = useState(null),
    [channelBusy, setChannelBusy] = useState(null),
    [renaming, setRenaming] = useState(null),
    [mcpBusy, setMcpBusy] = useState(null);
  async function renameAccount(id, value) {
    const next = value.trim();
    setRenaming(null);
    if (!next || next === accounts.find(a => a.id === id)?.name) return;
    try {
      await invoke('rename_account', {id, name: next});
      await onRefreshAccounts();
      await changed();
    } catch (e) {
      setError(String(e));
    }
  }
  useToastOn(error, () => setError(''), 'error');
  useToastOn(notice, () => setNotice(''), 'info');
  async function loadApiLimits(rows) {
    await Promise.all(
      rows
        .filter(a => a.provider === 'grok' && a.ready)
        .map(async a => {
          setApiLimits(v => ({
            ...v,
            [a.id]: {...v[a.id], status: v[a.id]?.status === 'available' ? 'available' : 'checking'},
          }));
          try {
            const r = await invoke('provider_limits', {id: a.id});
            setApiLimits(v => ({...v, [a.id]: r}));
          } catch (e) {
            setApiLimits(v => ({...v, [a.id]: {...v[a.id], status: 'error', detail: String(e)}}));
          }
        })
    );
  }
  const dialog = useRef(null),
    action = useRef(false),
    initial = useRef(null),
    refreshing = useRef(false),
    lastFocus = useRef(null);
  async function refresh(verify = false) {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [apiRows, customRows] = await Promise.all([
        invoke('list_provider_connections'),
        invoke('list_custom_agents'),
      ]);
      setApis(apiRows);
      onProviderRows(apiRows);
      setCustom(customRows);
      if (verify) {
        const updated = await Promise.all(
          apiRows.map(a =>
            invoke('check_provider_connection', {id: a.id}).catch(() => ({...a, ready: false}))
          )
        );
        setApis(updated);
        onProviderRows(updated);
        loadApiLimits(updated);
        await onModels();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      refreshing.current = false;
    }
  }
  useEffect(() => {
    refresh(true);
    let off,
      live = true;
    listen('local-model-progress', e =>
      setLocalProgress(
        e.payload.percent != null
          ? loc('Загрузка Qwen: {0}%', Math.round(e.payload.percent))
          : loc('Подготовка модели…')
      )
    ).then(f => {
      if (live) off = f;
      else f();
    });
    return () => {
      live = false;
      off?.();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    refresh(true);
    const focus = () => refresh(true);
    window.addEventListener('focus', focus);
    const timer = setInterval(focus, 60000);
    lastFocus.current = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('focus', focus);
      clearInterval(timer);
      lastFocus.current?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (open && initialProvider && initial.current !== initialProvider) {
      initial.current = initialProvider;
      const item = CATALOG.find(a => a.id === initialProvider);
      if (item) {
        setTab('catalog');
        setSearch(item.name);
      }
    }
    if (!open) initial.current = null;
  }, [open, initialProvider]);
  useEffect(() => {
    if (!open) return;
    const keydown = e => {
      if (e.key === 'Escape' && !action.current) {
        if (form) {
          setForm(null);
          setKey('');
        } else onClose();
      }
      if (e.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(
          el => !el.disabled && el.getClientRects().length
        );
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [open, form]);
  async function work(id, fn) {
    if (action.current) return;
    action.current = true;
    setBusy(id);
    setBusyForm(form);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      action.current = false;
      setBusy('');
      setBusyForm(null);
    }
  }
  async function changed() {
    await refresh();
    await onRefreshAgents();
    await onModels();
    window.dispatchEvent(new Event('nexus-connections-changed'));
  }
  function edit(item) {
    setForm(item);
    setName(item.name);
    setKey('');
    setUrl(item.provider === 'local' ? 'http://127.0.0.1:11434/v1' : '');
    setExecutable(item.executable || '');
    setArgs(JSON.stringify(item.args || []));
    setPkg(item.npmPackage || '');
    setAuth(item.authMethod || '');
    setError('');
  }
  async function connect(item) {
    if (item.kind === 'oauth')
      return work(item.id, async () => {
        let a = accounts.find(a => a.provider === item.id && checks[a.id]?.status !== 'ready');
        if (!a) {
          a = await invoke('add_account', {
            provider: item.id,
            name: accounts.some(a => a.provider === item.id)
              ? loc('Аккаунт {0}', accounts.filter(a => a.provider === item.id).length + 1)
              : loc('Личный'),
          });
          await onRefreshAccounts();
        }
        setTab('accounts');
        setExpanded(a.id);
        await onLogin(a.id);
      });
    if (item.kind === 'api' || item.kind === 'gemini') {
      edit(
        item.kind === 'gemini' ? {...item, kind: 'api', provider: 'gemini-api', name: 'Gemini API'} : item
      );
      return;
    }
    if (item.kind === 'custom') {
      edit(item);
      return;
    }
    if (item.kind === 'external') {
      setNotice(
        loc(
          'Для этого агента ещё нет адаптера чата. Можно установить CLI или добавить совместимый ACP-адаптер.'
        )
      );
      return;
    }
    return work(item.id, async () => {
      const agent = await invoke('connect_agent_manifest', {
        manifest: {
          name: item.name,
          executable: item.executable,
          args: item.args,
          authMethod: item.authMethod || null,
        },
      });
      setNotice(loc('{0}: сессия ACP подтверждена', agent.manifest.name));
      await changed();
    });
  }
  async function primary(item) {
    if (['qwen', 'goose'].includes(item.id) && !(await invoke('local_qwen_status').catch(() => false))) {
      setAfterLocal(item);
      edit(CATALOG.find(a => a.id === 'qwen-local'));
      setNotice(loc('Для {0} нужен локальный Qwen. После настройки Nexus продолжит подключение.', item.name));
      return;
    }
    const installed = agents.some(a => a.id === item.id && a.installed) || jobs[item.id]?.success === true;
    if (!installed && agents.find(a => a.id === item.id)?.installable) {
      setPendingInstall(item);
      await onInstall(item.id);
    } else await connect(item);
  }
  useEffect(() => {
    if (!pendingInstall) return;
    const job = jobs[pendingInstall.id];
    if (job?.success === true) {
      const item = pendingInstall;
      setPendingInstall(null);
      connect(item);
    } else if (job?.success === false) {
      setPendingInstall(null);
      setError(loc('Установка {0} не завершена. Раскройте журнал и повторите.', pendingInstall.name));
    }
  }, [jobs, pendingInstall]);
  useEffect(() => {
    if (!busy && resumeAgent) {
      const item = resumeAgent;
      setResumeAgent(null);
      primary(item);
    }
  }, [busy, resumeAgent]);
  async function submit(e) {
    e.preventDefault();
    await work('form', async () => {
      if (form.kind === 'api') {
        const row = await invoke('connect_provider', {
          provider: form.provider,
          name,
          baseUrl: url,
          apiKey: key,
        });
        setKey('');
        setNotice(loc('{0}: API подтвердил доступ, моделей: {1}', row.name, row.models.length));
        if (form.provider === 'local' && afterLocal) {
          setResumeAgent(afterLocal);
          setAfterLocal(null);
        }
      } else {
        let parsed;
        try {
          parsed = JSON.parse(args);
        } catch {
          throw Error(loc('Аргументы указываются массивом JSON, например ["--acp"]'));
        }
        if (!Array.isArray(parsed) || parsed.some(a => typeof a !== 'string'))
          throw Error(loc('Аргументы должны быть массивом строк'));
        await invoke('connect_agent_manifest', {
          manifest: {name, executable, args: parsed, npmPackage: pkg || null, authMethod: auth || null},
        });
        setNotice(loc('Сессия ACP подтверждена; агент добавлен в выбор моделей.'));
      }
      setForm(null);
      await changed();
    });
  }
  async function removeApi(id) {
    await work(id, async () => {
      await invoke('remove_provider_connection', {id});
      await changed();
    });
  }
  async function disconnect(id) {
    await work(id, async () => {
      await invoke('disconnect_custom_agent', {id});
      await changed();
    });
  }
  const total =
    accounts.filter(a => checks[a.id]?.status === 'ready').length +
    apis.filter(a => a.ready).length +
    custom.filter(a => a.verified).length;
  const connected = item =>
    item.kind === 'oauth'
      ? accounts.some(a => a.provider === item.id && checks[a.id]?.status === 'ready')
      : item.kind === 'api'
        ? apis.some(a => a.provider === item.provider && a.ready)
        : custom.some(a => a.verified && a.manifest.executable === item.executable);
  async function loadRegistry() {
    if (registryBusy) return;
    setRegistryBusy(true);
    setError('');
    try {
      setRegistry(await invoke('agent_registry'));
    } catch (e) {
      setError(String(e));
    } finally {
      setRegistryBusy(false);
    }
  }
  // Long work (a Qwen download, an agent install, a channel check) keeps running when the user leaves
  // its page or closes the dialog: the dialog stays mounted and shows where the work is and how far.
  const working = busy || channelBusy || mcpBusy;
  const activity = busy
    ? {
        title: busyForm?.name || loc('Подключение'),
        detail: busy === 'pull' ? localProgress || loc('Подготовка Ollama и загрузки…') : loc('Выполняется…'),
        back: busyForm && form !== busyForm ? () => edit(busyForm) : null,
      }
    : channelBusy
      ? {
          title: channelBusy.name,
          detail: channelBusy.label,
          back: tab !== 'channels' || form ? () => (setForm(null), setTab('channels')) : null,
        }
      : null;
  const percent = busy === 'pull' && /(\d+)%/.exec(localProgress)?.[1];
  if (!open && !working) return null;
  return (
    <>
      {!open && activity && (
        <button type="button" className="connections-activity-pill" onClick={onReopen}>
          <span className="connections-activity-spinner" aria-hidden="true" />
          <span>
            <strong>{activity.title}</strong>
            <small>{activity.detail}</small>
          </span>
        </button>
      )}
      <div
        hidden={!open}
        className="connections-overlay"
        onMouseDown={e => {
          if (e.target === e.currentTarget && !action.current) onClose();
        }}
      >
        <section
          className="connections-dialog"
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label={loc('Агенты и подключения')}
        >
          <div className="connections-heading">
            <div>
              <h2>{loc('Агенты и подключения')}</h2>
              <p>{loc('Установите агента, подтвердите вход — продолжайте в чате.')}</p>
            </div>
            <button aria-label={loc('Закрыть подключения')} onClick={onClose}>
              <X size={19} />
            </button>
          </div>
          <div className="connections-nav">
            <button
              className={tab === 'catalog' ? 'active' : ''}
              onClick={() => {
                setTab('catalog');
                setForm(null);
                setKey('');
              }}
            >
              {loc('Каталог')}
            </button>
            <button
              className={tab === 'accounts' ? 'active' : ''}
              onClick={() => {
                setTab('accounts');
                setForm(null);
                setKey('');
              }}
            >
              {loc('Аккаунты')}{' '}
              <span
                title={loc(
                  'Вход подтверждён: {0} из {1}',
                  total,
                  accounts.length + apis.length + custom.length
                )}
              >
                {accounts.length + apis.length + custom.length > total
                  ? `${total}/${accounts.length + apis.length + custom.length}`
                  : total}
              </span>
            </button>
            <button
              className={tab === 'channels' ? 'active' : ''}
              onClick={() => {
                setTab('channels');
                setForm(null);
                setKey('');
              }}
            >
              {loc('Каналы')}
            </button>
            <button onClick={() => edit({name: '', kind: 'custom'})}>
              <Plus size={15} />
              {loc('Свой агент')}
            </button>
          </div>
          {activity && (activity.back || percent) && (
            <div className="connections-activity" role="status">
              <span className="connections-activity-spinner" aria-hidden="true" />
              <span>
                <strong>{activity.title}</strong>
                <small>{activity.detail}</small>
                {percent && (
                  <i className="connections-activity-bar">
                    <b style={{width: percent + '%'}} />
                  </i>
                )}
              </span>
              {activity.back && (
                <button type="button" onClick={activity.back}>
                  {loc('Открыть')}
                </button>
              )}
            </div>
          )}
          <div className="connections-content">
            <div hidden={tab !== 'channels' || !!form}>
              <ChannelsPanel onBusy={setChannelBusy} />
            </div>
            {form ? (
              <form className="connection-form" onSubmit={submit}>
                <button
                  type="button"
                  className="connection-back"
                  onClick={() => {
                    setForm(null);
                    setKey('');
                  }}
                >
                  <ChevronLeft size={15} />
                  {loc('К списку')}
                </button>
                <h3>{form.kind === 'api' ? loc('Подключить {0}', form.name) : loc('Добавить ACP-агента')}</h3>
                <label>
                  {loc('Название')}
                  <input
                    required
                    value={name}
                    maxLength={80}
                    onChange={e => setName(e.target.value)}
                    placeholder={loc('Название агента или аккаунта')}
                  />
                </label>
                {form.kind === 'api' ? (
                  <>
                    {form.provider === 'local' ? (
                      <div className="local-setup">
                        <p>
                          {loc(
                            'Ollama должен работать на этом Mac. Nexus проверит модели на 127.0.0.1:11434.'
                          )}
                        </p>
                        <div>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              work('pull', async () => {
                                await invoke('setup_local_qwen');
                                setForm(null);
                                await changed();
                                if (afterLocal) {
                                  setResumeAgent(afterLocal);
                                  setAfterLocal(null);
                                }
                                setNotice(loc('Локальный Qwen подключён'));
                              })
                            }
                          >
                            {loc('Установить и подключить Qwen · несколько ГБ')}
                          </button>
                          <a href="https://ollama.com/download/mac" target="_blank" rel="noreferrer">
                            {loc('Установить Ollama')} <ExternalLink size={12} />
                          </a>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              work('pull', async () => {
                                await invoke('pull_local_qwen');
                                setNotice(loc('qwen3:4b загружен. Нажмите «Проверить и подключить».'));
                              })
                            }
                          >
                            <Download size={14} />
                            {loc('Загрузить Qwen 4B · несколько ГБ')}
                          </button>
                        </div>
                        {busy === 'pull' && (
                          <p role="status">
                            {localProgress || loc('Подготовка Ollama и загрузки…')}{' '}
                            <button type="button" onClick={() => invoke('cancel_local_qwen')}>
                              {loc('Отменить')}
                            </button>
                          </p>
                        )}
                        <small>
                          {loc(
                            'Загрузка требует свободного места и может занять несколько минут. Проверка текста моделью не заменяет запуск тестов.'
                          )}
                        </small>
                      </div>
                    ) : (
                      <label>
                        {loc('API-ключ')}
                        <input
                          type="password"
                          autoComplete="off"
                          required
                          value={key}
                          onChange={e => setKey(e.target.value)}
                          placeholder={loc('Ключ хранится в связке ключей macOS')}
                        />
                      </label>
                    )}
                    {form.provider === 'openai-compatible' && (
                      <label>
                        {loc('Адрес API')}
                        <input
                          required
                          type="url"
                          value={url}
                          placeholder="https://api.example.com/v1"
                          onChange={e => setUrl(e.target.value)}
                        />
                      </label>
                    )}
                    <p className="connection-hint">
                      {loc(
                        'Текстовый API загружает список моделей с сервера. Терминал, локальные файлы и лимиты подписки через него недоступны.'
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <label>
                      {loc('Исполняемый файл')}
                      <span className="path-field">
                        <input
                          required
                          value={executable}
                          maxLength={500}
                          onChange={e => setExecutable(e.target.value)}
                          placeholder={loc('my-agent или /полный/путь/к/агенту')}
                        />
                        <PathPick
                          kind="executable"
                          prompt={loc('Исполняемый файл агента')}
                          onPick={setExecutable}
                        />
                      </span>
                    </label>
                    <label>
                      {loc('Аргументы · JSON')}
                      <input
                        required
                        value={args}
                        onChange={e => setArgs(e.target.value)}
                        placeholder='["--acp"]'
                      />
                    </label>
                    <details>
                      <summary>{loc('Установка и авторизация')}</summary>
                      <label>
                        {loc('Официальный npm-пакет · необязательно')}
                        <input
                          value={pkg}
                          onChange={e => setPkg(e.target.value)}
                          placeholder="@vendor/agent@version"
                        />
                      </label>
                      <label>
                        {loc('Метод входа ACP · необязательно')}
                        <input
                          value={auth}
                          onChange={e => setAuth(e.target.value)}
                          placeholder={loc('ID из документации агента')}
                        />
                      </label>
                    </details>
                    <p className="connection-hint">
                      {loc(
                        'Агент запускается на вашем компьютере. Указывайте доверенную команду и официальный пакет. Nexus проверит ACP и создание сессии. Для другого протокола нужен адаптер.'
                      )}
                    </p>
                  </>
                )}
                {busy && busy !== 'pull' && form.kind !== 'api' && (
                  <button type="button" onClick={() => invoke('cancel_agent_connection')}>
                    {loc('Отменить подключение')}
                  </button>
                )}
                <button className="connection-primary" disabled={!!busy}>
                  {busy === 'pull'
                    ? loc('Загрузка модели…')
                    : busy
                      ? loc('Подключаю…')
                      : loc('Проверить и подключить')}
                </button>
              </form>
            ) : tab === 'channels' || tab === 'mcp' ? null : tab === 'catalog' ? (
              <>
                <div className="catalog-toolbar">
                  <label>
                    <Search size={15} />
                    <input
                      aria-label={loc('Найти агента')}
                      placeholder={loc('Найти агента')}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </label>
                  <CustomSelect
                    aria-label={loc('Фильтр агентов')}
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                  >
                    <option value="all">{loc('Все агенты')}</option>
                    <option value="ready">{loc('Подключённые')}</option>
                    <option value="local">{loc('Локальные')}</option>
                  </CustomSelect>
                </div>
                <div className="connections-catalog">
                  {CATALOG.filter(
                    a =>
                      (a.name + ' ' + a.description).toLowerCase().includes(search.toLowerCase()) &&
                      (filter === 'all' ||
                        (filter === 'ready' && connected(a)) ||
                        (filter === 'local' && a.tags.includes('local')))
                  ).map(item => {
                    const job = jobs[item.id],
                      installed = agents.some(a => a.id === item.id && a.installed) || job?.success === true,
                      ready = connected(item),
                      installable = agents.find(a => a.id === item.id)?.installable;
                    return (
                      <article key={item.id} className="catalog-agent">
                        <div className="catalog-agent-top">
                          <AgentIcon
                            provider={
                              item.id === 'qwen-local'
                                ? 'qwen'
                                : item.id === 'antigravity'
                                  ? 'gemini'
                                  : item.id
                            }
                          />
                          <div>
                            <h3>{item.name}</h3>
                            <span className={ready ? 'connection-ready' : ''}>
                              {ready
                                ? loc('Подключён')
                                : active(job?.phase)
                                  ? phaseLabel[job.phase]
                                  : installed
                                    ? loc('Установлен')
                                    : item.kind === 'api'
                                      ? loc('Подключение API')
                                      : loc('Не подключён')}
                            </span>
                          </div>
                          <button
                            className={ready ? '' : 'connection-primary'}
                            disabled={!!busy || active(job?.phase) || !!pendingInstall}
                            onClick={() => (ready ? setTab('accounts') : primary(item))}
                          >
                            {active(job?.phase)
                              ? phaseLabel[job.phase] + '…'
                              : busy === item.id
                                ? loc('Подключаю…')
                                : ready
                                  ? loc('Аккаунты')
                                  : !installed && installable
                                    ? item.kind === 'external'
                                      ? loc('Установить CLI')
                                      : loc('Установить и подключить')
                                    : item.kind === 'external'
                                      ? loc('Подробнее')
                                      : loc('Подключить')}
                          </button>
                        </div>
                        <p>{item.description}</p>
                        {item.kind === 'oauth' && ready && (
                          <button
                            className="connection-link"
                            disabled={!!busy}
                            onClick={() =>
                              work(item.id, async () => {
                                const a = await invoke('add_account', {
                                  provider: item.id,
                                  name: loc(
                                    'Аккаунт {0}',
                                    accounts.filter(a => a.provider === item.id).length + 1
                                  ),
                                });
                                await onRefreshAccounts();
                                setTab('accounts');
                                setExpanded(a.id);
                                await onLogin(a.id);
                              })
                            }
                          >
                            <Plus size={12} />
                            {loc('Ещё аккаунт')}
                          </button>
                        )}
                        <div className="catalog-tags">
                          {item.tags.map(t => (
                            <span key={t}>{TAG_NAMES[t]}</span>
                          ))}
                        </div>
                        {item.kind === 'gemini' && (
                          <button
                            className="connection-link"
                            onClick={() => primary(CATALOG.find(a => a.id === 'antigravity'))}
                          >
                            {loc('Войти с Google через Antigravity')}
                          </button>
                        )}
                        {job && (
                          <details className="connection-install-log">
                            <summary>
                              {phaseLabel[job.phase] || job.phase} {loc('· журнал установки')}
                            </summary>
                            <pre>{logs[item.id] || loc('Ожидаем установщик…')}</pre>
                            {active(job.phase) && (
                              <button
                                onClick={() => {
                                  setPendingInstall(null);
                                  onCancelInstall(item.id);
                                }}
                              >
                                {loc('Отменить установку')}
                              </button>
                            )}
                          </details>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="registry-catalog">
                  <button disabled={registryBusy} onClick={loadRegistry}>
                    {registryBusy
                      ? loc('Загружаю каталог ACP…')
                      : registry.length
                        ? loc('Обновить каталог ACP')
                        : loc('Все агенты из реестра ACP')}
                  </button>
                  {registry
                    .filter(a => (a.name + ' ' + a.description).toLowerCase().includes(search.toLowerCase()))
                    .map(a => (
                      <div className="registry-entry" key={a.id}>
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            {a.distribution} · {a.description}
                          </small>
                        </div>
                        <button
                          onClick={() =>
                            edit({
                              name: a.name,
                              kind: 'custom',
                              npmPackage: a.npmPackage,
                              args: a.args,
                              executable: '',
                            })
                          }
                        >
                          {loc('Настроить')}
                        </button>
                        {a.website && (
                          <a
                            href={a.website}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={loc('Документация ') + a.name}
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    ))}
                </div>
                <p className="connection-hint">
                  {loc(
                    'Каталог расширяется. Совместимого агента можно добавить через «Свой агент». Установка CLI, вход, поддержка чата и квота — разные проверки.'
                  )}
                </p>
              </>
            ) : (
              <div className="connections-accounts">
                <div className="connection-add-row">
                  <strong>{loc('Аккаунты и профили')}</strong>
                  <button
                    onClick={() => {
                      setTab('catalog');
                      setSearch('');
                      setFilter('all');
                    }}
                  >
                    <Plus size={14} />
                    {loc('Добавить аккаунт')}
                  </button>
                </div>
                {accounts.map(a => {
                  const job = authJobs[a.id],
                    state = connectionState(checks[a.id], job),
                    waiting = state === 'waiting',
                    ready = state === 'ready',
                    isOpen = expanded === a.id,
                    code = (job?.log || '')
                      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
                      .match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0];
                  return (
                    <article className="connection-account" key={a.id}>
                      <div className="catalog-agent-top">
                        <AgentIcon provider={a.provider} />
                        <div>
                          <h3 className="account-title">
                            {CATALOG.find(c => c.id === a.provider)?.name || a.provider} ·{' '}
                            {renaming?.id === a.id ? (
                              <input
                                className="account-rename"
                                autoFocus
                                maxLength={60}
                                value={renaming.value}
                                aria-label={loc('Название аккаунта')}
                                onChange={e => setRenaming({id: a.id, value: e.target.value})}
                                onBlur={() => renameAccount(a.id, renaming.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') renameAccount(a.id, renaming.value);
                                  if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setRenaming(null);
                                  }
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                className="account-name"
                                title={loc('Переименовать')}
                                onClick={() => setRenaming({id: a.id, value: a.name})}
                              >
                                {a.name}
                                <Pencil size={12} aria-hidden="true" />
                              </button>
                            )}
                          </h3>
                          <span className={ready ? 'connection-ready' : ''}>
                            {
                              {
                                ready: loc('Вход подтверждён'),
                                waiting: loc('Ожидаем входа в браузере'),
                                checking: loc('Проверяем вход…'),
                                error: loc('Ошибка проверки'),
                                login_required: loc('Требуется вход'),
                              }[state]
                            }
                          </span>
                        </div>
                        <button
                          className={
                            confirmRemove === a.id ? 'connection-remove confirm' : 'connection-remove'
                          }
                          title={
                            confirmRemove === a.id
                              ? loc('Нажмите ещё раз, чтобы удалить профиль')
                              : loc('Удалить аккаунт из Nexus')
                          }
                          aria-label={
                            confirmRemove === a.id
                              ? loc('Подтвердить удаление аккаунта ') + a.name
                              : loc('Удалить аккаунт ') + a.name
                          }
                          disabled={waiting || !!busy}
                          onBlur={() => setConfirmRemove(v => (v === a.id ? null : v))}
                          onKeyDown={e => {
                            if (e.key === 'Escape' && confirmRemove === a.id) {
                              e.stopPropagation();
                              setConfirmRemove(null);
                            }
                          }}
                          onClick={() => {
                            if (confirmRemove !== a.id) {
                              setConfirmRemove(a.id);
                              return;
                            }
                            setConfirmRemove(null);
                            work(a.id, async () => {
                              await onRemove(a.id);
                              await onModels();
                            });
                          }}
                        >
                          <Trash2 size={15} />
                          {confirmRemove === a.id && loc('Удалить?')}
                        </button>
                      </div>
                      {a.provider === 'gemini' && !ready && state !== 'checking' ? (
                        <p className="connection-hint">
                          {loc(
                            'Google закрыл личный вход через Gemini CLI. Подключите Gemini через Antigravity (вход Google) или по ключу Gemini API. Вход в этот профиль доступен только для корпоративных аккаунтов Google с Gemini Code Assist — в «Лимиты и детали».'
                          )}
                        </p>
                      ) : (
                        <Quota
                          quota={quotas[a.id]}
                          statusline={statuslines[a.id]}
                          expanded={isOpen}
                          unsupported={
                            a.provider === 'claude'
                              ? loc('Нет данных · Claude Code пока не передал лимиты')
                              : undefined
                          }
                        />
                      )}
                      <div className="connection-account-actions">
                        {a.provider === 'gemini' && !ready && state !== 'checking' && !waiting && (
                          <>
                            <button
                              className="connection-primary"
                              disabled={!!busy}
                              onClick={() => primary(CATALOG.find(c => c.id === 'antigravity'))}
                            >
                              {loc('Войти через Antigravity')}
                            </button>
                            <button
                              disabled={!!busy}
                              onClick={() => connect(CATALOG.find(c => c.id === 'gemini'))}
                            >
                              {loc('Gemini API по ключу')}
                            </button>
                          </>
                        )}
                        {!ready && state !== 'checking' && (a.provider !== 'gemini' || waiting) && (
                          <button
                            className="connection-primary"
                            disabled={waiting || !!busy}
                            onClick={() => {
                              setExpanded(a.id);
                              onLogin(a.id);
                            }}
                          >
                            {waiting
                              ? loc('Ожидаем подтверждения…')
                              : a.provider === 'codex'
                                ? loc('Войти с ChatGPT')
                                : a.provider === 'gemini'
                                  ? loc('Войти с Google')
                                  : loc('Войти')}
                          </button>
                        )}
                        {waiting && (
                          <button onClick={() => onCancelLogin(a.id)}>{loc('Отменить вход')}</button>
                        )}
                        <button
                          onClick={() => {
                            onCheck(a.id);
                            onQuota(a.id);
                          }}
                        >
                          <RefreshCw size={13} />
                          {loc('Обновить')}
                        </button>
                        <button aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : a.id)}>
                          {loc('Лимиты и детали')}
                        </button>
                      </div>
                      {waiting && a.provider === 'codex' && (
                        <div className="connection-device">
                          <strong>{code || loc('Получаем код…')}</strong>
                          <button
                            disabled={!code}
                            onClick={() => invoke('open_codex_device_page').catch(e => setError(String(e)))}
                          >
                            {loc('Открыть вход ChatGPT')}
                          </button>
                        </div>
                      )}
                      {job?.phase === 'error' && (
                        <p className="connection-error">
                          {job.log?.includes('no longer supported')
                            ? loc(
                                'Google отклонил вход: для личных аккаунтов он закрыт. Используйте Antigravity или Gemini API.'
                              )
                            : redact(job.log)}
                        </p>
                      )}
                      {isOpen && (
                        <>
                          {a.provider === 'gemini' && !ready && !waiting && (
                            <button
                              disabled={!!busy}
                              title={loc(
                                'Работает только для корпоративных аккаунтов Google с Gemini Code Assist'
                              )}
                              onClick={() => onLogin(a.id)}
                            >
                              {loc('Корпоративный аккаунт Google (Code Assist)')}
                            </button>
                          )}
                          {a.provider === 'claude' && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                work(a.id, async () => {
                                  await invoke('claude_statusline_install', {id: a.id});
                                  await onQuota(a.id);
                                  setNotice(
                                    loc(
                                      'Источник statusLine настроен для терминальных сессий Claude Code. В чате Nexus лимиты приходят и без него.'
                                    )
                                  );
                                })
                              }
                            >
                              {loc('Дополнительно: лимиты из терминальной сессии')}
                            </button>
                          )}
                          <p className="connection-hint">
                            {loc(
                              'Отдельный каталог профиля. Разные профили могут быть авторизованы одним аккаунтом. Удаление убирает профиль из Nexus, сохраняя данные официального CLI.'
                            )}
                          </p>
                          <details>
                            <summary>{loc('Диагностика входа')}</summary>
                            <pre>{redact(job?.log || checks[a.id]?.detail || loc('Нет данных'))}</pre>
                          </details>
                        </>
                      )}
                    </article>
                  );
                })}
                {apis.map(a => (
                  <article className="connection-account" key={a.id}>
                    <div className="catalog-agent-top">
                      <AgentIcon
                        provider={
                          a.provider === 'local'
                            ? 'qwen'
                            : a.provider === 'gemini-api'
                              ? 'gemini'
                              : a.provider
                        }
                      />
                      <div>
                        <h3>{a.name}</h3>
                        <span className={a.ready ? 'connection-ready' : ''}>
                          {a.ready ? loc('API проверен') : loc('API недоступен')} {loc('· моделей:')}{' '}
                          {a.models.length}
                        </span>
                      </div>
                      <button
                        aria-label={loc('Удалить подключение ') + a.name}
                        disabled={!!busy}
                        onClick={() => removeApi(a.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {a.provider === 'grok' ? (
                      <ApiLimits limits={apiLimits[a.id]} expanded />
                    ) : (
                      <Quota unsupported={loc('Нет данных · этот API не возвращает лимиты подписки')} />
                    )}
                    <details>
                      <summary>{loc('Модели и возможности')}</summary>
                      <p>{a.models.join(', ')}</p>
                      <p>
                        {loc('Текстовый чат · без файлов и терминала.')}{' '}
                        {a.provider === 'grok'
                          ? loc('Показаны лимиты API-ключа; квота подписки Grok через API не передаётся.')
                          : loc('Квота подписки не предоставляется этим API.')}
                      </p>
                      <small>
                        {loc('Последняя проверка:')} {new Date(a.checkedAt * 1000).toLocaleString()}
                      </small>
                    </details>
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        work(a.id, async () => {
                          const row = await invoke('check_provider_connection', {id: a.id});
                          await changed();
                          await loadApiLimits([row]);
                        })
                      }
                    >
                      {loc('Проверить подключение')}
                    </button>
                  </article>
                ))}
                {custom
                  .filter(a => a.verified)
                  .map(a => (
                    <article className="connection-account" key={a.id}>
                      <div className="catalog-agent-top">
                        <AgentIcon
                          provider={
                            a.manifest.executable === 'goose'
                              ? 'goose'
                              : a.manifest.executable === 'qwen'
                                ? 'qwen'
                                : a.manifest.name.includes('Antigravity')
                                  ? 'gemini'
                                  : 'custom'
                          }
                        />
                        <div>
                          <h3>{a.manifest.name}</h3>
                          <span className="connection-ready">{loc('Сессия ACP подтверждена')}</span>
                        </div>
                        <button
                          disabled={!!busy}
                          aria-label={loc('Отключить ') + a.manifest.name}
                          onClick={() => disconnect(a.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <small>
                        {loc(
                          'Лимиты не предоставлены адаптером. Глубина рассуждений и модель — по настройкам агента.'
                        )}
                      </small>
                    </article>
                  ))}
                {!accounts.length && !apis.length && !custom.some(a => a.verified) && (
                  <p className="connection-hint">
                    {loc('Выберите агента в каталоге — Nexus предложит доступный способ входа.')}
                  </p>
                )}
              </div>
            )}
          </div>
          <footer>{loc('Подтверждённый вход и доступность лимитов проверяются отдельно.')}</footer>
        </section>
      </div>
    </>
  );
}
