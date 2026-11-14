import React, {useEffect, useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {invoke} from '@tauri-apps/api/core';
import {Plug, Check} from 'lucide-react';
export function AgentConnectionCard({manifest, context}) {
  const [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [agentId, setAgentId] = useState(null),
    [error, setError] = useState('');
  useToastOn(error, () => setError(''), 'error');
  useEffect(() => {
    let live = true;
    invoke('list_custom_agents')
      .then(rows => {
        if (live) {
          const a = rows.find(
            a =>
              a.verified &&
              a.manifest.executable === manifest.executable &&
              JSON.stringify(a.manifest.args || []) === JSON.stringify(manifest.args || []) &&
              (a.manifest.npmPackage || null) === (manifest.npmPackage || null)
          );
          setConnected(!!a);
          setAgentId(a?.id || null);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [manifest.executable]);
  async function connect() {
    if (busy || !context?.enabled) return;
    setBusy(true);
    setError('');
    try {
      const agent = await invoke('connect_custom_agent', {
        chatId: context.chatId,
        messageId: context.messageId,
        block: JSON.stringify(manifest),
      });
      setConnected(true);
      setAgentId(agent.id);
      await context.onConnected?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await invoke('disconnect_custom_agent', {id: agentId});
      setConnected(false);
      await context.onConnected?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (
    !manifest ||
    typeof manifest.name !== 'string' ||
    typeof manifest.executable !== 'string' ||
    !Array.isArray(manifest.args)
  )
    return <p>Не удалось прочитать параметры подключения агента.</p>;
  return (
    <section className="agent-connect-card">
      <div className="agent-connect-title">
        <Plug size={18} />
        <strong>{manifest.name}</strong>
        <span>ACP</span>
      </div>
      <p>
        {manifest.npmPackage
          ? 'Nexus установит указанный пакет npm и проверит подключение.'
          : 'Nexus проверит подключение установленного агента.'}
      </p>
      {manifest.npmPackage && (
        <div className="agent-connect-package">
          Пакет: <code>{manifest.npmPackage}</code>
        </div>
      )}
      <details>
        <summary>Параметры подключения</summary>
        <pre>{JSON.stringify(manifest, null, 2)}</pre>
      </details>
      <small>Агент запускается локально. Проверьте команду и источник пакета перед подключением.</small>
      <button type="button" disabled={busy || !context?.enabled} onClick={connected ? disconnect : connect}>
        {connected ? (
          <>
            <Check size={15} />
            Подключён · отключить
          </>
        ) : busy ? (
          'Подключаю…'
        ) : manifest.npmPackage ? (
          'Установить и подключить'
        ) : (
          'Подключить агента'
        )}
      </button>
      {!context?.enabled && !connected && (
        <small>Подключение доступно в проекте Nexus после завершения ответа.</small>
      )}
    </section>
  );
}
