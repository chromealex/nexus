// App-wide notifications: errors and notices appear at the top of the window and close by themselves.
// Pure queue logic lives here so it is tested without React.
const listeners = new Set();
let sequence = 0;

// Long messages stay longer; errors longer than notices. Hover pauses the timer (see Toaster).
export function toastTimeout(text, tone = 'info') {
  const base = tone === 'error' ? 7000 : tone === 'warn' ? 6000 : 4000;
  return Math.min(base + String(text || '').length * 40, 15000);
}

// Strips the internal prefixes backend errors sometimes carry.
export function cleanMessage(value) {
  return String(value ?? '')
    .replace(/^Error:\s*/i, '')
    .replace(/^NEXUS_[A-Z_]+:\s*/, '')
    .trim();
}

// Same text shortly after the first one is merged instead of stacking.
export function pushToast(list, toast, max = 4) {
  const same = list.find(t => t.text === toast.text && t.tone === toast.tone);
  if (same) return list.map(t => (t === same ? {...t, count: (t.count || 1) + 1, id: toast.id} : t));
  return [...list, toast].slice(-max);
}

export function notify(message, {tone = 'info', action = null, timeout} = {}) {
  const text = cleanMessage(message);
  if (!text) return null;
  const toast = {id: ++sequence, text, tone, action, timeout: timeout ?? toastTimeout(text, tone)};
  listeners.forEach(fn => fn(toast));
  return toast.id;
}
export const notifyError = (message, options = {}) => notify(message, {...options, tone: 'error'});
export function onToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
