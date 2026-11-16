// Messages written while an answer is being generated wait in a per-chat queue and are sent one by one
// when the chat is idle. The queue survives a restart (localStorage, best effort). Pure logic, tested without React.
export const QUEUE_KEY = 'nexus-message-queue';
export const QUEUE_LIMIT = 20;

export function readQueue(storage) {
  try {
    const value = JSON.parse(storage?.getItem(QUEUE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
export function writeQueue(storage, queue) {
  try {
    const clean = Object.fromEntries(Object.entries(queue).filter(([, items]) => items?.length));
    storage?.setItem(QUEUE_KEY, JSON.stringify(clean));
  } catch {}
}

let sequence = 0;
export function enqueue(queue, chatId, text, {front = false} = {}) {
  const value = String(text || '').trim();
  if (!chatId || !value) return queue;
  const item = {id: 'q' + Date.now().toString(36) + (++sequence).toString(36), text: value};
  const list = queue[chatId] || [];
  if (list.length >= QUEUE_LIMIT) return queue;
  return {...queue, [chatId]: front ? [item, ...list] : [...list, item]};
}
export function dequeue(queue, chatId, id) {
  const list = (queue[chatId] || []).filter(item => item.id !== id);
  return {...queue, [chatId]: list};
}
export function updateQueued(queue, chatId, id, text) {
  const value = String(text || '').trim();
  if (!value) return dequeue(queue, chatId, id);
  return {
    ...queue,
    [chatId]: (queue[chatId] || []).map(item => (item.id === id ? {...item, text: value} : item)),
  };
}
export function moveFirst(queue, chatId, id) {
  const list = queue[chatId] || [],
    item = list.find(i => i.id === id);
  return item ? {...queue, [chatId]: [item, ...list.filter(i => i.id !== id)]} : queue;
}
