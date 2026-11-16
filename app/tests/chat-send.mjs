import {sliceBetween} from './helpers/source-slice.mjs';
import {loc} from '../src/i18n.js';
import {teamPlan} from '../src/team-plan.js';
import {chatErrorMessage} from '../src/chat-errors.js';
import {routingAdvice} from '../src/agent-catalog.js';
import {mergeLatestMessages} from '../src/chat-history.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const handler = sliceBetween(
  source,
  'async function sendChat(override,continueMessageId,regenerateAnswer=false){',
  'async function addProject(){'
);
function fixture({chat = '', fail = false} = {}) {
  const calls = [],
    state = {messages: [], draft: 'Hello', error: '', sending: false};
  let release;
  const gate = new Promise(r => (release = r));
  const ctx = {
    loc,
    teamPlan,
    teamMode: 'single',
    chatErrorMessage,
    routingAdvice,
    modelSaving: false,
    routeOptions: {models: [{id: 'codex/default', provider: 'codex', model: 'default', isDefault: true}]},
    window: {dispatchEvent: () => {}},
    Event: class Event {},
    mergeLatestMessages,
    routeApproval: {current: null},
    setRouteOffer: () => {},
    executionMode: 'discuss',
    modelChoice: 'auto',
    modelChoices: [],
    setContinuingId: () => {},
    setContinuingMode: () => {},
    setRunStartedAt: () => {},
    notifyReady: () => {},
    saveDraft: () => {},
    draftKey: () => 'k',
    localStorage: {},
    reasoningMode: 'normal',
    activeRunRef: {current: null},
    stopRequestedRef: {current: false},
    setStopping: () => {},
    draftFiles: [],
    filesBusy: false,
    setDraftFiles: () => {},
    setAgentQuestion: () => {},
    replyTo: null,
    setReplyTo: () => {},
    chatsReady: true,
    activeProject: 'project',
    activeChat: chat,
    chatDraft: 'Hello',
    sendingRef: {current: false},
    viewRef: {current: {project: 'project', chat}},
    Date,
    setStreamText: () => {},
    reactionSignals: () => [],
    quotaLeftByAccount: () => ({}),
    offerMcp: () => {},
    draftPrefs: {},
    routingText: t => t,
    accounts: [],
    quotaReports: {},
    statuslineReports: {},
    chatMessages: [],
    loadRouteFeedback: () => {},
    setChatSending: v => (state.sending = v),
    setProjectError: v => (state.error = v),
    setChatTrace: () => {},
    setChatDraft: v => (state.draft = typeof v === 'function' ? v(state.draft) : v),
    setChats: () => {},
    setActiveChat: () => {},
    setChatMessages: v => (state.messages = typeof v === 'function' ? v(state.messages) : v),
    invoke: async (name, args) => {
      calls.push({name, args});
      if (name === 'create_project_chat') {
        assert.equal(args.projectIdValue, 'project');
        return {id: 'created'};
      }
      if (name === 'regenerate_chat_answer') {
        return {
          message: {
            id: args.messageId,
            role: 'assistant',
            content: 'Other reply',
            variants: [{content: 'Reply'}, {content: 'Other reply'}],
            variant: 1,
          },
          route: 'Codex',
          tier: 'balanced',
        };
      }
      if (name === 'unified_chat_send') {
        await gate;
        if (fail) throw Error('Account unavailable');
        return {
          message: {id: 'answer', role: 'assistant', content: 'Reply'},
          route: 'Codex',
          tier: 'balanced',
        };
      }
      if (name === 'chat_message_page')
        return {
          messages: fail
            ? [{id: 'user', role: 'user', content: 'Hello'}]
            : [
                {id: 'user', role: 'user', content: 'Hello'},
                {id: 'answer', role: 'assistant', content: 'Reply'},
              ],
          hasMore: false,
          beforeId: 'user',
        };
      return [];
    },
  };
  vm.createContext(ctx);
  vm.runInContext(handler, ctx);
  return {ctx, state, calls, release};
}
{
  const f = fixture();
  const first = f.ctx.sendChat();
  await f.ctx.sendChat();
  f.release();
  await first;
  assert.equal(f.calls.filter(c => c.name === 'create_project_chat').length, 1);
  assert.equal(f.calls.filter(c => c.name === 'unified_chat_send').length, 1);
  assert.equal(f.state.messages.at(-1).content, 'Reply');
  assert.equal(f.state.sending, false);
}
{
  const f = fixture({chat: 'existing', fail: true});
  const p = f.ctx.sendChat();
  f.release();
  await p;
  assert.match(f.state.error, /нет доступного аккаунта/);
  assert.equal(f.state.messages[0].content, 'Hello');
  assert.equal(f.ctx.sendingRef.current, false);
}
{
  const f = fixture({chat: 'existing'});
  const p = f.ctx.sendChat();
  f.ctx.viewRef.current = {project: 'other', chat: 'other'};
  f.release();
  await p;
  assert.equal(
    f.state.messages.some(m => m.role === 'assistant'),
    false
  );
}
console.log(
  'Chat send: automatic creation, duplicate submission, response, failure and conversation ownership passed.'
);

