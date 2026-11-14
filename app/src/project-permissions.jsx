import React, {useEffect, useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {invoke} from '@tauri-apps/api/core';

// «Настройки проекта → Разрешения»: rules remembered with «Разрешать всегда», revocable one by one or all.
export function ProjectPermissions({projectId}) {
  const [rows, setRows] = useState(null),
    [busy, setBusy] = useState(false),
    [confirmAll, setConfirmAll] = useState(false),
    [message, setMessage] = useState('');
  useToastOn(message, () => setMessage(''), 'info');
  async function load() {
    try {
      setRows(await invoke('list_project_permissions', {projectId}));
    } catch (e) {
      setRows([]);
      setMessage(String(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  async function run(action, done) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(done);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
      setConfirmAll(false);
      load();
    }
  }
  return (
    <div className="project-permissions">
      <div className="context-heading">
        <h3>Разрешения</h3>
        <small>Правила «Разрешать всегда» для агентов и браузера в этом проекте</small>
      </div>
      {rows === null ? (
        <p className="project-permissions-empty">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="project-permissions-empty">
          Постоянных разрешений нет. Они появляются, когда в карточке разрешения отмечено «Разрешать всегда».
        </p>
      ) : (
        <ul>
          {rows.map(row => (
            <li key={row.id + row.label}>
              <span>{row.label}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      invoke('revoke_project_permission', {
                        projectId,
                        provider: row.provider,
                        kind: row.kind,
                        scope: row.scope,
                      }),
                    'Разрешение отозвано.'
                  )
                }
              >
                Отозвать
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows?.length > 1 &&
        (confirmAll ? (
          <div className="project-revoke-confirm" role="group" aria-label="Подтверждение отзыва разрешений">
            <span>Отозвать все разрешения проекта? Агентам снова понадобится подтверждение.</span>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() =>
                run(
                  () => invoke('reset_project_permissions', {projectId}),
                  'Все разрешения проекта отозваны.'
                )
              }
            >
              Отозвать все
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmAll(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="project-revoke"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
          >
            Отозвать все
          </button>
        ))}
      <small className="project-permissions-note">
        Разрешения macOS (доступ к файлам, автоматизация) настраиваются в системе отдельно.
      </small>
    </div>
  );
}
