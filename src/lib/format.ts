export const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

export const fmtRange = (start: number, end: number) => {
  const sameHalf = (start < 12) === (end < 12);
  const a = fmtHour(start);
  return `${sameHalf ? a.replace(/ (AM|PM)$/, '') : a}–${fmtHour(end)}`;
};

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const timeAgo = (ts: number | string) => {
  const t = typeof ts === 'string' ? Date.parse(ts) : ts;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export const fmtDate = (ts: string) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
