import assert from 'node:assert/strict';
import {
  CHANNELS,
  EXTRA,
  ORDER,
  parseAllowed,
  allowedText,
  formProblems,
  stateLabel,
  eventLine,
  shortcutBody,
  curlExample,
} from '../src/channels-format.js';

assert.deepEqual(ORDER, ['telegram', 'discord', 'slack', 'email', 'imessage', 'github', 'linear']);
assert.ok(EXTRA.api.steps.length >= 3 && EXTRA.push.steps.length >= 3);
for (const k of ORDER) {
  assert.ok(CHANNELS[k].name);
  assert.ok(CHANNELS[k].steps.length >= 3);
  assert.ok(CHANNELS[k].allowed);
}
assert.equal(CHANNELS.imessage.secret, '');

assert.deepEqual(parseAllowed(' 42 \n\n43, 42;U1\nu1'), ['42', '43', 'U1']);
assert.deepEqual(parseAllowed(''), []);
assert.equal(allowedText(['a', 'b']), 'a\nb');

const base = {enabled: true, projectId: 'p', allowed: ['42'], channelId: '', imapHost: '', smtpHost: ''};
assert.deepEqual(formProblems('telegram', {...base, enabled: false, allowed: []}), []);
assert.deepEqual(formProblems('telegram', base, {hasSecret: true}), []);
assert.match(formProblems('telegram', base, {hasSecret: false}).join(), /токен/);
assert.match(formProblems('telegram', {...base, allowed: []}, {hasSecret: true}).join(), /разрешённого/);
assert.match(formProblems('discord', {...base, channelId: 'abc'}, {hasSecret: true}).join(), /число/);
assert.deepEqual(formProblems('discord', {...base, channelId: '123'}, {hasSecret: true}), []);
assert.match(formProblems('slack', {...base, channelId: 'c1'}, {hasSecret: true}).join(), /C0123ABC/);
assert.match(formProblems('email', base, {hasSecret: true}).join(), /IMAP/);
assert.deepEqual(formProblems('imessage', base), []);

assert.equal(stateLabel({config: {enabled: false}, status: {state: 'running'}}), 'Выключен');
assert.equal(stateLabel({config: {enabled: true}, status: {state: 'error'}}), 'Ошибка');
assert.equal(stateLabel({config: {enabled: true}, status: {state: 'weird'}}), 'Запуск…');
assert.equal(
  eventLine({at: 1000, kind: 'slack', direction: 'in', summary: 'привет'}, 1010_000),
  '← Slack · только что · привет'
);
assert.match(
  eventLine({at: 1000, kind: 'email', direction: 'error', summary: 'x'}, 1000_000 + 300_000),
  /^! Email · 5 мин назад/
);
assert.match(formProblems('github', {...base, repo: 'bad'}, {hasSecret: true}).join(), /owner\/name/);
assert.deepEqual(formProblems('github', {...base, repo: 'me/nexus-core'}, {hasSecret: true}), []);
assert.deepEqual(formProblems('linear', base, {hasSecret: true}), []);
assert.deepEqual(formProblems('api', {...base, allowed: []}), []);
assert.match(formProblems('api', {...base, projectId: ''}).join(), /проект/);
assert.deepEqual(formProblems('push', {enabled: true, pushServer: 'https://ntfy.sh'}), []);
assert.match(formProblems('push', {enabled: true, pushServer: 'http://x'}).join(), /https/);
assert.equal(JSON.parse(shortcutBody(30)).wait, 30);
assert.match(curlExample('http://127.0.0.1:4719', 'tok'), /Bearer tok/);
assert.match(eventLine({at: 1000, kind: 'push', direction: 'error', summary: 'x'}, 1000_000), /Уведомления/);
console.log('channels-format: ok');
{
  const {stepParts, CHANNELS: C} = await import('../src/channels-format.js');
  assert.deepEqual(stepParts('просто текст'), {text: 'просто текст', actions: []});
  const steps = C.imessage.steps.map(stepParts);
  assert.ok(steps.every(s => s.text));
  assert.deepEqual(steps.flatMap(s => s.actions.map(a => a.open)).filter(Boolean), [
    'messages',
    'full-disk',
    'automation',
  ]);
  assert.ok(
    steps[2].actions.some(a => a.focus === 'channel-allowed') &&
      steps[2].actions.some(a => a.toggle === 'selfChat')
  );
  console.log('channels-format: iMessage step buttons ok');
}
