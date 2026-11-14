import {appLocale, getLang} from './i18n.js';
const pluralRules = new Intl.PluralRules(getLang());
const numbers = new Intl.NumberFormat(appLocale(), {maximumFractionDigits: 2});
export function countLabel(value, one, few, many) {
  const count = Number(value);
  if (!Number.isFinite(count)) return '—';
  const form = {one, few, many, other: getLang() === 'ru' ? few : many}[pluralRules.select(count)];
  return `${numbers.format(count)} ${form}`;
}
