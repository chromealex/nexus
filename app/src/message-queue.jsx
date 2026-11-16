import React, {useCallback, useEffect, useState} from 'react';
import {X, Pencil, Zap, Check} from 'lucide-react';
import {loc} from './i18n.js';
import {readQueue, writeQueue, enqueue, dequeue, updateQueued, moveFirst} from './message-queue.js';
import {countLabel} from './locale-format.js';

export function useMessageQueue() {
  const [queue, setQueue] = useState(() => readQueue(globalThis.localStorage));
  useEffect(() => writeQueue(globalThis.localStorage, queue), [queue]);
  return {
    queue,
    items: useCallback(chatId => queue[chatId] || [], [queue]),
    add: (chatId, text, options) => setQueue(q => enqueue(q, chatId, text, options)),
    remove: (chatId, id) => setQueue(q => dequeue(q, chatId, id)),
    update: (chatId, id, text) => setQueue(q => updateQueued(q, chatId, id, text)),
    first: (chatId, id) => setQueue(q => moveFirst(q, chatId, id)),
  };
}

// Queued messages above the composer. «Прервать и отправить» stops the current answer (its text is kept)
// and sends this message next — the way to redirect an agent mid-answer.
export function MessageQueue({chatId, queue, generating, onSteer}) {
  const items = queue.items(chatId),
    [editing, setEditing] = useState(null),
    [draft, setDraft] = useState('');
  if (!items.length) return null;
  return (
    <div className="message-queue" role="list" aria-label={loc('Очередь сообщений')}>
      <small>
        {generating
          ? loc(
              'В очереди {0} — отправятся по одному после текущего ответа',
              countLabel(items.length, loc('сообщение'), loc('сообщения'), loc('сообщений'))
            )
          : loc('Отправляю сообщения из очереди…')}
      </small>
      {items.map(item => (
        <div className="message-queue-item" role="listitem" key={item.id}>
          {editing === item.id ? (
            <>
              <textarea
                value={draft}
                autoFocus
                aria-label={loc('Текст сообщения в очереди')}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    queue.update(chatId, item.id, draft);
                    setEditing(null);
                  }
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
              <button
                type="button"
                aria-label={loc('Сохранить')}
                onClick={() => {
                  queue.update(chatId, item.id, draft);
                  setEditing(null);
                }}
              >
                <Check size={12} />
              </button>
            </>
          ) : (
            <>
              <span title={item.text}>{item.text}</span>
              {generating && (
                <button
                  type="button"
                  title={loc('Остановить текущий ответ и сразу отправить это сообщение')}
                  onClick={() => {
                    queue.first(chatId, item.id);
                    onSteer();
                  }}
                >
                  <Zap size={12} aria-hidden="true" />
                  {loc('Прервать и отправить')}
                </button>
              )}
              <button
                type="button"
                aria-label={loc('Изменить')}
                title={loc('Изменить')}
                onClick={() => {
                  setDraft(item.text);
                  setEditing(item.id);
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                aria-label={loc('Убрать из очереди')}
                title={loc('Убрать из очереди')}
                onClick={() => queue.remove(chatId, item.id)}
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
