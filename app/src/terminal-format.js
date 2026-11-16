// Pure helpers for the terminal tab, tested without React.

// Colour and cursor escape sequences are removed; carriage-return progress lines keep only their last state.
export function stripAnsi(text) {
  return String(text || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[^\n]*\r(?!\n)/g, '');
}

// Recent commands first-in-last-out, without consecutive duplicates, at most 200.
export function pushHistory(history, command) {
  const list = (history || []).filter(c => c !== command);
  list.push(command);
  return list.slice(-200);
}

// Output kept per block is capped so a chatty command cannot exhaust memory.
export const OUTPUT_LIMIT = 400_000;
export function appendOutput(output, chunk) {
  const next = (output || '') + chunk;
  return next.length > OUTPUT_LIMIT ? '…\n' + next.slice(next.length - OUTPUT_LIMIT) : next;
}
