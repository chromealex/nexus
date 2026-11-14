import React, {useState} from 'react';
import {X, Plus, ArrowRight} from 'lucide-react';
import {countLabel} from './locale-format.js';
import {Quota} from './quota-view.jsx';
import {loc} from './i18n.js';
const names = {claude: 'Claude Code', codex: 'OpenAI Codex', gemini: 'Gemini CLI'};
export function WelcomeScreen({
  accounts = [],
  checks = {},
  quotas = {},
  statuslines = {},
  onConnections,
  loading = false,
}) {
  const [show, setShow] = useState(true);
  const rows = accounts.slice(0, 2);
  return (
    <div className="nexus-welcome cinematic-welcome">
      {show ? (
        <section className="welcome-connections" aria-label={loc('Подключения')}>
          <div className="welcome-connections-heading">
            <h2>{loc('Подключения')}</h2>
            <button aria-label={loc('Скрыть карточку подключений')} onClick={() => setShow(false)}>
              <X size={17} />
            </button>
          </div>
          <p className="welcome-connections-lead">
            {loading
              ? loc('Проверяем аккаунты…')
              : accounts.length
                ? loc('Аккаунты и остаток лимитов')
                : loc('Агентов пока нет')}
          </p>
          <div className="welcome-account-list">
            {rows.map(a => (
              <div className="welcome-account" key={a.id}>
                <div className="welcome-account-title">
                  <img
                    src={'/agents/' + a.provider + '.svg'}
                    alt=""
                    onError={e => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                  <div>
                    <strong>{names[a.provider] || a.provider}</strong>
                    <small>
                      {a.name} ·{' '}
                      {checks[a.id]?.status === 'ready'
                        ? loc('Вход подтверждён')
                        : checks[a.id]?.status === 'checking'
                          ? loc('Проверяем вход')
                          : loc('Требуется проверка')}
                    </small>
                  </div>
                </div>
                <Quota quota={quotas[a.id]} statusline={statuslines[a.id]} />
              </div>
            ))}
            {loading && !rows.length && (
              <div className="welcome-account-skeleton" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
            {!loading && !rows.length && <p>{loc('Подключите первого агента, чтобы начать работу.')}</p>}
            {accounts.length > rows.length && (
              <button className="welcome-more-accounts" onClick={onConnections}>
                {loc('Ещё')}{' '}
                {countLabel(accounts.length - rows.length, loc('аккаунт'), loc('аккаунта'), loc('аккаунтов'))}
                <ArrowRight size={13} />
              </button>
            )}
          </div>
          <button className="welcome-connect-action" onClick={onConnections}>
            <Plus size={15} />
            {loc('Подключить агента')}
          </button>
        </section>
      ) : (
        <button className="welcome-show-connections" onClick={() => setShow(true)}>
          {loc('Подключения')}
        </button>
      )}
    </div>
  );
}
