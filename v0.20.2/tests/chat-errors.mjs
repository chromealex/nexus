import assert from 'node:assert/strict';
import {chatErrorMessage} from '../src/chat-errors.js';
for(const error of ['NEXUS_RATE_LIMIT','No remaining usable account after quota failures. Route: claude / Personal: subscription limit']){
 const message=chatErrorMessage(error);assert.match(message,/Запрос сохранён/);assert.doesNotMatch(message,/Personal|subscription|подписки|Route/);
}
assert.match(chatErrorMessage('NEXUS_ACCOUNT_UNAVAILABLE'),/нет доступного аккаунта/);
assert.match(chatErrorMessage('Agent response timed out'),/вовремя/);
assert.doesNotMatch(chatErrorMessage('{"error":"secret diagnostic"}'),/secret/);
