import React, {useEffect, useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {invoke} from '@tauri-apps/api/core';
import {X} from 'lucide-react';
import {loc} from './i18n.js';

// Message text that asks the agent to follow a prepared plan.
export function planMessage(task, steps) {
  return loc(
    'Выполни задачу по плану.\n\n{0}\n\nПлан:\n{1}',
    task,
    steps.map((s, i) => `${i + 1}. ${s.title}: ${s.prompt}`).join('\n')
  );
}

// Plan for the current draft, right under the composer (replaces «Инструменты → Планирование»).
// The rule-based plan costs nothing; the AI refinement is a separate, clearly marked model call.
export function ComposerPlan({task, workspace, onUse, onClose}) {
  const [plan, setPlan] = useState(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [planned, setPlanned] = useState('');
  useToastOn(error, () => setError(''), 'error');
  useEffect(() => {
    if (planned && task.trim() !== planned) setPlan(null);
  }, [task, planned]);
  async function create(ai) {
    const text = task.trim();
    if (!text) return;
    setBusy(ai ? 'ai' : 'rules');
    setError('');
    try {
      setPlan(
        await invoke(ai ? 'ai_adaptive_plan' : 'adaptive_plan', {
          task: text,
          strategy: 'balanced',
          ...(ai ? {workspace} : {}),
        })
      );
      setPlanned(text);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="composer-plan" aria-label={loc('План задачи')}>
      <header>
        <strong>{loc('План задачи')}</strong>
        <button type="button" aria-label={loc('Закрыть план')} onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      {!task.trim() ? (
        <p className="composer-plan-hint">
          {loc('Опишите задачу в поле ввода — план составится по её тексту.')}
        </p>
      ) : (
        <div className="composer-plan-actions">
          <button type="button" disabled={!!busy} onClick={() => create(false)}>
            {busy === 'rules' ? loc('Составляю…') : loc('По правилам · без ИИ')}
          </button>
          <button type="button" disabled={!!busy} onClick={() => create(true)}>
            {busy === 'ai' ? loc('Уточняю…') : loc('Уточнить с ИИ · расходует квоту')}
          </button>
        </div>
      )}
      {plan && (
        <>
          {plan.warnings?.map((w, i) => (
            <p key={i} className="composer-plan-warning">
              {w}
            </p>
          ))}
          <ol>
            {plan.steps.map(step => (
              <li key={step.id}>
                <strong>{step.title}</strong>
                <span>{step.reason}</span>
                <small>
                  {step.provider} · {step.model}
                  {step.dependsOn.length ? loc(' · после {0}', step.dependsOn.join(', ')) : ''}
                </small>
              </li>
            ))}
          </ol>
          <div className="composer-plan-actions">
            <button type="button" className="primary" onClick={() => onUse(planMessage(planned, plan.steps))}>
              {loc('Вставить план в сообщение')}
            </button>
            <small>{loc('Выполнение начнётся только после отправки.')}</small>
          </div>
        </>
      )}
    </section>
  );
}
