import React from 'react';
import {Info, ChevronRight, X} from 'lucide-react';
import {loc} from './i18n.js';
export function ChatNotice({message, onConnections, onClose}) {
  if (!message) return null;
  return (
    <section className="chat-notice" aria-label={loc('Уведомление чата')}>
      <Info className="chat-notice-icon" size={17} aria-hidden="true" />
      <div className="chat-notice-body">
        <div className="chat-notice-title" role="status">
          {loc('Не удалось продолжить')}
        </div>
        <details>
          <summary>
            {loc('Подробнее')} <ChevronRight size={12} aria-hidden="true" />
          </summary>
          <p>{message}</p>
        </details>
      </div>
      <button type="button" className="chat-notice-action" onClick={onConnections}>
        {loc('Подключения')} <ChevronRight size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="chat-notice-close"
        aria-label={loc('Закрыть уведомление')}
        onClick={onClose}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </section>
  );
}
