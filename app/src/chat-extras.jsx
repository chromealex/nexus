import {previewKind, normalizeQuestions, restoreQuestionSelection} from './chat-files.js';
import {useToastOn} from './toaster.jsx';
export {normalizeQuestions} from './chat-files.js';
import React, {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {File, X, Download, Image as ImageIcon} from 'lucide-react';
import {loc} from './i18n.js';
function useFile(file, enabled) {
  const [state, setState] = useState({});
  useEffect(() => {
    if (!enabled) return;
    let live = true,
      url;
    setState({loading: true});
    invoke('read_attachment', {id: file.id})
      .then(data => {
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const kind = previewKind(file);
        const mime =
          kind === 'pdf'
            ? 'application/pdf'
            : kind === 'image'
              ? file.mime || 'image/' + file.name.split('.').pop()
              : file.mime || 'application/octet-stream';
        url = URL.createObjectURL(new Blob([bytes], {type: mime}));
        if (live)
          setState({
            url,
            text: kind === 'text' ? new TextDecoder().decode(bytes.slice(0, 200000)) : null,
            truncated: kind === 'text' && bytes.length > 200000,
          });
        else URL.revokeObjectURL(url);
      })
      .catch(e => live && setState({error: String(e)}));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, enabled]);
  return state;
}
export function FileTile({file, onOpen, onRemove}) {
  const kind = previewKind(file),
    preview = useFile(file, kind === 'image');
  return (
    <div className="file-tile">
      <button
        type="button"
        className="file-open"
        onClick={() => onOpen(file)}
        title={loc('Предпросмотр: ') + file.name}
      >
        {preview.url ? (
          <img src={preview.url} alt="" />
        ) : kind === 'image' ? (
          <ImageIcon size={23} />
        ) : (
          <File size={23} />
        )}
        <span>
          <strong>{file.name}</strong>
          <small>
            {Math.max(1, Math.round(file.size / 1024))} {loc('КБ ·')}{' '}
            {file.name.split('.').pop()?.toUpperCase() || loc('Файл')}
          </small>
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="remove-attachment"
          aria-label={loc('Убрать ') + file.name}
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function FilePreview({file, onClose}) {
  const state = useFile(file, true),
    kind = previewKind(file);
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const before = document.activeElement;
    document.querySelector('.file-preview-close')?.focus();
    return () => {
      document.removeEventListener('keydown', handler);
      before?.focus?.();
    };
  }, [file.id]);
  return (
    <div
      className="file-preview-overlay"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="file-preview"
        role="dialog"
        aria-modal="true"
        aria-label={file.name}
        onKeyDown={e => {
          if (e.key === 'Tab') {
            const controls = [...e.currentTarget.querySelectorAll('button,a[href],audio,video,iframe')];
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
        }}
      >
        <header>
          <div>
            <strong>{file.name}</strong>
            <small>
              {Math.max(1, Math.round(file.size / 1024))} {loc('КБ')}
            </small>
          </div>
          {state.url && (
            <a href={state.url} download={file.name} title={loc('Скачать файл')}>
              <Download size={18} />
            </a>
          )}
          <button
            type="button"
            className="file-preview-close"
            aria-label={loc('Закрыть предпросмотр')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className={'file-preview-content ' + kind}>
          {state.loading ? (
            loc('Загрузка предпросмотра…')
          ) : state.error ? (
            <p role="alert">{state.error}</p>
          ) : state.url ? (
            <>
              {kind === 'image' ? (
                <img src={state.url} alt={file.name} />
              ) : kind === 'pdf' ? (
                <iframe title={file.name} src={state.url} />
              ) : kind === 'audio' ? (
                <audio controls src={state.url} />
              ) : kind === 'video' ? (
                <video controls src={state.url} />
              ) : kind === 'text' ? (
                <>
                  <pre>{state.text}</pre>
                  {state.truncated && (
                    <p>{loc('Показаны первые 200 КБ. Полный файл доступен для скачивания.')}</p>
                  )}
                </>
              ) : (
                <div className="file-no-preview">
                  <File size={52} />
                  <p>{loc('Для этого формата встроенный предпросмотр недоступен.')}</p>
                  <a href={state.url} download={file.name}>
                    {loc('Скачать')} {file.name}
                  </a>
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
export function QuestionCard({questions, onSubmit, disabled = false, onCancel, savedAnswers}) {
  const rows = normalizeQuestions(questions),
    restored = restoreQuestionSelection(questions, savedAnswers),
    [answers, setAnswers] = useState(restored.answers),
    [own, setOwn] = useState(restored.own),
    [custom, setCustom] = useState(restored.custom),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useToastOn(error, () => setError(''), 'error');
  const lock = React.useRef(false),
    groupId = React.useId();
  useEffect(() => {
    if (savedAnswers) {
      const value = restoreQuestionSelection(questions, savedAnswers);
      setAnswers(value.answers);
      setOwn(value.own);
      setCustom(value.custom);
    }
  }, [savedAnswers]);
  if (!rows.length) return null;
  const valuesFor = (q, values = answers) => [
    ...(values[q.id] || []),
    ...(own[q.id] && custom[q.id]?.trim() ? [custom[q.id].trim()] : []),
  ];
  async function submitValues(values) {
    if (lock.current || disabled || rows.some(q => !valuesFor(q, values).length)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onSubmit(Object.fromEntries(rows.map(q => [q.id, {answers: valuesFor(q, values)}])));
    } catch (e) {
      setError(String(e));
      setBusy(false);
      lock.current = false;
    }
  }
  function choose(q, label) {
    const selected = answers[q.id] || [];
    const next = {
      ...answers,
      [q.id]: q.multiple
        ? selected.includes(label)
          ? selected.filter(v => v !== label)
          : [...selected, label]
        : [label],
    };
    setAnswers(next);
    if (!q.multiple) {
      setOwn(v => ({...v, [q.id]: false}));
      if (rows.length === 1) {
        if (lock.current || disabled) return;
        lock.current = true;
        setBusy(true);
        setError('');
        Promise.resolve(onSubmit({[q.id]: {answers: [label]}})).catch(e => {
          setError(String(e));
          setBusy(false);
          lock.current = false;
        });
      }
    }
  }
  return (
    <form
      className="agent-question compact-question"
      onSubmit={e => {
        e.preventDefault();
        submitValues(answers);
      }}
    >
      {rows.map(q => (
        <fieldset key={q.id} disabled={disabled || busy}>
          <legend>
            {q.question}
            {q.multiple && <small className="multiple-hint">{loc('Можно выбрать несколько')}</small>}
          </legend>
          <div
            className="question-options"
            role={q.multiple ? 'group' : 'radiogroup'}
            aria-label={q.question}
          >
            {q.options.map(o => (
              <label
                className={'question-option ' + ((answers[q.id] || []).includes(o.label) ? 'selected' : '')}
                key={o.label}
              >
                <input
                  type={q.multiple ? 'checkbox' : 'radio'}
                  name={groupId + '-' + q.id}
                  checked={(answers[q.id] || []).includes(o.label)}
                  onChange={() => choose(q, o.label)}
                />
                <span>
                  {o.label}
                  {o.description && <small>{o.description}</small>}
                </span>
              </label>
            ))}
            {q.options.length > 0 && (
              <button
                type="button"
                className="own-choice"
                aria-expanded={!!own[q.id]}
                onClick={() => {
                  setOwn(v => ({...v, [q.id]: !v[q.id]}));
                  if (!q.multiple) setAnswers(v => ({...v, [q.id]: []}));
                }}
              >
                {loc('Свой вариант')}
              </button>
            )}
          </div>
          {(own[q.id] || !q.options.length) && (
            <input
              autoFocus
              aria-label={loc('Свой ответ: ') + q.question}
              type={q.isSecret ? 'password' : 'text'}
              placeholder={loc('Ваш ответ')}
              maxLength={2000}
              value={custom[q.id] || ''}
              onChange={e => {
                setCustom(v => ({...v, [q.id]: e.target.value}));
                if (!q.options.length) setOwn(v => ({...v, [q.id]: true}));
              }}
            />
          )}
        </fieldset>
      ))}
      {(rows.length > 1 ||
        rows.some(q => q.multiple) ||
        Object.values(own).some(Boolean) ||
        rows.some(q => !q.options.length) ||
        onCancel) && (
        <div className="question-actions">
          {(rows.length > 1 ||
            rows.some(q => q.multiple) ||
            Object.values(own).some(Boolean) ||
            rows.some(q => !q.options.length)) && (
            <button type="submit" disabled={disabled || busy || rows.some(q => !valuesFor(q).length)}>
              {disabled ? loc('Отправлено') : busy ? loc('Отправляю…') : loc('Продолжить')}
            </button>
          )}
          {onCancel && (
            <button type="button" disabled={busy} onClick={onCancel}>
              {loc('Отмена')}
            </button>
          )}
        </div>
      )}
      {busy && !disabled && <small>{loc('Отправляю…')}</small>}
    </form>
  );
}
