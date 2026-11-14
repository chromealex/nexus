const pluralRules = new Intl.PluralRules('ru');
const numbers = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2});
export function countLabel(value, one, few, many) {
  const count = Number(value);
  if (!Number.isFinite(count)) return '—';
  const form = {one, few, many, other: few}[pluralRules.select(count)];
  return `${numbers.format(count)} ${form}`;
}
