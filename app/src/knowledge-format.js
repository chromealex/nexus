// Pure helpers for the skills and memory dialogs, tested without React.
import {loc} from './i18n.js';

export function skillScopeLabel(scope) {
  return {nexus: loc('Nexus'), project: loc('проект'), claude: loc('Claude Code')}[scope] || scope;
}

// Skill names are folder names: lower-case latin letters, digits, «-» and «_».
export function skillSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^-+/, '')
    .slice(0, 64);
}
