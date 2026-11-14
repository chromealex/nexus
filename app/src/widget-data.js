import {loc} from './i18n.js';
// Validation for graphic blocks in answers (```nexus-widget JSON). Model output is untrusted:
// every field is type-checked, strings are trimmed to sane lengths, counts are capped.
// Anything that does not fit a known shape returns null and is shown as plain code instead.

const str = (v, n = 120) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '';
// null, '' and booleans are gaps, not zeros: a missing point must not draw a false dip.
const num = v => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
const TONES = ['note', 'tip', 'important', 'warning', 'caution', 'success'];
export const tone = v => {
  const t = String(v || '').toLowerCase();
  return TONES.includes(t) ? t : t === 'danger' || t === 'error' ? 'caution' : t === 'info' ? 'note' : 'note';
};

export const WIDGET_TYPES = [
  'metric',
  'kpis',
  'progress',
  'flow',
  'bar',
  'line',
  'pie',
  'timeline',
  'compare',
  'checklist',
  'callout',
];

export function normalizeWidget(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const type = String(data.type || '').toLowerCase();
  const title = str(data.title, 100);
  switch (type) {
    case 'metric': {
      const label = str(data.label, 80),
        value = str(data.value, 40);
      return label && value
        ? {type, label, value, delta: str(data.delta, 24), hint: str(data.hint, 140)}
        : null;
    }
    case 'kpis': {
      const items = list(data.items, 8)
        .map(i => ({label: str(i?.label, 60), value: str(i?.value, 32), delta: str(i?.delta, 20)}))
        .filter(i => i.label && i.value);
      return items.length ? {type, title, items} : null;
    }
    case 'progress': {
      const value = num(data.value);
      return value === null
        ? null
        : {type, label: str(data.label, 80) || loc('Прогресс'), value: Math.max(0, Math.min(100, value))};
    }
    case 'flow': {
      const steps = list(data.steps, 9)
        .map(s => str(s, 60))
        .filter(Boolean);
      return steps.length ? {type, title, steps} : null;
    }
    case 'bar':
    case 'pie':
    case 'donut': {
      const items = list(data.items, type === 'bar' ? 12 : 8)
        .map(i => ({label: str(i?.label, 40), value: num(i?.value)}))
        .filter(i => i.label && i.value !== null && (type === 'bar' || i.value > 0));
      return items.length
        ? {type: type === 'donut' ? 'pie' : type, title, items, unit: str(data.unit, 12)}
        : null;
    }
    case 'line': {
      const x = list(data.x, 60).map(v => str(v, 24));
      const series = list(data.series, 4)
        .map(s => ({name: str(s?.name, 40) || loc('Ряд'), values: list(s?.values, x.length).map(num)}))
        .filter(s => s.values.some(v => v !== null));
      return x.length >= 2 && series.length ? {type, title, x, series, unit: str(data.unit, 12)} : null;
    }
    case 'timeline': {
      const items = list(data.items, 12)
        .map(i => ({
          date: str(i?.date, 32),
          title: str(i?.title, 80),
          text: str(i?.text, 240),
          done: i?.done === true,
        }))
        .filter(i => i.title);
      return items.length ? {type, title, items} : null;
    }
    case 'compare': {
      const columns = list(data.columns, 4)
        .map(c => ({
          title: str(c?.title, 50),
          tone: c?.tone ? tone(c.tone) : '',
          items: list(c?.items, 10)
            .map(v => str(v, 140))
            .filter(Boolean),
        }))
        .filter(c => c.title && c.items.length);
      return columns.length >= 2 ? {type, title, columns} : null;
    }
    case 'checklist': {
      const items = list(data.items, 20)
        .map(i =>
          typeof i === 'string'
            ? {text: str(i, 160), done: false}
            : {text: str(i?.text, 160), done: i?.done === true}
        )
        .filter(i => i.text);
      return items.length ? {type, title, items} : null;
    }
    case 'callout': {
      const text = str(data.text, 1200);
      return text ? {type, tone: tone(data.tone), title, text} : null;
    }
    default:
      return null;
  }
}

// GitHub-style alerts in Markdown: "> [!NOTE]" / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION].
export function alertKind(text) {
  const m = String(text || '').match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|SUCCESS)\]/i);
  return m ? m[1].toLowerCase() : null;
}
export const ALERT_TITLES = {
  note: loc('Примечание'),
  tip: loc('Совет'),
  important: loc('Важно'),
  warning: loc('Внимание'),
  caution: loc('Осторожно'),
  success: loc('Готово'),
};
