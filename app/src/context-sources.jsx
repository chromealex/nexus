import React, {useEffect, useMemo, useRef, useState} from 'react';
import {PathPick} from './path-pick.jsx';
import {
  Folder,
  FileText,
  Link,
  StickyNote,
  Trash2,
  Upload,
  Plus,
  Image as ImageIcon,
  Pencil,
} from 'lucide-react';
import {countLabel} from './locale-format.js';
import {loc} from './i18n.js';

export const MAX_CONTEXT_SOURCES = 200;
export const MAX_DOCUMENT_BYTES = 20000000;
const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg)$/i;
const isImage = s => s.pendingFile?.type?.startsWith('image/') || IMAGE.test(s.name || '');
const size = bytes =>
  bytes >= 1e6
    ? (bytes / 1e6).toFixed(1).replace('.', ',') + loc(' МБ')
    : Math.max(1, Math.round(bytes / 1e3)) + loc(' КБ');
// Several links pasted at once become separate sources.
export const splitLinks = text =>
  String(text || '')
    .split(/\s+/)
    .map(v => v.trim())
    .filter(v => /^https?:\/\/\S+$/i.test(v));

const KINDS = [
  ['directory', loc('Папка'), Folder, loc('Абсолютный путь к папке, например /Users/you/Projects/app')],
  ['file', loc('Файл по пути'), FileText, loc('Абсолютный путь к файлу на компьютере')],
  ['url', loc('Ссылка'), Link, loc('https://… — можно вставить несколько ссылок сразу')],
  ['note', loc('Заметка'), StickyNote, loc('Правила, описание задачи, важные сведения…')],
];

function Thumb({source}) {
  const url = useMemo(
    () => (source.pendingFile && isImage(source) ? URL.createObjectURL(source.pendingFile) : null),
    [source.pendingFile]
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );
  if (url) return <img className="context-thumb" src={url} alt="" />;
  const Icon =
    source.kind === 'attachment'
      ? isImage(source)
        ? ImageIcon
        : FileText
      : KINDS.find(k => k[0] === source.kind)?.[2] || FileText;
  return <Icon size={15} aria-hidden="true" />;
}

// Context sources editor shared by project, folder and new-project dialogs.
// onFiles receives File objects from the button, drag-and-drop or paste; the dialog decides
// whether to upload them now (existing project) or after creation (new project).
export function ContextSources({contexts, setContexts, onFiles, busy, pendingNote}) {
  const files = useRef(null),
    list = useRef(null),
    [dragging, setDragging] = useState(false);
  const full = contexts.length >= MAX_CONTEXT_SOURCES;
  const patch = (index, data) => setContexts(v => v.map((s, i) => (i === index ? {...s, ...data} : s)));
  function add(kind) {
    if (full) return;
    setContexts(v => [...v, {kind, name: '', value: ''}]);
    setTimeout(() => list.current?.querySelector('.context-source:last-child textarea')?.focus(), 0);
  }
  function drop(e) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const dropped = e.dataTransfer?.files;
    if (dropped?.length) {
      onFiles(dropped);
      return;
    }
    const links = splitLinks(
      e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
    );
    if (links.length)
      setContexts(v =>
        [...v, ...links.map(value => ({kind: 'url', name: '', value}))].slice(0, MAX_CONTEXT_SOURCES)
      );
  }
  function paste(e) {
    const pasted = e.clipboardData?.files;
    if (pasted?.length && !busy) {
      e.preventDefault();
      onFiles(pasted);
    }
  }
  function pasteLinks(index, e) {
    const links = splitLinks(e.clipboardData?.getData('text'));
    if (links.length < 2) return;
    e.preventDefault();
    setContexts(v => {
      const next = [...v];
      next.splice(index, 1, ...links.map(value => ({kind: 'url', name: '', value})));
      return next.slice(0, MAX_CONTEXT_SOURCES);
    });
  }
  return (
    <div
      className={'context-sources' + (dragging ? ' is-dragging' : '')}
      onDragOver={e => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={drop}
      onPaste={paste}
    >
      <div className="context-list" ref={list}>
        {contexts.map((s, i) => (
          <div className={'context-source' + (s.pendingFile ? ' is-pending' : '')} key={i}>
            <div className="context-source-head">
              <Thumb source={s} />
              <label className="context-name">
                <input
                  aria-label={loc('Название источника ') + (i + 1)}
                  placeholder={
                    s.kind === 'attachment' ? s.name || loc('Документ') : loc('Название (необязательно)')
                  }
                  value={s.name}
                  maxLength={120}
                  onChange={e => patch(i, {name: e.target.value})}
                />
                <Pencil size={12} aria-hidden="true" />
              </label>
              <button
                type="button"
                disabled={busy}
                aria-label={loc('Убрать источник ') + (i + 1)}
                title={loc('Убрать источник')}
                onClick={() => setContexts(v => v.filter((_, n) => n !== i))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {s.kind === 'attachment' ? (
              <small className="context-meta">
                {s.pendingFile
                  ? `${size(s.pendingFile.size)} · ${pendingNote}`
                  : loc('Документ сохранён в Nexus')}
              </small>
            ) : (
              <textarea
                aria-label={loc('Содержимое источника ') + (i + 1)}
                placeholder={KINDS.find(k => k[0] === s.kind)?.[3]}
                value={s.value}
                rows={s.kind === 'note' ? 4 : 1}
                onPaste={s.kind === 'url' ? e => pasteLinks(i, e) : undefined}
                onChange={e => patch(i, {value: e.target.value})}
              />
            )}
            {(s.kind === 'directory' || s.kind === 'file') && (
              <PathPick
                kind={s.kind === 'directory' ? 'folder' : 'file'}
                prompt={s.kind === 'directory' ? loc('Папка для контекста') : loc('Файл для контекста')}
                onPick={path => patch(i, {value: path})}
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="context-dropzone"
        disabled={busy || full}
        onClick={() => files.current?.click()}
      >
        <Upload size={18} aria-hidden="true" />
        <span>
          <strong>{loc('Файлы и картинки')}</strong>
          <small>
            {loc('Перетащите сюда, вставьте из буфера (⌘V) или нажмите, чтобы выбрать. До 20 МБ на файл.')}
          </small>
        </span>
      </button>
      <input
        ref={files}
        hidden
        type="file"
        multiple
        onChange={e => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="context-add">
        {KINDS.map(([kind, label, Icon]) => (
          <button type="button" disabled={busy || full} key={kind} onClick={() => add(kind)}>
            <Plus size={13} />
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="context-count">
        {contexts.length
          ? countLabel(contexts.length, loc('источник'), loc('источника'), loc('источников'))
          : loc('Источников пока нет')}
        {full ? loc(' · достигнут предел {0}', MAX_CONTEXT_SOURCES) : ''}
      </p>
    </div>
  );
}
