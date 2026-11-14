import React, {useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {ShieldCheck, Globe} from 'lucide-react';
import {browserRequest} from './browser-mode.js';
import {loc} from './i18n.js';
export function PermissionCard({request, onAnswer}) {
  const [remember, setRemember] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useToastOn(error, () => setError(''), 'error');
  const raw = request.details || {},
    p = {...raw, ...raw.input, ...raw.toolCall};
  const browser = request.kind === 'browser' ? browserRequest(raw) : null;
  const title = browser
    ? loc('Агент просит действие в браузере')
    : request.kind === 'verification'
      ? loc('Nexus запрашивает запуск проверки')
      : request.kind.includes('commandExecution')
        ? loc('Агент запрашивает запуск действия')
        : request.kind.includes('fileChange')
          ? loc('Агент запрашивает изменение файлов')
          : request.kind.includes('permissions')
            ? loc('Агент запрашивает дополнительный доступ')
            : loc('Агент запрашивает использование инструмента');
  async function answer(value) {
    setBusy(true);
    try {
      await onAnswer(value, value && remember);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  return (
    <section className="permission-card" role="region" aria-label={loc('Запрос разрешения')}>
      <div className="permission-title">
        <ShieldCheck size={18} />
        <strong>{title}</strong>
      </div>
      {browser && (
        <div className={'permission-browser' + (browser.own ? ' is-own' : '')}>
          <p className="permission-browser-action">
            <Globe size={14} aria-hidden="true" />
            <strong>{browser.summary}</strong>
          </p>
          <small>
            {browser.where}
            {browser.host ? ` · ${browser.host}` : ''}
          </small>
          {browser.own && (
            <small className="permission-browser-warn">
              {loc('Это ваш браузер с личными аккаунтами. Разрешайте только то, что ожидаете.')}
            </small>
          )}
        </div>
      )}
      {p.reason && <p>{p.reason}</p>}
      {p.tool_name && (
        <p>
          {loc('Инструмент:')} <strong>{p.tool_name}</strong>
        </p>
      )}
      {p.command && <pre>{p.command}</pre>}
      {p.cwd && (
        <small>
          {loc('Рабочая папка:')} {p.cwd}
        </small>
      )}
      {p.permissions && (
        <div className="permission-scopes">
          {p.permissions.network?.enabled && <p>{loc('Доступ к сети')}</p>}
          {p.permissions.fileSystem && (
            <p>
              {loc('Доступ к файлам:')} {JSON.stringify(p.permissions.fileSystem)}
            </p>
          )}
        </div>
      )}
      <details>
        <summary>{loc('Полные сведения о запросе')}</summary>
        <pre>{JSON.stringify(p, null, 2)}</pre>
      </details>
      {request.rememberLabel && (
        <label className="permission-remember">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={e => setRemember(e.target.checked)}
          />
          <span>
            {loc('Разрешать всегда для этого проекта')}
            <small>
              {request.rememberLabel}
              {loc(
                '. Правило действует для этого агента во всех чатах проекта до отзыва в «Настройки проекта → Разрешения». Привязка к проекту не ограничивает пути доступа.'
              )}
            </small>
          </span>
        </label>
      )}
      <p className="permission-note">
        {remember
          ? loc('Вы сохраняете правило для будущих запросов.')
          : loc('Разрешение действует для этого запроса или текущего ответа.')}{' '}
        {loc('Системные разрешения macOS подтверждаются отдельно.')}
      </p>
      <div className="permission-actions">
        <button disabled={busy} onClick={() => answer(false)}>
          {loc('Отклонить')}
        </button>
        <button disabled={busy} onClick={() => answer(true)}>
          {loc('Разрешить')}
        </button>
      </div>
    </section>
  );
}
