// Nexus chat browser host: one invisible Google Chrome per chat with its own persistent profile.
// Agents reach it through Playwright MCP (--cdp-endpoint, behind the Nexus gateway); the user sees it
// in the side pane as a live screencast and can click, type and scroll in it. Tabs are restored
// between launches. JSON lines on stdin/stdout talk to Nexus; nothing listens on the network except
// Chrome's own loopback DevTools port. Written by Nexus at runtime.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const modules = process.env.NEXUS_NODE_MODULES,
  profile = process.env.NEXUS_PROFILE_DIR,
  stateFile = process.env.NEXUS_STATE_FILE;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
if (!modules || !profile || !stateFile) {
  send({type: 'error', message: 'Нет настроек браузера чата'});
  process.exit(2);
}
const {chromium} = createRequire(path.join(modules, 'noop.js'))('playwright-core');

const ids = new WeakMap();
let nextId = 1,
  active = null,
  view = 'none',
  userAt = 0,
  idleSince = Date.now(),
  agentActive = false,
  closing = false,
  screencast = null,
  lastFrame = 0,
  tabsTimer = null;
// The page is laid out at the pane's size (like a real browser window), at up to 2× pixel density.
let size = {width: 1280, height: 860, scale: 1};
const emulation = new WeakMap();
async function applySize(page) {
  if (!page || page.isClosed()) return;
  let session = emulation.get(page);
  if (!session) {
    session = await context.newCDPSession(page).catch(() => null);
    if (!session) return;
    emulation.set(page, session);
  }
  await session
    .send('Emulation.setDeviceMetricsOverride', {
      width: size.width,
      height: size.height,
      deviceScaleFactor: size.scale,
      mobile: false,
    })
    .catch(() => {});
}
const tabId = page => {
  if (!ids.has(page)) ids.set(page, nextId++);
  return ids.get(page);
};
const web = url => /^https?:\/\//i.test(url) || url === 'about:blank';
function normalizeUrl(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^localhost:\d+/i.test(text)) return null;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(text)) return 'http://' + text;
  if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text)) return 'https://' + text;
  return 'https://www.google.com/search?q=' + encodeURIComponent(text);
}

fs.mkdirSync(profile, {recursive: true});
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: true,
  viewport: null,
  args: [
    '--remote-debugging-port=0',
    '--window-size=1280,860',
    '--no-first-run',
    '--no-default-browser-check',
    // Only when run as root (CI containers); never on a normal macOS account.
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  ],
});
const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);

function pages() {
  return context.pages().filter(p => !p.isClosed());
}
async function publishTabs() {
  const list = await Promise.all(
    pages().map(async p => ({id: tabId(p), url: p.url(), title: await p.title().catch(() => '')})),
  );
  if (active && active.isClosed()) active = pages().at(-1) || null;
  send({type: 'tabs', tabs: list, active: active ? tabId(active) : null});
  saveState(list);
}
function scheduleTabs() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(() => publishTabs().catch(() => {}), 150);
}
function saveState(list) {
  const urls = list.map(t => t.url).filter(u => /^https?:\/\//i.test(u));
  const index = Math.max(0, list.findIndex(t => active && t.id === tabId(active)));
  try {
    fs.writeFileSync(stateFile + '.tmp', JSON.stringify({tabs: urls.slice(0, 20), active: index}));
    fs.renameSync(stateFile + '.tmp', stateFile);
  } catch {}
}

async function stopScreencast() {
  const current = screencast;
  screencast = null;
  if (current) await current.session.send('Page.stopScreencast').catch(() => {});
  if (current) await current.session.detach().catch(() => {});
}
async function startScreencast() {
  await stopScreencast();
  if (view === 'none' || !active || active.isClosed()) return;
  const page = active,
    session = await context.newCDPSession(page).catch(() => null);
  if (!session) return;
  const full = view === 'full',
    gap = full ? 90 : 900;
  screencast = {session, page};
  session.on('Page.screencastFrame', frame => {
    session.send('Page.screencastFrameAck', {sessionId: frame.sessionId}).catch(() => {});
    const now = Date.now();
    if (screencast?.page !== page || now - lastFrame < gap) return;
    lastFrame = now;
    send({
      type: 'frame',
      tab: tabId(page),
      data: frame.data,
      width: Math.round(frame.metadata.deviceWidth),
      height: Math.round(frame.metadata.deviceHeight),
    });
  });
  // The screencast only sends frames when something changes, so send the current picture right away.
  page
    .evaluate(() => [innerWidth, innerHeight])
    .then(async ([width, height]) => {
      const data = await page.screenshot({type: 'jpeg', quality: full ? 70 : 45, timeout: 5000});
      if (screencast?.page === page)
        send({type: 'frame', tab: tabId(page), data: data.toString('base64'), width, height});
    })
    .catch(() => {});
  await session
    .send('Page.startScreencast', {
      format: 'jpeg',
      quality: full ? 70 : 45,
      maxWidth: full ? Math.round(size.width * size.scale) : 480,
      maxHeight: full ? Math.round(size.height * size.scale) : 360,
      everyNthFrame: full ? 1 : 3,
    })
    .catch(() => {});
}
function activate(page, byUser = false) {
  if (!page || page.isClosed()) return;
  if (byUser) userAt = Date.now();
  if (active === page) return;
  active = page;
  page.bringToFront().catch(() => {});
  startScreencast().catch(() => {});
  scheduleTabs();
}
function watch(page) {
  tabId(page);
  applySize(page);
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return;
    idleSince = Date.now();
    // Follow the agent to the page it is working on, unless the user is driving the browser right now.
    if (page !== active && Date.now() - userAt > 4000) activate(page);
    scheduleTabs();
  });
  page.on('load', scheduleTabs);
  page.on('close', () => {
    if (active === page) {
      active = null;
      activate(pages().at(-1));
    }
    scheduleTabs();
  });
}
context.on('page', page => {
  watch(page);
  if (Date.now() - userAt > 4000 || !active) activate(page);
  scheduleTabs();
});
for (const page of pages()) watch(page);

