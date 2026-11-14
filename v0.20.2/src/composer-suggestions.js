export function composerSuggestion(value,{hasFiles=false,hasHistory=false,maxLength=12000}={}){
 if(value.includes('\n')||value.length>150)return '';
 const choices=[
  ...(hasFiles?['Проанализируй прикреплённые файлы и выдели главное']:[]),
  ...(!hasFiles&&hasHistory?['Подведи итог обсуждения и предложи следующие шаги']:[]),
  'Объясни, как устроен этот проект',
  'Найди причину ошибки и предложи исправление',
  'Проверь код и найди возможные проблемы',
  'Предложи план реализации задачи',
  'Сравни варианты решения и объясни различия',
  'Подведи итог обсуждения и предложи следующие шаги',
  'Напиши тесты для этой функции',
 ];
 const match=choices.find(text=>text.length>value.length&&text.length<=maxLength&&text.toLocaleLowerCase().startsWith(value.toLocaleLowerCase()));
 return match?value+match.slice(value.length):'';
}
