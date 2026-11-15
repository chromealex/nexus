import React from 'react';
import {quotaView, apiLimitsView} from './quota-format.js';
import {appLocale, loc} from './i18n.js';
const number = new Intl.NumberFormat(appLocale(), {maximumFractionDigits: 1});
export function Quota({quota, statusline, expanded = false, unsupported}) {
  const view = quotaView(quota, statusline);
  return (
    <div className={'connection-quota quota-overview' + (view.stale || view.error ? ' is-stale' : '')}>
      <div className="quota-overview-heading">
        <strong>{loc('Лимиты')}</strong>
        {view.checking && <small>{loc('Обновляем…')}</small>}
        {view.error && view.windows.length > 0 && (
          <small>{loc('Не удалось обновить · последние данные')}</small>
        )}
        {view.stale && !view.error && <small>{loc('Последние данные · требуют обновления')}</small>}
      </div>
      {view.credits && (
        <p className="quota-unknown">
          {view.credits.unlimited
            ? loc('Кредиты: без ограничения')
            : loc('Кредиты: {0}', number.format(view.credits.balance))}
          {view.plan ? loc(' · тариф {0}', view.plan) : ''}
        </p>
      )}
      {view.windows.length > 0 ? (
        <div className="quota-windows">
          {view.windows.map(window => (
            <div className="quota-window" key={window.id}>
              <div className="quota-window-label">
                <span>{window.label}</span>
                <strong>
                  {number.format(window.used)}
                  {loc('% использовано')}
                </strong>
              </div>
              <progress
                className={
                  'quota-progress' +
                  (window.used >= 100 ? ' is-exhausted' : window.used >= 90 ? ' is-low' : '')
                }
                max="100"
                value={window.used}
                aria-label={window.label + loc(' · использовано')}
                aria-valuetext={loc(
                  '{0}% использовано, {1}% осталось',
                  number.format(window.used),
                  number.format(window.left)
                )}
              />
              <div className="quota-window-note">
                <span>
                  {loc('Осталось')} {number.format(window.left)}%
                </span>
                {window.resetAt && (
                  <time dateTime={window.resetAt.toISOString()}>
                    {loc('Восстановление:')}{' '}
                    {window.resetAt.toLocaleString(appLocale(), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : view.credits ? null : (
        <p className="quota-unknown">
          {view.checking
            ? loc('Получаем данные от провайдера…')
            : unsupported || loc('Нет данных · провайдер не передал подтверждённые лимиты')}
          {/* The provider's own answer (error or response fields) explains why there are no limits. */}
          {!view.checking && !unsupported && quota?.detail && !expanded && (
            <small className="quota-reason">{quota.detail}</small>
          )}
        </p>
      )}
      {expanded && (
        <div className="quota-source">
          <small>
            {loc('Источник:')} {view.source || loc('Не предоставлен')}
            {view.checkedAt ? ' · ' + view.checkedAt.toLocaleString(appLocale()) : ''}
          </small>
          {quota?.detail && <small>{quota.detail}</small>}
        </div>
      )}
    </div>
  );
}
const money = new Intl.NumberFormat(appLocale(), {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
export function ApiLimits({limits, expanded = false}) {
  const view = apiLimitsView(limits);
  return (
    <div className={'connection-quota quota-overview' + (view.stale || view.error ? ' is-stale' : '')}>
      <div className="quota-overview-heading">
        <strong>{loc('Лимиты API-ключа')}</strong>
        {view.checking && <small>{loc('Обновляем…')}</small>}
        {view.error && <small>{loc('Не удалось обновить')}</small>}
        {view.limited && <small>{loc('Провайдер ограничил запросы')}</small>}
        {view.blocked && <small>{loc('Ключ или команда заблокированы')}</small>}
      </div>
      {view.windows.length > 0 && (
        <div className="quota-windows">
          {view.windows.map(w => (
            <div className="quota-window" key={w.id}>
              <div className="quota-window-label">
                <span>{w.label}</span>
                <strong>
                  {number.format(w.used)}
                  {loc('% использовано')}
                </strong>
              </div>
              <progress
                className={
                  'quota-progress' + (w.used >= 100 ? ' is-exhausted' : w.used >= 90 ? ' is-low' : '')
                }
                max="100"
                value={w.used}
                aria-label={w.label + loc(' · использовано')}
                aria-valuetext={loc(
                  '{0}% использовано, осталось {1} из {2}',
                  number.format(w.used),
                  number.format(w.remaining),
                  number.format(w.limit)
                )}
              />
              <div className="quota-window-note">
                <span>
                  {loc('Осталось')} {number.format(w.remaining)} {loc('из')} {number.format(w.limit)}
                </span>
                {w.reset && (
                  <span>
                    {loc('Сброс:')} {w.reset}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {view.credits && (
        <p className="quota-unknown">
          {loc('Баланс API:')} {money.format(view.credits.remaining)}
          {view.credits.total !== null ? loc(' из {0}', money.format(view.credits.total)) : ''}
        </p>
      )}
      {!view.windows.length && !view.credits && (
        <p className="quota-unknown">
          {view.checking
            ? loc('Получаем данные от xAI…')
            : view.error
              ? view.detail
              : loc('Нет данных · xAI не передал лимиты в ответе')}
        </p>
      )}
      {expanded && (
        <div className="quota-source">
          <small>
            {loc('Источник:')} {view.source || 'xAI API'}
            {view.checkedAt ? ' · ' + view.checkedAt.toLocaleString(appLocale()) : ''}
          </small>
          <small>
            {loc(
              'Лимиты подписки SuperGrok/X Premium через API недоступны: подписка и API оплачиваются отдельно.'
            )}
          </small>
        </div>
      )}
    </div>
  );
}
