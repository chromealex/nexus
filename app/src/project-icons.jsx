import React, {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Folder, ImagePlus, Search, Ban} from 'lucide-react';
import {useToastOn} from './toaster.jsx';

const EVENT = 'nexus-project-icon';

// Icons of the listed projects: found in the project folder, chosen by the user, or switched off.
export function useProjectIcons(projects) {
  const [icons, setIcons] = useState({});
  const ids = projects
    .filter(p => !p.system)
    .map(p => p.id)
    .join(',');
  useEffect(() => {
    let live = true;
    const load = id =>
      invoke('project_icon', {projectId: id})
        .then(v => live && setIcons(m => ({...m, [id]: v})))
        .catch(() => {});
    ids.split(',').filter(Boolean).forEach(load);
    const changed = e => e.detail?.projectId && load(e.detail.projectId);
    window.addEventListener(EVENT, changed);
    return () => {
      live = false;
      window.removeEventListener(EVENT, changed);
    };
  }, [ids]);
  return icons;
}

export function ProjectIcon({icon, size = 16}) {
  if (!icon?.url) return <Folder size={size} />;
  return <img className="project-icon" src={icon.url} alt="" width={size} height={size} draggable={false} />;
}

function base64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// «Иконка» in project settings: preview, where it was found, and the three choices.
export function ProjectIconSettings({projectId}) {
  const [icon, setIcon] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useToastOn(error, () => setError(''), 'error');
  const input = useRef(null);
  useEffect(() => {
    invoke('project_icon', {projectId})
      .then(setIcon)
      .catch(e => setError(String(e)));
  }, [projectId]);
  async function save(mode, file) {
    setBusy(true);
    try {
      const value = await invoke('set_project_icon', {
        projectId,
        mode,
        data: file ? await base64(file) : null,
        name: file?.name || null,
      });
      setIcon(value);
      window.dispatchEvent(new CustomEvent(EVENT, {detail: {projectId}}));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const caption =
    icon?.mode === 'none'
      ? 'Без иконки — показывается папка'
      : icon?.mode === 'custom'
        ? 'Своя иконка'
        : icon?.url
          ? 'Найдена в папке проекта: ' + icon.source
          : 'В папке проекта иконка не найдена';
  return (
    <div className="project-icon-settings">
      <div className="context-heading">
        <h3>Иконка</h3>
        <small>Показывается рядом с проектом в списке</small>
      </div>
      <div className="project-icon-row">
        <span className="project-icon-preview">
          <ProjectIcon icon={icon} size={32} />
        </span>
        <small>{icon ? caption : 'Загрузка…'}</small>
      </div>
      <div className="project-icon-actions">
        <button type="button" disabled={busy || icon?.mode === 'auto'} onClick={() => save('auto')}>
          <Search size={13} aria-hidden="true" />
          Искать в папке проекта
        </button>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={13} aria-hidden="true" />
          Выбрать картинку…
        </button>
        <button type="button" disabled={busy || icon?.mode === 'none'} onClick={() => save('none')}>
          <Ban size={13} aria-hidden="true" />
          Без иконки
        </button>
        <input
          ref={input}
          type="file"
          accept=".png,.svg,.jpg,.jpeg,.webp,.gif,.ico,image/*"
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) save('custom', file);
          }}
        />
      </div>
    </div>
  );
}
