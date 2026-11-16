import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {X, Plus, Play, Pencil, Trash2, CalendarClock} from 'lucide-react';
import {CustomSelect} from './custom-select.jsx';
import {notify} from './toasts.js';
import {loc} from './i18n.js';
import {
  scheduleLabel,
  statusLabel,
  emptyAutomation,
  toLocalInput,
  fromLocalInput,
  WEEKDAYS,
} from './automation-format.js';

// «Автоматизации»: prompts that run on a schedule in a project — in one chat or a new chat each time.
// They run while Nexus is open (with «Работать при закрытом окне» also when the window is closed).
export function AutomationsDialog({projects, activeProject, activeChat, onClose, onOpenChat}) {
  const [list, setList] = useState(null),
    [form, setForm] = useState(null),
    [confirm, setConfirm] = useState(null);
  const load = () =>
    invoke('list_automations')
      .then(setList)
      .catch(e => notify(String(e), {tone: 'error'}));
  useEffect(() => {
    load();
    let off;
    listen('automations-event', load).then(f => (off = f));
    return () => off?.();
  }, []);
  const projectName = id => projects.find(p => p.id === id)?.name || loc('проект удалён');
  async function toggle(a) {
    try {
      await invoke('toggle_automation', {id: a.id, enabled: !a.enabled});
      load();
    } catch (e) {
      notify(String(e), {tone: 'error'});
    }
  }
  async function remove(a) {
    if (confirm !== a.id) return setConfirm(a.id);
    try {
      await invoke('remove_automation', {id: a.id});
      setConfirm(null);
      load();
    } catch (e) {
      notify(String(e), {tone: 'error'});
    }
  }
  async function runNow(a) {
    try {
      await invoke('run_automation_now', {id: a.id});
      notify(loc('«{0}» запущена', a.name), {tone: 'success'});
      load();
    } catch (e) {
      notify(String(e), {tone: 'error'});
    }
  }
  return (
    <div className="settings-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section
        className="project-settings tool-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={loc('Автоматизации')}
      >
        <div className="settings-header">
          <div>
            <h2>{loc('Автоматизации')}</h2>
            <small>
              {loc(
                'Задания по расписанию: отчёт каждое утро, проверка сборки раз в час, разовое напоминание. Выполняются, пока Nexus открыт.'
              )}
            </small>
          </div>
          <button type="button" aria-label={loc('Закрыть')} onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="settings-body">
          {form ? (
            <AutomationForm
              initial={form}
              projects={projects}
              onCancel={() => setForm(null)}
              onSaved={() => {
                setForm(null);
                load();
              }}
            />
          ) : (
            <>
              <div className="tool-toolbar">
                <button
                  type="button"
                  className="primary"
                  disabled={!projects.length}
                  onClick={() => setForm(emptyAutomation(activeProject || projects[0]?.id))}
                >
                  <Plus size={13} aria-hidden="true" />
                  {loc('Новая автоматизация')}
                </button>
              </div>
              {list && !list.length && <p className="tool-empty">{loc('Пока нет автоматизаций.')}</p>}
              <ul className="tool-list">
                {(list || []).map(a => (
                  <li key={a.id}>
                    <CalendarClock size={16} aria-hidden="true" />
                    <div className="tool-list-main">
                      <strong>
                        {a.name}{' '}
                        <span className={'tool-pill' + (a.enabled ? '' : ' is-off')}>
                          {a.enabled ? loc('вкл.') : loc('выкл.')}
                        </span>
                      </strong>
                      <small>
                        {projectName(a.projectId)} · {scheduleLabel(a.schedule)} ·{' '}
                        {a.mode === 'execute' ? loc('Выполнение · с разрешениями') : loc('Обсуждение')}
                      </small>
                      <small>
                        {a.nextRun
                          ? loc('Следующий запуск: {0}', new Date(a.nextRun * 1000).toLocaleString())
                          : loc('Не запланировано')}
                        {a.lastRun
                          ? ' · ' +
                            loc('Последний: {0}', new Date(a.lastRun * 1000).toLocaleString()) +
                            ' — ' +
                            statusLabel(a.lastStatus)
                          : ''}
                      </small>
                      {a.lastError && <small className="is-error">{a.lastError}</small>}
                    </div>
                    <div className="tool-list-actions">
                      {a.lastChat && (
                        <button type="button" onClick={() => onOpenChat(a.projectId, a.lastChat)}>
                          {loc('Открыть чат')}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={a.lastStatus === 'running'}
                        onClick={() => runNow(a)}
                        title={loc('Запустить сейчас — расходует квоту')}
                      >
                        <Play size={12} aria-hidden="true" />
                        {a.lastStatus === 'running' ? loc('Выполняется…') : loc('Запустить')}
                      </button>
                      <button type="button" onClick={() => toggle(a)}>
                        {a.enabled ? loc('Выключить') : loc('Включить')}
                      </button>
                      <button
                        type="button"
                        aria-label={loc('Изменить')}
                        title={loc('Изменить')}
                        onClick={() => setForm(a)}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className={confirm === a.id ? 'is-confirm' : ''}
                        aria-label={loc('Удалить')}
                        title={confirm === a.id ? loc('Нажмите ещё раз, чтобы удалить') : loc('Удалить')}
                        onClick={() => remove(a)}
                      >
                        <Trash2 size={12} />
                        {confirm === a.id ? loc('Удалить?') : ''}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function AutomationForm({initial, projects, onCancel, onSaved}) {
  const [a, setA] = useState(initial),
    [chats, setChats] = useState([]),
    [preview, setPreview] = useState([]),
    [busy, setBusy] = useState(false);
  const set = patch => setA(v => ({...v, ...patch}));
  const setSchedule = patch => setA(v => ({...v, schedule: {...v.schedule, ...patch}}));
  useEffect(() => {
    if (!a.projectId) return;
    invoke('list_project_chats', {projectId: a.projectId})
      .then(rows => setChats(rows.filter(c => !c.archived && !c.deletedAt)))
      .catch(() => setChats([]));
  }, [a.projectId]);
  useEffect(() => {
    const t = setTimeout(
      () =>
        invoke('automation_preview', {schedule: a.schedule})
          .then(r => setPreview(r.next || []))
          .catch(() => setPreview([])),
      250
    );
    return () => clearTimeout(t);
  }, [JSON.stringify(a.schedule)]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await invoke('save_automation', {automation: a});
      notify(loc('Автоматизация сохранена'), {tone: 'success'});
      onSaved();
    } catch (err) {
      notify(String(err), {tone: 'error'});
    } finally {
      setBusy(false);
    }
  }
  const kind = a.schedule.kind;
  return (
    <form className="tool-form" onSubmit={save}>
      <label htmlFor="auto-name">{loc('Название')}</label>
      <input
        id="auto-name"
        type="text"
        value={a.name}
        maxLength={80}
        onChange={e => set({name: e.target.value})}
      />
      <label>{loc('Проект')}</label>
      <CustomSelect
        value={a.projectId}
        aria-label={loc('Проект')}
        onChange={e => set({projectId: e.target.value, chatId: null})}
      >
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </CustomSelect>
      <label>{loc('Чат')}</label>
      <CustomSelect
        value={a.chatId || ''}
        aria-label={loc('Чат')}
        onChange={e => set({chatId: e.target.value || null})}
      >
        <option value="">{loc('Новый чат при каждом запуске')}</option>
        {chats.map(c => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </CustomSelect>
      <label htmlFor="auto-prompt">{loc('Задание')}</label>
      <textarea
        id="auto-prompt"
        value={a.prompt}
        maxLength={12000}
        placeholder={loc('Например: проверь вчерашние коммиты и напиши короткий отчёт')}
        onChange={e => set({prompt: e.target.value})}
      />
      <label>{loc('Расписание')}</label>
      <CustomSelect
        value={kind}
        aria-label={loc('Расписание')}
        onChange={e => {
          const k = e.target.value;
          set({
            schedule:
              k === 'once'
                ? {kind: k, at: Math.floor(Date.now() / 1000) + 3600}
                : k === 'interval'
                  ? {kind: k, minutes: 60}
                  : k === 'daily'
                    ? {kind: k, time: '09:00'}
                    : {kind: k, time: '09:00', days: [1, 2, 3, 4, 5]},
          });
        }}
      >
        <option value="once">{loc('Один раз')}</option>
        <option value="interval">{loc('Каждые N минут')}</option>
        <option value="daily">{loc('Каждый день')}</option>
        <option value="weekly">{loc('По дням недели')}</option>
      </CustomSelect>
      {kind === 'once' && (
        <>
          <label htmlFor="auto-at">{loc('Когда')}</label>
          <input
            id="auto-at"
            type="datetime-local"
            value={toLocalInput(a.schedule.at)}
            onChange={e => setSchedule({at: fromLocalInput(e.target.value)})}
          />
        </>
      )}
      {kind === 'interval' && (
        <>
          <label htmlFor="auto-min">{loc('Минут')}</label>
          <input
            id="auto-min"
            type="number"
            min={5}
            max={10080}
            value={a.schedule.minutes}
            onChange={e => setSchedule({minutes: Number(e.target.value) || 5})}
          />
        </>
      )}
      {(kind === 'daily' || kind === 'weekly') && (
        <>
          <label htmlFor="auto-time">{loc('Время')}</label>
          <input
            id="auto-time"
            type="time"
            value={a.schedule.time}
            onChange={e => setSchedule({time: e.target.value})}
          />
        </>
      )}
      {kind === 'weekly' && (
        <>
          <label>{loc('Дни')}</label>
          <div className="tool-form-days">
            {WEEKDAYS().map(([n, label]) => (
              <label key={n}>
                <input
                  type="checkbox"
                  checked={a.schedule.days.includes(n)}
                  onChange={e =>
                    setSchedule({
                      days: e.target.checked
                        ? [...a.schedule.days, n].sort()
                        : a.schedule.days.filter(d => d !== n),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}
      {preview.length > 0 && (
        <small>
          {loc('Ближайшие запуски: {0}', preview.map(t => new Date(t * 1000).toLocaleString()).join(', '))}
        </small>
      )}
      <label>{loc('Режим')}</label>
      <CustomSelect value={a.mode} aria-label={loc('Режим')} onChange={e => set({mode: e.target.value})}>
        <option value="discuss">{loc('Обсуждение')}</option>
        <option value="execute">{loc('Выполнение · с разрешениями')}</option>
      </CustomSelect>
      {a.mode === 'execute' && (
        <small>{loc('Каждое действие агента ждёт вашего подтверждения в чате или в канале задач.')}</small>
      )}
      {!a.chatId && (
        <>
          <label>{loc('Рабочая копия')}</label>
          <label className="tool-form-check">
            <input type="checkbox" checked={!!a.worktree} onChange={e => set({worktree: e.target.checked})} />{' '}
            {loc('Новые чаты — в отдельной ветке (git worktree)')}
          </label>
        </>
      )}
      <label>{loc('Включена')}</label>
      <label className="tool-form-check">
        <input type="checkbox" checked={a.enabled} onChange={e => set({enabled: e.target.checked})} />{' '}
        {loc('Запускать по расписанию')}
      </label>
      <div className="tool-form-actions">
        <button type="button" onClick={onCancel}>
          {loc('Отмена')}
        </button>
        <button type="submit" className="primary" disabled={busy || !a.name.trim() || !a.prompt.trim()}>
          {busy ? loc('Сохраняю…') : loc('Сохранить')}
        </button>
      </div>
    </form>
  );
}
