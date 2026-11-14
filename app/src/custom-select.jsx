import React, {useId, useLayoutEffect, useRef, useState} from 'react';
import {ModelTreeSelect} from './model-tree-select.jsx';
import {createPortal} from 'react-dom';
import {ChevronDown, Check} from 'lucide-react';
const labelText = value =>
  Array.isArray(value)
    ? value.map(labelText).join('')
    : React.isValidElement(value)
      ? labelText(value.props.children)
      : value == null
        ? ''
        : String(value);
function optionsFrom(children, group = '') {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement(child)) return [];
    if (child.type === 'optgroup') return optionsFrom(child.props.children, child.props.label);
    if (child.type !== 'option') return [];
    return [
      {
        value: String(child.props.value ?? labelText(child.props.children)),
        label: labelText(child.props.children),
        disabled: !!child.props.disabled,
        group,
      },
    ];
  });
}
export function CustomSelect(props) {
  return props.modelTree ? <ModelTreeSelect {...props} /> : <FlatSelect {...props} />;
}
function FlatSelect({value, onChange, children, disabled = false, className = '', title, ...props}) {
  const options = optionsFrom(children),
    selected = options.find(o => o.value === String(value)),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState({left: 0, top: 0, width: 200, maxHeight: 280}),
    [label, setLabel] = useState('');
  const trigger = useRef(null),
    popup = useRef(null),
    typeahead = useRef({text: '', time: 0}),
    id = useId();
  useLayoutEffect(() => {
    if (props['aria-label'] || props['aria-labelledby']) return;
    const parent = trigger.current?.closest('label');
    if (parent)
      setLabel(
        [...parent.childNodes]
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent)
          .join('')
          .trim()
      );
  }, [props['aria-label'], props['aria-labelledby']]);
  function show() {
    if (disabled) return;
    trigger.current?.focus();
    const index = options.findIndex(o => o.value === String(value) && !o.disabled);
    setActive(
      index >= 0
        ? index
        : Math.max(
            0,
            options.findIndex(o => !o.disabled)
          )
    );
    setOpen(true);
  }
  function choose(index) {
    const o = options[index];
    if (!o || o.disabled) return;
    onChange?.({target: {value: o.value}, currentTarget: {value: o.value}});
    setOpen(false);
    trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 220), window.innerWidth - 16),
        below = window.innerHeight - r.bottom - 12,
        above = r.top - 12,
        desired = Math.min(300, options.length * 36 + 12),
        up = below < desired && above > below,
        maxHeight = Math.max(60, Math.min(300, up ? above : below));
      setPosition({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: up ? Math.max(8, r.top - 6 - Math.min(desired, maxHeight)) : r.bottom + 6,
        width,
        maxHeight,
      });
    };
    place();
    const outside = e => {
      if (!trigger.current?.contains(e.target) && !popup.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, options.length]);
  useLayoutEffect(() => {
    if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView({block: 'nearest'});
  }, [active, open]);
  useLayoutEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  function keydown(e) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (!open) {
        show();
        return;
      }
      const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0);
      if (!enabled.length) return;
      const offset = e.key === 'ArrowUp' ? -1 : 1;
      setActive(
        e.key === 'Home'
          ? enabled[0]
          : e.key === 'End'
            ? enabled.at(-1)
            : enabled[(enabled.indexOf(active) + offset + enabled.length) % enabled.length]
      );
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open ? choose(active) : show();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const now = Date.now();
      typeahead.current.text =
        (now - typeahead.current.time > 700 ? '' : typeahead.current.text) + e.key.toLowerCase();
      typeahead.current.time = now;
      const index = options.findIndex(
        o => !o.disabled && o.label.toLowerCase().startsWith(typeahead.current.text)
      );
      if (index >= 0) {
        if (open) setActive(index);
        else {
          setActive(index);
          setOpen(true);
        }
      }
    }
  }
  return (
    <span className="nexus-select">
      <button
        {...props}
        ref={trigger}
        type="button"
        className={'nexus-select-trigger ' + className}
        role="combobox"
        aria-label={props['aria-label'] || label || title || 'Выбор значения'}
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        title={title}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keydown}
      >
        <span>{selected?.label || String(value || 'Выбрать')}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="listbox"
            className="nexus-select-popup"
            aria-label={props['aria-label'] || label || title || 'Варианты'}
            style={position}
          >
            {options.map((o, i) => (
              <React.Fragment key={o.value + '-' + i}>
                {o.group && o.group !== options[i - 1]?.group && (
                  <div className="nexus-select-group">{o.group}</div>
                )}
                <div
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={o.value === String(value)}
                  aria-disabled={o.disabled || undefined}
                  className={'nexus-select-option' + (o.disabled ? ' disabled' : '')}
                  data-active={active === i}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => {
                    if (!o.disabled) setActive(i);
                  }}
                  onClick={() => choose(i)}
                >
                  <span>{o.label}</span>
                  {o.value === String(value) && <Check size={13} aria-hidden="true" />}
                </div>
              </React.Fragment>
            ))}
          </div>,
          trigger.current?.closest('[role="dialog"]') || document.body
        )}
    </span>
  );
}
