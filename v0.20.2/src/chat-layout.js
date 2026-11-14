// Pure layout helpers for the chat: minimap geometry and text size steps.

export const TEXT_SIZES = [13, 14, 15, 16, 17, 18, 20];
export const DEFAULT_TEXT_SIZE = 15;
export function stepTextSize(current, direction) {
  if (direction === 0) return DEFAULT_TEXT_SIZE;
  const index = TEXT_SIZES.indexOf(TEXT_SIZES.includes(current) ? current : DEFAULT_TEXT_SIZE);
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, index + Math.sign(direction)))];
}
export function readTextSize(value) {
  const n = Number(value);
  return TEXT_SIZES.includes(n) ? n : DEFAULT_TEXT_SIZE;
}

// Scales message boxes into the minimap track. Every message stays at least 2px tall and
// separated by 1px, the visible window at least 18px, so short chats remain readable.
export function layoutMinimap({ items = [], contentHeight = 0, viewportHeight = 0, scrollTop = 0, trackHeight = 0 }) {
  const total = Math.max(1, contentHeight, viewportHeight);
  const scale = trackHeight > 0 ? trackHeight / total : 0;
  const bars = items.map(item => {
    const top = Math.max(0, item.top * scale);
    const height = Math.max(2, item.height * scale - 1);
    const blocks = (item.blocks || [])
      .map(b => ({ kind: b.kind, top: Math.max(0, b.top * scale), height: Math.max(1.5, b.height * scale) }))
      .filter(b => b.top < height);
    return { id: item.id, role: item.role, excerpt: item.excerpt || '', top, height, blocks };
  });
  const windowHeight = Math.min(trackHeight, Math.max(18, viewportHeight * scale));
  const windowTop = Math.max(0, Math.min(trackHeight - windowHeight, scrollTop * scale));
  return { scale, bars, scrollable: contentHeight > viewportHeight + 4, window: { top: windowTop, height: windowHeight } };
}
