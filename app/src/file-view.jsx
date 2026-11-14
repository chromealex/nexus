import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {invoke} from '@tauri-apps/api/core';
import {Copy, Check, FolderOpen, ExternalLink, Download, File as FileIcon} from 'lucide-react';
import {fileKind, parseDelimited, languageForFile} from './chat-files.js';
import {languageOf, tokenize} from './code-highlight.js';
import {ChatMarkdown} from './chat-message-view.jsx';
import {loc} from './i18n.js';

const TEXT_LIMIT = 1_000_000;
const APP_TYPES =
  /\.(pdf|png|jpe?g|gif|webp|heic|svg|txt|md|csv|tsv|json|rtf|docx?|xlsx?|pptx?|pages|numbers|key|odt|ods|odp|mp3|wav|m4a|mp4|mov|webm)$/i;

function bytesOf(base64) {
  const bin = atob(base64),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const MIMES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

// Loads a chat attachment or a project file and keeps a blob URL / decoded text for the viewer.
function useFileData(file, chatId) {
  const [state, setState] = useState({loading: true});
  useEffect(() => {
    let live = true,
      url = null;
    setState({loading: true});
    (async () => {
      try {
        const res =
          file.source === 'attachment'
            ? {
                data: await invoke('read_attachment', {id: file.id}),
                name: file.name,
                size: file.size,
                mime: file.mime,
              }
            : await invoke('read_project_file', {chatId, path: file.path});
        const bytes = bytesOf(res.data);
        const name = res.name || file.name,
          ext = name.split('.').pop().toLowerCase(),
          mime = file.mime || MIMES[ext] || 'application/octet-stream',
          kind = fileKind(name, file.mime);
        url = URL.createObjectURL(new Blob([bytes], {type: mime}));
        const textual = ['markdown', 'html', 'table', 'json', 'code', 'svg'].includes(kind);
        const text = textual
          ? new TextDecoder('utf-8', {fatal: false}).decode(bytes.subarray(0, TEXT_LIMIT))
          : '';
        if (live)
          setState({
            loading: false,
            url,
            text,
            truncated: textual && bytes.length > TEXT_LIMIT,
            kind,
            name,
            display: res.display || name,
            path: res.path || null,
            size: res.size ?? bytes.length,
            line: file.line || res.line || null,
          });
      } catch (e) {
        if (live) setState({loading: false, error: String(e)});
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.key, chatId]);
  return state;
}

function CodeLines({text, name, line}) {
  const box = useRef(null);
  const lines = useMemo(() => {
    const {family} = languageOf(languageForFile(name));
    const out = [[]];
    for (const token of tokenize(text, family)) {
      const parts = token.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) out.push([]);
        if (part) out.at(-1).push({...token, text: part});
      });
    }
    return out;
  }, [text, name]);
  useEffect(() => {
    if (!line) return;
    box.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({block: 'center'});
  }, [line, lines]);
  return (
    <div className="file-code" ref={box}>
      {lines.map((tokens, i) => (
        <div key={i} data-line={i + 1} className={'file-code-line' + (line === i + 1 ? ' is-target' : '')}>
          <span className="file-code-no" aria-hidden="true">
            {i + 1}
          </span>
          <code>
            {tokens.map((t, j) =>
              t.type === 'plain' ? (
                <React.Fragment key={j}>{t.text}</React.Fragment>
              ) : (
                <span key={j} className={'tok-' + t.type}>
                  {t.text}
                </span>
              )
            )}
            {'\n'}
          </code>
        </div>
      ))}
    </div>
  );
}

function TableView({text, name}) {
  const rows = useMemo(
    () => parseDelimited(text, name.toLowerCase().endsWith('.tsv') ? '\t' : ',', 501),
    [text, name]
  );
  if (!rows.length) return <p className="file-empty">{loc('Пустая таблица')}</p>;
  const [head, ...body] = rows;
  return (
    <div className="file-table">
      <table>
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.slice(0, 500).map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && <p className="file-empty">{loc('Показаны первые 500 строк.')}</p>}
    </div>
  );
}

