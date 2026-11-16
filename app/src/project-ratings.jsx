import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {loc} from './i18n.js';
import {useToastOn} from './toaster.jsx';

// «Настройки проекта → Оценки моделей»: share this user's model ratings with the team through the project
// folder (`.nexus/model-ratings/<install id>.json`, counts only), and use the teammates' ratings in Auto.
export function ProjectRatings({projectId}) {
  const [info, setInfo] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useToastOn(message, () => setMessage(''), 'error');
  useEffect(() => {
    invoke('project_ratings_sharing', {projectId})
      .then(setInfo)
      .catch(() => setInfo({shared: false, teammates: 0, rated: 0}));
  }, [projectId]);
  async function toggle(shared) {
    setBusy(true);
    try {
      setInfo(await invoke('set_project_ratings_shared', {projectId, shared}));
      window.dispatchEvent(new Event('nexus-route-feedback'));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="project-permissions project-ratings">
      <div className="context-heading">
        <h3>{loc('Оценки моделей')}</h3>
        <small>{loc('Ваши оценки ответов помогают «Авто» выбирать модель')}</small>
      </div>
      <label className="project-ratings-toggle">
        <input
          type="checkbox"
          checked={!!info?.shared}
          disabled={busy || !info}
          onChange={e => toggle(e.target.checked)}
        />
        {loc('Делиться оценками с командой через папку проекта')}
      </label>
      <p className="project-permissions-empty">
        {info?.shared
          ? loc(
              'Счётчики сохраняются в {0} (без текстов сообщений и без имени). Закоммитьте папку, чтобы команда их получила. Оценок коллег: {1}.',
              info.folder,
              info.teammates
            )
          : loc('Сейчас оценки хранятся только у вас. Ваших оценок в этом проекте: {0}.', info?.rated ?? 0)}
      </p>
    </div>
  );
}
