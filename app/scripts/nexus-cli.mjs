#!/usr/bin/env node
// `nexus` — control Nexus from a terminal, a script or another agent, and `nexus mcp` — the same as an
// MCP server (stdio) for Claude Desktop, Claude Code, Codex, Cursor and other MCP clients.
// Talks to the Nexus local API (Agents and connections → Channels → Local API must be on).
// The token is read from NEXUS_TOKEN or, on macOS, from the Keychain item Nexus created (macOS may ask once).
// No dependencies: Node.js 18+.
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';

const VERSION = '1.0.0';
const BASE = (process.env.NEXUS_URL || 'http://127.0.0.1:4719').replace(/\/$/, '');

let cachedToken = null;
function token() {
  if (cachedToken) return cachedToken;
  if (process.env.NEXUS_TOKEN) return (cachedToken = process.env.NEXUS_TOKEN.trim());
  if (process.platform === 'darwin') {
    try {
      cachedToken = execFileSync(
        '/usr/bin/security',
        ['find-generic-password', '-s', 'com.nexus.connections', '-a', 'channel-api', '-w'],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}
      ).trim();
      if (cachedToken) return cachedToken;
    } catch {}
  }
  throw new Error(
    'No API token. Turn on Nexus → Agents and connections → Channels → Local API, or set NEXUS_TOKEN.'
  );
}

export async function api(method, path, body, {timeout = 30000} = {}) {
  const ctrl = new AbortController(),
    timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, {
      method,
      signal: ctrl.signal,
      headers: {
        Authorization: 'Bearer ' + token(),
        ...(body ? {'Content-Type': 'application/json'} : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = {text};
    }
    if (!res.ok && res.status !== 202) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Nexus did not answer in time');
    if (e.cause?.code === 'ECONNREFUSED')
      throw new Error(`Nexus is not reachable at ${BASE}. Is Nexus open and the Local API on?`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function parseArgs(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const waitFor = args => Math.min(Number(args.wait ?? 120) || 0, 300);
const timeoutFor = wait => (wait + 15) * 1000;

export const TOOLS = [
  {
    name: 'nexus_list_projects',
    description: 'List Nexus projects (id, name, working folder).',
    inputSchema: {type: 'object', properties: {}},
    run: () => api('GET', '/v1/projects'),
  },
  {
    name: 'nexus_list_chats',
    description: 'List chats, optionally of one project. Shows which are running.',
    inputSchema: {type: 'object', properties: {project: {type: 'string', description: 'Project id'}}},
    run: a => api('GET', '/v1/chats' + (a.project ? '?project=' + encodeURIComponent(a.project) : '')),
  },
  {
    name: 'nexus_read_chat',
    description: 'Read the latest messages of a Nexus chat.',
    inputSchema: {
      type: 'object',
      properties: {chat: {type: 'string'}, limit: {type: 'number', description: 'Up to 200, default 20'}},
      required: ['chat'],
    },
    run: a => api('GET', `/v1/chats/${encodeURIComponent(a.chat)}/messages?limit=${Number(a.limit) || 20}`),
  },
  {
    name: 'nexus_start_task',
    description:
      'Start a task in a new Nexus chat of a project. Nexus routes it to the best connected agent. Execution mode works only if the user allowed it for the Local API; otherwise it is a discussion.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {type: 'string', description: 'Project id from nexus_list_projects'},
        text: {type: 'string'},
        title: {type: 'string'},
        mode: {type: 'string', enum: ['discuss', 'execute']},
        worktree: {type: 'boolean', description: 'Run the chat on its own git branch'},
        wait: {type: 'number', description: 'Seconds to wait for the answer, up to 300 (default 120)'},
      },
      required: ['project', 'text'],
    },
    run: a => {
      const wait = waitFor(a);
      return api(
        'POST',
        '/v1/chats',
        {project: a.project, text: a.text, title: a.title, mode: a.mode, worktree: !!a.worktree, wait},
        {timeout: timeoutFor(wait)}
      );
    },
  },
  {
    name: 'nexus_send_message',
    description: 'Send a follow-up message to an existing Nexus chat and optionally wait for the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        chat: {type: 'string'},
        text: {type: 'string'},
        mode: {type: 'string', enum: ['discuss', 'execute']},
        wait: {type: 'number'},
      },
      required: ['chat', 'text'],
    },
    run: a => {
      const wait = waitFor(a);
      return api(
        'POST',
        `/v1/chats/${encodeURIComponent(a.chat)}/messages`,
        {text: a.text, mode: a.mode, wait},
        {timeout: timeoutFor(wait)}
      );
    },
  },
  {
    name: 'nexus_stop_chat',
    description: 'Stop the answer that is being generated in a chat (the received text is kept).',
    inputSchema: {type: 'object', properties: {chat: {type: 'string'}}, required: ['chat']},
    run: a => api('POST', `/v1/chats/${encodeURIComponent(a.chat)}/stop`, {}),
  },
  {
    name: 'nexus_list_automations',
    description: 'List scheduled automations with their next and last runs.',
    inputSchema: {type: 'object', properties: {}},
    run: () => api('GET', '/v1/automations'),
  },
  {
    name: 'nexus_run_automation',
    description: 'Run an automation now.',
    inputSchema: {type: 'object', properties: {id: {type: 'string'}}, required: ['id']},
    run: a => api('POST', `/v1/automations/${encodeURIComponent(a.id)}/run`, {}),
  },
];

// Minimal MCP server over stdio (JSON-RPC 2.0, one message per line).
export async function handleMcp(msg) {
  const {id, method, params} = msg;
  const reply = result => ({jsonrpc: '2.0', id, result});
  const error = (code, message) => ({jsonrpc: '2.0', id, error: {code, message}});
  if (method === 'initialize')
    return reply({
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: {tools: {}},
      serverInfo: {name: 'nexus', version: VERSION},
    });
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return null;
  if (method === 'ping') return reply({});
  if (method === 'tools/list')
    return reply({
      tools: TOOLS.map(({name, description, inputSchema}) => ({name, description, inputSchema})),
    });
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) return error(-32602, 'Unknown tool ' + params?.name);
    try {
      const data = await tool.run(params.arguments || {});
      return reply({content: [{type: 'text', text: JSON.stringify(data, null, 2)}]});
    } catch (e) {
      return reply({content: [{type: 'text', text: String(e.message || e)}], isError: true});
    }
  }
  return id === undefined ? null : error(-32601, 'Method not found: ' + method);
}
function serveMcp() {
  const rl = createInterface({input: process.stdin});
  rl.on('line', async line => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return process.stdout.write(
        JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}) + '\n'
      );
    }
    const out = await handleMcp(msg);
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  });
}

