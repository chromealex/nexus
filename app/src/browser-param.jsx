import React from 'react';
import {Globe, Download, ExternalLink} from 'lucide-react';
import {CustomSelect} from './custom-select.jsx';
import {BROWSER_MODES, browserHint, normalizeMode} from './browser-mode.js';
import {loc} from './i18n.js';

// «Параметры → Браузер»: choose the browser for this chat and finish its one-time setup.
export function BrowserParam({
  status,
  disabled,
  busy,
  error,
  onMode,
  onInstall,
  onCancel,
  onExtension,
  compact,
}) {
  const mode = normalizeMode(status?.mode),
    hint = browserHint(mode, status || {});
  return (
    <div className={'composer-param-row browser-param' + (compact ? ' is-compact' : '')}>
      <span className="composer-param-label">
        <Globe size={12} aria-hidden="true" />
        {loc('Браузер агентов')}
      </span>
      <CustomSelect
        className="reasoning-mode"
        aria-label={loc('Браузер агентов')}
        value={mode}
        disabled={disabled || busy || !status}
        onChange={e => onMode(e.target.value)}
      >
        {Object.entries(BROWSER_MODES).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </CustomSelect>
      <small className={'browser-hint is-' + hint.tone}>{hint.text}</small>
      {hint.action === 'install' && (
        <span className="browser-actions">
          <button type="button" disabled={busy} onClick={onInstall}>
            <Download size={12} aria-hidden="true" />
            {loc('Установить')}
          </button>
        </span>
      )}
      {status?.installing && (
        <span className="browser-actions">
          <button type="button" onClick={onCancel}>
            {loc('Отменить')}
          </button>
        </span>
      )}
      {hint.action === 'extension' && (
        <span className="browser-actions">
          <button type="button" onClick={onExtension}>
            <ExternalLink size={12} aria-hidden="true" />
            {loc('Расширение для Chrome')}
          </button>
        </span>
      )}
      {error && (
        <small className="browser-hint is-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
