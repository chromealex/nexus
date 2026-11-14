import assert from 'node:assert/strict';
import {quotaView, quotaPercent, quotaDate} from '../src/quota-format.js';
assert.equal(quotaPercent(null), null);
assert.equal(quotaPercent(undefined), null);
assert.equal(quotaPercent(''), null);
assert.equal(quotaPercent(101), null);
assert.equal(quotaPercent(-1), null);
assert.equal(quotaPercent(NaN), null);
assert.equal(quotaPercent(0), 0);
assert.equal(quotaDate('bad'), null);
const now = 1800000000000;
let view = quotaView(
  {
    status: 'available',
    primaryUsedPercent: 0,
    secondaryUsedPercent: 100,
    primaryWindowMinutes: 300,
    secondaryWindowMinutes: 10080,
    checkedAt: now / 1000,
    primaryResetAt: (now + 300000) / 1000,
  },
  null,
  now
);
assert.equal(view.windows.length, 2);
assert.equal(view.windows[0].used, 0);
assert.equal(view.windows[0].left, 100);
assert.equal(view.windows[0].label, '5 часов');
assert.equal(view.windows[1].label, 'Неделя');
assert.equal(view.windows[1].left, 0);
assert.equal(view.stale, false);
assert.equal(view.windows[0].resetAt.getTime(), now + 300000);
assert.equal(quotaView({status: 'unavailable'}, null, now).windows.length, 0);
view = quotaView({status: 'checking', primaryUsedPercent: 25, checkedAt: (now - 700000) / 1000}, null, now);
assert.equal(view.windows[0].used, 25);
assert.equal(view.checking, true);
assert.equal(view.stale, true);
view = quotaView(
  null,
  {
    status: 'available',
    data: {
      fiveHour: {usedPercent: 32.5, resetAt: '2026-11-11T20:00:00Z'},
      sevenDay: {usedPercent: 57},
      receivedAt: '2026-11-11T17:00:00Z',
    },
  },
  Date.parse('2026-11-11T17:01:00Z')
);
assert.equal(view.windows[0].used, 32.5);
assert.equal(view.windows[1].used, 57);
assert.equal(view.source, 'Claude Code statusLine');
assert.equal(view.stale, false);
assert.equal(quotaView(null, {status: 'available', data: {}}, now).windows.length, 0);
console.log(
  'Quota progress: actual zero/full usage, missing/invalid values, two windows, reset dates, stale data and refresh preservation passed.'
);
import {apiLimitsView} from '../src/quota-format.js';
{
  const v = quotaView(
    null,
    {
      status: 'available',
      data: {
        fiveHour: {usedPercent: 9, resetAt: 1790578200},
        sevenDay: {usedPercent: 15, resetAt: 1791036000},
        receivedAt: '2026-11-11T17:00:00Z',
        source: 'Claude Code stream-json rate_limit_event',
      },
    },
    Date.parse('2026-11-11T17:01:00Z')
  );
  assert.equal(v.windows.length, 2);
  assert.equal(v.source, 'Claude Code stream-json rate_limit_event');
  assert.equal(v.windows[0].resetAt.getTime(), 1790578200000);
}
{
  const v = apiLimitsView(
    {
      status: 'available',
      requests: {limit: 480, remaining: 360, usedPercent: 25, reset: '15s'},
      tokens: null,
      credits: null,
      checkedAt: 1800000000,
    },
    1800000000000
  );
  assert.equal(v.windows.length, 1);
  assert.equal(v.windows[0].label, 'Запросы в минуту');
  assert.equal(v.windows[0].left, 75);
  assert.equal(v.windows[0].reset, '15s');
  assert.equal(v.stale, false);
}
{
  const v = apiLimitsView({
    status: 'available',
    requests: {usedPercent: null},
    credits: {remaining: 12.5, spent: null, total: 25},
  });
  assert.equal(v.windows.length, 0);
  assert.equal(v.credits.remaining, 12.5);
  assert.equal(v.credits.spent, null);
}
assert.equal(apiLimitsView(null).checking, true);
assert.equal(apiLimitsView({status: 'unavailable'}).windows.length, 0);
console.log('Claude stream-json limits and xAI API key limits passed.');
{
  const v = quotaView(
    {status: 'available', creditsBalance: '125.5', planType: 'business', checkedAt: 1800000000},
    null,
    1800000000000
  );
  assert.equal(v.windows.length, 0);
  assert.equal(v.credits.balance, 125.5);
  assert.equal(v.plan, 'business');
}
{
  const v = quotaView({status: 'available', creditsUnlimited: true, primaryUsedPercent: 10}, null);
  assert.equal(v.credits.unlimited, true);
  assert.equal(v.windows.length, 1);
}
assert.equal(quotaView({status: 'available', creditsBalance: 'abc'}, null).credits, null);
console.log('Codex workspace credits passed.');
