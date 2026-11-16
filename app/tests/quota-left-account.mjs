import assert from 'node:assert/strict';
import {quotaLeftByAccount} from '../src/quota-format.js';
assert.deepEqual(quotaLeftByAccount([{id: 'x', provider: 'codex'}], {}, {}), {});
console.log('quota-left-account ok');
