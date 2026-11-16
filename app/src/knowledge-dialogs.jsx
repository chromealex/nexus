import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {X, Plus, Pencil, Trash2, Sparkles, Brain, FolderOpen} from 'lucide-react';
import {CustomSelect} from './custom-select.jsx';
import {notify} from './toasts.js';
import {loc} from './i18n.js';
import {skillScopeLabel, skillSlug} from './knowledge-format.js';

function Dialog({title, hint, onClose, children}) {
  return (
    <div className="settings-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section className="project-settings tool-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="settings-header">
          <div>
            <h2>{title}</h2>
            <small>{hint}</small>
          </div>
          <button type="button" aria-label={loc('Закрыть')} onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="settings-body">{children}</div>
      </section>
    </div>
  );
}

// «Навыки»: SKILL.md instructions offered to every agent. `/имя` in a message passes the whole skill.
export function SkillsDialog({projectId, projectName, onClose}) {
  const [list, setList] = useState(null),
    [form, setForm] = useState(null),
    [confirm, setConfirm] = useState(null);
  const load = () =>
    invoke('list_skills', {projectId: projectId || null})
      .then(setList)
      .catch(e => notify(String(e), {tone: 'error'}));
  useEffect(() => {
    load();
  }, [projectId]);
  async function edit(s) {
    try {
      const full = await invoke('read_skill', {scope: s.scope, projectId: projectId || null, name: s.name});
      setForm({...full, previous: full.name});
    } catch (e) {
      notify(String(e), {tone: 'error'});
    }
  }
  async function remove(s) {
    const key = s.scope + ':' + s.name;
    if (confirm !== key) return setConfirm(key);
    try {
      await invoke('remove_skill', {scope: s.scope, projectId: projectId || null, name: s.name});
      setConfirm(null);
      load();
    } catch (e) {
      notify(String(e), {tone: 'error'});
    }
  }
  async function save(e) {
    e.preventDefault();
    try {
      await invoke('save_skill', {
        scope: form.scope,
        projectId: projectId || null,
        name: form.name,
        description: form.description,
        body: form.body,
        previous: form.previous || null,
      });
      notify(loc('Навык «{0}» сохранён', form.name), {tone: 'success'});
      setForm(null);
      load();
    } catch (err) {
      notify(String(err), {tone: 'error'});
    }
  }
  return (
    <Dialog
      title={loc('Навыки')}
      hint={loc(
        'Инструкции для повторяющихся задач. Агенты видят их список и читают нужный SKILL.md сами; «/имя» в сообщении передаёт навык целиком любой модели.'
      )}
      onClose={onClose}
    >
      {form ? (
        <form className="tool-form" onSubmit={save}>
          <label>{loc('Где хранить')}</label>
          <CustomSelect
            value={form.scope}
            aria-label={loc('Где хранить')}
            disabled={!!form.previous}
            onChange={e => setForm(f => ({...f, scope: e.target.value}))}
          >
            <option value="nexus">{loc('Nexus — для всех проектов')}</option>
            {projectId && (
              <option value="project">
                {loc('Проект «{0}» — .nexus/skills, попадёт в git', projectName)}
              </option>
            )}
          </CustomSelect>
          <label htmlFor="skill-name">{loc('Имя')}</label>
          <input
            id="skill-name"
            type="text"
            value={form.name}
            maxLength={64}
            placeholder="release-notes"
            onChange={e => setForm(f => ({...f, name: skillSlug(e.target.value)}))}
          />
          <label htmlFor="skill-desc">{loc('Когда использовать')}</label>
          <input
            id="skill-desc"
            type="text"
            value={form.description}
            maxLength={400}
            placeholder={loc('Например: когда нужно написать заметки к релизу по коммитам')}
            onChange={e => setForm(f => ({...f, description: e.target.value}))}
          />
          <label htmlFor="skill-body" className="tool-form-wide">
            {loc('Инструкции (Markdown)')}
          </label>
          <textarea
            id="skill-body"
            className="tool-form-wide"
            rows={14}
            value={form.body}
            onChange={e => setForm(f => ({...f, body: e.target.value}))}
          />
          <div className="tool-form-actions">
            <button type="button" onClick={() => setForm(null)}>
              {loc('Отмена')}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!form.name || !form.description.trim() || !form.body.trim()}
            >
              {loc('Сохранить')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="tool-toolbar">
            <button
              type="button"
              className="primary"
              onClick={() => setForm({scope: 'nexus', name: '', description: '', body: ''})}
            >
              <Plus size={13} aria-hidden="true" />
              {loc('Новый навык')}
            </button>
            <small>{loc('Навыки Claude Code из ~/.claude/skills тоже доступны всем агентам.')}</small>
          </div>
          {list && !list.length && <p className="tool-empty">{loc('Навыков пока нет.')}</p>}
          <ul className="tool-list">
            {(list || []).map(s => (
              <li key={s.scope + s.name}>
                <Sparkles size={16} aria-hidden="true" />
                <div className="tool-list-main">
                  <strong>
                    /{s.name} <span className="tool-pill">{skillScopeLabel(s.scope)}</span>
                  </strong>
                  <small>{s.description || loc('Без описания')}</small>
                </div>
                <div className="tool-list-actions">
                  <button
                    type="button"
                    title={loc('Показать в Finder')}
                    aria-label={loc('Показать в Finder')}
                    onClick={() =>
                      invoke('reveal_skill', {
                        scope: s.scope,
                        projectId: projectId || null,
                        name: s.name,
                      }).catch(e => notify(String(e), {tone: 'error'}))
                    }
                  >
                    <FolderOpen size={12} />
                  </button>
                  {s.scope !== 'claude' && (
                    <>
                      <button
                        type="button"
                        aria-label={loc('Изменить')}
                        title={loc('Изменить')}
                        onClick={() => edit(s)}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className={confirm === s.scope + ':' + s.name ? 'is-confirm' : ''}
                        aria-label={loc('Удалить')}
                        title={
                          confirm === s.scope + ':' + s.name
                            ? loc('Нажмите ещё раз, чтобы удалить')
                            : loc('Удалить')
                        }
                        onClick={() => remove(s)}
                      >
                        <Trash2 size={12} />
                        {confirm === s.scope + ':' + s.name ? loc('Удалить?') : ''}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

// «Память»: durable facts every agent gets — for all projects or for the open one.
export function MemoryDialog({projectId, projectName, onClose}) {
  const [list, setList] = useState(null),
    [text, setText] = useState(''),
    [scope, setScope] = useState(projectId ? 'project' : 'global'),
    [editing, setEditing] = useState(null),
    [confirm, setConfirm] = useState(null);
  const load = () =>
    invoke('list_memory', {projectId: projectId || null})
      .then(setList)
      .catch(e => notify(String(e), {tone: 'error'}));
  useEffect(() => {
    load();
  }, [projectId]);
  async function save(e) {
    e.preventDefault();
    try {
      await invoke('save_memory', {
        id: editing?.id || null,
        scope: scope === 'project' ? projectId : 'global',
        text,
        source: null,
      });
      setText('');
      setEditing(null);
      load();
    } catch (err) {
      notify(String(err), {tone: 'error'});
    }
  }
  async function remove(m) {
    if (confirm !== m.id) return setConfirm(m.id);
    try {
      await invoke('remove_memory', {id: m.id});
      setConfirm(null);
      load();
    } catch (e) {
      notify(String(e), {tone: 'error'});
    }
  }
  return (
    <Dialog
      title={loc('Память')}
      hint={loc(
        'Факты, которые получают все агенты: ваши предпочтения, договорённости, где что лежит. Агент может только предложить факт — сохраняете вы.'
      )}
      onClose={onClose}
    >
      <form className="tool-form" onSubmit={save}>
        <label htmlFor="memory-text">{editing ? loc('Изменить факт') : loc('Новый факт')}</label>
        <input
          id="memory-text"
          type="text"
          value={text}
          maxLength={1000}
          placeholder={loc('Например: тесты запускаются командой npm test в папке app')}
          onChange={e => setText(e.target.value)}
        />
        <label>{loc('Для кого')}</label>
        <CustomSelect value={scope} aria-label={loc('Для кого')} onChange={e => setScope(e.target.value)}>
          {projectId && <option value="project">{loc('Проект «{0}»', projectName)}</option>}
          <option value="global">{loc('Все проекты')}</option>
        </CustomSelect>
        <div className="tool-form-actions">
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setText('');
              }}
            >
              {loc('Отмена')}
            </button>
          )}
          <button type="submit" className="primary" disabled={!text.trim()}>
            {editing ? loc('Сохранить') : loc('Запомнить')}
          </button>
        </div>
      </form>
      {list && !list.length && <p className="tool-empty">{loc('Память пуста.')}</p>}
      <ul className="tool-list">
        {(list || []).map(m => (
          <li key={m.id}>
            <Brain size={16} aria-hidden="true" />
            <div className="tool-list-main">
              <p>{m.text}</p>
              <small>
                {m.scope === 'global' ? loc('Все проекты') : loc('Этот проект')}
                {m.source === 'agent' ? ' · ' + loc('предложил агент') : ''}
              </small>
            </div>
            <div className="tool-list-actions">
              <button
                type="button"
                aria-label={loc('Изменить')}
                title={loc('Изменить')}
                onClick={() => {
                  setEditing(m);
                  setText(m.text);
                  setScope(m.scope === 'global' ? 'global' : 'project');
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                className={confirm === m.id ? 'is-confirm' : ''}
                aria-label={loc('Удалить')}
                title={confirm === m.id ? loc('Нажмите ещё раз, чтобы удалить') : loc('Удалить')}
                onClick={() => remove(m)}
              >
                <Trash2 size={12} />
                {confirm === m.id ? loc('Удалить?') : ''}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