// Restore the chat's tabs from the last session.
try {
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const urls = (saved.tabs || []).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 20);
  const first = pages()[0] || (await context.newPage());
  for (let i = 0; i < urls.length; i++) {
    const page = i === 0 ? first : await context.newPage();
    page.goto(urls[i], {waitUntil: 'commit', timeout: 20000}).catch(() => {});
  }
  active = pages()[Math.min(saved.active || 0, pages().length - 1)] || first;
} catch {
  active = pages()[0] || (await context.newPage());
}
send({type: 'ready', port});
await publishTabs();

async function handle(msg) {
  idleSince = Date.now();
  const page = active && !active.isClosed() ? active : null;
  switch (msg.type) {
    case 'view':
      view = ['full', 'thumb', 'none'].includes(msg.mode) ? msg.mode : 'none';
      await startScreencast();
      return;
    case 'resize': {
      const width = Math.round(+msg.width),
        height = Math.round(+msg.height),
        scale = Math.min(2, Math.max(1, +msg.scale || 1));
      if (!(width >= 320 && width <= 2400 && height >= 240 && height <= 2000)) return;
      if (width === size.width && height === size.height && scale === size.scale) return;
      size = {width, height, scale};
      await Promise.all(pages().map(applySize));
      return startScreencast();
    }
    case 'agent':
      agentActive = !!msg.active;
      return;
    case 'navigate': {
      const url = normalizeUrl(msg.url);
      if (!url || !web(url)) return send({type: 'notice', message: 'Можно открывать только адреса http(s).'});
      userAt = Date.now();
      const target = page || (await context.newPage());
      activate(target, true);
      await target.goto(url, {waitUntil: 'commit', timeout: 30000}).catch(e => send({type: 'notice', message: String(e.message || e).split('\n')[0]}));
      return scheduleTabs();
    }
    case 'back':
      userAt = Date.now();
      return page?.goBack({waitUntil: 'commit'}).catch(() => {});
    case 'forward':
      userAt = Date.now();
      return page?.goForward({waitUntil: 'commit'}).catch(() => {});
    case 'reload':
      userAt = Date.now();
      return page?.reload({waitUntil: 'commit'}).catch(() => {});
    case 'newTab': {
      userAt = Date.now();
      const created = await context.newPage();
      activate(created, true);
      const url = msg.url && normalizeUrl(msg.url);
      if (url && web(url)) created.goto(url, {waitUntil: 'commit'}).catch(() => {});
      return;
    }
    case 'selectTab':
      return activate(
        pages().find(p => tabId(p) === msg.id),
        true,
      );
    case 'closeTab': {
      userAt = Date.now();
      const target = pages().find(p => tabId(p) === msg.id);
      if (!target) return;
      if (pages().length === 1) await context.newPage();
      await target.close().catch(() => {});
      return;
    }
    case 'click':
      userAt = Date.now();
      return page?.mouse
        .click(+msg.x, +msg.y, {button: msg.button === 'right' ? 'right' : 'left', clickCount: Math.min(3, +msg.clickCount || 1)})
        .catch(() => {});
    case 'move':
      return page?.mouse.move(+msg.x, +msg.y).catch(() => {});
    case 'wheel':
      userAt = Date.now();
      await page?.mouse.move(+msg.x, +msg.y).catch(() => {});
      return page?.mouse.wheel(+msg.dx || 0, +msg.dy || 0).catch(() => {});
    case 'key':
      userAt = Date.now();
      return page?.keyboard.press(String(msg.key).slice(0, 40)).catch(() => {});
    case 'text':
      userAt = Date.now();
      return page?.keyboard.insertText(String(msg.text).slice(0, 2000)).catch(() => {});
    case 'shutdown':
      return shutdown();
  }
}
async function shutdown() {
  if (closing) return;
  closing = true;
  await publishTabs().catch(() => {});
  await stopScreencast();
  await context.close().catch(() => {});
  process.exit(0);
}
readline
  .createInterface({input: process.stdin})
  .on('line', line => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    handle(msg).catch(e => send({type: 'notice', message: String(e?.message || e).split('\n')[0]}));
  })
  .on('close', shutdown);
context.on('close', () => {
  if (!closing) process.exit(0);
});
// A chat browser nobody looks at and no agent uses is closed after 15 minutes; tabs are kept.
setInterval(() => {
  if (view === 'none' && !agentActive && Date.now() - idleSince > 15 * 60 * 1000) shutdown();
}, 60 * 1000).unref();