{
  const f = fixture();
  const sending = f.ctx.sendChat();
  await f.ctx.stopChat();
  await f.ctx.stopChat();
  f.release();
  await sending;
  const cancel = f.calls.findIndex(c => c.name === 'cancel_chat_generation');
  const send = f.calls.findIndex(c => c.name === 'unified_chat_send');
  assert.ok(cancel >= 0 && cancel < send, 'Early stop is registered before generation starts');
  assert.equal(f.calls.filter(c => c.name === 'cancel_chat_generation').length, 1);
  assert.equal(f.calls[cancel].args.requestId, f.calls[send].args.requestId);
  assert.equal(f.ctx.activeRunRef.current, null);
}
console.log('Stop: early cancellation, duplicate click and request ownership passed.');

{
  const f = fixture({chat: 'existing'});
  f.ctx.chatDraft = 'Unsent draft';
  f.ctx.draftFiles = [{id: 'draft-file'}];
  const p = f.ctx.sendChat('Продолжить', 'stopped-answer');
  f.release();
  await p;
  const call = f.calls.find(c => c.name === 'unified_chat_send');
  assert.equal(call.args.continueMessageId, 'stopped-answer');
  assert.equal(call.args.reasoningMode, 'normal');
  assert.equal(call.args.attachmentIds.length, 0);
  assert.equal(f.state.draft, 'Hello');
  assert.equal(
    f.calls.some(c => c.name === 'create_project_chat'),
    false
  );
}
console.log('Continue: target answer and reasoning mode forwarded; draft attachments kept separate.');

{
  const f = fixture({chat: 'existing'});
  f.ctx.modelChoice = 'codex/test-model';
  f.ctx.modelChoices = [{id: 'codex/test-model', provider: 'codex', model: 'test-model'}];
  f.ctx.routeOptions.models = f.ctx.modelChoices;
  const p = f.ctx.sendChat();
  f.release();
  await p;
  assert.equal(f.calls.find(c => c.name === 'unified_chat_send').args.modelChoice, 'codex/test-model');
}
{
  const f = fixture({chat: 'existing'});
  f.ctx.modelChoice = 'codex/missing';
  await f.ctx.sendChat();
  assert.equal(f.calls.length, 0);
  assert.match(f.state.error, /недоступна/);
}
console.log('Manual model: selected model forwarded and unavailable selection is never silently replaced.');

{
  const f = fixture({chat: 'existing'});
  f.ctx.teamMode = 'team';
  f.ctx.chatDraft = '- Напиши код\n- Переведи текст';
  const p = f.ctx.sendChat();
  f.release();
  await p;
  const call = f.calls.find(c => c.name === 'unified_chat_send');
  assert.equal(call.args.teamSteps.length, 2);
  assert.equal(call.args.teamSteps[1].dependsOn[0], 1);
}
{
  const f = fixture({chat: 'existing'});
  f.ctx.teamMode = 'team';
  const p = f.ctx.sendChat('Продолжить', 'stopped-answer');
  f.release();
  await p;
  assert.equal(f.calls.find(c => c.name === 'unified_chat_send').args.teamSteps, null);
}
console.log('Team send: plan reaches backend; continuation does not replay specialists.');
{
  // Regenerate: separate command, no new user message, the draft is left alone.
  const f = fixture({chat: 'chat'});
  f.state.draft = 'Unsent draft';
  f.state.messages = [
    {id: 'user', role: 'user', content: 'Hello'},
    {id: 'answer', role: 'assistant', content: 'Reply'},
  ];
  await f.ctx.sendChat('Hello', 'answer', true);
  const call = f.calls.find(c => c.name === 'regenerate_chat_answer');
  assert.ok(call, 'regenerate command used');
  assert.equal(call.args.messageId, 'answer');
  assert.ok(!f.calls.some(c => c.name === 'unified_chat_send'), 'no ordinary send');
  assert.equal(f.state.draft, 'Unsent draft', 'draft untouched');
  assert.ok(!f.state.messages.some(m => String(m.id).startsWith('pending-')), 'no pending user message');
  console.log('Chat regenerate: separate command, draft and history preserved passed.');
}
