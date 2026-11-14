import React from 'react';
import {loc} from './i18n.js';
export function TeamPlanPreview({plan, integrator}) {
  if (!plan) return null;
  return (
    <details className="model-route-preview team-plan-preview">
      <summary>
        {plan.steps.length
          ? plan.autoPlan
            ? loc(
                '{0} · разбиение по контексту на {1} типа работ',
                plan.mode === 'auto' ? loc('Авто') : loc('Команда'),
                plan.steps.length
              )
            : loc(
                '{0} · {1} подзадачи + итог',
                plan.mode === 'auto' ? loc('Авто') : loc('Команда'),
                plan.steps.length
              )
          : loc('Команда · один исполнитель')}
      </summary>
      <p>{plan.reason}</p>
      {plan.error && <p role="alert">{plan.error}</p>}
      <ol>
        {plan.steps.map(step => (
          <li key={step.id}>
            <strong>{step.title}</strong>
            <p>
              {step.label || loc('Нет исполнителя')}
              {step.effort
                ? loc(
                    ' · глубина {0}',
                    {low: loc('низкая'), medium: loc('средняя'), high: loc('высокая')}[step.effort]
                  )
                : ''}{' '}
              ·{' '}
              {plan.autoPlan
                ? loc('для этапов этого типа')
                : step.dependsOn.length
                  ? loc('после этапа {0}', step.dependsOn.join(', '))
                  : loc('независимый этап')}
            </p>
            <small>{step.reason}</small>
          </li>
        ))}
      </ol>
      {plan.steps.length > 0 && (
        <p>
          {loc('Объединение и проверка:')} {integrator}
          {loc('. Дополнительные вызовы расходуют квоту; стоимость подписочных запросов неизвестна.')}
        </p>
      )}
    </details>
  );
}
