import React from 'react';
import {Info, ChevronRight, X} from 'lucide-react';
export function ChatNotice({message, onConnections, onClose}) {
  if (!message) return null;
  return (
    <section className="chat-notice" aria-label="Уведомление чата">
      <Info className="chat-notice-icon" size={17} aria-hidden="true" />
      <div className="chat-notice-body">
        <div className="chat-notice-title" role="status">
          Не удалось продолжить
        </div>
        <details>
          <summary>
            Подробнее <ChevronRight size={12} aria-hidden="true" />
          </summary>
          <p>{message}</p>
        </details>
      </div>
      <button type="button" className="chat-notice-action" onClick={onConnections}>
        Подключения <ChevronRight size={13} aria-hidden="true" />
      </button>
      <button type="button" className="chat-notice-close" aria-label="Закрыть уведомление" onClick={onClose}>
        <X size={15} aria-hidden="true" />
      </button>
    </section>
  );
}
