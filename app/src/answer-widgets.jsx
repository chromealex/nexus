import React, {Suspense, lazy, useEffect, useId, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  Copy,
  Check,
  Code2,
  Workflow,
  Maximize2,
  X,
  Info,
  Lightbulb,
  AlertTriangle,
  OctagonAlert,
  BadgeCheck,
  Megaphone,
  CheckCircle2,
  Circle,
  ArrowRight,
} from 'lucide-react';
import {normalizeWidget, alertKind, ALERT_TITLES} from './widget-data.js';
import {loc} from './i18n.js';

// Chart palette: cool primary, warm accent, then muted companions. Same in light of the glass UI.
// Charts load lazily so the chart library stays out of the main bundle.
const Charts = lazy(() => import('./answer-charts.jsx'));
export const PALETTE = [
  '#5cb8d7',
  '#e3b37c',
  '#a5c9b4',
  '#b9a6e0',
  '#e39a9a',
  '#9ec8dc',
  '#d6c98a',
  '#7fa7c9',
];
const ICONS = {
  note: Info,
  tip: Lightbulb,
  important: Megaphone,
  warning: AlertTriangle,
  caution: OctagonAlert,
  success: BadgeCheck,
};
const textOf = node =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : React.isValidElement(node)
        ? textOf(node.props.children)
        : '';

function Frame({title, kind, children, className = ''}) {
  return (
    <figure className={'nexus-widget widget-' + kind + ' ' + className}>
      {title && <figcaption>{title}</figcaption>}
      {children}
    </figure>
  );
}
const Delta = ({value}) =>
  value ? (
    <span className={'widget-delta ' + (/^[-−]/.test(value) ? 'down' : /^\+/.test(value) ? 'up' : '')}>
      {value}
    </span>
  ) : null;