const HELP = `nexus ${VERSION} — control Nexus from the terminal

  nexus projects                         list projects
  nexus chats [--project ID]             list chats
  nexus ask --project ID "task" [--wait 120] [--mode execute] [--worktree] [--title T]
                                         start a task in a new chat
  nexus send CHAT "message" [--wait 120] [--mode execute]
  nexus read CHAT [--limit 20]           latest messages
  nexus stop CHAT                        stop the running answer
  nexus automations                      list automations
  nexus run-automation ID                run an automation now
  nexus mcp                              serve these as an MCP server over stdio
  --json                                 print raw JSON

Environment: NEXUS_URL (default http://127.0.0.1:4719), NEXUS_TOKEN.`;

function print(data, args) {
  if (args.json) return console.log(JSON.stringify(data, null, 2));
  if (data.projects) return data.projects.forEach(p => console.log(`${p.id}\t${p.name}\t${p.workspace}`));
  if (data.chats) return data.chats.forEach(c => console.log(`${c.id}\t${c.running ? '● ' : ''}${c.title}`));
  if (data.automations)
    return data.automations.forEach(a =>
      console.log(
        `${a.id}\t${a.enabled ? 'on ' : 'off'}\t${a.name}\tnext: ${a.nextRun ? new Date(a.nextRun * 1000).toLocaleString() : '—'}`
      )
    );
  if (data.messages) return data.messages.forEach(m => console.log(`\n[${m.role}]\n${m.content}`));
  if (data.chatId && 'running' in data) {
    if (data.answer?.content) console.log(data.answer.content);
    else console.log(`Running in chat ${data.chatId}. Read it later: nexus read ${data.chatId}`);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function main(argv) {
  const args = parseArgs(argv),
    [cmd, ...rest] = args._;
  if (!cmd || cmd === 'help' || args.help) return console.log(HELP);
  if (cmd === 'version' || args.version) return console.log(VERSION);
  if (cmd === 'mcp') return serveMcp();
  const tool = name => TOOLS.find(t => t.name === name).run;
  const data = await {
    projects: () => tool('nexus_list_projects')({}),
    chats: () => tool('nexus_list_chats')({project: args.project}),
    ask: () => {
      if (!args.project || !rest.length) throw new Error('Usage: nexus ask --project ID "task"');
      return tool('nexus_start_task')({...args, text: rest.join(' ')});
    },
    send: () => {
      if (rest.length < 2) throw new Error('Usage: nexus send CHAT "message"');
      return tool('nexus_send_message')({...args, chat: rest[0], text: rest.slice(1).join(' ')});
    },
    read: () => tool('nexus_read_chat')({chat: rest[0], limit: args.limit}),
    stop: () => tool('nexus_stop_chat')({chat: rest[0]}),
    automations: () => tool('nexus_list_automations')({}),
    'run-automation': () => tool('nexus_run_automation')({id: rest[0]}),
  }[cmd]?.();
  if (data === undefined) throw new Error(`Unknown command «${cmd}». Run: nexus help`);
  print(data, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => {
    console.error('nexus: ' + (e.message || e));
    process.exit(1);
  });
}
