import React from 'react';
import {Globe, X, PanelRightClose, FileText} from 'lucide-react';
import {loc} from './i18n.js';

// Right-hand panel of the chat: the chat browser, the chat's changes and terminal, and opened files, each as a tab.
// It appears when an agent starts using the browser or when a file is opened; the tool tabs open from the header.
export function SidePanel({
  width,
  onResize,
  onClose,
  view,
  onView,
  files,
  onCloseFile,
  browserTab,
  tools = [],
  children,
}) {
  const drag = e => {
    e.preventDefault();
    const startX = e.clientX,
      start = width;
    const move = ev => onResize(start + (startX - ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <aside className="browser-pane side-panel" aria-label={loc('Боковая панель')}>
      <div
        className="browser-pane-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={loc('Ширина панели')}
        tabIndex={0}
        onPointerDown={drag}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') onResize(width + 24);
          if (e.key === 'ArrowRight') onResize(width - 24);
        }}
      />
      <div className="side-panel-bar" role="tablist" aria-label={loc('Содержимое панели')}>
        {browserTab && (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'browser'}
            className={'side-panel-tab' + (view === 'browser' ? ' is-active' : '')}
            onClick={() => onView('browser')}
          >
            <Globe size={13} aria-hidden="true" />
            {loc('Браузер')}
          </button>
        )}
        {tools.map(tool => (
          <button
            key={tool.key}
            type="button"
            role="tab"
            aria-selected={view === tool.key}
            className={'side-panel-tab' + (view === tool.key ? ' is-active' : '')}
            onClick={() => onView(tool.key)}
          >
            <tool.icon size={13} aria-hidden="true" />
            {tool.label}
            {tool.badge ? <span className="side-panel-badge">{tool.badge}</span> : null}
          </button>
        ))}
        {files.map(file => (
          <span key={file.key} className={'side-panel-tab is-file' + (view === file.key ? ' is-active' : '')}>
            <button
              type="button"
              role="tab"
              aria-selected={view === file.key}
              title={file.path || file.name}
              onClick={() => onView(file.key)}
            >
              <FileText size={13} aria-hidden="true" />
              <span>{file.name}</span>
            </button>
            <button
              type="button"
              className="side-panel-tab-close"
              aria-label={loc('Закрыть ') + file.name}
              onClick={() => onCloseFile(file.key)}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="browser-pane-close"
          aria-label={loc('Скрыть панель')}
          title={loc('Скрыть панель')}
          onClick={onClose}
        >
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="side-panel-body">{children}</div>
    </aside>
  );
}

// File descriptor for the panel from an attachment or a path mentioned in the chat.
export function panelFile(input) {
  if (input.source === 'attachment')
    return {
      key: 'a:' + input.id,
      source: 'attachment',
      id: input.id,
      name: input.name,
      size: input.size,
      mime: input.mime,
    };
  const path = String(input.path);
  return {
    key: 'p:' + path + (input.line ? ':' + input.line : ''),
    source: 'project',
    path: input.line ? `${path}:${input.line}` : path,
    name: path.split('/').pop() || path,
    line: input.line || null,
  };
}
