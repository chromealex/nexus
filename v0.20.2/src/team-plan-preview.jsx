import React from 'react';
export function TeamPlanPreview({plan,integrator}){
 if(!plan)return null;
 return <details className="model-route-preview team-plan-preview"><summary>{plan.steps.length?plan.autoPlan?'Команда · разбиение по контексту':`Команда · ${plan.steps.length} подзадачи + итог`:'Команда · один исполнитель'}</summary><p>{plan.reason}</p>{plan.error&&<p role="alert">{plan.error}</p>}<ol>{plan.steps.map(step=><li key={step.id}><strong>{step.title}</strong><p>{step.label||'Нет исполнителя'} · {step.dependsOn.length?`после этапа ${step.dependsOn.join(', ')}`:'независимый этап'}</p><small>{step.reason}</small></li>)}</ol>{plan.steps.length>0&&<p>Объединение и проверка: {integrator}. Дополнительные вызовы расходуют квоту; стоимость подписочных запросов неизвестна.</p>}</details>;
}
