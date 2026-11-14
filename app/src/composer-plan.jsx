import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {X} from 'lucide-react';

// Message text that asks the agent to follow a prepared plan.
export function planMessage(task, steps) {
  return `Выполни задачу по плану.\n\n${task}\n\nПлан:\n${steps.map((s, i) => `${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}`;
}

// Plan for the current draft, right under the composer (replaces «Инструменты → Планирование»).
// The rule-based plan costs nothing; the AI refinement is a separate, clearly marked model call.
export function ComposerPlan({task, workspace, onUse, onClose}) {
  const [plan, setPlan] = useState(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [planned, setPlanned] = useState('');
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
    <section className="composer-plan" aria-label="План задачи">
      <header>
        <strong>План задачи</strong>
        <button type="button" aria-label="Закрыть план" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      {!task.trim() ? (
        <p className="composer-plan-hint">Опишите задачу в поле ввода — план составится по её тексту.</p>
      ) : (
        <div className="composer-plan-actions">
          <button type="button" disabled={!!busy} onClick={() => create(false)}>
            {busy === 'rules' ? 'Составляю…' : 'По правилам · без ИИ'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => create(true)}>
            {busy === 'ai' ? 'Уточняю…' : 'Уточнить с ИИ · расходует квоту'}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
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
                  {step.dependsOn.length ? ` · после ${step.dependsOn.join(', ')}` : ''}
                </small>
              </li>
            ))}
          </ol>
          <div className="composer-plan-actions">
            <button type="button" className="primary" onClick={() => onUse(planMessage(planned, plan.steps))}>
              Вставить план в сообщение
            </button>
            <small>Выполнение начнётся только после отправки.</small>
          </div>
        </>
      )}
    </section>
  );
}
