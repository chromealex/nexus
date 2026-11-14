import React, {useEffect, useRef, useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {invoke} from '@tauri-apps/api/core';
import {X, RotateCcw, MessageSquare, Archive, Trash2} from 'lucide-react';
import {FadeLabel} from './fade-label.jsx';
import {loc} from './i18n.js';
export function SavedChats({kind, projects, onClose, onRestore}) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  useToastOn(error, () => setError(''), 'error');
  const dialog = useRef(null),
    lastFocus = useRef(document.activeElement),
    saving = useRef(false);
  useEffect(() => {
    let live = true;
    invoke('list_saved_chats', {kind})
      .then(r => live && setRows(r))
      .catch(e => live && setError(String(e)));
    dialog.current?.querySelector('button')?.focus();
    const key = e => {
      if (e.key === 'Escape' && !saving.current) onClose();
      if (e.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button')].filter(
          el => !el.disabled && el.getClientRects().length
        );
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      live = false;
      document.removeEventListener('keydown', key);
      lastFocus.current?.focus();
    };
  }, [kind]);
  async function restore(chat) {
    if (saving.current) return;
    saving.current = true;
    setBusy(chat.id);
    try {
      await invoke('change_chat_state', {chatId: chat.id, action: 'restore'});
      await onRestore(chat);
    } catch (e) {
      setError(String(e));
    } finally {
      saving.current = false;
      setBusy('');
    }
  }
  return (
    <div
      className="settings-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !saving.current) onClose();
      }}
    >
      <section
        className="saved-chats-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={kind === 'archive' ? loc('Архив чатов') : loc('Корзина чатов')}
      >
        <div className="settings-header">
          <div>
            <h2>{kind === 'archive' ? loc('Архив') : loc('Корзина')}</h2>
            <p>
              {kind === 'archive'
                ? loc('Архивные чаты скрыты из дерева.')
                : loc('Удалённые чаты и их сообщения можно восстановить.')}
            </p>
          </div>
          <button aria-label={loc('Закрыть список чатов')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="saved-chat-list">
          {rows
            .filter(c => !rows.some(p => p.id === c.parentChatId))
            .map(c => (
              <article className="saved-chat-row" key={c.id}>
                <MessageSquare size={17} />
                <div>
                  <FadeLabel>{c.title}</FadeLabel>
                  <small>
                    {projects.find(p => p.id === c.projectId)?.name || loc('Проект')}
                    {rows.some(x => x.parentChatId === c.id) ? loc(' · с подчатами') : ''}
                  </small>
                </div>
                <button disabled={!!busy} onClick={() => restore(c)}>
                  <RotateCcw size={14} />
                  {busy === c.id ? loc('Восстанавливаю…') : loc('Восстановить')}
                </button>
              </article>
            ))}
          {!rows.length && !error && (
            <div className="saved-chats-empty">
              {kind === 'archive' ? (
                <Archive size={26} aria-hidden="true" />
              ) : (
                <Trash2 size={26} aria-hidden="true" />
              )}
              <strong>{kind === 'archive' ? loc('В архиве пока нет чатов') : loc('Корзина пуста')}</strong>
              <p>
                {kind === 'archive'
                  ? loc(
                      'Чтобы убрать чат из дерева, не удаляя его, откройте меню «…» у чата и выберите «Архивировать». Отсюда его можно вернуть в любой момент.'
                    )
                  : loc(
                      'Сюда попадают чаты, удалённые через меню «…». Сообщения сохраняются, чат можно восстановить вместе с подчатами.'
                    )}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
