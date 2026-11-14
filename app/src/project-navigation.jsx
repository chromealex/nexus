import {CustomSelect} from './custom-select.jsx';
import {ProjectIcon, ProjectIconSettings, useProjectIcons} from './project-icons.jsx';
import {useToastOn} from './toaster.jsx';
import {PathPick} from './path-pick.jsx';
import {ProjectPermissions} from './project-permissions.jsx';
import {folderChatCount, projectChatCount} from './navigation-counts.js';
import {countLabel} from './locale-format.js';
import {SavedChats} from './saved-chats.jsx';
import {FadeLabel} from './fade-label.jsx';
import {searchChats} from './chat-search.js';
import {NavSearch, NavSearchResults, UndoToast, NavSkeleton} from './nav-extras.jsx';
import {shortcutText, withShortcut} from './shortcuts.js';
import {ContextSources, MAX_CONTEXT_SOURCES, MAX_DOCUMENT_BYTES} from './context-sources.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {listen} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import {
  Folder,
  FolderOpen,
  MessageSquare,
  Plus,
  Settings,
  ChevronRight,
  ChevronDown,
  Network,
  X,
  FileText,
  Link,
  StickyNote,
  Trash2,
  Upload,
  MoreHorizontal,
  SquarePen,
  LockKeyhole,
  Check,
  Archive,
  Rows3,
  Rows4,
} from 'lucide-react';