// One file in the side panel: rendered view where it makes sense, the source otherwise.
export function FileView({file, chatId}) {
  const state = useFileData(file, chatId);
  const [source, setSource] = useState(false),
    [copied, setCopied] = useState(false),
    [message, setMessage] = useState('');
  useToastOn(message, () => setMessage(''), 'error');
  useEffect(() => {
    setSource(false);
    setMessage('');
  }, [file.key]);
  const pretty = useMemo(() => {
    if (state.kind !== 'json') return '';
    try {
      return JSON.stringify(JSON.parse(state.text), null, 2);
    } catch {
      return state.text;
    }
  }, [state.kind, state.text]);
  if (state.loading) return <div className="file-view is-empty">{loc('Загрузка…')}</div>;
  if (state.error)
    return (
      <div className="file-view is-empty">
        <FileIcon size={26} aria-hidden="true" />
        <p role="alert">{state.error}</p>
      </div>
    );
  const project = file.source !== 'attachment';
  const reveal = open =>
    invoke('reveal_project_file', {chatId, path: state.path || file.path, open}).catch(e =>
      setMessage(String(e))
    );
  const canRender = ['markdown', 'html', 'svg', 'table'].includes(state.kind);
  const kb = Math.max(1, Math.round(state.size / 1024));
  return (
    <div className="file-view">
      <div className="file-view-bar">
        <span className="file-view-path" title={state.path || state.display}>
          {state.display}
          <small>
            {' '}
            · {kb} {loc('КБ')}
          </small>
        </span>
        {canRender && (
          <span className="file-view-toggle" role="group" aria-label={loc('Вид файла')}>
            <button type="button" className={!source ? 'is-active' : ''} onClick={() => setSource(false)}>
              {loc('Просмотр')}
            </button>
            <button type="button" className={source ? 'is-active' : ''} onClick={() => setSource(true)}>
              {loc('Код')}
            </button>
          </span>
        )}
        {state.text && (
          <button
            type="button"
            title={loc('Копировать содержимое')}
            aria-label={loc('Копировать содержимое')}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
        {project ? (
          <>
            {APP_TYPES.test(state.name) && (
              <button
                type="button"
                title={loc('Открыть в приложении')}
                aria-label={loc('Открыть в приложении')}
                onClick={() => reveal(true)}
              >
                <ExternalLink size={14} />
              </button>
            )}
            <button
              type="button"
              title={loc('Показать в Finder')}
              aria-label={loc('Показать в Finder')}
              onClick={() => reveal(false)}
            >
              <FolderOpen size={14} />
            </button>
          </>
        ) : (
          <a href={state.url} download={state.name} title={loc('Скачать')} aria-label={loc('Скачать')}>
            <Download size={14} />
          </a>
        )}
      </div>
      <div className={'file-view-body is-' + state.kind}>
        {state.kind === 'image' ? (
          <img src={state.url} alt={state.name} />
        ) : state.kind === 'svg' && !source ? (
          <img src={state.url} alt={state.name} />
        ) : state.kind === 'pdf' ? (
          <iframe title={state.name} src={state.url} />
        ) : state.kind === 'audio' ? (
          <audio controls src={state.url} />
        ) : state.kind === 'video' ? (
          <video controls src={state.url} />
        ) : state.kind === 'markdown' && !source ? (
          <div className="file-markdown chat-markdown">
            <ChatMarkdown content={state.text} />
          </div>
        ) : state.kind === 'html' && !source ? (
          <>
            {/* No scripts, forms or same-origin access: the page is only drawn. */}
            <iframe className="file-html" title={state.name} sandbox="" srcDoc={state.text} />
            <p className="file-view-note">
              {loc('Скрипты страницы отключены — показана только разметка и стили.')}
            </p>
          </>
        ) : state.kind === 'table' && !source ? (
          <TableView text={state.text} name={state.name} />
        ) : state.kind === 'json' ? (
          <CodeLines text={pretty} name="x.json" line={state.line} />
        ) : ['code', 'markdown', 'html', 'svg', 'table'].includes(state.kind) ? (
          <CodeLines text={state.text} name={state.name} line={state.line} />
        ) : (
          <div className="file-view is-empty">
            <FileIcon size={30} aria-hidden="true" />
            <p>{loc('Встроенного просмотра для этого формата нет.')}</p>
            {project && APP_TYPES.test(state.name) && (
              <button type="button" onClick={() => reveal(true)}>
                {loc('Открыть в приложении')}
              </button>
            )}
          </div>
        )}
        {state.truncated && <p className="file-view-note">{loc('Показан первый 1 МБ файла.')}</p>}
      </div>
    </div>
  );
}