export function NexusWidget({data, source}) {
  const w = useMemo(() => normalizeWidget(data), [data]);
  if (!w)
    return (
      <pre className="widget-invalid" title={loc('Блок не распознан — показан исходный JSON')}>
        <code>{source || JSON.stringify(data, null, 2)}</code>
      </pre>
    );
  switch (w.type) {
    case 'metric':
      return (
        <Frame kind="metric">
          <span className="metric-label">{w.label}</span>
          <strong className="metric-value">
            {w.value}
            <Delta value={w.delta} />
          </strong>
          {w.hint && <small>{w.hint}</small>}
        </Frame>
      );
    case 'kpis':
      return (
        <Frame kind="kpis" title={w.title}>
          <div className="kpi-grid">
            {w.items.map((k, i) => (
              <div key={i} className="kpi">
                <span>{k.label}</span>
                <strong>
                  {k.value}
                  <Delta value={k.delta} />
                </strong>
              </div>
            ))}
          </div>
        </Frame>
      );
    case 'progress':
      return (
        <Frame kind="progress">
          <div className="widget-row">
            <span>{w.label}</span>
            <b>{Math.round(w.value)}%</b>
          </div>
          <div
            className="widget-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={w.value}
          >
            <div style={{width: w.value + '%'}} />
          </div>
        </Frame>
      );
    case 'flow':
      return (
        <Frame kind="flow" title={w.title}>
          <ol className={'flow-steps' + (w.steps.length <= 5 ? ' horizontal' : '')}>
            {w.steps.map((s, i) => (
              <li key={i}>
                <span className="flow-index">{i + 1}</span>
                <span>{s}</span>
                {i < w.steps.length - 1 && <ArrowRight className="flow-arrow" size={14} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </Frame>
      );
    case 'bar': {
      const items = w.items.map(i => ({name: i.label, value: i.value}));
      return (
        <Frame kind="chart" title={w.title}>
          <div style={{height: Math.max(150, items.length * 34 + 30)}}>
            <Suspense fallback={<div className="widget-chart-loading" aria-hidden="true" />}>
              <Charts kind="bar" w={w} items={items} />
            </Suspense>
          </div>
        </Frame>
      );
    }
    case 'line': {
      const rows = w.x.map((x, i) =>
        Object.fromEntries([['x', x], ...w.series.map(s => [s.name, s.values[i] ?? null])])
      );
      return (
        <Frame kind="chart" title={w.title}>
          <div style={{height: 220}}>
            <Suspense fallback={<div className="widget-chart-loading" aria-hidden="true" />}>
              <Charts kind="line" w={w} rows={rows} />
            </Suspense>
          </div>
        </Frame>
      );
    }
    case 'pie': {
      const total = w.items.reduce((n, i) => n + i.value, 0);
      return (
        <Frame kind="pie" title={w.title}>
          <div className="pie-layout">
            <div className="pie-chart">
              <Suspense fallback={<div className="widget-chart-loading" aria-hidden="true" />}>
                <Charts kind="pie" w={w} />
              </Suspense>
            </div>
            <ul className="pie-legend">
              {w.items.map((i, n) => (
                <li key={n}>
                  <span className="swatch" style={{background: PALETTE[n % PALETTE.length]}} />
                  <span>{i.label}</span>
                  <b>{Math.round((i.value / total) * 100)}%</b>
                </li>
              ))}
            </ul>
          </div>
        </Frame>
      );
    }
    case 'timeline':
      return (
        <Frame kind="timeline" title={w.title}>
          <ol className="timeline">
            {w.items.map((t, i) => (
              <li key={i} className={t.done ? 'done' : ''}>
                <span className="timeline-dot" aria-hidden="true" />
                {t.date && <time>{t.date}</time>}
                <strong>{t.title}</strong>
                {t.text && <p>{t.text}</p>}
              </li>
            ))}
          </ol>
        </Frame>
      );
    case 'compare':
      return (
        <Frame kind="compare" title={w.title}>
          <div className="compare-grid" style={{'--cols': w.columns.length}}>
            {w.columns.map((c, i) => (
              <section key={i} className={c.tone ? 'tone-' + c.tone : ''}>
                <h4>{c.title}</h4>
                <ul>
                  {c.items.map((x, n) => (
                    <li key={n}>{x}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Frame>
      );
    case 'checklist': {
      const done = w.items.filter(i => i.done).length;
      return (
        <Frame kind="checklist" title={w.title}>
          <div className="checklist-summary">
            {done} {loc('из')} {w.items.length}
          </div>
          <ul className="checklist">
            {w.items.map((c, i) => (
              <li key={i} className={c.done ? 'done' : ''}>
                {c.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </Frame>
      );
    }
    case 'callout': {
      const Icon = ICONS[w.tone] || Info;
      return (
        <div className={'answer-callout tone-' + w.tone} role="note">
          <strong className="answer-callout-title">
            <Icon size={15} />
            {w.title || ALERT_TITLES[w.tone]}
          </strong>
          <p>{w.text}</p>
        </div>
      );
    }
    default:
      return null;
  }
}

// "> [!NOTE]" style alerts. Ordinary quotes stay ordinary.
function stripMarker(children) {
  const list = React.Children.toArray(children);
  if (typeof list[0] === 'string') list[0] = list[0].replace(/^\s*\[![A-Za-z]+\]\s*/, '');
  return list.filter(c => c !== '');
}
export function Blockquote({children, node, ...props}) {
  const items = React.Children.toArray(children).filter(c => !(typeof c === 'string' && !c.trim()));
  const kind = alertKind(textOf(items[0]));
  if (!kind) return <blockquote {...props}>{children}</blockquote>;
  const first = React.isValidElement(items[0])
    ? React.cloneElement(items[0], {}, ...stripMarker(items[0].props.children))
    : null;
  const Icon = ICONS[kind] || Info;
  return (
    <div className={'answer-callout tone-' + kind} role="note">
      <strong className="answer-callout-title">
        <Icon size={15} />
        {ALERT_TITLES[kind]}
      </strong>
      {first && textOf(first).trim() ? first : null}
      {items.slice(1)}
    </div>
  );
}

let mermaidReady;
function loadMermaid() {
  mermaidReady ||= import('mermaid').then(({default: mermaid}) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      themeVariables: {
        darkMode: true,
        background: 'transparent',
        fontSize: '13px',
        primaryColor: '#1d2b34',
        primaryTextColor: '#e3e8ea',
        primaryBorderColor: '#5cb8d7',
        secondaryColor: '#26323a',
        secondaryTextColor: '#e3e8ea',
        tertiaryColor: '#18242c',
        tertiaryTextColor: '#e3e8ea',
        lineColor: '#7f9aa8',
        textColor: '#d4d8da',
        mainBkg: '#1d2b34',
        nodeBorder: '#5cb8d7',
        clusterBkg: '#141e25',
        clusterBorder: '#ffffff22',
        edgeLabelBackground: '#141e25',
        noteBkgColor: '#2b3540',
        noteTextColor: '#e3e8ea',
        noteBorderColor: '#e3b37c',
        actorBkg: '#1d2b34',
        actorBorder: '#5cb8d7',
        actorTextColor: '#e3e8ea',
        signalColor: '#9ec8dc',
        signalTextColor: '#d4d8da',
        labelBoxBkgColor: '#1d2b34',
        labelTextColor: '#e3e8ea',
        pie1: PALETTE[0],
        pie2: PALETTE[1],
        pie3: PALETTE[2],
        pie4: PALETTE[3],
        pie5: PALETTE[4],
        pie6: PALETTE[5],
        pie7: PALETTE[6],
        pie8: PALETTE[7],
        pieStrokeColor: 'transparent',
        pieTitleTextColor: '#e3e8ea',
        pieLegendTextColor: '#d4d8da',
        gridColor: '#ffffff14',
        taskBkgColor: '#2a5566',
        taskBorderColor: '#5cb8d7',
        doneTaskBkgColor: '#3d5a4a',
        activeTaskBkgColor: '#5cb8d7',
        critBkgColor: '#8a4b4b',
        todayLineColor: '#e3b37c',
      },
    });
    return mermaid;
  });
  return mermaidReady;
}

// The zoomed view is portaled to <body>: glass ancestors use backdrop-filter, which would trap position:fixed.
// Mermaid diagrams (flowchart, sequence, gantt, class, state, ER, pie, mindmap, timeline...).
// Rendered lazily with securityLevel "strict": labels are sanitized and no scripts or links run.
export function MermaidBlock({code}) {
  const [svg, setSvg] = useState(''),
    [error, setError] = useState(''),
    [mode, setMode] = useState('diagram'),
    [zoom, setZoom] = useState(false),
    [copied, setCopied] = useState(false);
  const base = 'mmd' + useId().replace(/[^a-z0-9]/gi, ''),
    sequence = useRef(0);
  useEffect(() => {
    let live = true;
    const run = ++sequence.current,
      id = base + '-' + run;
    // Streaming answers change the code on every chunk: wait for a short pause before rendering.
    const timer = setTimeout(async () => {
      try {
        if (code.length > 20000) throw Error(loc('Диаграмма слишком большая'));
        const mermaid = await loadMermaid();
        await mermaid.parse(code);
        const out = await mermaid.render(id, code);
        if (live && run === sequence.current) {
          setSvg(out.svg);
          setError('');
        }
      } catch (e) {
        if (live && run === sequence.current)
          setError(
            String(e?.message || e)
              .split('\n')[0]
              .slice(0, 200)
          );
      } finally {
        document.getElementById('d' + id)?.remove();
      }
    }, 320);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code]);
  useEffect(() => {
    if (!zoom) return;
    const key = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoom(false);
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [zoom]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  const showCode = mode === 'code' || (!svg && !!error);
  return (
    <figure className="nexus-widget widget-diagram">
      <div className="diagram-toolbar">
        <span>
          <Workflow size={13} />
          {loc('Схема')}
        </span>
        <div>
          <button
            type="button"
            aria-pressed={mode === 'code'}
            onClick={() => setMode(m => (m === 'code' ? 'diagram' : 'code'))}
            title={mode === 'code' ? loc('Показать схему') : loc('Показать код Mermaid')}
          >
            <Code2 size={13} />
            {mode === 'code' ? loc('Схема') : loc('Код')}
          </button>
          <button type="button" onClick={copy} title={loc('Копировать код Mermaid')}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button type="button" disabled={!svg} onClick={() => setZoom(true)} title={loc('Открыть крупно')}>
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
      {showCode ? (
        <pre className="diagram-code">
          <code>{code}</code>
        </pre>
      ) : svg ? (
        <div className="mermaid-diagram" dangerouslySetInnerHTML={{__html: svg}} />
      ) : (
        <div className="diagram-loading">{loc('Рисую схему…')}</div>
      )}
      {error && (
        <small className="diagram-error" role="status">
          {loc('Схема не построена:')} {error}
        </small>
      )}
      {zoom &&
        createPortal(
          <div
            className="diagram-zoom"
            role="dialog"
            aria-modal="true"
            aria-label={loc('Схема крупно')}
            onMouseDown={e => {
              if (e.target === e.currentTarget) setZoom(false);
            }}
          >
            <button
              type="button"
              className="diagram-zoom-close"
              aria-label={loc('Закрыть')}
              onClick={() => setZoom(false)}
            >
              <X size={18} />
            </button>
            <div className="mermaid-diagram zoomed" dangerouslySetInnerHTML={{__html: svg}} />
          </div>,
          document.body
        )}
    </figure>
  );
}
