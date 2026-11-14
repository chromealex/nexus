import React, {useEffect, useId, useRef, useState} from 'react';
import {SlidersHorizontal, ChevronDown} from 'lucide-react';
import {loc} from './i18n.js';

// Secondary composer settings (routing priority, reasoning depth, team) behind one button.
// The button shows only the values that differ from the defaults, so the common case stays short.
// Model and Discussion/Execution remain separate, always visible controls.
export function composerParamsSummary({priority, priorityLabel, reasoning, reasoningLabel, team, browser}) {
  return [
    priority !== 'balanced' && priorityLabel,
    reasoning !== 'auto' && reasoningLabel,
    team && loc('Команда'),
    browser,
  ].filter(Boolean);
}

export function ComposerParams({summary, fullSummary, disabled, children}) {
  const [open, setOpen] = useState(false),
    root = useRef(null),
    trigger = useRef(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = e => {
      if (root.current?.contains(e.target) || e.target.closest?.('.nexus-select-popup')) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <span className="nexus-select composer-params" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={
          'nexus-select-trigger reasoning-mode composer-params-trigger' + (summary.length ? ' is-custom' : '')
        }
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        disabled={disabled}
        title={fullSummary}
        onClick={() => setOpen(v => !v)}
      >
        <SlidersHorizontal size={13} aria-hidden="true" />
        <span>{summary.length ? summary.join(' · ') : loc('Параметры')}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="composer-params-popover"
          id={id}
          role="dialog"
          aria-label={loc('Параметры запроса')}
          onKeyDown={e => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
              e.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <strong>{loc('Параметры запроса')}</strong>
          {children}
        </div>
      )}
    </span>
  );
}

export function ParamRow({label, hint, children}) {
  return (
    <div className="composer-param-row">
      <span className="composer-param-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
