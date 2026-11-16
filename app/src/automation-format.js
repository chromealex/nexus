// Pure helpers for the automations dialog, tested without React.
import {loc} from './i18n.js';
import {countLabel} from './locale-format.js';

export const WEEKDAYS = () => [
  [1, loc('Пн')],
  [2, loc('Вт')],
  [3, loc('Ср')],
  [4, loc('Чт')],
  [5, loc('Пт')],
  [6, loc('Сб')],
  [7, loc('Вс')],
];

export function scheduleLabel(s) {
  if (!s) return '';
  if (s.kind === 'once') return loc('один раз, {0}', new Date(s.at * 1000).toLocaleString());
  if (s.kind === 'interval')
    return s.minutes % 60 === 0
      ? loc('каждые {0}', countLabel(s.minutes / 60, loc('час'), loc('часа'), loc('часов')))
      : loc('каждые {0}', countLabel(s.minutes, loc('минуту'), loc('минуты'), loc('минут')));
  if (s.kind === 'daily') return loc('каждый день в {0}', s.time);
  const days = s.days || [];
  if (days.join() === '1,2,3,4,5') return loc('по будням в {0}', s.time);
  if (days.join() === '6,7') return loc('по выходным в {0}', s.time);
  const names = Object.fromEntries(WEEKDAYS());
  return loc('{0} в {1}', days.map(d => names[d]).join(', '), s.time);
}

export function statusLabel(status) {
  return (
    {
      ok: loc('готово'),
      error: loc('ошибка'),
      stopped: loc('остановлено'),
      running: loc('выполняется'),
      waiting: loc('ждёт свободный чат'),
    }[status] || loc('ещё не запускалась')
  );
}

export function emptyAutomation(projectId) {
  return {
    id: '',
    name: '',
    projectId: projectId || '',
    chatId: null,
    prompt: '',
    schedule: {kind: 'daily', time: '09:00'},
    mode: 'discuss',
    model: null,
    worktree: false,
    enabled: true,
  };
}

// <input type="datetime-local"> works in local time without a zone.
export function toLocalInput(seconds) {
  const d = new Date((seconds || 0) * 1000),
    pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}
