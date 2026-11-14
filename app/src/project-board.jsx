import {CustomSelect} from './custom-select.jsx';
import {useToastOn} from './toaster.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {countLabel} from './locale-format.js';
import {Target, ListChecks, Plus, X, Trash2, MessageSquare, ChevronRight} from 'lucide-react';
import {loc} from './i18n.js';
const STATUS = {
  running: loc('В работе'),
  planning: loc('Планирование'),
  verifying: loc('Проверка'),
  review: loc('Ждёт проверки'),
  answered: loc('Ответ получен'),
  done: loc('Проверки пройдены'),
  failed: loc('Ошибка'),
  stopped: loc('Остановлена'),
  interrupted: loc('Прервана перезапуском'),
  pending: loc('Ожидает'),
  completed: loc('Предложение готово'),
  blocked: loc('Зависимость не завершена'),
};
export function ProjectBoard({projectId, chatId, onChat, open, onToggle}) {
  const [board, setBoard] = useState({goals: [], tasks: []}),
    [title, setTitle] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [filter, setFilter] = useState('all');
  useToastOn(error, () => setError(''), 'error');
  const current = useRef(projectId),
    sequence = useRef(0),
    saving = useRef(false);
  current.current = projectId;
  async function load() {
    const p = projectId,
      id = ++sequence.current;
    if (!p) return;
    try {
      const data = await invoke('project_board', {projectId: p});
      if (current.current === p && sequence.current === id) setBoard(data);
    } catch (e) {
      if (current.current === p) setError(String(e));
    }
  }
  useEffect(() => {
    setBoard({goals: [], tasks: []});
    setTitle('');
    setError('');
    load();
    const timer = setInterval(load, 4000);
    let off,
      live = true;
    listen('chat-activity', load).then(f => {
      if (live) off = f;
      else f();
    });
    return () => {
      live = false;
      sequence.current++;
      clearInterval(timer);
      off?.();
    };
  }, [projectId]);
  async function mutate(fn) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    const p = projectId;
    try {
      await fn();
      if (current.current === p) await load();
    } catch (e) {
      if (current.current === p) setError(String(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const DONE = ['done', 'completed', 'answered'];
  const active = board.tasks.filter(t =>
    ['running', 'planning', 'verifying', 'review', 'failed', 'interrupted'].includes(t.status)
  );
  return (
    <>
      <div className="project-work-strip">
        <button onClick={onToggle} aria-expanded={open}>
          <Target size={15} />
          {board.goals.find(g => !g.done)?.title || loc('Цели проекта')}
          <ChevronRight size={13} />
        </button>
        <button onClick={onToggle}>
          <ListChecks size={15} />
          {active.length ? loc('{0} · требуют внимания', active.length) : loc('Задачи проекта')}
        </button>
      </div>
      {open && (
        <section className="project-work-panel" aria-label={loc('Цели и задачи проекта')}>
          <div className="project-work-heading">
            <strong>{loc('Цели и задачи')}</strong>
            <button aria-label={loc('Закрыть цели и задачи')} onClick={onToggle}>
              <X size={16} />
            </button>
          </div>
          <div className="project-goals board-section">
            <div>
              <h3>
                <Target size={15} />
                {loc('Цели')}
              </h3>
              <button disabled={busy} onClick={() => setEditing(v => !v)}>
                <Plus size={14} />
                {loc('Добавить')}
              </button>
            </div>
            {board.goals.map(g => (
              <div className="project-goal" key={g.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={g.done}
                    disabled={busy}
                    onChange={e =>
                      mutate(() =>
                        invoke('save_project_goal', {
                          projectId,
                          id: g.id,
                          title: g.title,
                          done: e.target.checked,
                        })
                      )
                    }
                  />
                  <span className={g.done ? 'goal-done' : ''}>{g.title}</span>
                </label>
                <button
                  aria-label={loc('Удалить цель ') + g.title}
                  disabled={busy}
                  onClick={() => mutate(() => invoke('remove_project_goal', {projectId, id: g.id}))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {editing && (
              <form
                className="goal-form"
                onSubmit={e => {
                  e.preventDefault();
                  if (title.trim())
                    mutate(async () => {
                      await invoke('save_project_goal', {projectId, id: null, title, done: false});
                      setTitle('');
                      setEditing(false);
                    });
                }}
              >
                <input
                  autoFocus
                  aria-label={loc('Новая цель проекта')}
                  placeholder={loc('Какой результат нужен?')}
                  value={title}
                  maxLength={300}
                  onChange={e => setTitle(e.target.value)}
                />
                <button disabled={busy || !title.trim()}>{loc('Сохранить')}</button>
              </form>
            )}
            {!board.goals.length && !editing && (
              <p>{loc('Добавьте цель — она будет видна здесь и попадёт в контекст агента.')}</p>
            )}
          </div>
          <div className="task-list-heading board-section-heading">
            <h3>
              <ListChecks size={15} />
              {loc('Задачи из чатов')}
              {board.tasks.length > 0 && <small>{board.tasks.length}</small>}
            </h3>
            <CustomSelect
              value={filter}
              aria-label={loc('Фильтр задач')}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">{loc('Все')}</option>
              <option value="active">{loc('Требуют внимания')}</option>
              <option value="chat">{loc('Текущий чат')}</option>
            </CustomSelect>
          </div>
          <div className="project-task-list">
            {board.tasks
              .filter(
                t =>
                  filter === 'all' ||
                  (filter === 'active' && active.some(a => a.id === t.id)) ||
                  (filter === 'chat' && t.chatId === chatId)
              )
              .slice()
              .reverse()
              .map(t => (
                <article className="project-task" key={t.id}>
                  <div>
                    <span className={'task-status task-status-' + t.status}>
                      {STATUS[t.status] || t.status}
                    </span>
                    <button
                      title={loc('Открыть чат задачи')}
                      aria-label={loc('Открыть чат: ') + t.title}
                      onClick={() => onChat(t.chatId)}
                    >
                      <MessageSquare size={14} />
                    </button>
                  </div>
                  <strong>{t.title}</strong>
                  {t.steps.length > 0 && (
                    <details>
                      <summary>
                        {loc('Автоплан ·')}{' '}
                        {countLabel(t.steps.length, loc('этап'), loc('этапа'), loc('этапов'))}
                      </summary>
                      <ol>
                        {t.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                      <small>
                        {loc(
                          'План по правилам. Результат ответа сам по себе не подтверждает выполнение этапов.'
                        )}
                      </small>
                    </details>
                  )}
                  {t.team?.length > 0 &&
                    (() => {
                      const done = t.team.filter(r => DONE.includes(r.status)).length;
                      return (
                        <div
                          className="task-progress"
                          role="progressbar"
                          aria-label={loc('Готовность подзадач')}
                          aria-valuemin={0}
                          aria-valuemax={t.team.length}
                          aria-valuenow={done}
                        >
                          <span style={{width: (done / t.team.length) * 100 + '%'}} />
                          <small>
                            {done} {loc('из')}{' '}
                            {countLabel(t.team.length, loc('подзадачи'), loc('подзадач'), loc('подзадач'))}{' '}
                            {loc('готово')}
                          </small>
                        </div>
                      );
                    })()}
                  {t.team?.length > 0 && (
                    <details>
                      <summary>
                        {loc('Команда ·')}{' '}
                        {countLabel(t.team.length, loc('подзадача'), loc('подзадачи'), loc('подзадач'))}
                      </summary>
                      <ol>
                        {t.team.map(r => (
                          <li key={r.step.id}>
                            <strong>{r.step.title}</strong>
                            <p>
                              {STATUS[
                                r.status === 'running' && t.status === 'interrupted'
                                  ? 'interrupted'
                                  : r.status
                              ] || r.status}{' '}
                              · {r.step.modelChoice}
                              {r.elapsedMs > 0 ? loc(' · {0} с', (r.elapsedMs / 1000).toFixed(1)) : ''}
                            </p>
                            <small>{r.step.reason}</small>
                            {r.result && (
                              <details>
                                <summary>{loc('Результат подзадачи')}</summary>
                                <pre className="team-step-result">{r.result}</pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ol>
                      <small>
                        {loc(
                          'Результаты специалистов — предложения. Реализация и проверки выполняются итоговым агентом.'
                        )}
                      </small>
                    </details>
                  )}
                  <p>{t.verification}</p>
                </article>
              ))}
            {!board.tasks.length && <p>{loc('Отправьте запрос в чат — его статус появится здесь.')}</p>}
          </div>
        </section>
      )}
    </>
  );
}
