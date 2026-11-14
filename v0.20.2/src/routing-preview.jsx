import React from 'react';
export function RoutingPreview({route,models=[]}){
 if(!route.choice)return null;
 const label=models.find(m=>m.id===route.choice)?.label||route.choice;
 return <details className="model-route-preview"><summary>{label} · {route.taskType||'Запрос'} · {route.benchmark?'сравнение моделей':'выбор модели'}</summary><p>{route.reason||'Модель выбрана вручную; приоритет автовыбора не применяется.'}</p>{route.comparison&&<><p>Покрытие: {route.coverage} совместимых моделей. Без оценки не означает хуже.</p><div className="routing-comparison">{route.comparison.map((row,i)=><section key={row.id} aria-label={i?'Альтернатива':'Выбранная модель'}><strong>{i?'Альтернатива: ':'Выбрана: '}{row.label}</strong><p>{row.quality}</p><p>{row.minutes==null?'Сопоставимое время неизвестно':`Расчётное время AA: ${row.minutes} мин/задачу`}</p><p>{row.cost==null?'Стоимость запроса неизвестна':`${row.costLabel}: $${row.cost.toFixed(4)}`}</p><small>{row.note}</small></section>)}</div></>}</details>;
}
