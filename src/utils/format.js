export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 1) return '< 1 s';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export const formatRate = (perSecond) =>
  perSecond <= 0 ? '—' : perSecond >= 10 ? `${Math.round(perSecond)} files/s` : `${perSecond.toFixed(1)} files/s`;
