import React from 'react';
import {Languages} from 'lucide-react';
import {CustomSelect} from './custom-select.jsx';
import {LANGUAGES, getLang, getLangSetting, loc, setLang} from './i18n.js';

// Interface language picker. «System» follows the macOS language; switching reloads the window.
// Looks like the other footer links (Archive, Trash): icon + muted text, no frame.
export function LanguageSelect() {
  return (
    <span className="nav-language">
      <Languages size={16} aria-hidden="true" />
      <CustomSelect
        className="language-select"
        aria-label={loc('Язык интерфейса')}
        title={loc('Язык интерфейса')}
        value={getLangSetting()}
        onChange={e => setLang(e.target.value)}
      >
        <option value="system">{loc('Как в системе · {0}', LANGUAGES[getLang()])}</option>
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </CustomSelect>
    </span>
  );
}
