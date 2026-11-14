import assert from 'node:assert/strict';
import {normalizeSearch, folderPath, matchRanges, highlightParts, searchChats} from '../src/chat-search.js';

const projects = [
  {id: 'p', name: 'Nexus'},
  {id: 'q', name: 'Сайт'},
];
const folders = [
  {id: 'f1', projectId: 'p', name: 'Интерфейс'},
  {id: 'f2', projectId: 'p', name: 'Окна', parentId: 'f1'},
  {id: 'loop', projectId: 'p', name: 'Цикл', parentId: 'loop'},
];
const chats = [
  {id: 'a', projectId: 'p', title: 'Настройка ёлки', folderId: 'f2'},
  {id: 'b', projectId: 'p', title: 'Окно подключений'},
  {id: 'c', projectId: 'q', title: 'Главная страница'},
  {id: 'd', projectId: 'p', title: 'Подчат окна', parentChatId: 'b'},
  {id: 'e', projectId: 'p', title: 'Удалённый', deletedAt: 'x'},
  {id: 'g', projectId: 'p', title: 'Архивный', archived: true},
];
const data = {chats, folders, projects};

assert.equal(normalizeSearch('  Ёлка   ДЛЯ '), 'елка для');
assert.deepEqual(folderPath(folders, 'f2'), ['Интерфейс', 'Окна']);
assert.deepEqual(folderPath(folders, 'loop'), ['Цикл'], 'cycles terminate');
assert.deepEqual(matchRanges('Окно окно', 'окн'), [
  [0, 3],
  [5, 8],
]);
assert.deepEqual(matchRanges('abcdef', 'bc cd'), [[1, 4]], 'overlapping ranges merge');
assert.deepEqual(
  highlightParts('Ёлка', 'елк'),
  [
    {text: 'Ёлк', match: true},
    {text: 'а', match: false},
  ],
  'ё matches е, original text kept'
);
assert.deepEqual(highlightParts('abc', ''), [{text: 'abc', match: false}]);

assert.deepEqual(
  searchChats('', data)
    .map(r => r.chat.id)
    .sort(),
  ['a', 'b', 'c', 'd'],
  'empty query lists live chats only'
);
assert.deepEqual(
  searchChats('елки', data).map(r => r.chat.id),
  ['a']
);
assert.equal(searchChats('окн', data)[0].chat.id, 'b', 'title prefix ranks first');
assert.ok(
  searchChats('окн', data).some(r => r.chat.id === 'a'),
  'folder path matches'
);
assert.deepEqual(
  searchChats('сайт главная', data).map(r => r.chat.id),
  ['c'],
  'all terms required across path and title'
);
assert.deepEqual(searchChats('удалённый', data), []);
assert.deepEqual(searchChats('архивный', data), []);
assert.deepEqual(
  searchChats('окна подчат', data)[0].path,
  ['Nexus', 'Окно подключений'],
  'subchat path contains parent chat'
);
assert.equal(searchChats('', data, 2).length, 2, 'limit applies');
console.log(
  'Chat search: normalisation, ё/е, folder paths, cycles, ranking, highlighting and hidden chats passed.'
);
