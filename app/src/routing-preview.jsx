import React from 'react';
import {loc} from './i18n.js';
export function RoutingPreview({route, models = []}) {
  if (!route.choice) return null;
  const label = models.find(m => m.id === route.choice)?.label || route.choice;
  return (
    <details className="model-route-preview">
      <summary>
        {label} · {route.taskType || loc('Запрос')} ·{' '}
        {route.benchmark ? loc('сравнение моделей') : loc('выбор модели')}
      </summary>
      <p>{route.reason || loc('Модель выбрана вручную; приоритет автовыбора не применяется.')}</p>
      {route.comparison && (
        <>
          <p>
            {loc('Покрытие:')} {route.coverage} {loc('совместимых моделей. Без оценки не означает хуже.')}
          </p>
          <div className="routing-comparison">
            {route.comparison.map((row, i) => (
              <section key={row.id} aria-label={i ? loc('Альтернатива') : loc('Выбранная модель')}>
                <strong>
                  {i ? loc('Альтернатива: ') : loc('Выбрана: ')}
                  {row.label}
                </strong>
                <p>{row.quality}</p>
                <p>
                  {row.minutes == null
                    ? loc('Сопоставимое время неизвестно')
                    : loc('Расчётное время AA: {0} мин/задачу', row.minutes)}
                </p>
                <p>
                  {row.cost == null
                    ? loc('Стоимость запроса неизвестна')
                    : `${row.costLabel}: $${row.cost.toFixed(4)}`}
                </p>
                <small>{row.note}</small>
              </section>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
