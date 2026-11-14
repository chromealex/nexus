import assert from 'node:assert/strict';
import {loc, matchLanguage, getLang, LANGUAGES} from '../src/i18n.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';
import de from '../src/locales/de.js';
import fr from '../src/locales/fr.js';
import pt from '../src/locales/pt.js';
import zh from '../src/locales/zh.js';
import ja from '../src/locales/ja.js';

// Outside the app window the Russian source strings are kept, so other tests see them.
assert.equal(getLang(), 'ru');
assert.equal(loc('Новый чат'), 'Новый чат');
assert.equal(loc('Осталось {0}%', 73), 'Осталось 73%');
assert.equal(loc('{0} из {1}', 2, 5), '2 из 5');
assert.equal(loc('JSON {{"a": {0}}}', 1), 'JSON {"a": 1}');

// System language: region and script are ignored; unknown languages fall back to English.
assert.equal(matchLanguage(['pt-BR']), 'pt');
assert.equal(matchLanguage(['zh-Hans-CN']), 'zh');
assert.equal(matchLanguage(['ru_RU']), 'ru');
assert.equal(matchLanguage(['ko-KR', 'de-AT']), 'de');
assert.equal(matchLanguage(['ko-KR']), 'en');
assert.equal(matchLanguage([]), 'en');

// Every language translates every English key and keeps the same {n} placeholders.
const placeholders = s => (s.match(/\{\d+\}/g) || []).sort().join();
const dicts = {es, de, fr, pt, zh, ja};
assert.deepEqual(Object.keys(LANGUAGES), ['ru', 'en', ...Object.keys(dicts)]);
for (const [code, dict] of Object.entries(dicts)) {
  for (const key of Object.keys(en)) {
    assert.ok(dict[key], `${code}: missing translation for «${key}»`);
    assert.equal(placeholders(dict[key]), placeholders(key), `${code}: placeholders differ for «${key}»`);
  }
}
for (const [key, value] of Object.entries(en)) assert.equal(placeholders(value), placeholders(key), key);

console.log(
  'i18n: source fallback, placeholders, system language match and full coverage of 7 languages passed.'
);
