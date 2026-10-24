// Pure helpers (no DOM) – tested in tests/logic.test.js
export const SECTIONS = [
  { key: 'glovebox', label: 'Glovebox / Centre console', hint: 'Daily quick access – use the console organiser' },
  { key: 'cabin', label: 'Cabin / Door pockets', hint: 'Frequent reach – dog hair zone' },
  { key: 'boot', label: 'Boot', hint: 'Main storage – Tesla pet liner + boot mat' },
  { key: 'frunk', label: 'Frunk', hint: 'Protected storage for less-used items' },
  { key: 'seasonal', label: 'Seasonal / Occasional', hint: 'Add as needed' },
];
export const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label]));
export const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'buy', label: 'To buy' }, { key: 'pack', label: 'Not in car' }, { key: 'critical', label: 'Critical' },
];

const pad = (n) => String(n).padStart(2, '0');
const parse = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function fmtDate(iso, { long = false } = {}) {
  if (!iso) return '';
  const d = parse(iso), s = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return long ? `${DAYS[d.getUTCDay()]} ${s}` : s;
}
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export function inText(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${-days} days ago`;
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30.44);
  return `in ${days} days (~${months} months)`;
}

// ---- kit
export const isCritical = (it) => !!it.critical;
export function kitCounts(items) {
  const n = items.length, have = items.filter((i) => i.have).length, packed = items.filter((i) => i.packed).length;
  const crit = items.filter(isCritical), critHave = crit.filter((i) => i.have).length, critPacked = crit.filter((i) => i.packed).length;
  return { n, have, packed, toBuy: n - have, notPacked: items.filter((i) => i.have && !i.packed).length, crit: crit.length, critHave, critPacked };
}
export function filterKit(items, f) {
  if (f === 'buy') return items.filter((i) => !i.have);
  if (f === 'pack') return items.filter((i) => i.have && !i.packed);
  if (f === 'critical') return items.filter(isCritical);
  return items;
}
export function groupKit(items) {
  const known = new Set(SECTIONS.map((s) => s.key));
  return SECTIONS.map((s) => ({ ...s, items: items.filter((i) => (known.has(i.section) ? i.section : 'seasonal') === s.key).sort(bySort) }))
    .filter((g) => g.items.length);
}
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));

// ---- kit check: covers everything ticked 'In the car' (in section order)
export function checkList(items) { return groupKit(items.filter((i) => i.packed)).flatMap((g) => g.items); }
export function checkProgress(items, check) {
  const list = checkList(items), res = check?.results || {};
  const answered = list.filter((i) => res[i.id]);
  return { list, total: list.length, done: answered.length, ok: answered.filter((i) => res[i.id] === 'ok').length,
    missing: list.filter((i) => res[i.id] === 'missing'), next: list.find((i) => !res[i.id]) || null };
}
export const openCheck = (checks, kind = 'kit') => checks.filter((c) => c.kind === kind && !c.completed_on).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0] || null;
export const lastCheck = (checks, kind = 'kit') => checks.filter((c) => c.kind === kind && c.completed_on)
  .sort((a, b) => b.completed_on.localeCompare(a.completed_on) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] || null;

// ---- dates
export function dateView(dates, today) {
  const open = dates.filter((d) => d.kind !== 'recommended' && !d.done_on)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const rows = open.map((d) => ({ d, days: d.due_date ? daysBetween(today, d.due_date) : null, remindNow: !!(d.remind_on && d.remind_on <= today) }));
  const done = dates.filter((d) => d.kind !== 'recommended' && d.done_on).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const rec = dates.filter((d) => d.kind === 'recommended').sort((a, b) => !!a.done_on - !!b.done_on || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { rows, reminders: rows.filter((r) => r.remindNow), done, rec };
}

// ---- car jobs: next due = last done + frequency
export const FREQS = [
  { key: 'once', label: 'One-off', soon: 0 },
  { key: 'weekly', label: 'Weekly', days: 7, soon: 3 },
  { key: 'fortnightly', label: 'Every 2 weeks', days: 14, soon: 3 },
  { key: 'monthly', label: 'Monthly', months: 1, soon: 7 },
  { key: '6monthly', label: 'Every 6 months', months: 6, soon: 14 },
];
export const FREQ = Object.fromEntries(FREQS.map((f) => [f.key, f]));
const iso = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
export function addMonths(s, n) {   // calendar months; 31/01 + 1 month = 28/02 (or 29/02)
  const d = parse(s), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return iso(d);
}
export function nextDue(job) {
  const f = FREQ[job.frequency]; if (!f || !job.last_done || job.frequency === 'once') return null;
  return f.months ? addMonths(job.last_done, f.months) : addDays(job.last_done, f.days);
}
// state: 'done' (one-off ticked – hidden) | 'todo' (one-off) | 'duenow' (never done) | 'overdue' | 'soon' | 'ok'
export function jobStatus(job, today) {
  const f = FREQ[job.frequency] || FREQ.monthly;
  if (job.frequency === 'once') return { job, state: job.last_done ? 'done' : 'todo', next: null, days: null };
  if (!job.last_done) return { job, state: 'duenow', next: null, days: null };
  const next = nextDue(job), days = daysBetween(today, next);
  return { job, state: days < 0 ? 'overdue' : days <= f.soon ? 'soon' : 'ok', next, days };
}
const RANK = { overdue: 0, duenow: 1, soon: 2, todo: 3, ok: 4, done: 5 };
const FRANK = Object.fromEntries(FREQS.map((f, i) => [f.key, i]));
export function jobView(jobs, today) {
  const rows = jobs.map((j) => jobStatus(j, today)).sort((a, b) => RANK[a.state] - RANK[b.state] || (a.days ?? -1e6) - (b.days ?? -1e6)
    || FRANK[a.job.frequency] - FRANK[b.job.frequency] || (a.job.sort_order ?? 0) - (b.job.sort_order ?? 0));
  return {
    now: rows.filter((r) => r.state === 'overdue' || r.state === 'duenow'),
    soon: rows.filter((r) => r.state === 'soon'),
    oneoff: rows.filter((r) => r.state === 'todo'),
    ok: rows.filter((r) => r.state === 'ok'),
    doneOneoffs: rows.filter((r) => r.state === 'done'),
  };
}