export function ProjectNavigation({
  projects,
  activeProject,
  activeChat,
  onProject,
  onChat,
  onCreated,
  onDraftChat,
  onProjects,
  disabled,
  busy,
  onConnections,
}) {
  const [chats, setChats] = useState([]),
    [folders, setFolders] = useState([]),
    [expanded, setExpanded] = useState({}),
    [editor, setEditor] = useState(null),
    [error, setError] = useState(''),
    [menu, setMenu] = useState(null),
    [creating, setCreating] = useState(null),
    [folderName, setFolderName] = useState(''),
    [activity, setActivity] = useState({}),
    [savedKind, setSavedKind] = useState(null),
    [query, setQuery] = useState(''),
    [resultIndex, setResultIndex] = useState(0),
    [toast, setToast] = useState(null),
    [loaded, setLoaded] = useState(false),
    [compact, setCompact] = useState(() => {
      try {
        return localStorage.getItem('nexus-nav-density') === 'compact';
      } catch {
        return false;
      }
    });
  useToastOn(error, () => setError(''), 'error');
  const projectIcons = useProjectIcons(projects);
  const searchRef = useRef(null),
    newChatRef = useRef(null);
  const nav = useRef(null),
    live = useRef(true),
    loadId = useRef(0),
    createBusy = useRef(false);
  async function refresh() {
    const id = ++loadId.current;
    try {
      const rows = await Promise.all(
        projects.map(async p => {
          const [c, f] = await Promise.all([
            invoke('list_project_chats', {projectId: p.id}),
            invoke('list_project_folders', {projectId: p.id}),
          ]);
          return {c, f};
        })
      );
      if (live.current && id === loadId.current) {
        setChats(rows.flatMap(r => r.c));
        setFolders(rows.flatMap(r => r.f));
        setLoaded(true);
      }
    } catch (e) {
      if (live.current) setError(String(e));
    }
  }
  useEffect(() => {
    live.current = true;
    refresh();
    const timer = setInterval(refresh, 5000);
    const read = () => refresh();
    window.addEventListener('nexus-chat-read', read);
    window.addEventListener('nexus-chat-lifecycle', read);
    return () => {
      live.current = false;
      clearInterval(timer);
      window.removeEventListener('nexus-chat-read', read);
      window.removeEventListener('nexus-chat-lifecycle', read);
    };
  }, [projects.map(p => p.id).join(','), activeChat]);
  useEffect(() => {
    let alive = true,
      off;
    listen('chat-activity', e => {
      const v = e.payload;
      setActivity(a => ({...a, [v.chatId]: v.status}));
      refresh();
    }).then(f => {
      if (alive) off = f;
      else f();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [projects.map(p => p.id).join(',')]);
  useEffect(() => {
    const close = e => {
      if (e.key === 'Escape') setMenu(null);
    };
    const outside = e => {
      if (!e.target.closest('.nav-menu,.nav-more')) setMenu(null);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  const toggle = key => setExpanded(v => ({...v, [key]: v[key] === false ? true : false}));
  async function newChat(projectId = activeProject, folderId = null, parentChatId = null) {
    if (createBusy.current || busy) return;
    // A plain new chat opens as a draft; it is created when the first message is sent.
    if (!folderId && !parentChatId && onDraftChat && projectId) {
      setMenu(null);
      setExpanded(v => ({...v, ['p' + projectId]: true}));
      onDraftChat(projectId);
      return;
    }
    createBusy.current = true;
    setMenu(null);
    try {
      const c = await invoke('create_project_chat', {
        projectIdValue: projectId,
        title: parentChatId ? 'Подчат' : 'Новый чат',
      });
      const saved =
        folderId || parentChatId
          ? await invoke('organize_chat', {chatId: c.id, title: c.title, folderId, parentChatId})
          : c;
      setExpanded(v => ({
        ...v,
        ['p' + projectId]: true,
        ...(folderId ? {['f' + folderId]: true} : {}),
        ...(parentChatId ? {['c' + parentChatId]: true} : {}),
      }));
      onCreated(saved);
      await refresh();
      setTimeout(() => document.querySelector('[aria-label="Message to NEXUS"]')?.focus(), 0);
    } catch (e) {
      setError(String(e));
    } finally {
      createBusy.current = false;
    }
  }
  function newFolder(projectId, parentId = null) {
    setMenu(null);
    setCreating({projectId, parentId});
    setFolderName('');
    setExpanded(v => ({...v, ['p' + projectId]: true, ...(parentId ? {['f' + parentId]: true} : {})}));
  }
  async function saveFolder(e) {
    e.preventDefault();
    if (!folderName.trim() || createBusy.current) return;
    createBusy.current = true;
    try {
      await invoke('save_project_folder', {
        projectId: creating.projectId,
        id: null,
        parentId: creating.parentId,
        name: folderName,
        contexts: [],
      });
      setCreating(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      createBusy.current = false;
    }
  }
  function folderInput(projectId, parentId) {
    return creating?.projectId === projectId && creating.parentId === parentId ? (
      <form className="nav-create-folder" onSubmit={saveFolder}>
        <Folder size={15} />
        <input
          autoFocus
          aria-label="Название новой папки"
          placeholder="Название папки"
          value={folderName}
          maxLength={120}
          onChange={e => setFolderName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setCreating(null);
            }
          }}
        />
        <button title="Создать папку" disabled={!folderName.trim()}>
          <Check size={14} />
        </button>
        <button type="button" title="Отмена" onClick={() => setCreating(null)}>
          <X size={13} />
        </button>
      </form>
    ) : null;
  }
  async function changeChat(item, action) {
    if (createBusy.current || busy) return;
    createBusy.current = true;
    setMenu(null);
    try {
      await invoke('change_chat_state', {chatId: item.id, action});
      await refresh();
      window.dispatchEvent(new Event('nexus-chat-lifecycle'));
      if (action === 'archive' || action === 'trash') {
        const subchats = chats.some(c => c.parentChatId === item.id);
        setToast({
          id: Date.now(),
          chat: item,
          wasActive: activeChat === item.id,
          text:
            (action === 'archive' ? 'Чат перенесён в архив' : 'Чат перемещён в корзину') +
            (subchats ? ' вместе с подчатами' : ''),
          undo: true,
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      createBusy.current = false;
    }
  }
  async function undoChange() {
    const t = toast;
    if (!t || t.busy) return;
    setToast({...t, busy: true});
    try {
      await invoke('change_chat_state', {chatId: t.chat.id, action: 'restore'});
      await refresh();
      window.dispatchEvent(new Event('nexus-chat-lifecycle'));
      if (t.wasActive) onChat(t.chat.id, t.chat.projectId);
      setToast(null);
    } catch (e) {
      setToast(null);
      setError('Не удалось вернуть чат: ' + String(e));
    }
  }
  newChatRef.current = newChat;
  useEffect(() => {
    const create = () => newChatRef.current?.();
    const focus = () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('nexus-new-chat', create);
    window.addEventListener('nexus-focus-search', focus);
    return () => {
      window.removeEventListener('nexus-new-chat', create);
      window.removeEventListener('nexus-focus-search', focus);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('nexus-nav-density', compact ? 'compact' : 'comfortable');
    } catch {}
  }, [compact]);
  const results = query.trim() ? searchChats(query, {chats, folders, projects}) : [];
  useEffect(() => {
    setResultIndex(0);
  }, [query]);
  function openResult(r) {
    if (!r) return;
    onChat(r.chat.id, r.chat.projectId);
    setExpanded(v => ({
      ...v,
      ['p' + r.chat.projectId]: true,
      ...(r.chat.folderId ? {['f' + r.chat.folderId]: true} : {}),
    }));
    setQuery('');
    invoke('mark_chat_read', {chatId: r.chat.id, messageId: null})
      .then(refresh)
      .catch(() => {});
    setTimeout(() => document.querySelector('[aria-label="Message to NEXUS"]')?.focus(), 0);
  }
  function searchKey(e) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery('');
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      setResultIndex(i => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      setResultIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results.length) {
      e.preventDefault();
      openResult(results[resultIndex]);
    }
  }
  function more(type, item) {
    const key = type + item.id;
    return (
      <>
        <button
          className="nav-action nav-more"
          aria-label={'Действия: ' + (item.name || item.title)}
          aria-expanded={menu === key}
          title="Действия"
          onClick={() => setMenu(menu === key ? null : key)}
        >
          <MoreHorizontal size={16} />
        </button>
        {menu === key && (
          <div className="nav-menu" role="menu">
            {type !== 'chat' && (
              <>
                <button
                  role="menuitem"
                  disabled={busy}
                  onClick={() =>
                    newChat(type === 'project' ? item.id : item.projectId, type === 'folder' ? item.id : null)
                  }
                >
                  <SquarePen size={14} />
                  Новый чат
                </button>
                <button
                  role="menuitem"
                  disabled={busy}
                  onClick={() =>
                    newFolder(
                      type === 'project' ? item.id : item.projectId,
                      type === 'folder' ? item.id : null
                    )
                  }
                >
                  <Folder size={14} />
                  Новая папка
                </button>
              </>
            )}
            {type === 'chat' && (
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => newChat(item.projectId, item.folderId || null, item.id)}
              >
                <MessageSquare size={14} />
                Создать подчат
              </button>
            )}
            <button
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setEditor({
                  type,
                  item,
                  project: projects.find(p => p.id === (type === 'project' ? item.id : item.projectId)),
                });
                setMenu(null);
              }}
            >
              <Settings size={14} />
              {type === 'chat' ? 'Название и расположение' : 'Настройки и контекст'}
            </button>
            {type === 'chat' && (
              <>
                <hr />
                <button role="menuitem" disabled={busy} onClick={() => changeChat(item, 'archive')}>
                  <Archive size={14} />
                  Архивировать
                </button>
                <button role="menuitem" disabled={busy} onClick={() => changeChat(item, 'trash')}>
                  <Trash2 size={14} />
                  Удалить
                </button>
              </>
            )}
          </div>
        )}
      </>
    );
  }
  function chatRows(projectId, parent = null, folder = null, depth = 0) {
    if (depth > 16) return null;
    return chats
      .filter(
        c =>
          c.projectId === projectId && (c.parentChatId || null) === parent && (c.folderId || null) === folder
      )
      .map(c => {
        const running = activity[c.id] ? activity[c.id] === 'running' : c.running;
        const unread = c.unread && !running;
        return (
          <React.Fragment key={c.id}>
            <div
              className={
                'nav-row ' +
                (activeChat === c.id ? 'selected ' : '') +
                (running ? 'is-thinking ' : '') +
                (unread ? 'has-unread' : '')
              }
              style={{paddingLeft: 12 + depth * 14}}
            >
              <span className="chat-status-slot">
                {running ? (
                  <span className="visually-hidden">Генерирует ответ</span>
                ) : unread ? (
                  <span className="unread-dot" role="status" aria-label="Новый ответ" />
                ) : null}
              </span>
              <button
                className="nav-toggle"
                aria-label={'Подчаты: ' + c.title}
                onClick={() => toggle('c' + c.id)}
              >
                {chats.some(x => x.parentChatId === c.id) ? (
                  expanded['c' + c.id] !== false ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )
                ) : (
                  <MessageSquare size={14} />
                )}
              </button>
              <button
                className="nav-title"
                disabled={disabled}
                onClick={() => {
                  onChat(c.id, c.projectId);
                  setExpanded(v => ({...v, ['p' + c.projectId]: true}));
                  invoke('mark_chat_read', {chatId: c.id, messageId: null})
                    .then(refresh)
                    .catch(() => {});
                }}
              >
                <FadeLabel className="chat-title-text">{c.title}</FadeLabel>
              </button>
              {more('chat', c)}
            </div>
            {expanded['c' + c.id] !== false && chatRows(projectId, c.id, folder, depth + 1)}
          </React.Fragment>
        );
      });
  }
  function folderRows(projectId, parent = null, depth = 0) {
    if (depth > 16) return null;
    return folders
      .filter(f => f.projectId === projectId && (f.parentId || null) === parent)
      .map(f => (
        <React.Fragment key={f.id}>
          <div className="nav-row nav-folder" style={{paddingLeft: 18 + depth * 14}}>
            <button className="nav-title folder-title" onClick={() => toggle('f' + f.id)}>
              {expanded['f' + f.id] !== false ? <FolderOpen size={15} /> : <Folder size={15} />}
              <FadeLabel>{f.name}</FadeLabel>
              <small
                className="nav-chat-count"
                title={countLabel(folderChatCount(chats, folders, projectId, f.id), 'чат', 'чата', 'чатов')}
              >
                {folderChatCount(chats, folders, projectId, f.id)}
              </small>
            </button>
            {more('folder', f)}
          </div>
          {expanded['f' + f.id] !== false && (
            <>
              {folderInput(projectId, f.id)}
              {folderRows(projectId, f.id, depth + 1)}
              {chatRows(projectId, null, f.id, depth + 1)}
            </>
          )}
        </React.Fragment>
      ));
  }
  return (
    <>
      <nav ref={nav} className={'project-nav' + (compact ? ' nav-compact' : '')} aria-label="Проекты и чаты">
        <div className="cinematic-wordmark">NEXUS</div>
        <button
          className="new-chat-nav"
          title={withShortcut('Новый чат в текущем проекте', 'newChat')}
          disabled={!activeProject || disabled || busy}
          onClick={() => newChat()}
        >
          <SquarePen size={17} />
          Новый чат<kbd aria-hidden="true">{shortcutText('newChat')}</kbd>
        </button>
        <NavSearch value={query} onChange={setQuery} inputRef={searchRef} onKeyDown={searchKey} />
        <div className="nav-section-title">
          {query.trim() ? 'Результаты' : 'Проекты'}
          <span className="nav-section-actions">
            <button
              title={compact ? 'Обычная плотность списка' : 'Компактный список'}
              aria-label={compact ? 'Обычная плотность списка' : 'Компактный список'}
              aria-pressed={compact}
              onClick={() => setCompact(v => !v)}
            >
              {compact ? <Rows3 size={15} /> : <Rows4 size={15} />}
            </button>
            <button
              title="Добавить проект"
              aria-label="Добавить проект"
              disabled={disabled || busy}
              onClick={() => setEditor({type: 'new-project'})}
            >
              <Plus size={16} />
            </button>
          </span>
        </div>
        <div className="nav-scroll">
          {query.trim() ? (
            <NavSearchResults
              results={results}
              query={query}
              active={resultIndex}
              onOpen={openResult}
              onHover={setResultIndex}
            />
          ) : !loaded && !error ? (
            <NavSkeleton />
          ) : (
            projects.map(p => (
              <div key={p.id} className="project-nav-group">
                <div className={'nav-row project-name ' + (p.id === activeProject ? 'current' : '')}>
                  <button
                    className="nav-toggle"
                    title="Свернуть или развернуть проект"
                    onClick={() => toggle('p' + p.id)}
                  >
                    {expanded['p' + p.id] !== false ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <button
                    className="nav-title"
                    disabled={disabled}
                    onClick={() => {
                      onProject(p.id);
                      setExpanded(v => ({...v, ['p' + p.id]: true}));
                    }}
                  >
                    {p.system ? <Network size={16} /> : <ProjectIcon icon={projectIcons[p.id]} />}
                    <FadeLabel>{p.name}</FadeLabel>
                    <small
                      className="nav-chat-count"
                      title={countLabel(projectChatCount(chats, p.id), 'чат', 'чата', 'чатов')}
                    >
                      {projectChatCount(chats, p.id)}
                    </small>
                    {p.system && <LockKeyhole size={10} aria-label="Системный проект" />}
                  </button>
                  {
                    <button
                      type="button"
                      className="nav-action nav-new-chat"
                      title="Новый чат в проекте"
                      aria-label={'Новый чат в проекте ' + p.name}
                      disabled={busy || disabled}
                      onClick={() => newChat(p.id)}
                    >
                      <Plus size={14} />
                    </button>
                  }
                  {more('project', p)}
                </div>
                {expanded['p' + p.id] !== false && (
                  <>
                    {folderInput(p.id, null)}
                    {folderRows(p.id)}
                    {chatRows(p.id)}
                    {!chats.some(c => c.projectId === p.id) && !folders.some(f => f.projectId === p.id) && (
                      <button className="nav-empty" disabled={busy} onClick={() => newChat(p.id)}>
                        Начать новый чат
                      </button>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
        <div className="nav-footer">
          <UndoToast key={toast?.id} toast={toast} onUndo={undoChange} onClose={() => setToast(null)} />
          <div className="nav-saved-links">
            <button onClick={() => setSavedKind('archive')}>
              <Archive size={14} />
              Архив
            </button>
            <button onClick={() => setSavedKind('trash')}>
              <Trash2 size={14} />
              Корзина
            </button>
          </div>
          <button title={withShortcut('Агенты и подключения', 'connections')} onClick={onConnections}>
            <Network size={16} />
            Агенты и подключения<kbd aria-hidden="true">{shortcutText('connections')}</kbd>
          </button>
        </div>
      </nav>
      {savedKind && (
        <SavedChats
          kind={savedKind}
          projects={projects}
          onClose={() => setSavedKind(null)}
          onRestore={async chat => {
            await refresh();
            window.dispatchEvent(new Event('nexus-chat-lifecycle'));
            onChat(chat.id, chat.projectId);
            setSavedKind(null);
          }}
        />
      )}
      {editor && (
        <ProjectEditor
          key={editor.type + (editor.item?.id || '')}
          editor={editor}
          project={editor.project || projects.find(p => p.id === activeProject)}
          folders={folders.filter(f => f.projectId === (editor.project?.id || activeProject))}
          chats={chats.filter(c => c.projectId === (editor.project?.id || activeProject))}
          onClose={() => setEditor(null)}
          onSaved={async (result, warning) => {
            await onProjects();
            await refresh();
            if (editor.type === 'new-project') onProject(result.id);
            if (editor.type === 'chat') onCreated(result);
            setEditor(null);
            if (warning) setError(warning);
          }}
        />
      )}
    </>
  );
}

const fileData = file =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
function ProjectEditor({editor, project, folders, chats, onClose, onSaved}) {
  const {type, item} = editor;
  const [name, setName] = useState(item?.name || item?.title || ''),
    [workspace, setWorkspace] = useState(''),
    [contexts, setContexts] = useState(item?.contexts || []),
    [parent, setParent] = useState(item?.parentId || ''),
    [folder, setFolder] = useState(item?.folderId || ''),
    [parentChat, setParentChat] = useState(item?.parentChatId || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useToastOn(error, () => setError(''), 'error');
  const dialog = useRef(null),
    files = useRef(null),
    lastFocus = useRef(document.activeElement);
  useEffect(() => {
    dialog.current?.querySelector('input')?.focus();
    const key = e => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button,input,select,textarea')].filter(
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
      document.removeEventListener('keydown', key);
      lastFocus.current?.focus();
    };
  }, [busy]);
  const patch = (index, data) => setContexts(v => v.map((s, i) => (i === index ? {...s, ...data} : s)));
  async function upload(list) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    const room = MAX_CONTEXT_SOURCES - contexts.length;
    if (picked.length > room) {
      setError(`Можно добавить ещё ${room} — предел ${MAX_CONTEXT_SOURCES} источников`);
      return;
    }
    const big = picked.find(f => f.size > MAX_DOCUMENT_BYTES);
    if (big) {
      setError(`«${big.name}» больше 20 МБ`);
      return;
    }
    if (type === 'new-project') {
      setError('');
      setContexts(v => [
        ...v,
        ...picked.map(file => ({kind: 'attachment', name: file.name, value: '', pendingFile: file})),
      ]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const file of picked) {
        const data = await fileData(file);
        const a = await invoke('upload_attachment', {
          projectId: type === 'project' ? item.id : project.id,
          name: file.name,
          mime: file.type,
          data,
        });
        setContexts(v => [...v, {kind: 'attachment', name: file.name, value: a.id}]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (files.current) files.current.value = '';
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result;
      if (type === 'new-project') {
        const ready = contexts.filter(c => !c.pendingFile),
          pending = contexts.filter(c => c.pendingFile);
        result = await invoke('create_project', {name, workspace, contexts: ready});
        if (pending.length) {
          const uploaded = [],
            failed = [];
          for (const c of pending) {
            try {
              const data = await fileData(c.pendingFile);
              const a = await invoke('upload_attachment', {
                projectId: result.id,
                name: c.pendingFile.name,
                mime: c.pendingFile.type,
                data,
              });
              uploaded.push({kind: 'attachment', name: c.name || c.pendingFile.name, value: a.id});
            } catch (e) {
              failed.push(c.pendingFile.name);
            }
          }
          if (uploaded.length)
            result = await invoke('save_project_settings', {
              projectId: result.id,
              name: result.name,
              contexts: [...result.contexts, ...uploaded],
            });
          if (failed.length) {
            await onSaved(
              result,
              'Проект создан, но не загрузились: ' + failed.join(', ') + '. Добавьте их в настройках проекта.'
            );
            return;
          }
        }
      } else if (type === 'project')
        result = await invoke('save_project_settings', {projectId: item.id, name, contexts});
      else if (type === 'chat')
        result = await invoke('organize_chat', {
          chatId: item.id,
          title: name,
          folderId: folder || null,
          parentChatId: parentChat || null,
        });
      else
        result = await invoke('save_project_folder', {
          projectId: project.id,
          id: item?.id || null,
          parentId: parent || null,
          name,
          contexts,
        });
      await onSaved(result);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  const title = {
    'new-project': 'Новый проект',
    project: 'Настройки проекта',
    'new-folder': 'Новая папка',
    folder: 'Настройки папки',
    chat: 'Настройки чата',
  }[type];
  return (
    <div
      className="settings-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section ref={dialog} className="project-settings" role="dialog" aria-modal="true" aria-label={title}>
        <div className="settings-header">
          <div>
            <h2>{title}</h2>
            <small>
              {type === 'project'
                ? item.workspace
                : type === 'new-project'
                  ? 'Локальная папка с кодом станет рабочим каталогом агента'
                  : project?.name}
            </small>
          </div>
          <button type="button" disabled={busy} aria-label="Закрыть настройки" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <form onSubmit={save}>
          <div className="settings-body">
            <label>
              Название
              <input
                aria-label="Название"
                value={name}
                maxLength={120}
                onChange={e => setName(e.target.value)}
                required
              />
            </label>
            {type === 'new-project' && (
              <label>
                Рабочая папка
                <span className="path-field">
                  <input
                    aria-label="Рабочая папка"
                    placeholder="/Users/you/Projects/MyProject"
                    value={workspace}
                    onChange={e => setWorkspace(e.target.value)}
                    required
                  />
                  <PathPick kind="folder" prompt="Рабочая папка проекта" onPick={setWorkspace} />
                </span>
                <small>Основной локальный каталог проекта</small>
              </label>
            )}
            {(type === 'folder' || type === 'new-folder') && (
              <label>
                Родительская папка
                <CustomSelect
                  aria-label="Родительская папка"
                  value={parent}
                  onChange={e => setParent(e.target.value)}
                >
                  <option value="">В корне проекта</option>
                  {folders
                    .filter(f => f.id !== item?.id)
                    .map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </CustomSelect>
              </label>
            )}
            {type === 'chat' && (
              <>
                <label>
                  Папка
                  <CustomSelect
                    aria-label="Папка чата"
                    value={folder}
                    onChange={e => {
                      setFolder(e.target.value);
                      setParentChat('');
                    }}
                  >
                    <option value="">В корне проекта</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </CustomSelect>
                </label>
                <label>
                  Родительский чат
                  <CustomSelect
                    aria-label="Родительский чат"
                    value={parentChat}
                    onChange={e => setParentChat(e.target.value)}
                  >
                    <option value="">Самостоятельный чат</option>
                    {chats
                      .filter(c => c.id !== item.id && (c.folderId || '') === folder)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </CustomSelect>
                  <small>
                    Подчат получает последние сообщения родительских чатов и контекст своей папки.
                  </small>
                </label>
              </>
            )}
            {type !== 'chat' && (
              <>
                <div className="context-heading">
                  <h3>
                    Контекст
                    {type === 'new-project' && (
                      <small className="optional"> · можно добавить сейчас или позже</small>
                    )}
                  </h3>
                  <small>
                    {type === 'project' || type === 'new-project'
                      ? 'Наследуется всеми папками и чатами проекта'
                      : 'Дополняет контекст проекта и родительских папок'}
                  </small>
                </div>
                <ContextSources
                  contexts={contexts}
                  setContexts={setContexts}
                  onFiles={upload}
                  busy={busy}
                  pendingNote="загрузится при создании проекта"
                />
                <p className="context-help">
                  Папки и файлы агент читает с вашего компьютера. Загруженные документы и картинки хранятся в
                  Nexus. Ссылки передаются как источники: доступ к содержимому зависит от возможностей агента
                  и авторизации сайта. В запрос уходит до 48 000 символов контекста — длинные заметки
                  сокращаются.
                </p>
              </>
            )}
            {type === 'project' && <ProjectIconSettings projectId={item.id} />}
            {type === 'project' && <ProjectPermissions projectId={item.id} />}
          </div>
          <div className="settings-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Отмена
            </button>
            <button className="primary" disabled={busy || !name.trim()} type="submit">
              {busy ? 'Сохраняю…' : type.startsWith('new-') ? 'Создать' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
