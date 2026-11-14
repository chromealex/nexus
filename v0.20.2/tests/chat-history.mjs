import assert from 'node:assert/strict';
import {mergeLatestMessages,prependMessages} from '../src/chat-history.js';
const history=[{id:'old',content:'old'},{id:'current',content:'before'},{id:'pending-123',content:'sending'}];
const merged=mergeLatestMessages(history,[{id:'current',content:'after'},{id:'new',content:'new'}]);
assert.deepEqual(merged.map(m=>m.id),['old','current','new']);assert.equal(merged[1].content,'after');
assert.deepEqual(prependMessages(merged,[{id:'older'},{id:'old'}]).map(m=>m.id),['older','old','current','new']);
assert.deepEqual(mergeLatestMessages([],[]),[]);
console.log('Chat history: page prepend deduplication, latest updates and loaded history preservation passed.');
