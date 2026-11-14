import {countLabel} from './locale-format.js';
import {loc} from './i18n.js';
export const quotaPercent = value =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
export function quotaDate(value) {
  if (value == null || value === '') return null;
  const d = new Date(typeof value === 'number' ? value * (value < 1e12 ? 1000 : 1) : value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function windowName(minutes, fallback) {
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes === 10080) return loc('Неделя');
  if (minutes % 1440 === 0) return countLabel(minutes / 1440, loc('день'), loc('дня'), loc('дней'));
  if (minutes % 60 === 0) return countLabel(minutes / 60, loc('час'), loc('часа'), loc('часов'));
  return countLabel(minutes, loc('минута'), loc('минуты'), loc('минут'));
}
export function quotaView(quota, statusline, now = Date.now()) {
  const report = statusline?.status === 'available' ? statusline.data : null;
  const slPrimary = quotaPercent(report?.fiveHour?.usedPercent),
    slSecondary = quotaPercent(report?.sevenDay?.usedPercent),
    useStatusline = slPrimary !== null || slSecondary !== null;
  const primary = useStatusline ? slPrimary : quotaPercent(quota?.primaryUsedPercent),
    secondary = useStatusline ? slSecondary : quotaPercent(quota?.secondaryUsedPercent);
  const checkedAt = quotaDate(useStatusline ? report?.receivedAt : quota?.checkedAt);
  const windows = [
    {
      id: 'primary',
      label: useStatusline ? loc('5 часов') : windowName(quota?.primaryWindowMinutes, loc('Основное окно')),
      used: primary,
      resetAt: quotaDate(useStatusline ? report?.fiveHour?.resetAt : quota?.primaryResetAt),
    },
    {
      id: 'secondary',
      label: useStatusline
        ? loc('Неделя')
        : windowName(quota?.secondaryWindowMinutes, loc('Дополнительное окно')),
      used: secondary,
      resetAt: quotaDate(useStatusline ? report?.sevenDay?.resetAt : quota?.secondaryResetAt),
    },
  ]
    .filter(w => w.used !== null)
    .map(w => ({...w, left: 100 - w.used}));
  return {
    windows,
    checkedAt,
    stale: !!checkedAt && now - checkedAt.getTime() > 600000,
    source: useStatusline ? report?.source || 'Claude Code statusLine' : quota?.source || '',
    checking: quota?.status === 'checking',
    error: quota?.status === 'error',
    // Codex Business/Enterprise may report credits instead of usage windows; never shown as a percentage.
    credits:
      !useStatusline &&
      (quota?.creditsUnlimited === true || /^-?\d+(\.\d+)?$/.test(quota?.creditsBalance ?? ''))
        ? {
            unlimited: quota.creditsUnlimited === true,
            balance: quota.creditsUnlimited === true ? null : Number(quota.creditsBalance),
          }
        : null,
    plan: !useStatusline && typeof quota?.planType === 'string' ? quota.planType : null,
  };
}

// xAI API key limits (per-minute windows from response headers). Not subscription quota.
export function apiLimitsView(limits, now = Date.now()) {
  if (!limits || limits.status === 'checking') return {windows: [], checking: true, credits: null};
  const win = (id, label, w) => {
    const used = quotaPercent(w?.usedPercent);
    return used === null
      ? null
      : {
          id,
          label,
          used,
          left: Math.round((100 - used) * 10) / 10,
          limit: w.limit,
          remaining: w.remaining,
          reset: typeof w.reset === 'string' ? w.reset : null,
        };
  };
  const windows = [
    win('requests', loc('Запросы в минуту'), limits.requests),
    win('tokens', loc('Токены в минуту'), limits.tokens),
  ].filter(Boolean);
  const c = limits.credits,
    credits =
      c && Number.isFinite(c.remaining)
        ? {
            remaining: c.remaining,
            spent: Number.isFinite(c.spent) ? c.spent : null,
            total: Number.isFinite(c.total) ? c.total : null,
          }
        : null;
  const checkedAt = quotaDate(limits.checkedAt);
  return {
    windows,
    credits,
    checking: false,
    error: limits.status === 'error',
    limited: !!limits.limited,
    blocked: !!limits.blocked,
    detail: limits.detail || '',
    source: limits.source || '',
    checkedAt,
    stale: !!checkedAt && now - checkedAt.getTime() > 600000,
  };
}
