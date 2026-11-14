import React, {useEffect, useId, useRef, useState} from 'react';
import {useToastOn} from './toaster.jsx';
import {createPortal} from 'react-dom';
import {X, ChevronDown} from 'lucide-react';
import {AgentIcon} from './agent-icon.jsx';
import {withShortcut} from './shortcuts.js';
import {CATALOG, modelCapabilities, incompatibleReason, preferredModel} from './agent-catalog.js';
import {modelProfile, CRITERIA, criterionAssessment} from './model-profiles.js';
import {evidenceFor, evidenceGap, evidenceText, COHORTS} from './model-benchmarks.js';
import {invoke} from '@tauri-apps/api/core';
import {loc} from './i18n.js';

export function ModelTreeSelect({
  value,
  onChange,
  models,
  connections = [],
  task,
  reasoningMode,
  disabled,
  onRefresh,
  busy,
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [collapsed, setCollapsed] = useState({}),
    [inspected, setInspected] = useState(null),
    [sourceError, setSourceError] = useState('');
  useToastOn(sourceError, () => setSourceError(''), 'error');
  const trigger = useRef(null),
    panel = useRef(null),
    search = useRef(null),
    id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = e => {
      if (!panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const groups = [...new Set(models.map(m => m.provider))]
    .sort((a, b) => Number(a.startsWith('api-')) - Number(b.startsWith('api-')) || a.localeCompare(b))
    .map(provider => {
      const rows = models
          .filter(m => m.provider === provider)
          .sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || a.model.localeCompare(b.model)),
        connection = connections.find(c => c.id === provider);
      const name =
        connection?.name || CATALOG.find(c => c.id === provider)?.name || rows[0].label.split(' · ')[0];
      return {
        provider,
        name,
        kind:
          connection?.provider === 'local'
            ? loc('Локальные')
            : provider.startsWith('api-')
              ? 'API'
              : loc('Агенты'),
        rows,
      };
    });
  const selected = models.find(m => m.id === value),
    autoGroup = groups.find(g => value === 'agent-auto:' + g.provider);
  const title =
    value === 'auto'
      ? loc('Модель: Авто')
      : autoGroup
        ? autoGroup.name + loc(' · Авто')
        : selected?.label ||
          (value.startsWith('agent-auto:')
            ? (CATALOG.find(a => a.id === value.slice(11))?.name || loc('Выбранный агент')) +
              loc(' · временно недоступен')
            : loc('Выбранная модель недоступна'));
  const needle = query.trim().toLowerCase();
  const matches = (m, name) =>
    [name, m.label, m.model, modelProfile(m, connections).role].join(' ').toLowerCase().includes(needle);
  function choose(next) {
    onChange({target: {value: next}});
    close();
  }
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const nodes = [
        ...panel.current.querySelectorAll('input,button:not(:disabled),summary,[tabindex="0"]'),
      ].filter(n => n.getClientRects().length);
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && e.target.closest('[role="tree"]')) {
      e.preventDefault();
      const nodes = [...panel.current.querySelectorAll('[role="treeitem"]')],
        i = nodes.indexOf(document.activeElement);
      nodes[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? nodes.length - 1
            : (i + (e.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length
      ]?.focus();
    }
  }
  const inspect = inspected && models.find(m => m.id === inspected),
    profile = inspect && modelProfile(inspect, connections),
    caps = inspect && modelCapabilities(inspect, connections);
  return (
    <span className="nexus-select">
      <button
        ref={trigger}
        type="button"
        className="nexus-select-trigger reasoning-mode model-choice"
        disabled={disabled}
        title={
          disabled
            ? loc('Модель выбирается для открытого чата; во время ответа выбор недоступен')
            : withShortcut(loc('Модель для этого чата'), 'model')
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setQuery('');
          setInspected(selected?.id || null);
          setOpen(!open);
        }}
      >
        {busy ? loc('Обновление моделей…') : title}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div className="model-picker-backdrop">
            <section
              ref={panel}
              id={id}
              role="dialog"
              aria-modal="true"
              aria-label={loc('Выбор модели для этого чата')}
              className="model-picker"
              onKeyDown={keydown}
            >
              <div className="model-picker-header">
                <div>
                  <strong>{loc('Модель для этого чата')}</strong>
                  <small>{loc('Выбор сохраняется в истории проекта')}</small>
                </div>
                <button
                  type="button"
                  className="model-picker-close"
                  aria-label={loc('Закрыть выбор модели')}
                  onClick={close}
                >
                  <X size={16} />
                </button>
              </div>
              <input
                ref={search}
                aria-label={loc('Поиск модели или агента')}
                placeholder={loc('Поиск модели, агента или задачи')}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    panel.current.querySelector('[role="treeitem"]')?.focus();
                  }
                }}
              />
              <div className="model-picker-body">
                <div role="tree" aria-label={loc('Агенты и модели')} className="model-tree">
                  <button
                    type="button"
                    role="treeitem"
                    aria-selected={value === 'auto'}
                    onFocus={() => setInspected(null)}
                    onClick={() => choose('auto')}
                  >
                    {loc('Авто · возможности и опубликованные тесты')}
                  </button>
                  {groups.map(g => {
                    const rows = g.rows.filter(m => matches(m, g.name));
                    if (!rows.length) return null;
                    const expanded = !!needle || !collapsed[g.provider];
                    const eligible = g.rows.filter(
                      m => !incompatibleReason(m, task, reasoningMode, connections)
                    );
                    return (
                      <div key={g.provider} role="none">
                        <button
                          type="button"
                          role="treeitem"
                          aria-expanded={expanded}
                          aria-owns={expanded ? `${id}-${g.provider}` : undefined}
                          onClick={() => setCollapsed(v => ({...v, [g.provider]: expanded}))}
                          onKeyDown={e => {
                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                              e.preventDefault();
                              setCollapsed(v => ({...v, [g.provider]: e.key === 'ArrowLeft'}));
                            }
                          }}
                        >
                          <span className="model-group-caret" aria-hidden="true">
                            {expanded ? '▾' : '▸'}
                          </span>
                          <AgentIcon provider={g.provider} />
                          {g.name}
                          <small>
                            {g.kind} · {g.rows.length}
                          </small>
                        </button>
                        {expanded && (
                          <div role="group" id={`${id}-${g.provider}`}>
                            {!g.provider.startsWith('custom-') && (
                              <button
                                type="button"
                                role="treeitem"
                                aria-selected={value === 'agent-auto:' + g.provider}
                                aria-disabled={!eligible.length}
                                onFocus={() => setInspected(preferredModel(eligible)?.id || null)}
                                onClick={() => {
                                  if (eligible.length) choose('agent-auto:' + g.provider);
                                }}
                              >
                                {loc('Авто внутри')} {g.name}
                                {!eligible.length && <small>{loc('Нет совместимой модели')}</small>}
                              </button>
                            )}
                            {rows.map(m => {
                              const reason = incompatibleReason(m, task, reasoningMode, connections);
                              return (
                                <button
                                  type="button"
                                  role="treeitem"
                                  key={m.id}
                                  aria-selected={value === m.id}
                                  aria-disabled={!!reason}
                                  onFocus={() => setInspected(m.id)}
                                  onMouseEnter={() => setInspected(m.id)}
                                  onClick={() => setInspected(m.id)}
                                >
                                  <span>
                                    {m.model === 'default' ? loc('Модель runtime') : m.model}
                                    {m.isDefault ? loc(' · по умолчанию') : ''}
                                  </span>
                                  <small>{reason || modelProfile(m, connections).cost}</small>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!groups.some(g => g.rows.some(m => matches(m, g.name))) && (
                    <p role="status">{loc('Подключённые модели не найдены')}</p>
                  )}
                  <details className="model-catalog">
                    <summary>
                      {loc('Каталог подключений ·')} {CATALOG.length}
                    </summary>
                    {CATALOG.filter(a =>
                      [a.name, a.description].join(' ').toLowerCase().includes(needle)
                    ).map(a => (
                      <div key={a.id}>
                        <strong>{a.name}</strong>
                        <p>{a.description}</p>
                        <small>
                          {a.kind === 'external'
                            ? loc('Нет адаптера чата')
                            : loc(
                                'Модели доступны в дереве после подключения. Цена и качество зависят от конкретной модели.'
                              )}
                        </small>
                      </div>
                    ))}
                  </details>
                </div>
                <div className="model-facts" role="region" aria-label={loc('Характеристики модели')}>
                  {inspect ? (
                    <>
                      <strong>{inspect.label}</strong>
                      <button
                        type="button"
                        disabled={!!incompatibleReason(inspect, task, reasoningMode, connections)}
                        onClick={() => choose(inspect.id)}
                      >
                        {loc('Выбрать эту модель')}
                      </button>
                      <p>{profile.role}</p>
                      <small>{loc('Назначение по источнику; не сравнительный рейтинг')}</small>
                      {profile.evidence && <small>{profile.evidence}</small>}
                      {profile.resolvedNote && <small>{profile.resolvedNote}</small>}
                      <dl>
                        <dt>{loc('Оплата подключения')}</dt>
                        <dd>{profile.cost}</dd>
                        {profile.referencePrice && (
                          <>
                            <dt>{loc('Справочно: публичный API')}</dt>
                            <dd>
                              {profile.referencePrice}
                              {loc(
                                '. Базовый тариф; режим, длинный контекст и дополнительные услуги могут изменить цену. Тариф подписки не вычисляется из API.'
                              )}
                            </dd>
                          </>
                        )}
                        {profile.exampleCost && (
                          <>
                            <dt>{loc('Пример одинакового объёма в API')}</dt>
                            <dd>
                              ${profile.exampleCost}{' '}
                              {loc(
                                'за 10 000 входных + 2 000 выходных токенов. Без дополнительных токенов рассуждений, повторов и услуг.'
                              )}
                            </dd>
                          </>
                        )}
                        <dt>{loc('Контекст')}</dt>
                        <dd>{profile.contextNote}</dd>
                        <dt>{loc('Возможности в Nexus')}</dt>
                        <dd>
                          {caps.text ? loc('Текст') : loc('Нет адаптера для этой модели')} ·{' '}
                          {caps.files ? loc('файлы через агента') : loc('без файлов')} ·{' '}
                          {caps.tools ? loc('инструменты с разрешениями') : loc('без инструментов')}{' '}
                          {loc('· изображения:')}{' '}
                          {caps.images === true
                            ? loc('да')
                            : caps.images === false
                              ? loc('нет')
                              : loc('не проверено')}
                        </dd>
                      </dl>
                      <table>
                        <thead>
                          <tr>
                            <th>{loc('Критерий')}</th>
                            <th>{loc('Качество / стоимость')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERIA.map(c => (
                            <tr key={c}>
                              <td>{c}</td>
                              <td>{criterionAssessment(inspect, c, caps)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <details>
                        <summary>
                          {loc('Опубликованные сравнения ·')} {evidenceFor(inspect).length}
                        </summary>
                        {evidenceFor(inspect).map((r, i) => (
                          <div key={i}>
                            <p>{evidenceText(r)}</p>
                            <small>{COHORTS[r.cohort].limit}</small>
                            {r.outputSpeed != null && (
                              <p>
                                {loc('Выдача:')} {r.outputSpeed} {loc('ток/с; первый ответ:')} {r.firstToken}{' '}
                                {loc('с.')}
                              </p>
                            )}
                            {r.minutes != null && (
                              <p>
                                {loc('Время задачи в тесте:')} {r.minutes} {loc('мин')}
                                {r.cost != null ? loc('; API-расход: ${0}', r.cost) : ''}
                                {loc('. Это не длительность и цена запроса Nexus.')}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                invoke('open_external', {url: r.source}).catch(e => setSourceError(String(e)))
                              }
                            >
                              {loc('Источник результата')}
                            </button>
                          </div>
                        ))}
                        {!evidenceFor(inspect).length && <p>{evidenceGap(inspect)}</p>}
                      </details>
                      <p>
                        {loc(
                          'Это внешние результаты, не собственные прогоны Nexus. Режимы и условия отличаются; стоимость по отдельным категориям неизвестна. Отсутствие оценки не означает низкое качество.'
                        )}
                      </p>
                      {profile.source && (
                        <button
                          type="button"
                          onClick={() =>
                            invoke('open_external', {url: profile.source}).catch(e =>
                              setSourceError(String(e))
                            )
                          }
                        >
                          {loc('Официальный источник ·')} {profile.date}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <strong>{loc('Как работает «Авто»')}</strong>
                      <p>
                        {loc(
                          'Сначала проверяются вложения, режим выполнения и глубина рассуждений. Затем используются свежие опубликованные тесты точной версии модели: для кода — индекс агентов в том же Claude Code или Codex, для сложных задач — индекс AA, для PDF — GDP.pdf, для действий с инструментами — AutomationBench, для текста и изображений — Arena. Результаты служат ориентиром; режим Nexus может отличаться.'
                        )}
                      </p>
                      <p>
                        {loc(
                          'Приоритет задаётся отдельно для каждого чата: Баланс, Качество, Экономия или Скорость. Баланс допускает отставание до 3 баллов ради меньшего времени или известной стоимости. Экономия и Скорость могут снижать качество. Это правило продукта, не статистическая гарантия. Короткие простые вопросы не сравниваются по рейтингам. Без двух сопоставимых моделей используется резервный выбор по совместимости и модели по умолчанию. Алиасы Claude Code сопоставляются с версией по официальной таблице, если настройки её не переопределяют; данные старше 90 дней не влияют на выбор. Выбор конкретной модели никогда не заменяется молча.'
                        )}
                      </p>
                      <p>{loc('Для ACP без списка моделей доступна модель, выбранная самим runtime.')}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="model-picker-footer">
                <span>{loc('Все модели подключений · без скрытых замен')}</span>
                <button type="button" disabled={busy} onClick={onRefresh}>
                  {loc('Обновить каталог')}
                </button>
              </div>
            </section>
          </div>,
          trigger.current?.closest('[role="dialog"]') || document.body
        )}
    </span>
  );
}
