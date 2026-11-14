// Message rendering pieces used by App: markdown, answer details, message actions and the inline editor.
import {AgentConnectionCard} from './agent-connection-card.jsx';
import {useToastOn} from './toaster.jsx';
import {countLabel} from './locale-format.js';
import {legacyQuestionSelection, filePathRef} from './chat-files.js';
import {QuestionCard, normalizeQuestions} from './chat-extras.jsx';
import {
  Reply,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Bookmark,
  BookmarkCheck,
  RotateCcw,
  Pencil,
  CornerDownLeft,
} from 'lucide-react';
import {NexusWidget, MermaidBlock, Blockquote} from './answer-widgets.jsx';
import {CodeBlock, TableBlock, VariantSwitcher} from './chat-tools.jsx';
import {messageDate, responseDetails, effortLabel} from './chat-message.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React, {useEffect, useState, useRef, useContext, createContext} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {loc} from './i18n.js';

const ChatQuestionContext = createContext({allowQuestion: false});
function MarkdownCode({className, children, ...props}) {
  const {allowQuestion, onQuestion, selections, legacyReply, agentContext} = useContext(ChatQuestionContext),
    lang = (className || '').replace('language-', '');
  if (lang === 'nexus-agent') {
    try {
      return <AgentConnectionCard manifest={JSON.parse(String(children))} context={agentContext} />;
    } catch {
      return <p>{loc('Параметры агента повреждены.')}</p>;
    }
  }
  if (lang === 'nexus-question') {
    try {
      const block = String(children).trim(),
        question = JSON.parse(block),
        savedAnswers =
          selections?.[block] || legacyQuestionSelection(question.questions || question, legacyReply);
      return (
        <QuestionCard
          questions={question.questions || question}
          savedAnswers={savedAnswers}
          disabled={!allowQuestion || !!savedAnswers}
          onSubmit={values =>
            onQuestion(
              Object.entries(values)
                .map(([id, v]) => {
                  const q = normalizeQuestions(question.questions || question).find(q => q.id === id);
                  return (q?.question || loc('Выбор')) + ': ' + v.answers.join(', ');
                })
                .join('\n'),
              {block, answers: values}
            )
          }
        />
      );
    } catch {
      return null;
    }
  }
  if (lang === 'nexus-widget') {
    try {
      return <NexusWidget data={JSON.parse(String(children))} source={String(children)} />;
    } catch {
      return <pre className="widget-error">Widget data invalid</pre>;
    }
  }
  // A file path in inline code opens in the side panel.
  const ref = !className && typeof children === 'string' ? filePathRef(children) : null;
  if (ref)
    return (
      <button
        type="button"
        className="file-link"
        title={loc('Открыть файл справа')}
        onClick={() => openFile(ref)}
      >
        <code {...props}>{children}</code>
      </button>
    );
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}
function safeDecode(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}
function openFile(ref) {
  window.dispatchEvent(new CustomEvent('nexus-open-file', {detail: ref}));
}
const markdownComponents = {
  pre: ({children}) => {
    const child = React.Children.toArray(children)[0],
      lang = child?.props?.className || '';
    if (/language-mermaid\b/.test(lang))
      return <MermaidBlock code={String(child.props.children ?? '').replace(/\n$/, '')} />;
    return /language-nexus-(question|widget|agent)/.test(lang) ? (
      <>{children}</>
    ) : (
      <CodeBlock className={child?.props?.className}>{child?.props?.children}</CodeBlock>
    );
  },
  table: TableBlock,
  blockquote: Blockquote,
  a: ({href, children}) => {
    const ref = !/^https?:\/\//i.test(href || '') ? filePathRef(safeDecode(href || '')) : null;
    if (ref)
      return (
        <a
          href="#"
          className="file-link"
          onClick={e => {
            e.preventDefault();
            openFile(ref);
          }}
        >
          {children}
        </a>
      );
    return (
      <a href={/^https:\/\//.test(href || '') ? href : undefined} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  code: MarkdownCode,
};
export function ChatMarkdown({
  content,
  onQuestion,
  allowQuestion = false,
  selections,
  legacyReply,
  agentContext,
}) {
  return (
    <ChatQuestionContext.Provider value={{onQuestion, allowQuestion, selections, legacyReply, agentContext}}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content || ''}
      </ReactMarkdown>
    </ChatQuestionContext.Provider>
  );
}

export function ResponseDetails({raw}) {
  const {rows} = responseDetails(raw);
  return (
    <details className="response-details activity-details">
      <summary>
        {loc('Ход ответа и детали ·')} {countLabel(rows.length, loc('этап'), loc('этапа'), loc('этапов'))}
      </summary>
      <div className="activity-list">
        {rows.map((row, i) => (
          <div className="activity-row" key={i}>
            {row.body ? (
              <details>
                <summary>{row.title}</summary>
                <pre>{row.body}</pre>
              </details>
            ) : (
              <span>{row.title}</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
export function MessageActions({
  message,
  onReply,
  onUpdate,
  bookmarked,
  onBookmark,
  canRegenerate,
  onRegenerate,
  locked,
}) {
  const [copied, setCopied] = useState(false),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  useToastOn(actionError, () => setActionError(''), 'error');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const date = messageDate(message.createdAt),
    {model, effort} = responseDetails(message.details || '');
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setActionError(loc('Не удалось скопировать ответ'));
    }
  }
  async function selectVariant(index) {
    if (busy || locked) return;
    setBusy(true);
    setActionError('');
    try {
      onUpdate(
        await invoke('select_message_variant', {chatId: message.chatId, messageId: message.id, index})
      );
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function rate(value) {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      const updated = await invoke('rate_chat_message', {
        chatId: message.chatId,
        messageId: message.id,
        rating: message.rating === value ? null : value,
      });
      onUpdate(updated);
    } catch {
      setActionError(loc('Не удалось сохранить оценку'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="message-footer">
      <div className="message-actions" role="group" aria-label={loc('Действия с ответом')}>
        <button
          type="button"
          title={loc('Ответить с цитатой')}
          aria-label={loc('Ответить с цитатой')}
          onClick={() => onReply(message)}
        >
          <Reply size={15} />
        </button>
        <button
          type="button"
          title={copied ? loc('Скопировано') : loc('Копировать ответ')}
          aria-label={copied ? loc('Скопировано') : loc('Копировать ответ')}
          onClick={copy}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <button
          type="button"
          disabled={busy}
          title={loc('Полезный ответ')}
          aria-label={loc('Полезный ответ')}
          aria-pressed={message.rating === 1}
          onClick={() => rate(1)}
        >
          <ThumbsUp size={15} />
        </button>
        <button
          type="button"
          disabled={busy}
          title={loc('Неполезный ответ')}
          aria-label={loc('Неполезный ответ')}
          aria-pressed={message.rating === -1}
          onClick={() => rate(-1)}
        >
          <ThumbsDown size={15} />
        </button>
        <button
          type="button"
          title={bookmarked ? loc('Убрать закладку') : loc('Добавить в закладки чата')}
          aria-label={bookmarked ? loc('Убрать закладку') : loc('Добавить в закладки')}
          aria-pressed={bookmarked}
          onClick={() => onBookmark(message)}
        >
          {bookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
        </button>
        {canRegenerate && (
          <button
            type="button"
            disabled={locked}
            title={loc(
              'Повторить ответ с текущей моделью — новый вызов, расходует квоту. Прежний ответ сохранится как вариант.'
            )}
            aria-label={loc('Повторить ответ')}
            onClick={() => onRegenerate(message)}
          >
            <RotateCcw size={15} />
          </button>
        )}
        <VariantSwitcher message={message} disabled={busy || locked} onSelect={selectVariant} />
        {date && (
          <time dateTime={date.toISOString()} title={date.toLocaleString()}>
            <Clock size={12} />
            {date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
          </time>
        )}
        {model && (
          <span className="message-model" title={loc('Модель ответа: ') + model}>
            {model}
          </span>
        )}
        {effort && (
          <span className="message-mode" title={loc('Режим рассуждений')}>
            {effortLabel(effort)}
          </span>
        )}
      </div>
    </div>
  );
}

export function UserActions({message, canEdit, locked, onEdit, onToComposer, bookmarked, onBookmark}) {
  const [copied, setCopied] = useState(false),
    timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {}
  }
  const date = messageDate(message.createdAt);
  return (
    <div className="message-footer user-footer">
      <div className="message-actions" role="group" aria-label={loc('Действия с сообщением')}>
        {message.edited && (
          <span className="message-edited" title={loc('Запрос изменён после отправки')}>
            {loc('изменено')}
          </span>
        )}
        {date && (
          <time dateTime={date.toISOString()} title={date.toLocaleString()}>
            {date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
          </time>
        )}
        <button
          type="button"
          title={copied ? loc('Скопировано') : loc('Копировать')}
          aria-label={copied ? loc('Скопировано') : loc('Копировать сообщение')}
          onClick={copy}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        {canEdit && (
          <button
            type="button"
            disabled={locked}
            title={loc('Изменить запрос и получить новый ответ')}
            aria-label={loc('Изменить запрос')}
            onClick={() => onEdit(message)}
          >
            <Pencil size={15} />
          </button>
        )}
        <button
          type="button"
          title={loc('Вставить текст в поле ввода')}
          aria-label={loc('Вставить в поле ввода')}
          onClick={() => onToComposer(message)}
        >
          <CornerDownLeft size={15} />
        </button>
        <button
          type="button"
          title={bookmarked ? loc('Убрать закладку') : loc('Добавить в закладки чата')}
          aria-label={bookmarked ? loc('Убрать закладку') : loc('Добавить в закладки')}
          aria-pressed={bookmarked}
          onClick={() => onBookmark(message)}
        >
          {bookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
        </button>
      </div>
    </div>
  );
}

export function MessageEditor({message, onSave, onCancel, busy}) {
  const [text, setText] = useState(message.content.replace(/^Ответ на сообщение NEXUS:\n(?:> .*\n)*\n/, '')),
    area = useRef(null);
  useEffect(() => {
    const el = area.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);
  return (
    <form
      className="message-editor"
      onSubmit={e => {
        e.preventDefault();
        if (text.trim()) onSave(text);
      }}
    >
      <textarea
        ref={area}
        aria-label={loc('Изменить запрос')}
        value={text}
        maxLength={12000}
        rows={Math.min(12, Math.max(3, text.split('\n').length))}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (text.trim()) onSave(text);
          }
        }}
      />
      <div>
        <small>
          {loc('Новый ответ заменит текущий на экране, прежний останется вариантом. ⌘Enter — отправить.')}
        </small>
        <button type="button" onClick={onCancel} disabled={busy}>
          {loc('Отмена')}
        </button>
        <button type="submit" className="primary" disabled={busy || !text.trim()}>
          {loc('Отправить')}
        </button>
      </div>
    </form>
  );
}
