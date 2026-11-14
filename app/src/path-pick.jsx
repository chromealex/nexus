import React, {useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {FolderOpen} from 'lucide-react';
import {notify} from './toasts.js';

// «Выбрать…» next to a path field: the native macOS panel fills the field; cancel changes nothing.
export function PathPick({kind = 'file', prompt, onPick, disabled, label = 'Выбрать…'}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="path-pick"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const path = await invoke('pick_path', {kind, prompt});
          if (path) onPick(path);
        } catch (e) {
          notify(String(e), {tone: 'error'});
        } finally {
          setBusy(false);
        }
      }}
    >
      <FolderOpen size={13} aria-hidden="true" />
      {label}
    </button>
  );
}
