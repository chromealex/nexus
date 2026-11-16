import {teamPlan} from './team-plan.js';
import {TeamPlanPreview} from './team-plan-preview.jsx';
import {chatErrorMessage} from './chat-errors.js';
import {ROUTING_PRIORITIES} from './model-benchmarks.js';
import {RoutingPreview} from './routing-preview.jsx';
import {quotaLeftByAccount, quotaLeftByProvider, roomiestAccount} from './quota-format.js';
import {CustomSelect} from './custom-select.jsx';
import {mergeLatestMessages, prependMessages} from './chat-history.js';
import {ComposerPlan} from './composer-plan.jsx';
import {Toaster, useToastOn} from './toaster.jsx';
import {notify} from './toasts.js';
import {installScrollFades} from './scroll-fades.js';
import {installChatEdgeFade} from './chat-edge-fade.js';
import {ConnectionsDialog} from './connections-dialog.jsx';
import {ProjectBoard} from './project-board.jsx';
import {WelcomeScreen} from './welcome-screen.jsx';
import {ParticlePersona} from './particle-persona.jsx';
import {ThinkingLightning} from './thinking-lightning.jsx';
import {SceneBackdrop} from './scene-backdrop.jsx';
import {reactionSignals} from './answer-reaction.js';
import {routingAdvice, classifyTask, pendingRequestMatches, arbiterCandidates} from './agent-catalog.js';
import {PermissionCard} from './permission-card.jsx';
import {ProjectNavigation} from './project-navigation.jsx';
import {useChatScroll} from './use-chat-scroll.js';
import {ComposerParams, ParamRow, composerParamsSummary} from './composer-params.jsx';
import {BrowserParam} from './browser-param.jsx';
import {BrowserView, BrowserPreview, useChatBrowser} from './browser-pane.jsx';
import {SidePanel, panelFile} from './side-panel.jsx';
import {FileView} from './file-view.jsx';
import {browserSummary} from './browser-mode.js';
import {shortcutFor, withShortcut} from './shortcuts.js';
import {ChatSkeleton} from './nav-extras.jsx';
import {ComposerInput} from './composer-input.jsx';
import {FileTile, QuestionCard} from './chat-extras.jsx';
import {
  Copy,
  Paperclip,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  PanelLeft,
  PanelRight,
  ListChecks,
  Square,
  Bookmark,
  FileDown,
  Search,
  MoreHorizontal,
  Map as MapIcon,
  Minus,
  Plus,
} from 'lucide-react';
import {ChatMinimap} from './chat-minimap.jsx';
import {stepTextSize, readTextSize, TEXT_SIZES, DEFAULT_TEXT_SIZE} from './chat-layout.js';
import {CollapsibleMessage, GenerationStatus, ChatFind, QuickReplies, DropOverlay} from './chat-tools.jsx';
import {
  draftKey,
  loadDraft,
  saveDraft,
  loadBookmarks,
  toggleBookmark,
  isLongMessage,
  chatToMarkdown,
  excerpt,
} from './chat-local.js';
import {mergeContinuation, dayKey, dayLabel} from './chat-message.js';
import React, {useEffect, useLayoutEffect, useState, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import './style.css';
import './workspace-ui.css';
import './dialog-theme.css';
import './cinematic.css';
import './ui-polish.css';
import {
  ChatMarkdown,
  ResponseDetails,
  MessageActions,
  UserActions,
  MessageEditor,
} from './chat-message-view.jsx';
import {loc} from './i18n.js';

const REASONING_LABELS = {
  auto: loc('Авто'),
  fast: loc('Быстро'),
  normal: loc('Обычно'),
  deep: loc('Глубоко'),
};

function App() {
  const [historyMeta, setHistoryMeta] = useState({hasMore: false, beforeId: null}),
    [historyBusy, setHistoryBusy] = useState(false),
    [historyChat, setHistoryChat] = useState(''),
    [accountsReady, setAccountsReady] = useState(false),
    [continuingMode, setContinuingMode] = useState('continue'),
    [runStartedAt, setRunStartedAt] = useState(0),
    [findOpen, setFindOpen] = useState(false),
    [bookmarks, setBookmarks] = useState([]),
    [dragActive, setDragActive] = useState(false),
    [editing, setEditing] = useState(null),
    [chatMenu, setChatMenu] = useState(null),
    [exportNote, setExportNote] = useState(null),
    [prefs, setPrefs] = useState(() => {
      try {
        return {
          quickReplies: localStorage.getItem('nexus-quick-replies') === 'on',
          notify: localStorage.getItem('nexus-notify') !== 'off',
        };
      } catch {
        return {quickReplies: false, notify: true};
      }
    });
  const [textSize, setTextSize] = useState(() => {
      try {
        return readTextSize(localStorage.getItem('nexus-text-size'));
      } catch {
        return readTextSize(null);
      }
    }),
    [minimapOn, setMinimapOn] = useState(() => {
      try {
        return localStorage.getItem('nexus-minimap') !== 'off';
      } catch {
        return true;
      }
    });
  const draftOwner = useRef(null),
    draftSkip = useRef(false),
    dragDepth = useRef(0);
  const historyRef = useRef({busy: false}),
    prependAnchor = useRef(null);
  const [boardOpen, setBoardOpen] = useState(false),
    [providerRows, setProviderRows] = useState([]),
    [connectionTarget, setConnectionTarget] = useState(null),
    [routeOffer, setRouteOffer] = useState(null),
    [executionMode, setExecutionMode] = useState('execute');
  const routeApproval = useRef(null);
  const [planOpen, setPlanOpen] = useState(false),
    [navCollapsed, setNavCollapsed] = useState(false),
    [agentPermission, setAgentPermission] = useState(null);
  const pendingChatRef = useRef(null),
    sendingRef = useRef(false),
    viewRef = useRef({}),
    fileInputRef = useRef(null),
    activeRunRef = useRef(null),
    stopRequestedRef = useRef(false);
  const [chatsReady, setChatsReady] = useState(false),
    [chatSending, setChatSending] = useState(false),
    [stopping, setStopping] = useState(false),
    [continuingId, setContinuingId] = useState(null),
    [modelSaving, setModelSaving] = useState(false),
    [modelChoices, setModelChoices] = useState([]),
    [modelsBusy, setModelsBusy] = useState(false),
    [modelLoadError, setModelLoadError] = useState(''),
    [reasoningMode, setReasoningMode] = useState(() => {
      try {
        return localStorage.getItem('nexus-reasoning-mode') || 'auto';
      } catch {
        return 'auto';
      }
    }),
    [streamText, setStreamText] = useState(''),
    [replyTo, setReplyTo] = useState(null),
    [draftFiles, setDraftFiles] = useState([]),
    [filesBusy, setFilesBusy] = useState(false),
    [panelFiles, setPanelFiles] = useState([]),
    [panelView, setPanelView] = useState('browser'),
    [agentQuestion, setAgentQuestion] = useState(null),
    [chatTrace, setChatTrace] = useState(''),
    [chatDraft, setChatDraft] = useState(''),
    [registryRows, setRegistryRows] = useState([]),
    [registryBusy, setRegistryBusy] = useState(false),
    [projects, setProjects] = useState([]),
    [projectName, setProjectName] = useState(''),
    [projectPath, setProjectPath] = useState(''),
    [activeProject, setActiveProject] = useState(() => {
      try {
        return localStorage.getItem('nexus-active-project') || '';
      } catch {
        return '';
      }
    }),
    [chats, setChats] = useState([]),
    [chatTitle, setChatTitle] = useState(''),
    [activeChat, setActiveChat] = useState(''),
    [chatMessages, setChatMessages] = useState([]),
    [projectError, setProjectError] = useState(''),
    [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false),
    [adaptiveStrategy, setAdaptiveStrategy] = useState('balanced'),
    [adaptivePlan, setAdaptivePlan] = useState(null),
    [adaptiveResults, setAdaptiveResults] = useState({}),
    [adaptiveBusy, setAdaptiveBusy] = useState(false),
    [statuslineReports, setStatuslineReports] = useState({}),
    [nativeDiagnostics, setNativeDiagnostics] = useState(null),
    [diagBusy, setDiagBusy] = useState(false),
    [axUsage, setAxUsage] = useState(null),
    [axBusy, setAxBusy] = useState(false),
    [taskAccount, setTaskAccount] = useState('auto'),
    [quotaReports, setQuotaReports] = useState({}),
    [routeFeedback, setRouteFeedback] = useState({}),
    [isolation, setIsolation] = useState({}),
    [removePending, setRemovePending] = useState(null),
    [agents, setAgents] = useState([]),
    [open, setOpen] = useState(false),
    [jobs, setJobs] = useState({}),
    [logs, setLogs] = useState({}),
    [expanded, setExpanded] = useState({}),
    [elapsed, setElapsed] = useState(0),
    [prompt, setPrompt] = useState(''),
    [workspace, setWorkspace] = useState(''),
    [selected, setSelected] = useState('auto'),
    [running, setRunning] = useState(false),
    [result, setResult] = useState(''),
    [error, setError] = useState(''),
    [confirmInstall, setConfirmInstall] = useState(null),
    [tab, setTab] = useState('agents'),
    [accounts, setAccounts] = useState([]),
    [newProvider, setNewProvider] = useState('claude'),
    [newName, setNewName] = useState('Personal'),
    [accountMessage, setAccountMessage] = useState(''),
    [accountChecks, setAccountChecks] = useState({}),
    [integrations, setIntegrations] = useState({}),
    [authJobs, setAuthJobs] = useState({}),
    [activeAccount, setActiveAccount] = useState(null),
    [showAuthLogs, setShowAuthLogs] = useState(false);
  const refresh = () =>
    invoke('agents')
      .then(setAgents)
      .catch(e => setError(String(e)));
  const modelChoice = chats.find(c => c.id === activeChat)?.modelChoice || 'auto';
  useEffect(() => {
    setProjectError('');
  }, [activeChat]);
  const routingPriority = chats.find(c => c.id === activeChat)?.routingPriority || 'balanced';
  // Personal ratings plus, in a project shared with the team, the teammates' ratings from its folder.
  const loadRouteFeedback = () =>
    invoke('route_feedback_stats', {projectId: viewRef.current?.project || activeProject || null})
      .then(setRouteFeedback)
      .catch(() => {});
  useEffect(() => {
    loadRouteFeedback();
    window.addEventListener('nexus-route-feedback', loadRouteFeedback);
    return () => window.removeEventListener('nexus-route-feedback', loadRouteFeedback);
  }, [activeProject]);
  const routeOptions = {
    feedback: routeFeedback,
    priority: routingPriority,
    models: modelChoices,
    connections: providerRows,
    hasFiles: draftFiles.length > 0,
    hasImages: draftFiles.some(f => f.mime?.startsWith('image/') && f.mime !== 'image/svg+xml'),
    executionMode,
    reasoningMode,
    selection: modelChoice,
    quotaLeft: quotaLeftByProvider(accounts, quotaReports, statuslineReports),
  };
  const routePreview = routingAdvice(chatDraft, routeOptions);
  const activeChatRow = chats.find(c => c.id === activeChat);
  const teamMode = activeChatRow?.teamMode || (activeChatRow?.teamEnabled ? 'team' : 'auto');
  const teamPreview = teamPlan(chatDraft, routeOptions, teamMode);
  const [browserState, setBrowserState] = useState(null),
    [browserBusy, setBrowserBusy] = useState(false),
    [browserError, setBrowserError] = useState('');
  useEffect(() => {
    let live = true;
    setBrowserError('');
    if (!activeChat) {
      setBrowserState(null);
      return;
    }
    invoke('browser_tools_status', {chatId: activeChat})
      .then(v => live && setBrowserState({...v, chatId: activeChat}))
      .catch(() => live && setBrowserState(null));
    return () => {
      live = false;
    };
  }, [activeChat]);
  const browserMode = browserState?.chatId === activeChat ? browserState.mode : 'builtin';
  // The chat browser pane is hidden until an agent works in the browser (or the user opens it);
  // closing it during an answer keeps it closed until that answer ends. Width is remembered.
  const [browserPaneOpen, setBrowserPaneOpen] = useState(false),
    browserDismissed = useRef(false),
    [browserPaneWidth, setBrowserPaneWidth] = useState(() => {
      try {
        return Math.min(900, Math.max(360, Number(localStorage.getItem('nexus-browser-width')) || 480));
      } catch {
        return 480;
      }
    });
  function toggleBrowserPane(value) {
    setBrowserPaneOpen(value);
    browserDismissed.current = !value;
  }
  function resizeBrowserPane(value) {
    const next = Math.round(Math.min(Math.max(360, value), Math.max(360, window.innerWidth * 0.6)));
    setBrowserPaneWidth(next);
    try {
      localStorage.setItem('nexus-browser-width', String(next));
    } catch {}
  }
  async function saveBrowserMode(mode) {
    if (!activeChat) return;
    const chatId = activeChat;
    setBrowserBusy(true);
    setBrowserError('');
    try {
      const v = await invoke('save_chat_browser', {chatId, mode});
      setBrowserState(s => (s?.chatId === chatId ? {...v, chatId} : s));
    } catch (e) {
      setBrowserError(String(e));
    } finally {
      setBrowserBusy(false);
    }
  }
  async function installBrowser() {
    const chatId = activeChat;
    setBrowserBusy(true);
    setBrowserError('');
    setBrowserState(s => s && {...s, installing: true});
    try {
      const v = await invoke('install_browser_tools');
      setBrowserState(s => s && {...s, ...v, mode: s.mode, chatId: s.chatId});
    } catch (e) {
      setBrowserError(String(e));
      if (chatId)
        invoke('browser_tools_status', {chatId})
          .then(v => setBrowserState(s => (s?.chatId === chatId ? {...v, chatId} : s)))
          .catch(() => {});
    } finally {
      setBrowserBusy(false);
      setBrowserState(s => s && {...s, installing: false});
    }
  }
  async function openBrowserExtension() {
    try {
      await invoke('open_browser_extension_page');
    } catch (e) {
      setBrowserError(String(e));
    }
  }
  async function saveTeamMode(mode) {
    if (!activeChat || modelSaving || chatSending) return;
    const chatId = activeChat;
    setModelSaving(true);
    try {
      const saved = await invoke('save_chat_team', {chatId, enabled: mode === 'team', mode});
      setChats(rows => rows.map(c => (c.id === chatId ? saved : c)));
    } catch (e) {
      setProjectError(String(e));
    } finally {
      setModelSaving(false);
    }
  }
  async function saveModelChoice(value) {
    if (!activeChat || modelSaving) return;
    const chatId = activeChat;
    setModelSaving(true);
    try {
      const saved = await invoke('save_chat_model', {chatId, modelChoice: value});
      setChats(rows => rows.map(c => (c.id === chatId ? saved : c)));
    } catch (e) {
      setProjectError(loc('Не удалось сохранить модель: ') + String(e));
    } finally {
      setModelSaving(false);
    }
  }
  async function saveRoutingPriority(value) {
    if (!activeChat || modelSaving || chatSending) return;
    const chatId = activeChat;
    setModelSaving(true);
    try {
      const saved = await invoke('save_chat_routing_priority', {chatId, priority: value});
      routeApproval.current = null;
      setChats(rows => rows.map(c => (c.id === chatId ? saved : c)));
    } catch (e) {
      setProjectError(loc('Не удалось сохранить приоритет: ') + String(e));
    } finally {
      setModelSaving(false);
    }
  }
  useEffect(() => {
    refresh();
    let un;
    let live = true;
    listen('install-event', e => {
      let v = e.payload;
      setJobs(s => ({
        ...s,
        [v.id]: {
          phase: v.phase,
          started: s[v.id]?.started || Date.now(),
          success: v.success,
          completedAt: v.success !== null ? Date.now() : null,
        },
      }));
      setLogs(s => ({...s, [v.id]: ((s[v.id] || '') + '\n' + v.message).slice(-60000)}));
      if (v.success !== null) {
        refresh();
        refreshAccounts();
        setExpanded(old => ({...old, [v.id]: false}));
      }
    }).then(f => {
      if (live) un = f;
      else f();
    });
    const sync = () =>
      invoke('install_status')
        .then(items => {
          setJobs(old => {
            const next = {...old};
            for (const v of items) {
              const wasComplete = old[v.id]?.success === true;
              next[v.id] = {
                ...old[v.id],
                phase: v.phase,
                started: old[v.id]?.started || Date.now(),
                success: v.success,
                completedAt: v.success !== null ? old[v.id]?.completedAt || Date.now() : null,
              };
              if (v.success === true && !wasComplete) {
                refresh();
                refreshAccounts();
                setExpanded(prev => ({...prev, [v.id]: false}));
              }
            }
            return next;
          });
        })
        .catch(() => {});
    sync();
    const poll = setInterval(sync, 2500);
    const timer = setInterval(() => setElapsed(Date.now()), 1000);
    return () => {
      live = false;
      un?.();
      clearInterval(timer);
      clearInterval(poll);
    };
  }, []);
  useEffect(() => {
    let live = true,
      unlisten;
    listen('chat-progress', e => {
      if (sendingRef.current && e.payload.chatId === activeRunRef.current?.chatId)
        setChatTrace(e.payload.stage);
    }).then(f => {
      if (live) unlisten = f;
      else f();
    });
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    let live = true,
      unlisten;
    listen('chat-text', e => {
      if (sendingRef.current && e.payload.chatId === activeRunRef.current?.chatId)
        setStreamText(e.payload.text);
    })
      .then(f => {
        if (live) unlisten = f;
        else f();
      })
      .catch(() => {});
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    let live = true,
      off,
      closed;
    listen('chat-question', e => {
      if (sendingRef.current && e.payload.chatId === activeRunRef.current?.chatId)
        setAgentQuestion(e.payload);
    })
      .then(f => {
        if (live) off = f;
        else f();
      })
      .catch(() => {});
    listen('chat-question-closed', e => setAgentQuestion(v => (v?.id === e.payload.id ? null : v)))
      .then(f => {
        if (live) closed = f;
        else f();
      })
      .catch(() => {});
    return () => {
      live = false;
      off?.();
      closed?.();
    };
  }, []);
  async function attachFiles(list) {
    if (filesBusy || chatSending || !activeProject) return;
    const files = Array.from(list || []),
      project = activeProject;
    if (files.length + draftFiles.length > 8) {
      setProjectError(loc('Можно прикрепить до 8 файлов'));
      return;
    }
    if (
      files.some(f => f.size > 20000000) ||
      files.reduce((n, f) => n + f.size, 0) + draftFiles.reduce((n, f) => n + f.size, 0) > 40000000
    ) {
      setProjectError(loc('Максимум 20 МБ на файл и 40 МБ на сообщение'));
      return;
    }
    setFilesBusy(true);
    setProjectError('');
    try {
      for (const file of files) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = () => reject(Error(loc('Не удалось прочитать ') + file.name));
          reader.readAsDataURL(file);
        });
        const stored = await invoke('upload_attachment', {
          projectId: project,
          name: file.name,
          mime: file.type,
          data,
        });
        if (viewRef.current.project === project) setDraftFiles(v => [...v, stored]);
      }
    } catch (e) {
      setProjectError(String(e));
    } finally {
      setFilesBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }
  useEffect(() => {
    let live = true;
    const off = [];
    for (const [event, handler] of [
      [
        'chat-permission',
        e => {
          if (e.payload.chatId === activeRunRef.current?.chatId) setAgentPermission(e.payload);
        },
      ],
      ['chat-permission-closed', e => setAgentPermission(v => (v?.id === e.payload.id ? null : v))],
    ])
      listen(event, handler)
        .then(f => {
          if (live) off.push(f);
          else f();
        })
        .catch(() => {});
    return () => {
      live = false;
      off.forEach(f => f());
    };
  }, []);
  async function answerPermission(allow, remember = false) {
    const p = agentPermission;
    if (!p) return;
    await invoke('answer_agent_permission', {chatId: p.chatId, id: p.id, allow, remember});
    setAgentPermission(null);
  }
  async function answerQuestion(values) {
    const question = agentQuestion;
    if (!question) return;
    await invoke('answer_agent_question', {chatId: question.chatId, id: question.id, answers: values});
    setAgentQuestion(null);
  }
  useEffect(() => {
    try {
      localStorage.setItem('nexus-reasoning-mode', reasoningMode);
    } catch {}
  }, [reasoningMode]);
  const modelLoadRef = useRef(false),
    modelReloadPendingRef = useRef(false);
  async function loadChatModels() {
    if (modelLoadRef.current) {
      modelReloadPendingRef.current = true;
      return;
    }
    modelLoadRef.current = true;
    setModelsBusy(true);
    setModelLoadError('');
    try {
      setModelChoices(await invoke('list_chat_models'));
    } catch (e) {
      setModelLoadError(loc('Не удалось загрузить модели: ') + String(e));
    } finally {
      modelLoadRef.current = false;
      setModelsBusy(false);
      if (modelReloadPendingRef.current) {
        modelReloadPendingRef.current = false;
        queueMicrotask(loadChatModels);
      }
    }
  }
  useEffect(() => {
    loadChatModels();
  }, [
    accounts.map(a => a.id).join(','),
    Object.entries(accountChecks)
      .map(([id, c]) => id + ':' + c.status)
      .sort()
      .join(','),
  ]);

  const reloadProjects = async () => {
    try {
      setProjects(await invoke('list_projects'));
    } catch (e) {
      setProjectError(String(e));
    }
  };
  useEffect(() => {
    reloadProjects();
  }, []);
  viewRef.current = {project: activeProject, chat: activeChat};
  useEffect(() => {
    try {
      if (activeProject) localStorage.setItem('nexus-active-project', activeProject);
      if (activeChat && chats.some(c => c.id === activeChat && c.projectId === activeProject))
        localStorage.setItem('nexus-active-chat:' + activeProject, activeChat);
    } catch {}
  }, [activeProject, activeChat, chats]);
  useEffect(() => {
    if (projects.length && !projects.some(p => p.id === activeProject)) setActiveProject(projects[0].id);
  }, [projects]);
  useEffect(() => {
    let live = true;
    setChatsReady(false);
    if (!sendingRef.current) {
      setAgentQuestion(null);
      setAgentPermission(null);
    }
    setReplyTo(null);
    setActiveChat('');
    setChatMessages([]);
    setChatTrace('');
    setChats([]);
    if (activeProject) {
      const p = projects.find(p => p.id === activeProject);
      if (p) setWorkspace(p.workspace);
      invoke('list_project_chats', {projectId: activeProject})
        .then(rows => {
          if (live) {
            setChats(rows);
            let saved = '';
            try {
              saved = localStorage.getItem('nexus-active-chat:' + activeProject) || '';
            } catch {}
            setActiveChat(
              pendingChatRef.current?.project === activeProject
                ? pendingChatRef.current.chat
                : rows.find(c => c.id === saved)?.id || rows[rows.length - 1]?.id || ''
            );
            pendingChatRef.current = null;
            setChatsReady(true);
          }
        })
        .catch(e => live && setProjectError(String(e)));
    }
    return () => {
      live = false;
    };
  }, [activeProject]);
  useEffect(() => {
    let live = true;
    setReplyTo(null);
    setChatMessages([]);
    setHistoryMeta({hasMore: false, beforeId: null});
    historyRef.current = {busy: false};
    prependAnchor.current = null;
    setHistoryBusy(false);
    if (!sendingRef.current) setChatTrace('');
    if (activeChat)
      invoke('chat_message_page', {chatId: activeChat, beforeId: null, limit: 40})
        .then(page => {
          if (live) {
            setChatMessages(page.messages);
            setHistoryMeta({hasMore: page.hasMore, beforeId: page.beforeId});
            setHistoryChat(activeChat);
          }
        })
        .catch(e => {
          if (live) {
            setProjectError(String(e));
            setHistoryChat(activeChat);
          }
        });
    return () => {
      live = false;
    };
  }, [activeChat]);
  useEffect(() => {
    const refresh = async () => {
      const project = activeProject;
      if (!project) return;
      try {
        const rows = await invoke('list_project_chats', {projectId: project});
        if (viewRef.current.project !== project) return;
        setChats(rows);
        // An empty chat id is an open draft of a new chat: keep it.
        if (viewRef.current.chat && !rows.some(c => c.id === viewRef.current.chat))
          setActiveChat(rows.at(-1)?.id || '');
      } catch (e) {
        setProjectError(String(e));
      }
    };
    window.addEventListener('nexus-chat-lifecycle', refresh);
    return () => window.removeEventListener('nexus-chat-lifecycle', refresh);
  }, [activeProject]);
  const chatScroll = useChatScroll(activeChat, [chatMessages, chatSending, streamText]);
  async function loadOlderMessages() {
    if (historyRef.current.busy || !historyMeta.hasMore || !historyMeta.beforeId || !activeChat) return;
    const chat = activeChat,
      request = {busy: true};
    historyRef.current = request;
    setHistoryBusy(true);
    setProjectError('');
    try {
      const page = await invoke('chat_message_page', {
        chatId: chat,
        beforeId: historyMeta.beforeId,
        limit: 40,
      });
      if (viewRef.current.chat !== chat || historyRef.current !== request) return;
      const el = chatScroll.viewport.current;
      if (el) {
        chatScroll.keepReading();
        prependAnchor.current = {chat, top: el.scrollTop, height: el.scrollHeight};
      }
      setChatMessages(rows => prependMessages(rows, page.messages));
      setHistoryMeta({hasMore: page.hasMore, beforeId: page.beforeId});
    } catch (e) {
      if (viewRef.current.chat === chat) setProjectError(loc('Не удалось загрузить историю: ') + String(e));
    } finally {
      if (historyRef.current === request) {
        request.busy = false;
        setHistoryBusy(false);
      }
    }
  }
  useLayoutEffect(() => {
    const saved = prependAnchor.current,
      el = chatScroll.viewport.current;
    if (saved && el && saved.chat === activeChat) {
      el.scrollTop = saved.top + el.scrollHeight - saved.height;
      prependAnchor.current = null;
      chatScroll.onScroll();
    }
  }, [chatMessages]);
  const currentChatSending = chatSending && activeRunRef.current?.chatId === activeChat;
  // The side panel holds the chat browser and opened files; the browser streams only while its tab is shown.
  const panelShown = browserPaneOpen && !!activeChat && (panelView === 'browser' || panelFiles.length > 0);
  const browserPaneShown = panelShown && panelView === 'browser';
  function openPanelFile(input) {
    const file = panelFile(input);
    setPanelFiles(list => (list.some(f => f.key === file.key) ? list : [...list, file].slice(-8)));
    setPanelView(file.key);
    setBrowserPaneOpen(true);
  }
  function closePanelFile(key) {
    const rest = panelFiles.filter(f => f.key !== key);
    setPanelFiles(rest);
    if (panelView === key) setPanelView(rest.at(-1)?.key || 'browser');
    if (!rest.length && !chatBrowser.available) setBrowserPaneOpen(false);
  }
  useEffect(() => {
    // Paths in answers (`src/a.rs:12`) and links to local files open here.
    const open = e =>
      e.detail?.path && openPanelFile({source: 'project', path: e.detail.path, line: e.detail.line});
    window.addEventListener('nexus-open-file', open);
    return () => window.removeEventListener('nexus-open-file', open);
  });
  const chatBrowser = useChatBrowser({
    chatId: activeChat,
    paneOpen: browserPaneShown,
    status: browserState?.chatId === activeChat ? browserState : null,
    agentBusy: currentChatSending,
  });
  // Each chat starts with the pane hidden; it opens by itself when the agent starts using the browser.
  useEffect(() => {
    setBrowserPaneOpen(false);
    browserDismissed.current = false;
    setPlanOpen(false);
    setPanelFiles([]);
    setPanelView('browser');
  }, [activeChat]);
  useEffect(() => {
    if (!currentChatSending) browserDismissed.current = false;
  }, [currentChatSending]);
  useEffect(() => {
    if (chatBrowser.activity && currentChatSending && !browserDismissed.current) {
      setPanelView('browser');
      setBrowserPaneOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatBrowser.activity]);
  const visibleTurns = chatMessages.filter(m => m.role !== 'system'),
    lastAnswerId = visibleTurns.at(-1)?.role === 'assistant' ? visibleTurns.at(-1).id : null,
    lastUserId =
      [...chatMessages].reverse().find(m => m.role === 'user' && !String(m.id).startsWith('pending-'))?.id ||
      null;
  const historyLoading =
    !!activeChat && historyChat !== activeChat && chatMessages.length === 0 && !currentChatSending;
  const shortcutRef = useRef(null);
  shortcutRef.current = name => {
    const index = chats.findIndex(c => c.id === activeChat);
    if (name === 'newChat') {
      window.dispatchEvent(new Event('nexus-new-chat'));
      return true;
    }
    if (name === 'search') {
      setNavCollapsed(false);
      setTimeout(() => window.dispatchEvent(new Event('nexus-focus-search')), 0);
      return true;
    }
    if (name === 'connections') {
      setConnectionTarget(null);
      setTab('accounts');
      setOpen(true);
      return true;
    }
    if (name === 'model') {
      const trigger = document.querySelector('.composer-tools .model-choice');
      if (trigger && !trigger.disabled) {
        trigger.click();
        return true;
      }
      return false;
    }
    if (name === 'sidebar') {
      setNavCollapsed(v => !v);
      return true;
    }
    if (name === 'textBigger' || name === 'textSmaller' || name === 'textReset') {
      setTextSize(v => stepTextSize(v, name === 'textBigger' ? 1 : name === 'textSmaller' ? -1 : 0));
      return true;
    }
    if (name === 'find') {
      if (!activeChat || !chatMessages.length) return false;
      setFindOpen(true);
      return true;
    }
    if (chatSending) return false;
    if (name === 'previous' && index > 0) {
      setActiveChat(chats[index - 1].id);
      return true;
    }
    if (name === 'next' && index >= 0 && index < chats.length - 1) {
      setActiveChat(chats[index + 1].id);
      return true;
    }
    return false;
  };
  // Per-chat drafts: text and uploaded files follow the chat they were written in (also across restarts).
  useLayoutEffect(() => {
    const key = draftKey(activeChat, activeProject);
    if (draftOwner.current === key) return;
    draftOwner.current = key;
    draftSkip.current = true;
    const saved = loadDraft(localStorage, key);
    setChatDraft(saved.text);
    setDraftFiles(saved.files);
  }, [activeChat, activeProject]);
  useEffect(() => {
    if (draftSkip.current) {
      draftSkip.current = false;
      return;
    }
    const key = draftOwner.current;
    if (!key) return;
    const timer = setTimeout(() => saveDraft(localStorage, key, chatDraft, draftFiles), 250);
    return () => clearTimeout(timer);
  }, [chatDraft, draftFiles]);
  useEffect(() => {
    setBookmarks(activeChat ? loadBookmarks(localStorage, activeChat) : []);
    setFindOpen(false);
    setEditing(null);
    setChatMenu(null);
  }, [activeChat]);
  useEffect(() => {
    try {
      localStorage.setItem('nexus-quick-replies', prefs.quickReplies ? 'on' : 'off');
      localStorage.setItem('nexus-notify', prefs.notify ? 'on' : 'off');
    } catch {}
  }, [prefs]);
  useEffect(() => {
    if (!chatMenu) return;
    const close = e => {
      if (!e.target.closest?.('.chat-heading-actions')) setChatMenu(null);
    };
    const esc = e => {
      if (e.key === 'Escape') setChatMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [chatMenu]);
  // Message text size: one CSS variable, everything inside answers is sized in em.
  useEffect(() => {
    document.documentElement.style.setProperty('--chat-font-size', textSize + 'px');
    try {
      localStorage.setItem('nexus-text-size', String(textSize));
    } catch {}
  }, [textSize]);
  useEffect(() => {
    try {
      localStorage.setItem('nexus-minimap', minimapOn ? 'on' : 'off');
    } catch {}
  }, [minimapOn]);
  function navigateHistory(top, smooth) {
    const el = chatScroll.viewport.current;
    if (!el) return;
    chatScroll.keepReading();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({top, behavior: smooth && !reduce ? 'smooth' : 'auto'});
  }
  function bookmark(message) {
    if (activeChat) setBookmarks(toggleBookmark(localStorage, activeChat, message));
  }
  // Scrolls to a message, loading older pages first when it is not in the loaded part of the history.
  async function revealMessage(id) {
    const chat = activeChat;
    if (!chat) return;
    if (!chatMessages.some(m => m.id === id) && historyMeta.hasMore) {
      let before = historyMeta.beforeId,
        more = historyMeta.hasMore,
        collected = [];
      try {
        while (more && before && !collected.some(m => m.id === id)) {
          const page = await invoke('chat_message_page', {chatId: chat, beforeId: before, limit: 60});
          if (viewRef.current.chat !== chat) return;
          collected = [...page.messages, ...collected];
          before = page.beforeId;
          more = page.hasMore;
        }
      } catch (e) {
        setProjectError(loc('Не удалось загрузить историю: ') + String(e));
        return;
      }
      chatScroll.keepReading();
      setChatMessages(rows => prependMessages(rows, collected));
      setHistoryMeta({hasMore: more, beforeId: before});
    }
    chatScroll.keepReading();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.querySelector(
          '[data-message-id="' + (globalThis.CSS?.escape ? CSS.escape(id) : id) + '"]'
        );
        if (!el) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({block: 'center', behavior: reduce ? 'auto' : 'smooth'});
        el.classList.remove('message-flash');
        void el.offsetWidth;
        el.classList.add('message-flash');
        setTimeout(() => el.classList.remove('message-flash'), 1800);
      })
    );
  }
  const loadAllMessages = chat => invoke('list_chat_messages', {chatId: chat});
  async function exportChat(kind) {
    setChatMenu(null);
    const chat = chats.find(c => c.id === activeChat);
    if (!chat) return;
    try {
      const rows = await loadAllMessages(chat.id);
      const markdown = chatToMarkdown({
        title: chat.title,
        project: projects.find(p => p.id === activeProject)?.name,
        messages: rows,
      });
      if (kind === 'copy') {
        await navigator.clipboard.writeText(markdown);
        setExportNote({text: loc('Чат скопирован в Markdown')});
      } else {
        const path = await invoke('save_chat_export', {fileName: chat.title, content: markdown});
        setExportNote({text: loc('Сохранено: ') + path.split('/').slice(-2).join('/'), path});
      }
    } catch (e) {
      setProjectError(loc('Экспорт не выполнен: ') + String(e));
    }
  }
  // Errors and notices go to the toasts at the top of the window and close by themselves.
  useEffect(() => {
    if (!exportNote) return;
    const path = exportNote.path;
    notify(exportNote.text, {
      tone: 'success',
      action: path && {
        label: loc('Показать в Finder'),
        run: () => invoke('reveal_chat_export', {path}).catch(e => setProjectError(String(e))),
      },
    });
    setExportNote(null);
  }, [exportNote]);
  useEffect(() => installScrollFades(), []);
  useEffect(() => installChatEdgeFade(), []);
  useToastOn(projectError, () => setProjectError(''), 'error', {
    label: loc('Подключения'),
    run: () => setOpen(true),
  });
  useToastOn(accountMessage, () => setAccountMessage(''), 'info');
  useToastOn(browserError, () => setBrowserError(''), 'error');
  function regenerate(message) {
    const index = chatMessages.findIndex(m => m.id === message.id);
    const request = chatMessages
      .slice(0, index)
      .reverse()
      .find(m => m.role === 'user');
    if (!request) {
      setProjectError(loc('Исходный запрос не загружен — прокрутите историю выше'));
      return;
    }
    sendChat(request.content, message.id, true);
  }
  async function saveEdit(message, text) {
    try {
      const updated = await invoke('edit_last_user_message', {
        chatId: message.chatId || activeChat,
        messageId: message.id,
        text,
      });
      setEditing(null);
      const index = chatMessages.findIndex(m => m.id === message.id);
      const answer = chatMessages.slice(index + 1).find(m => m.role === 'assistant');
      setChatMessages(rows => rows.map(r => (r.id === updated.id ? updated : r)));
      if (answer) sendChat(updated.content, answer.id, true);
      else sendChat(updated.content);
    } catch (e) {
      setProjectError(String(e));
    }
  }
  function notifyReady(message) {
    if (!prefs.notify || document.hasFocus() || !message) return;
    const chat = chats.find(c => c.id === message.chatId);
    invoke('notify_answer_ready', {
      title: 'Nexus · ' + (chat?.title || loc('ответ готов')),
      body: excerpt(message.content, 160) || loc('Ответ готов'),
    }).catch(() => {});
  }
  // Global shortcuts. Open dialogs own the keyboard, so nothing fires while one is shown.
  useEffect(() => {
    const key = e => {
      const name = shortcutFor(e);
      if (!name) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (shortcutRef.current?.(name)) e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  function navigateChat(chat, project = activeProject) {
    if (project !== activeProject) {
      pendingChatRef.current = {project, chat};
      setActiveProject(project);
    } else setActiveChat(chat);
  }
  useEffect(() => {
    const read = () => {
      const last = chatMessages.filter(m => m.role === 'assistant').at(-1);
      if (activeChat && last && document.hasFocus() && !chatScroll.showLatest && !currentChatSending)
        invoke('mark_chat_read', {chatId: activeChat, messageId: last.id})
          .then(() => window.dispatchEvent(new Event('nexus-chat-read')))
          .catch(() => {});
    };
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, [activeChat, chatMessages, currentChatSending, chatScroll.showLatest]);

  useEffect(() => {
    if (
      chatSending ||
      !pendingRequestMatches(routeOffer, {
        projectId: activeProject,
        chatId: activeChat,
        text: chatDraft,
        modelChoice,
        priority: routingPriority,
        attachmentIds: draftFiles.map(f => f.id),
        replyId: replyTo?.id,
      })
    )
      return;
    const advice = routingAdvice(routeOffer.text, routeOptions);
    if (!advice.offer && advice.choice) {
      routeApproval.current = {text: routeOffer.text, choice: advice.choice};
      setOpen(false);
      sendChat(routeOffer.text);
    }
  }, [modelChoices, providerRows, executionMode, reasoningMode, routingPriority]);
  useEffect(() => {
    if (
      routeOffer &&
      !pendingRequestMatches(routeOffer, {
        projectId: activeProject,
        chatId: activeChat,
        text: chatDraft,
        modelChoice,
        priority: routingPriority,
        attachmentIds: draftFiles.map(f => f.id),
        replyId: replyTo?.id,
      })
    )
      setRouteOffer(null);
  }, [routeOffer, activeProject, activeChat, chatDraft, modelChoice, draftFiles, replyTo, routingPriority]);
  async function submitChat(override, continueMessageId) {
    const input = typeof override === 'string' ? override : chatDraft;
    if (sendingRef.current || filesBusy || modelSaving || (!input.trim() && !draftFiles.length)) return;
    const mentioned =
      modelChoice === 'auto'
        ? modelChoices.find(
            m =>
              m.provider.startsWith('custom-') &&
              input.toLowerCase().includes('@' + m.label.split(' · ')[0].toLowerCase())
          )
        : null;
    if (mentioned) routeApproval.current = {text: input, choice: mentioned.id};
    if (
      (modelChoice === 'auto' || modelChoice.startsWith('agent-auto:')) &&
      !continueMessageId &&
      routeApproval.current?.text !== input
    ) {
      const advice = routingAdvice(input, routeOptions);
      if (advice.error) {
        setProjectError(advice.error);
        return;
      }
      if (advice.offer) {
        setRouteOffer({
          ...advice,
          priority: routeOptions.priority,
          text: input,
          projectId: activeProject,
          chatId: activeChat,
          attachmentIds: draftFiles.map(f => f.id),
          replyId: replyTo?.id || null,
        });
        return;
      }
      const choice = advice.choice;
      if (choice) routeApproval.current = {text: input, choice};
    }
    return sendChat(override, continueMessageId);
  }
  async function sendChat(override, continueMessageId, regenerateAnswer = false) {
    const input = typeof override === 'string' ? override : chatDraft;
    if (modelSaving) return;
    const resolved = routingAdvice(input, {
      ...routeOptions,
      selection: routeApproval.current?.text === input ? routeApproval.current.choice : modelChoice,
    });
    if (resolved.error || !resolved.choice) {
      setProjectError(resolved.error || loc('Нет совместимой модели. Проверьте подключения и параметры.'));
      return;
    }

    const team = continueMessageId
      ? null
      : teamPlan(
          (replyTo
            ? loc('Контекст цитаты: ') + replyTo.content.slice(0, 3000).replace(/\n/g, ' ') + '\n'
            : '') + input,
          routeOptions,
          teamMode
        );
    if (team?.error) {
      setProjectError(team.error);
      return;
    }
    if (
      !activeProject ||
      !chatsReady ||
      (!input.trim() && !draftFiles.length) ||
      sendingRef.current ||
      filesBusy
    )
      return;
    setContinuingId(continueMessageId || null);
    setContinuingMode(regenerateAnswer ? 'regenerate' : 'continue');
    setRunStartedAt(Date.now());
    sendingRef.current = true;
    stopRequestedRef.current = false;
    setStopping(false);
    activeRunRef.current = {
      requestId:
        globalThis.crypto?.randomUUID?.() || 'r' + Date.now() + '-' + Math.random().toString(36).slice(2),
      chatId: activeChat,
    };
    setStreamText('');
    setChatSending(true);
    const content =
        (replyTo
          ? loc('Ответ на сообщение NEXUS:\n') +
            replyTo.content
              .slice(0, 3000)
              .split('\n')
              .map(l => '> ' + l)
              .join('\n') +
            '\n\n'
          : '') + (input.trim() || (draftFiles.length ? loc('Посмотри приложенные файлы.') : '')),
      project = activeProject;
    const attachments = continueMessageId ? [] : draftFiles;
    let chatId = activeChat;
    setProjectError('');
    setChatTrace('Selecting an available agent…');
    try {
      if (!chatId) {
        const c = await invoke('create_project_chat', {
          projectIdValue: project,
          title: Array.from(content).slice(0, 30).join(''),
        });
        chatId = c.id;
        saveDraft(localStorage, draftKey('', project), '', []);
        setChats(v => [...v, c]);
        setActiveChat(chatId);
        window.dispatchEvent(new Event('nexus-chat-lifecycle'));
        viewRef.current = {project, chat: chatId};
      }
      if (!continueMessageId) {
        setReplyTo(null);
        setChatDraft('');
        setChatMessages(v => [...v, {id: 'pending-' + Date.now(), role: 'user', content, attachments}]);
      }
      activeRunRef.current.chatId = chatId;
      // Implicit feedback: how this message reacts to the previous answers (thanks / moving on, a
      // correction, or “what you did earlier does not work”). Explicit ratings are never overridden.
      if (!continueMessageId) {
        const recent = chatMessages.filter(m => m.role === 'assistant' && m.chatId === chatId).slice(-8);
        const signals = reactionSignals(input, recent);
        if (signals.length)
          Promise.all(
            signals.map(s =>
              invoke('record_route_feedback', {
                messageId: s.messageId,
                signal: s.signal,
                explicit: false,
                regression: !!s.regression,
              }).catch(() => false)
            )
          ).then(loadRouteFeedback);
      }
      // In Auto the tree runs again at send time with sampling by the user's ratings (a second chance for
      // agents low in the ranking); its shortlist goes to the arbiter.
      const automatic = modelChoice === 'auto' || modelChoice.startsWith('agent-auto:');
      const auto =
        automatic && !continueMessageId && !team?.steps?.length
          ? routingAdvice(input, {...routeOptions, selection: modelChoice, random: Math.random})
          : null;
      let finalChoice = (auto && !auto.error && auto.choice) || resolved.choice;
      const candidates = auto && !auto.trivial ? arbiterCandidates(auto, routeOptions.quotaLeft) : [];
      if (candidates.length >= 2) {
        setChatTrace(loc('Подбираю модель: уточняю тип задачи и сравниваю {0} варианта', candidates.length));
        const verdict = await invoke('route_arbiter', {
          text: input,
          candidates: candidates.map(c => ({summary: c.summary})),
          accountId: roomiestAccount(accounts, quotaReports, statuslineReports),
        }).catch(() => null);
        const label = id => modelChoices.find(m => m.id === id)?.label || id;
        const steps = [
          [
            loc('Подбор модели'),
            loc('Дерево выбрало кандидатов: {0}.', candidates.map(c => label(c.id)).join(', ')) +
              ' ' +
              auto.reason,
          ],
        ];
        if (verdict) {
          const refined = routingAdvice(input, {
            ...routeOptions,
            override: {kind: verdict.kind, needsActions: verdict.needsActions},
          });
          const same = refined.kind === auto.kind && refined.needsTools === auto.needsTools;
          const picked = candidates[verdict.pick]?.id;
          finalChoice = (same && picked) || refined.choice || finalChoice;
          steps.push([
            loc('Выбрана модель: {0}', label(finalChoice)),
            [
              verdict.why,
              loc('решил {0}', verdict.by),
              same ? '' : loc('тип задачи уточнён: {0}', verdict.kind),
            ]
              .filter(Boolean)
              .join(' · '),
          ]);
        } else {
          steps.push([
            loc('Выбрана модель: {0}', label(finalChoice)),
            loc('Арбитр недоступен или не ответил вовремя; оставлен выбор дерева.'),
          ]);
        }
        await invoke('set_chat_route_note', {
          chatId,
          requestId: activeRunRef.current.requestId,
          steps,
        }).catch(() => {});
        setChatTrace(steps.at(-1)[0]);
      }
      if (stopRequestedRef.current) await invoke('cancel_chat_generation', activeRunRef.current);
      const reply = regenerateAnswer
        ? await invoke('regenerate_chat_answer', {
            chatId,
            messageId: continueMessageId,
            requestId: activeRunRef.current.requestId,
            reasoningMode,
            modelChoice: finalChoice,
            executionMode,
          })
        : await invoke('set_account_limits', {
            limits: quotaLeftByAccount(accounts, quotaReports, statuslineReports),
          })
            .catch(() => {})
            .then(() =>
              invoke('unified_chat_send', {
                chatId,
                text: content,
                strategy: 'balanced',
                attachmentIds: attachments.map(f => f.id),
                requestId: activeRunRef.current.requestId,
                continueMessageId: continueMessageId || null,
                reasoningMode,
                modelChoice: finalChoice,
                executionMode,
                teamAutoPlan: !!team?.autoPlan,
                teamSteps: team?.steps?.length
                  ? team.steps.map(({id, title, prompt, dependsOn, modelChoice, reason, effort, kind}) => ({
                      id,
                      title,
                      prompt,
                      dependsOn,
                      modelChoice,
                      reason,
                      ...(effort ? {effort} : {}),
                      ...(kind ? {kind} : {}),
                    }))
                  : null,
              })
            );
      if (viewRef.current.project === project && viewRef.current.chat === chatId) {
        if (!continueMessageId) setDraftFiles([]);
        setStreamText('');
        setChatTrace(`${reply.route} · ${reply.tier}`);
        setChatMessages(v =>
          v.some(m => m.id === reply.message.id)
            ? v.map(m => (m.id === reply.message.id ? reply.message : m))
            : [...v, reply.message]
        );
      }
      notifyReady(reply.message);
      if (finalChoice && reply?.message?.id)
        invoke('note_answer_route', {
          messageId: reply.message.id,
          modelId: finalChoice,
          kind: (auto || resolved).kind || '*',
          projectId: project || null,
        }).catch(() => {});
    } catch (e) {
      if (viewRef.current.project === project && viewRef.current.chat === chatId) {
        setProjectError(chatErrorMessage(e));
        if (!continueMessageId) setChatDraft(draft => draft || input);
        setChatTrace(loc('Запрос не выполнен'));
      }
    } finally {
      if (chatId) {
        try {
          const page = await invoke('chat_message_page', {chatId, beforeId: null, limit: 40});
          if (viewRef.current.project === project && viewRef.current.chat === chatId)
            setChatMessages(rows => mergeLatestMessages(rows, page.messages));
        } catch (e) {
          if (viewRef.current.project === project) setProjectError(String(e));
        }
      }
      routeApproval.current = null;
      setRouteOffer(null);
      setContinuingId(null);
      activeRunRef.current = null;
      stopRequestedRef.current = false;
      setStopping(false);
      sendingRef.current = false;
      setChatSending(false);
      setStreamText('');
      setAgentQuestion(null);
    }
  }
  async function stopChat() {
    if (!sendingRef.current || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setStopping(true);
    const run = activeRunRef.current;
    if (!run?.chatId) return;
    try {
      await invoke('cancel_chat_generation', run);
    } catch (e) {
      stopRequestedRef.current = false;
      setStopping(false);
      setProjectError(loc('Не удалось остановить генерацию: ') + String(e));
    }
  }
  async function addProject() {
    try {
      const p = await invoke('create_project', {name: projectName, workspace: projectPath});
      await reloadProjects();
      setActiveProject(p.id);
      setProjectName('');
      setProjectPath('');
      setProjectError('');
    } catch (e) {
      setProjectError(String(e));
    }
  }
  async function addChat() {
    try {
      const c = await invoke('create_project_chat', {
        projectIdValue: activeProject,
        title: chatTitle || 'New chat',
      });
      setChats(v => [...v, c]);
      setActiveChat(c.id);
      setChatTitle('');
      setProjectError('');
    } catch (e) {
      setProjectError(String(e));
    }
  }
  async function saveChatMessage(role, content) {
    if (!activeChat) return;
    try {
      const m = await invoke('append_chat_message', {chatId: activeChat, role, content});
      setChatMessages(v => [...v, m]);
    } catch (e) {
      setProjectError('Chat save failed: ' + String(e));
    }
  }
  async function deleteProject() {
    if (!activeProject || !deleteProjectConfirm) return;
    try {
      await invoke('remove_project', {projectId: activeProject});
      setActiveProject('');
      setDeleteProjectConfirm(false);
      await reloadProjects();
      setProjectError('');
    } catch (e) {
      setProjectError(String(e));
    }
  }
  async function inspectNative() {
    setDiagBusy(true);
    try {
      const data = await invoke('nexus_diagnostics');
      setNativeDiagnostics(data);
      setAccountMessage(
        data.accessibilityTrusted
          ? 'NEXUS Accessibility granted. See diagnostics below.'
          : 'NEXUS Accessibility is denied for this running process. See diagnostics below.'
      );
    } catch (e) {
      setNativeDiagnostics({error: String(e)});
      setAccountMessage('Native diagnostics: ' + String(e));
    } finally {
      setDiagBusy(false);
    }
  }
  async function refreshClaudeAccessibility() {
    setAxBusy(true);
    try {
      const result = await invoke('claude_accessibility_usage');
      setAxUsage(result);
      if (result.status === 'permission_required' || result.status === 'unavailable')
        setAccountMessage(result.detail);
    } catch (e) {
      setAxUsage({status: 'error', detail: String(e)});
      setAccountMessage('Claude Accessibility: ' + String(e));
    } finally {
      setAxBusy(false);
    }
  }

  const refreshAccounts = () =>
    invoke('list_accounts')
      .then(rows => {
        setAccounts(rows);
        setAccountsReady(true);
      })
      .catch(e => {
        setAccountsReady(true);
        setAccountMessage(String(e));
      });
  useEffect(() => {
    refreshAccounts();
    invoke('integrations')
      .then(items => setIntegrations(Object.fromEntries(items.map(x => [x.id, x]))))
      .catch(e => setError(String(e)));
  }, []);
  async function addProfile() {
    try {
      await invoke('add_account', {provider: newProvider, name: newName});
      setAccountMessage('Profile added. Click Login to authorize.');
      refreshAccounts();
    } catch (e) {
      setAccountMessage(String(e));
    }
  }
  const checkingAccounts = useRef(new Set());
  async function checkProfile(id) {
    if (checkingAccounts.current.has(id) || ['starting', 'waiting'].includes(authJobs[id]?.phase)) return;
    checkingAccounts.current.add(id);
    setAccountChecks(v =>
      v[id] ? v : {...v, [id]: {status: 'checking', detail: loc('Проверяем подключение…')}}
    );
    try {
      const result = await invoke('check_account', {id});
      setAccountChecks(v => ({...v, [id]: result}));
    } catch (e) {
      setAccountChecks(v => ({...v, [id]: {status: 'error', detail: String(e)}}));
    } finally {
      checkingAccounts.current.delete(id);
    }
  }
  useEffect(() => {
    const refresh = () => accounts.forEach(a => checkProfile(a.id));
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [accounts.map(a => a.id).join(','), open]);
  async function statuslineRead(id) {
    try {
      const data = await invoke('claude_statusline_read', {id});
      setStatuslineReports(v => ({...v, [id]: data}));
    } catch (e) {
      setAccountMessage('Status Line read: ' + String(e));
    }
  }
  async function statuslineAction(id, action) {
    try {
      setAccountMessage(await invoke(action, {id}));
      await statuslineRead(id);
    } catch (e) {
      setAccountMessage('Status Line: ' + String(e));
    }
  }
  async function refreshQuota(id) {
    const acct = accounts.find(a => a.id === id);
    if (acct?.provider === 'claude') {
      await statuslineRead(id);
      // Without a fresh reading Claude Code is asked once (at most every 10 minutes) for its limits.
      invoke('claude_limits_probe', {id})
        .then(ran => ran && statuslineRead(id))
        .catch(() => {});
      return;
    }
    setQuotaReports(s => ({...s, [id]: {...s[id], status: 'checking', detail: 'Checking provider...'}}));
    try {
      const r = await invoke('account_quota', {id});
      setQuotaReports(s => ({...s, [id]: r}));
    } catch (e) {
      setQuotaReports(s => ({
        ...s,
        [id]: {...s[id], status: 'error', detail: String(e), source: s[id]?.source || 'NEXUS'},
      }));
    }
  }
  async function refreshIsolation() {
    try {
      const r = await invoke('account_isolation');
      setIsolation(Object.fromEntries(r.map(x => [x.profileId, x])));
    } catch (e) {
      setAccountMessage(String(e));
    }
  }
  useEffect(() => {
    let off,
      live = true;
    listen('claude-limits', e => {
      const id = e.payload?.accountId;
      if (id) statuslineRead(id);
    })
      .then(f => {
        if (live) off = f;
        else f();
      })
      .catch(() => {});
    return () => {
      live = false;
      off?.();
    };
  }, []);
  useEffect(() => {
    accounts.forEach(a => refreshQuota(a.id));
    if (!open) return;
    const timer = setInterval(() => accounts.forEach(a => refreshQuota(a.id)), 60000);
    return () => clearInterval(timer);
  }, [open, accounts.map(a => a.id).join(',')]);
  function quotaText(q) {
    if (!q || q.status === 'checking') return 'Checking quota...';
    if (q.status !== 'available') return 'Quota not exposed by provider';
    const left =
      q.primaryUsedPercent == null
        ? ''
        : `${Math.max(0, 100 - q.primaryUsedPercent).toFixed(0)}% left (primary)`;
    const weekly =
      q.secondaryUsedPercent == null
        ? ''
        : `${Math.max(0, 100 - q.secondaryUsedPercent).toFixed(0)}% left (secondary)`;
    return [left, weekly].filter(Boolean).join(' · ') || 'Quota unavailable';
  }
  async function loginProfile(id) {
    setAuthJobs(s => ({...s, [id]: {phase: 'starting', log: 'Starting login...'}}));
    try {
      await invoke('account_login', {id});
    } catch (e) {
      setAuthJobs(s => ({...s, [id]: {phase: 'error', log: String(e)}}));
    }
  }
  useEffect(() => {
    let active = true;
    const unsubs = [];
    listen('auth-event', e => {
      const v = e.payload;
      setAuthJobs(s => ({
        ...s,
        [v.id]: {phase: v.phase, log: ((s[v.id]?.log || '') + '\n' + v.message).slice(-20000)},
      }));
      if (v.phase === 'ready') {
        setAccountChecks(s => ({...s, [v.id]: {status: 'ready', detail: loc('Вход подтверждён')}}));
        loadChatModels();
      }
    }).then(u => {
      if (active) unsubs.push(u);
      else u();
    });
    const poll = setInterval(() => {
      for (const a of accounts) {
        {
          invoke('auth_status', {id: a.id})
            .then(v => setAuthJobs(s => ({...s, [a.id]: v})))
            .catch(() => {});
        }
      }
    }, 2000);
    return () => {
      active = false;
      unsubs.forEach(u => u());
      clearInterval(poll);
    };
  }, [accounts]);
  async function openGuide(id) {
    const url = integrations[id]?.url;
    if (!url) return;
    try {
      await invoke('open_external', {url});
    } catch (e) {
      window.open(url, '_blank');
    }
  }
  async function cancelLogin(id) {
    try {
      await invoke('cancel_auth', {id});
    } catch (e) {
      setAccountMessage(String(e));
    }
  }
  async function removeProfile(id) {
    try {
      await invoke('remove_account', {id});
      setActiveAccount(null);
      setRemovePending(null);
      setAccountChecks(s => {
        const n = {...s};
        delete n[id];
        return n;
      });
      setAuthJobs(s => {
        const n = {...s};
        delete n[id];
        return n;
      });
      await refreshAccounts();
      setAccountMessage('Profile removed from NEXUS. Credentials were not deleted.');
    } catch (e) {
      setAccountMessage('Remove failed: ' + String(e));
      throw e;
    }
  }
  async function openCodexLogin() {
    try {
      await invoke('open_codex_device_page');
    } catch (e) {
      setAccountMessage('Browser: ' + String(e));
    }
  }
  const busy = phase => ['queued', 'checking', 'installing', 'verifying'].includes(phase);
  const step = phase =>
    ({queued: 0, checking: 1, installing: 2, verifying: 3, installed: 3, failed: 0})[phase] ?? 0;

  async function install(id) {
    setConfirmInstall(null);
    setJobs(s => ({...s, [id]: {phase: 'queued', started: Date.now(), success: null}}));
    setLogs(s => ({...s, [id]: 'Queued'}));
    setExpanded(s => ({...s, [id]: true}));
    try {
      await invoke('install_agent', {id});
    } catch (e) {
      setJobs(s => ({...s, [id]: {phase: 'failed', started: s[id]?.started || Date.now(), success: false}}));
      setLogs(s => ({...s, [id]: (s[id] || '') + '\nERROR: ' + String(e)}));
      setError('Installation ' + id + ': ' + String(e));
    }
  }
  async function cancel(id) {
    try {
      await invoke('cancel_install', {id});
      setLogs(s => ({...s, [id]: (s[id] || '') + '\\nCancellation requested'}));
    } catch (e) {
      setError(String(e));
    }
  }
  async function refreshRegistry() {
    setRegistryBusy(true);
    try {
      setRegistryRows(await invoke('model_registry'));
    } catch (e) {
      setError('Model registry: ' + String(e));
    } finally {
      setRegistryBusy(false);
    }
  }
  async function createAiPlan() {
    setError('');
    setAdaptivePlan(null);
    setAdaptiveResults({});
    setAdaptiveBusy(true);
    try {
      setAdaptivePlan(
        await invoke('ai_adaptive_plan', {task: prompt, strategy: adaptiveStrategy, workspace})
      );
    } catch (e) {
      setError('AI planner: ' + String(e));
    } finally {
      setAdaptiveBusy(false);
    }
  }
  async function createAdaptivePlan() {
    setError('');
    setAdaptivePlan(null);
    setAdaptiveResults({});
    setAdaptiveBusy(true);
    try {
      setAdaptivePlan(await invoke('adaptive_plan', {task: prompt, strategy: adaptiveStrategy}));
    } catch (e) {
      setError(String(e));
    } finally {
      setAdaptiveBusy(false);
    }
  }
  async function executeAdaptiveStep(step) {
    setError('');
    setAdaptiveBusy(true);
    try {
      const deps = step.dependsOn
        .map(id => {
          const previous = adaptiveResults[id];
          if (!previous || previous.status !== 'completed') throw Error(`Dependency ${id} is not completed`);
          return `Step ${id}:\n${previous.output.slice(0, 3500)}`;
        })
        .join('\n\n');
      const output = await invoke('adaptive_execute_with_context', {
        step,
        workspace,
        context: deps.slice(0, 14000),
      });
      if (activeChat) {
        await saveChatMessage('user', `Step ${step.id}: ${step.title}\\n${step.prompt}`);
        await saveChatMessage('assistant', output);
      }
      setAdaptiveResults(old => ({...old, [step.id]: {status: 'completed', output}}));
    } catch (e) {
      setAdaptiveResults(old => ({...old, [step.id]: {status: 'failed', output: String(e)}}));
    } finally {
      setAdaptiveBusy(false);
    }
  }
  async function run() {
    setError('');
    setResult('');
    setRunning(true);
    if (activeChat) await saveChatMessage('user', prompt);
    try {
      if (taskAccount !== 'auto') {
        {
          const output = await invoke('run_task_account', {accountId: taskAccount, prompt, workspace});
          setResult(output);
          if (activeChat) await saveChatMessage('assistant', output);
        }
      } else {
        const id = selected === 'auto' ? await invoke('auto_pick') : selected;
        {
          const output = await invoke('run_task', {id, prompt, workspace});
          setResult(output);
          if (activeChat) await saveChatMessage('assistant', output);
        }
      }
    } catch (e) {
      setError(String(e));
      if (activeChat) await saveChatMessage('assistant', 'Error: ' + String(e));
    } finally {
      setRunning(false);
    }
  }
  return (
    <div
      className={
        'app' +
        (chatMessages.length === 0 && !currentChatSending && !historyLoading ? ' cinematic-home' : '') +
        (navCollapsed ? ' nav-collapsed' : '') +
        (panelShown ? ' browser-pane-open' : '')
      }
      style={panelShown ? {'--browser-pane-width': browserPaneWidth + 'px'} : undefined}
    >
      <Toaster />
      <SceneBackdrop />
      <div className="workspace-persona">
        <ParticlePersona interactive={chatMessages.length === 0 && !currentChatSending && !historyLoading} />
      </div>
      <ThinkingLightning active={currentChatSending} chatId={activeChat} />
      <ProjectNavigation
        projects={projects}
        activeProject={activeProject}
        activeChat={activeChat}
        disabled={filesBusy}
        busy={chatSending}
        onProject={setActiveProject}
        onChat={navigateChat}
        onCreated={c => {
          if (c.projectId !== activeProject) {
            pendingChatRef.current = {project: c.projectId, chat: c.id};
            setActiveProject(c.projectId);
          } else {
            setChats(v => (v.some(x => x.id === c.id) ? v.map(x => (x.id === c.id ? c : x)) : [...v, c]));
            setActiveChat(c.id);
          }
        }}
        onDraftChat={projectId => {
          // A new chat is only a draft until its first message: nothing is created in the project yet.
          if (projectId !== activeProject) {
            pendingChatRef.current = {project: projectId, chat: ''};
            setActiveProject(projectId);
          } else setActiveChat('');
          setTimeout(() => document.querySelector('[aria-label="Message to NEXUS"]')?.focus(), 0);
        }}
        onProjects={reloadProjects}
        onConnections={() => {
          setConnectionTarget(null);
          setOpen(true);
          setTab('accounts');
        }}
      />
      <header
        onMouseDown={e => {
          if (e.button === 0 && !e.target.closest('button')) {
            e.preventDefault();
            invoke('drag_main_window').catch(err => setError(String(err)));
          }
        }}
      >
        <div className="mac-navigation">
          <button
            title={withShortcut(loc('Предыдущий чат'), 'previous')}
            aria-label={loc('Предыдущий чат')}
            disabled={chatSending || chats.findIndex(c => c.id === activeChat) <= 0}
            onClick={() => setActiveChat(chats[chats.findIndex(c => c.id === activeChat) - 1].id)}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            title={withShortcut(loc('Следующий чат'), 'next')}
            aria-label={loc('Следующий чат')}
            disabled={chatSending || chats.findIndex(c => c.id === activeChat) >= chats.length - 1}
            onClick={() => setActiveChat(chats[chats.findIndex(c => c.id === activeChat) + 1].id)}
          >
            <ArrowRight size={16} />
          </button>
          <button
            title={withShortcut(loc('Показать или скрыть проекты'), 'sidebar')}
            aria-label={loc('Показать или скрыть проекты')}
            onClick={() => setNavCollapsed(v => !v)}
          >
            <PanelLeft size={16} />
          </button>
        </div>
        <div className="brand">
          <span className="mark">◇</span> NEXUS <span className="minor">/ DESKTOP</span>
        </div>
        <div className="topright">
          <span className="status">● LOCAL SYSTEM</span>
          {activeChat && !panelShown && (chatBrowser.available || panelFiles.length > 0) && (
            <button
              title={loc('Показать боковую панель')}
              onClick={() => {
                if (!panelFiles.length) setPanelView('browser');
                toggleBrowserPane(true);
              }}
            >
              <PanelRight size={14} aria-hidden="true" /> {panelFiles.length ? loc('Панель') : loc('Браузер')}
            </button>
          )}
          <button
            title={withShortcut(loc('Агенты и подключения'), 'connections')}
            onClick={() => setOpen(!open)}
          >
            {loc('Агенты')} <span className="count">{agents.filter(a => a.installed).length}</span>
          </button>
        </div>
      </header>
      <main>
        <div className="ambient"></div>
        <div className="hologram">
          <div className="halo"></div>
          <div className="head"></div>
          <div className="neck"></div>
          <div className="body"></div>
          <div className="ring"></div>
        </div>
        <div className="hero">
          <span className="eyebrow">NEXUS INTELLIGENCE</span>
          <h1>How can I help?</h1>
          <p>One command. Your AI team.</p>
        </div>
      </main>
      <section className="bottom">
        {
          <section
            className="unified-chat"
            onDragEnter={e => {
              if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
              e.preventDefault();
              dragDepth.current++;
              setDragActive(true);
            }}
            onDragOver={e => {
              if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
            }}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDragActive(false);
            }}
            onDrop={e => {
              if (!e.dataTransfer?.files?.length) return;
              e.preventDefault();
              dragDepth.current = 0;
              setDragActive(false);
              attachFiles(e.dataTransfer.files);
            }}
          >
            <DropOverlay active={dragActive} />
            <div className="chat-heading">
              <div>
                <span className="chat-heading-project">
                  {projects.find(p => p.id === activeProject)?.name || loc('Проект')}
                </span>
                <strong
                  className="chat-heading-title"
                  title={chats.find(c => c.id === activeChat)?.title || loc('Новый чат')}
                >
                  {chats.find(c => c.id === activeChat)?.title || loc('Новый чат')}
                </strong>
              </div>
              {activeChat && chatMessages.length > 0 && (
                <div className="chat-heading-actions">
                  <button
                    type="button"
                    title={withShortcut(loc('Найти в чате'), 'find')}
                    aria-label={loc('Найти в чате')}
                    aria-pressed={findOpen}
                    onClick={() => setFindOpen(v => !v)}
                  >
                    <Search size={15} />
                  </button>
                  {bookmarks.length > 0 && (
                    <button
                      type="button"
                      title={loc('Закладки чата')}
                      aria-label={loc('Закладки: ') + bookmarks.length}
                      aria-expanded={chatMenu === 'bookmarks'}
                      onClick={() => setChatMenu(v => (v === 'bookmarks' ? null : 'bookmarks'))}
                    >
                      <Bookmark size={15} />
                      <span>{bookmarks.length}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    title={loc('Вид и экспорт')}
                    aria-label={loc('Вид и экспорт чата')}
                    aria-expanded={chatMenu === 'more'}
                    onClick={() => setChatMenu(v => (v === 'more' ? null : 'more'))}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {chatMenu === 'bookmarks' && (
                    <div className="chat-heading-menu" role="menu">
                      {bookmarks.length ? (
                        bookmarks.map(b => (
                          <button
                            role="menuitem"
                            key={b.id}
                            onClick={() => {
                              setChatMenu(null);
                              revealMessage(b.id);
                            }}
                          >
                            <small>{b.role === 'user' ? loc('Вы') : 'Nexus'}</small>
                            {b.excerpt || loc('Сообщение')}
                          </button>
                        ))
                      ) : (
                        <p>{loc('Закладок нет. Отметьте сообщение значком закладки под ним.')}</p>
                      )}
                    </div>
                  )}
                  {chatMenu === 'more' && (
                    <div className="chat-heading-menu more-menu">
                      <div className="menu-section-title">{loc('Размер текста')}</div>
                      <div className="text-size-row" role="group" aria-label={loc('Размер текста сообщений')}>
                        <button
                          type="button"
                          aria-label={loc('Мельче (⌘−)')}
                          title={loc('Мельче (⌘−)')}
                          disabled={textSize === TEXT_SIZES[0]}
                          onClick={() => setTextSize(v => stepTextSize(v, -1))}
                        >
                          <Minus size={14} />
                        </button>
                        <div className="text-size-scale">
                          {TEXT_SIZES.map(n => (
                            <button
                              type="button"
                              key={n}
                              aria-pressed={n === textSize}
                              aria-label={n + loc(' пикселей')}
                              onClick={() => setTextSize(n)}
                              style={{fontSize: Math.round(n * 0.8)}}
                            >
                              A
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          aria-label={loc('Крупнее (⌘=)')}
                          title={loc('Крупнее (⌘=)')}
                          disabled={textSize === TEXT_SIZES.at(-1)}
                          onClick={() => setTextSize(v => stepTextSize(v, 1))}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="text-size-foot">
                        <span>{textSize} px</span>
                        <button
                          type="button"
                          disabled={textSize === DEFAULT_TEXT_SIZE}
                          onClick={() => setTextSize(v => stepTextSize(v, 0))}
                        >
                          {loc('Сбросить (⌘0)')}
                        </button>
                      </div>
                      <hr />
                      <label className="menu-toggle">
                        <input
                          type="checkbox"
                          checked={minimapOn}
                          onChange={e => setMinimapOn(e.target.checked)}
                        />
                        <MapIcon size={14} />
                        {loc('Миникарта вместо полосы прокрутки')}
                      </label>
                      <hr />
                      <button role="menuitem" onClick={() => exportChat('copy')}>
                        <Copy size={14} />
                        {loc('Копировать весь чат (Markdown)')}
                      </button>
                      <button role="menuitem" onClick={() => exportChat('file')}>
                        <FileDown size={14} />
                        {loc('Сохранить в «Загрузки» (.md)')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {findOpen && activeChat && (
              <ChatFind
                key={activeChat}
                chatId={activeChat}
                loadAll={loadAllMessages}
                onJump={revealMessage}
                onClose={() => setFindOpen(false)}
                containerSelector=".chat-thread-content"
              />
            )}
            <ProjectBoard
              projectId={activeProject}
              chatId={activeChat}
              onChat={navigateChat}
              open={boardOpen}
              onToggle={() => setBoardOpen(v => !v)}
            />
            {
              <>
                <div className={'chat-scroll-area' + (minimapOn ? ' minimap-scroll' : '')}>
                  {minimapOn && activeChat && chatMessages.length > 1 && (
                    <ChatMinimap
                      viewportRef={chatScroll.viewport}
                      contentRef={chatScroll.content}
                      bookmarks={bookmarks}
                      onNavigate={navigateHistory}
                      version={
                        chatMessages.length + ':' + streamText.length + ':' + textSize + ':' + (editing || '')
                      }
                    />
                  )}
                  <div
                    className="chat-thread"
                    ref={chatScroll.viewport}
                    onScroll={() => {
                      chatScroll.onScroll();
                      if (chatScroll.viewport.current?.scrollTop < 160) loadOlderMessages();
                    }}
                    onWheel={chatScroll.onWheel}
                    role="log"
                    aria-label="Conversation"
                    aria-live="polite"
                    aria-busy={currentChatSending}
                  >
                    <div className="chat-thread-content" ref={chatScroll.content}>
                      {historyMeta.hasMore && (
                        <button
                          type="button"
                          className="history-load-more"
                          disabled={historyBusy}
                          onClick={loadOlderMessages}
                        >
                          {historyBusy ? loc('Загружаю историю…') : loc('Загрузить более ранние сообщения')}
                        </button>
                      )}
                      {historyLoading && <ChatSkeleton />}
                      {chatMessages.length === 0 && !currentChatSending && !historyLoading && (
                        <WelcomeScreen
                          loading={!accountsReady}
                          accounts={accounts}
                          checks={accountChecks}
                          quotas={quotaReports}
                          statuslines={statuslineReports}
                          onConnections={() => {
                            setConnectionTarget(null);
                            setOpen(true);
                          }}
                          system={activeProject === 'nexus-system'}
                          onPrompt={value => {
                            setChatDraft(value);
                            document.querySelector('[aria-label="Message to NEXUS"]')?.focus();
                          }}
                        />
                      )}
                      {chatMessages.map((m, index) => (
                        <React.Fragment key={m.id}>
                          {dayKey(m.createdAt) &&
                            dayKey(m.createdAt) !== dayKey(chatMessages[index - 1]?.createdAt) && (
                              <div
                                className="chat-day-separator"
                                role="separator"
                                aria-label={dayLabel(m.createdAt)}
                              >
                                <span>{dayLabel(m.createdAt)}</span>
                              </div>
                            )}
                          <article
                            className={
                              'chat-bubble ' +
                              m.role +
                              (m.id === continuingId &&
                              currentChatSending &&
                              continuingMode === 'regenerate' &&
                              !streamText
                                ? ' is-regenerating'
                                : '')
                            }
                            data-message-id={m.id}
                            data-thinking-target={
                              currentChatSending && m.id === continuingId ? 'true' : undefined
                            }
                          >
                            <div className="chat-role">
                              {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'NEXUS' : 'System'}
                            </div>
                            {m.role === 'system' ? (
                              <details className="response-details">
                                <summary>{loc('Технические детали')}</summary>
                                <pre>{m.content}</pre>
                              </details>
                            ) : editing === m.id ? (
                              <MessageEditor
                                message={m}
                                busy={chatSending}
                                onCancel={() => setEditing(null)}
                                onSave={text => saveEdit(m, text)}
                              />
                            ) : (
                              <CollapsibleMessage long={m.role === 'user' && isLongMessage(m.content)}>
                                <div className="chat-markdown">
                                  <ChatMarkdown
                                    agentContext={{
                                      enabled: activeProject === 'nexus-system' && !chatSending,
                                      chatId: m.chatId,
                                      messageId: m.id,
                                      onConnected: async () => {
                                        await loadChatModels();
                                        refresh();
                                        const page = await invoke('chat_message_page', {
                                          chatId: activeChat,
                                          beforeId: null,
                                          limit: 40,
                                        });
                                        setChatMessages(rows => mergeLatestMessages(rows, page.messages));
                                      },
                                    }}
                                    content={
                                      m.id === continuingId &&
                                      currentChatSending &&
                                      continuingMode === 'regenerate'
                                        ? streamText || m.content
                                        : m.id === continuingId && currentChatSending
                                          ? mergeContinuation(
                                              m.content === 'Генерация остановлена.' ? '' : m.content,
                                              streamText
                                            )
                                          : m.content
                                    }
                                    allowQuestion={
                                      !currentChatSending &&
                                      !chatMessages.slice(index + 1).some(x => x.role === 'user')
                                    }
                                    selections={m.questionSelections}
                                    legacyReply={
                                      chatMessages[index + 1]?.role === 'user'
                                        ? chatMessages[index + 1].content
                                        : null
                                    }
                                    onQuestion={async (text, selection) => {
                                      const updated = await invoke('save_question_selection', {
                                        chatId: m.chatId,
                                        messageId: m.id,
                                        block: selection.block,
                                        answers: selection.answers,
                                      });
                                      setChatMessages(rows =>
                                        rows.map(row => (row.id === updated.id ? updated : row))
                                      );
                                      await sendChat(text);
                                    }}
                                  />
                                  {m.attachments?.length > 0 && (
                                    <div className="message-files">
                                      {m.attachments.map(file => (
                                        <FileTile
                                          key={file.id}
                                          file={file}
                                          onOpen={file => openPanelFile({source: 'attachment', ...file})}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </CollapsibleMessage>
                            )}
                            {m.stopped && (
                              <div className="generation-stopped">
                                {continuingId === m.id && currentChatSending ? (
                                  loc('Продолжаю ответ…')
                                ) : (
                                  <>
                                    {loc('Ответ остановлен')}{' '}
                                    <button
                                      type="button"
                                      className="continue-generation"
                                      disabled={chatSending || filesBusy}
                                      onClick={() => sendChat(loc('Продолжить'), m.id)}
                                    >
                                      {loc('Продолжить')}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {m.details && <ResponseDetails raw={m.details} />}{' '}
                            {m.role === 'assistant' && (
                              <MessageActions
                                message={m}
                                locked={chatSending}
                                bookmarked={bookmarks.some(b => b.id === m.id)}
                                onBookmark={bookmark}
                                canRegenerate={m.id === lastAnswerId}
                                onRegenerate={regenerate}
                                onReply={m => {
                                  setReplyTo(m);
                                  document.querySelector('[aria-label="Message to NEXUS"]')?.focus();
                                }}
                                onUpdate={updated =>
                                  setChatMessages(rows =>
                                    rows.map(row => (row.id === updated.id ? updated : row))
                                  )
                                }
                              />
                            )}
                            {m.role === 'user' &&
                              editing !== m.id &&
                              !String(m.id).startsWith('pending-') && (
                                <UserActions
                                  message={m}
                                  locked={chatSending}
                                  canEdit={m.id === lastUserId}
                                  onEdit={msg => setEditing(msg.id)}
                                  onToComposer={msg => {
                                    setChatDraft(
                                      msg.content.replace(/^Ответ на сообщение NEXUS:\n(?:> .*\n)*\n/, '')
                                    );
                                    document.querySelector('[aria-label="Message to NEXUS"]')?.focus();
                                  }}
                                  bookmarked={bookmarks.some(b => b.id === m.id)}
                                  onBookmark={bookmark}
                                />
                              )}
                          </article>
                        </React.Fragment>
                      ))}
                      {currentChatSending && !continuingId && streamText && (
                        <article
                          className="chat-bubble assistant streaming-answer"
                          data-thinking-target="true"
                        >
                          <div className="chat-role">NEXUS</div>
                          <div className="chat-markdown">
                            <ChatMarkdown content={streamText} />
                          </div>
                        </article>
                      )}
                      {currentChatSending && (
                        <details
                          className="response-details pending-details"
                          data-thinking-target={!continuingId && !streamText ? 'true' : undefined}
                        >
                          <summary>
                            <GenerationStatus
                              startedAt={runStartedAt}
                              now={elapsed || Date.now()}
                              trace={chatTrace}
                              streaming={!!streamText}
                              regenerating={continuingMode === 'regenerate' && !!continuingId}
                            />
                          </summary>
                          <p role="status">{chatTrace}</p>
                        </details>
                      )}
                      {prefs.quickReplies && !chatSending && lastAnswerId && (
                        <QuickReplies disabled={!chatsReady || filesBusy} onPick={text => submitChat(text)} />
                      )}
                    </div>
                  </div>
                  {chatScroll.showLatest && (
                    <button
                      type="button"
                      className="jump-latest"
                      title={loc('К последнему сообщению')}
                      aria-label={loc('К последнему сообщению')}
                      onClick={chatScroll.jumpToLatest}
                    >
                      <ArrowDown size={18} />
                    </button>
                  )}
                </div>
                {agentPermission?.chatId === activeChat && (
                  <PermissionCard
                    key={agentPermission.id}
                    request={agentPermission}
                    onAnswer={answerPermission}
                  />
                )}
                {agentQuestion?.chatId === activeChat && (
                  <QuestionCard
                    key={agentQuestion.id}
                    questions={agentQuestion.questions}
                    onSubmit={answerQuestion}
                    onCancel={() => answerQuestion({})}
                  />
                )}
                {routeOffer?.projectId === activeProject && routeOffer?.chatId === activeChat && (
                  <section className="routing-offer" aria-label={loc('Выбор агента для задачи')}>
                    <strong>{loc('Нужно совместимое подключение')}</strong>
                    <p>
                      {routeOffer.reason} {routeOffer.warning}
                    </p>
                    <div>
                      <button
                        onClick={() => {
                          setConnectionTarget(routeOffer.preferred);
                          setOpen(true);
                        }}
                      >
                        {loc('Установить / подключить')}
                      </button>
                      <button
                        disabled={!routeOffer.fallback}
                        onClick={() => {
                          routeApproval.current = {text: routeOffer.text, choice: routeOffer.fallback};
                          sendChat(routeOffer.text);
                        }}
                      >
                        {loc('Использовать подключённого')}
                      </button>
                      <button onClick={() => setRouteOffer(null)}>{loc('Отмена')}</button>
                    </div>
                    <small>
                      {loc(
                        'После подключения Nexus продолжит этот запрос, если чат и черновик не изменились.'
                      )}
                    </small>
                  </section>
                )}
                <form
                  className="chat-composer"
                  onSubmit={e => {
                    e.preventDefault();
                    submitChat();
                  }}
                >
                  {replyTo && (
                    <div className="reply-preview">
                      <div>
                        <strong>{loc('Ответ на сообщение NEXUS')}</strong>
                        <p>{replyTo.content.slice(0, 180)}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={loc('Отменить цитирование')}
                        title={loc('Отменить цитирование')}
                        onClick={() => setReplyTo(null)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {draftFiles.length > 0 && (
                    <div className="draft-files">
                      {draftFiles.map(file => (
                        <FileTile
                          key={file.id}
                          file={file}
                          onOpen={file => openPanelFile({source: 'attachment', ...file})}
                          onRemove={() => {
                            if (!chatSending) setDraftFiles(v => v.filter(f => f.id !== file.id));
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={e => attachFiles(e.target.files)}
                  />
                  <ComposerInput
                    value={chatDraft}
                    onChange={setChatDraft}
                    onSend={submitChat}
                    maxLength={replyTo ? 8000 : 12000}
                    hasFiles={draftFiles.length > 0}
                    hasHistory={chatMessages.length > 0}
                    suggestionsEnabled={!chatSending && !replyTo}
                    disabled={!activeProject || agentQuestion?.chatId === activeChat}
                    onPaste={e => {
                      const files = e.clipboardData?.files;
                      if (files?.length) {
                        e.preventDefault();
                        attachFiles(files);
                      }
                    }}
                  />
                  <div className="composer-bottom">
                    <div className="composer-tools">
                      <button
                        type="button"
                        className="attach-button"
                        title={
                          chatSending
                            ? loc('Дождитесь окончания ответа, чтобы прикрепить файлы')
                            : filesBusy
                              ? loc('Файлы ещё добавляются')
                              : loc('Прикрепить файлы')
                        }
                        aria-label={loc('Прикрепить файлы')}
                        disabled={!activeProject || chatSending || filesBusy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip size={20} />
                      </button>
                      <button
                        type="button"
                        className={'attach-button composer-plan-toggle' + (planOpen ? ' is-active' : '')}
                        title={loc('План задачи: этапы по тексту запроса, без отправки')}
                        aria-label={loc('План задачи')}
                        aria-expanded={planOpen}
                        disabled={!activeProject || chatSending}
                        onClick={() => setPlanOpen(v => !v)}
                      >
                        <ListChecks size={18} />
                      </button>
                      <CustomSelect
                        modelTree
                        value={modelChoice}
                        models={modelChoices}
                        connections={providerRows}
                        task={classifyTask(chatDraft, draftFiles.length > 0, routeOptions)}
                        reasoningMode={reasoningMode}
                        disabled={chatSending || modelSaving || !activeChat}
                        busy={modelsBusy}
                        onRefresh={loadChatModels}
                        onChange={e => saveModelChoice(e.target.value)}
                      />
                      <ComposerParams
                        disabled={chatSending || !activeChat}
                        summary={composerParamsSummary({
                          priority: routingPriority,
                          priorityLabel: ROUTING_PRIORITIES[routingPriority],
                          reasoning: reasoningMode,
                          reasoningLabel: REASONING_LABELS[reasoningMode],
                          team: teamMode === 'team',
                          browser: browserSummary(browserMode),
                        })}
                        fullSummary={loc(
                          'Приоритет: {0} · Глубина: {1} · {2} · Браузер: {3}',
                          ROUTING_PRIORITIES[routingPriority],
                          REASONING_LABELS[reasoningMode],
                          {auto: loc('Исполнители: авто'), team: loc('Команда'), single: loc('Один агент')}[
                            teamMode
                          ],
                          browserSummary(browserMode) || loc('выключен')
                        )}
                      >
                        <ParamRow
                          label={loc('Приоритет автовыбора')}
                          hint={
                            modelChoice !== 'auto' && !modelChoice.startsWith('agent-auto:')
                              ? loc('Действует только при модели «Авто». Сейчас выбрана конкретная модель.')
                              : loc('Чем руководствоваться, когда модель выбирается автоматически.')
                          }
                        >
                          <CustomSelect
                            className="reasoning-mode"
                            aria-label={loc('Приоритет автовыбора')}
                            title={
                              modelChoice !== 'auto' && !modelChoice.startsWith('agent-auto:')
                                ? loc('Приоритет действует только при модели «Авто»')
                                : loc('Приоритет автовыбора для этого чата')
                            }
                            value={routingPriority}
                            disabled={
                              chatSending ||
                              modelSaving ||
                              !activeChat ||
                              (modelChoice !== 'auto' && !modelChoice.startsWith('agent-auto:'))
                            }
                            onChange={e => saveRoutingPriority(e.target.value)}
                          >
                            {Object.entries(ROUTING_PRIORITIES).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </CustomSelect>
                        </ParamRow>
                        <ParamRow
                          label={loc('Глубина рассуждений')}
                          hint={loc('Независима от модели. Для ACP и API доступна только «Авто».')}
                        >
                          <CustomSelect
                            className="reasoning-mode"
                            aria-label={loc('Режим рассуждений')}
                            title={loc('Глубина рассуждений агента')}
                            disabled={chatSending}
                            value={reasoningMode}
                            onChange={e => setReasoningMode(e.target.value)}
                          >
                            <option value="auto">{loc('Авто')}</option>
                            <option value="fast">{loc('Быстро')}</option>
                            <option value="normal">{loc('Обычно')}</option>
                            <option value="deep">{loc('Глубоко')}</option>
                          </CustomSelect>
                        </ParamRow>
                        <ParamRow
                          label={loc('Исполнители')}
                          hint={loc(
                            '«Авто» делит на части только составные запросы при автоматическом выборе модели и отдаёт каждую часть лучшей для неё модели. «Команда» делит всегда. Каждая часть — отдельный вызов и расход квоты.'
                          )}
                        >
                          <CustomSelect
                            className="reasoning-mode"
                            aria-label={loc('Исполнители запроса')}
                            value={teamMode}
                            disabled={chatSending || modelSaving || !activeChat}
                            onChange={e => saveTeamMode(e.target.value)}
                          >
                            <option value="auto">{loc('Авто')}</option>
                            <option value="single">{loc('Один агент')}</option>
                            <option value="team">{loc('Команда')}</option>
                          </CustomSelect>
                        </ParamRow>
                        <BrowserParam
                          status={browserState?.chatId === activeChat ? browserState : null}
                          disabled={chatSending || !activeChat}
                          busy={browserBusy}
                          error={browserError}
                          onMode={saveBrowserMode}
                          onInstall={installBrowser}
                          onCancel={() => invoke('cancel_browser_install').catch(() => {})}
                          onExtension={openBrowserExtension}
                        />
                        <div className="composer-param-toggles">
                          <label>
                            <input
                              type="checkbox"
                              checked={prefs.quickReplies}
                              onChange={e => setPrefs(p => ({...p, quickReplies: e.target.checked}))}
                            />
                            {loc('Быстрые ответы под последним ответом')}
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={prefs.notify}
                              onChange={e => setPrefs(p => ({...p, notify: e.target.checked}))}
                            />
                            {loc('Уведомлять о готовом ответе, если окно в фоне')}
                          </label>
                        </div>
                      </ComposerParams>
                      <CustomSelect
                        aria-label={loc('Режим работы')}
                        title={
                          executionMode === 'auto'
                            ? loc(
                                'Выполнение без разрешений: агент меняет файлы, запускает команды и работает в браузере чата без вопросов; проверки проекта запускаются сами. Действия в вашем Chrome со входами всё равно подтверждаются.'
                              )
                            : executionMode === 'execute'
                              ? loc(
                                  'Выполнение: агент меняет файлы и запускает команды с вашим подтверждением, затем Nexus предлагает запустить проверки проекта (тесты, линтер, типы) — тоже с подтверждением'
                                )
                              : loc('Обсуждение: агент отвечает и читает файлы, ничего не меняя')
                        }
                        className={
                          'reasoning-mode execution-mode' + (executionMode === 'auto' ? ' is-auto' : '')
                        }
                        value={executionMode}
                        disabled={chatSending}
                        onChange={e => setExecutionMode(e.target.value)}
                      >
                        <option value="discuss">{loc('Обсуждение')}</option>
                        <option value="execute">{loc('Выполнение · с разрешениями')}</option>
                        <option value="auto">{loc('Выполнение · без разрешений')}</option>
                      </CustomSelect>
                      <span>{filesBusy ? loc('Добавляю файлы…') : loc('Enter — отправить')}</span>
                    </div>
                    {currentChatSending ? (
                      <button
                        type="button"
                        className="stop-generation"
                        title={loc('Остановить генерацию')}
                        aria-label={loc('Остановить генерацию')}
                        disabled={stopping}
                        onClick={stopChat}
                      >
                        <Square size={13} fill="currentColor" />
                        <span>{stopping ? loc('Останавливаю…') : loc('Стоп')}</span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        aria-label={loc('Отправить сообщение')}
                        title={
                          !activeProject
                            ? loc('Сначала выберите проект')
                            : filesBusy
                              ? loc('Файлы ещё добавляются')
                              : chatDraft.length > (replyTo ? 8000 : 12000)
                                ? loc('Сообщение слишком длинное')
                                : !chatDraft.trim() && !draftFiles.length
                                  ? loc('Введите сообщение или прикрепите файл')
                                  : loc('Отправить сообщение (Enter)')
                        }
                        disabled={
                          chatSending ||
                          !activeProject ||
                          !chatsReady ||
                          filesBusy ||
                          (!chatDraft.trim() && !draftFiles.length) ||
                          chatDraft.length > (replyTo ? 8000 : 12000)
                        }
                      >
                        <ArrowUp size={20} />
                      </button>
                    )}
                  </div>
                  {planOpen && (
                    <ComposerPlan
                      task={chatDraft}
                      workspace={workspace}
                      onClose={() => setPlanOpen(false)}
                      onUse={text => {
                        setChatDraft(text);
                        setPlanOpen(false);
                      }}
                    />
                  )}
                  <TeamPlanPreview
                    plan={teamPreview}
                    integrator={modelChoices.find(m => m.id === routePreview.choice)?.label || loc('Авто')}
                  />
                  <RoutingPreview route={routePreview} models={modelChoices} draft={chatDraft} />
                  {modelLoadError && (
                    <small className="model-load-error" role="status">
                      {modelLoadError}
                    </small>
                  )}
                </form>
              </>
            }
          </section>
        }
      </section>
      {panelShown && (
        <SidePanel
          width={browserPaneWidth}
          onResize={resizeBrowserPane}
          onClose={() => toggleBrowserPane(false)}
          view={panelView}
          onView={setPanelView}
          files={panelFiles}
          onCloseFile={closePanelFile}
          browserTab={chatBrowser.available || !!chatBrowser.activity || panelView === 'browser'}
        >
          {panelView === 'browser' ? (
            <BrowserView
              browser={chatBrowser}
              chatId={activeChat}
              settings={
                <BrowserParam
                  compact
                  status={browserState?.chatId === activeChat ? browserState : null}
                  disabled={!activeChat}
                  busy={browserBusy}
                  error={browserError}
                  onMode={saveBrowserMode}
                  onInstall={installBrowser}
                  onCancel={() => invoke('cancel_browser_install').catch(() => {})}
                  onExtension={openBrowserExtension}
                />
              }
            />
          ) : (
            panelFiles.find(f => f.key === panelView) && (
              <FileView
                key={panelView}
                file={panelFiles.find(f => f.key === panelView)}
                chatId={activeChat}
              />
            )
          )}
        </SidePanel>
      )}
      {chatBrowser.preview && (
        <BrowserPreview
          browser={chatBrowser}
          onOpen={() => {
            setPanelView('browser');
            toggleBrowserPane(true);
          }}
        />
      )}
      <ConnectionsDialog
        open={open}
        onClose={() => setOpen(false)}
        onReopen={() => setOpen(true)}
        initialProvider={connectionTarget}
        agents={agents}
        accounts={accounts}
        jobs={jobs}
        logs={logs}
        checks={accountChecks}
        authJobs={authJobs}
        quotas={quotaReports}
        statuslines={statuslineReports}
        onInstall={install}
        onCancelInstall={cancel}
        onLogin={loginProfile}
        onCancelLogin={cancelLogin}
        onCheck={checkProfile}
        onQuota={refreshQuota}
        onRemove={removeProfile}
        onRefreshAccounts={refreshAccounts}
        onRefreshAgents={refresh}
        onModels={loadChatModels}
        onProviderRows={setProviderRows}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
