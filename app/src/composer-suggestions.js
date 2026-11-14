import {loc} from './i18n.js';
export function composerSuggestion(value, {hasFiles = false, hasHistory = false, maxLength = 12000} = {}) {
  if (value.includes('\n') || value.length > 150) return '';
  const choices = [
    ...(hasFiles ? [loc('Проанализируй прикреплённые файлы и выдели главное')] : []),
    ...(!hasFiles && hasHistory ? [loc('Подведи итог обсуждения и предложи следующие шаги')] : []),
    loc('Объясни, как устроен этот проект'),
    loc('Найди причину ошибки и предложи исправление'),
    loc('Проверь код и найди возможные проблемы'),
    loc('Предложи план реализации задачи'),
    loc('Сравни варианты решения и объясни различия'),
    loc('Подведи итог обсуждения и предложи следующие шаги'),
    loc('Напиши тесты для этой функции'),
  ];
  const match = choices.find(
    text =>
      text.length > value.length &&
      text.length <= maxLength &&
      text.toLocaleLowerCase().startsWith(value.toLocaleLowerCase())
  );
  return match ? value + match.slice(value.length) : '';
}
