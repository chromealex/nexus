// Interface language. Russian source strings are the keys; other languages live in src/locales.
// By default the macOS (system) language is used; a choice made in the app overrides it.
// The language is read once at start-up; switching reloads the window so module-level
// labels are rebuilt too.
import en from './locales/en.js';
import es from './locales/es.js';
import de from './locales/de.js';
import fr from './locales/fr.js';
import pt from './locales/pt.js';
import zh from './locales/zh.js';
import ja from './locales/ja.js';

const DICTS = {en, es, de, fr, pt, zh, ja};
export const LANGUAGES = {
  ru: 'Русский',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  zh: '简体中文',
  ja: '日本語',
};
const LOCALES = {
  ru: 'ru-RU',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  pt: 'pt-BR',
  zh: 'zh-CN',
  ja: 'ja-JP',
};
const KEY = 'nexus-lang';
const FALLBACK = 'en';

// 'pt-BR' → 'pt', 'zh-Hans-CN' → 'zh'; unknown languages fall back to English.
export function matchLanguage(tags = []) {
  for (const tag of tags) {
    const base = String(tag || '')
      .toLowerCase()
      .split(/[-_]/)[0];
    if (base in LANGUAGES) return base;
  }
  return FALLBACK;
}

function savedLang() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    return saved && saved in LANGUAGES ? saved : null;
  } catch {
    return null;
  }
}

function systemLang() {
  // Outside the app window (unit tests in Node) keep the Russian source strings.
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return 'ru';
  return matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let lang = savedLang() || systemLang();
export const getLang = () => lang;
// 'system' when the app follows the system language, otherwise the chosen code.
export const getLangSetting = () => savedLang() || 'system';
export const appLocale = () => LOCALES[lang] || 'en-US';

export function setLang(next) {
  if (next !== 'system' && !(next in LANGUAGES)) return;
  try {
    if (next === 'system') globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // storage may be unavailable
  }
  const resolved = next === 'system' ? systemLang() : next;
  if (resolved === lang) return;
  lang = resolved;
  if (typeof location !== 'undefined') location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = lang;

// loc('Осталось {0}%', 73) → 'Осталось 73%' / '73% left'. '{{' and '}}' are literal braces.
export function loc(key, ...args) {
  const text = (lang !== 'ru' && DICTS[lang]?.[key]) || (lang !== 'ru' && en[key]) || key;
  if (!args.length && !text.includes('{{')) return text;
  return text.replace(/\{\{|\}\}|\{(\d+)\}/g, (m, i) =>
    m === '{{' ? '{' : m === '}}' ? '}' : String(args[Number(i)] ?? '')
  );
}
