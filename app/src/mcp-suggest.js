// Which MCP servers a request seems to need: mentions of the service or its typical objects.
const HINTS = {
  atlassian: /\b(jira|джир|confluence|конфлюенс|atlassian|атласиан)/i,
  linear: /\blinear\b|линеар/i,
  notion: /\bnotion\b|ноушн|ношн/i,
  sentry: /\bsentry\b|сентри/i,
  supabase: /\bsupabase\b|супабейс/i,
  vercel: /\bvercel\b|версел/i,
  asana: /\basana\b|асана/i,
  airtable: /\bairtable\b|эйртейбл/i,
};

// Issue keys like BW-4571 also point to Jira; common non-issue codes are not keys.
const ISSUE_KEY = /\b([A-Z][A-Z0-9]{1,9})-\d{2,6}\b/g;
const NOT_KEYS = new Set([
  'UTF',
  'ISO',
  'GPT',
  'SHA',
  'RFC',
  'CVE',
  'MP',
  'COVID',
  'HTTP',
  'TLS',
  'ES',
  'PEP',
]);
function hasIssueKey(text) {
  for (const m of String(text || '').matchAll(ISSUE_KEY)) if (!NOT_KEYS.has(m[1])) return true;
  return false;
}

/** Preset IDs the text points to whose server is not connected and given to agents yet. */
export function suggestMcp(text, servers = []) {
  const ready = new Set(servers.filter(s => s.signedIn && s.enabled).map(s => s.id));
  return Object.entries(HINTS)
    .filter(
      ([id, re]) =>
        !ready.has(id) && (re.test(String(text || '')) || (id === 'atlassian' && hasIssueKey(text)))
    )
    .map(([id]) => id);
}
