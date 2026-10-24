import { SECTIONS, SECTION_LABEL, FILTERS, fmtDate, daysBetween, inText, kitCounts, filterKit, groupKit, checkProgress, openCheck, lastCheck, dateView } from './logic.js?v=1';
import { makeBackend, seedIfEmpty } from './data.js?v=1';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const localToday = () => params.get('today') || new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, device time zone
const PROJECT = 'rwbiizjwvyssdyxjuqan';
const DASH = `https://supabase.com/dashboard/project/${PROJECT}`;
const CFG = window.CAR_CONFIG || {};
const TABS = ['kit', 'check', 'dates', 'wash'];
const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('car.' + k) || 'null'); localStorage.setItem('car.' + k, JSON.stringify(v)); } catch { return null; } };

const be = makeBackend();
const state = { tab: TABS.includes(params.get('tab')) ? params.get('tab') : (LS('tab') || 'kit'), db: null, conn: '',
  filter: LS('filter') || 'all', checkMode: LS('checkMode') || 'one', seeded: false };

// ---------- loading, offline cache, connection problems
let loadSeq = 0;
async function refresh() {
  const n = ++loadSeq; let db;
  try {
    if (be.kind !== 'mock' && !navigator.onLine) throw new Error('offline');
    db = await withTimeout(be.load());
    if (!state.seeded) { state.seeded = true; if (await seedIfEmpty(be, db)) db = await withTimeout(be.load()); }
  } catch (err) {
    if (n === loadSeq) {
      if (isMissingTables(err)) { state.conn = ''; renderSetup(); throw err; }
      state.conn = connProblem(err); if (state.db) render(); else renderUnreachable();
    }
    throw err;
  }
  if (n !== loadSeq) return;
  state.db = db; state.conn = ''; saveCache(db); render();
}
const withTimeout = (p) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('Timed out reaching the database')), 15000))]);
const isMissingTables = (err) => err?.code === 'PGRST205' || err?.code === '42P01' || /could not find the table|does not exist/i.test(String(err?.message || ''));
const isNetErr = (err) => !navigator.onLine || /failed to fetch|networkerror|load failed|network|offline|fetch/i.test(String(err?.message || err));
const connProblem = (err) => (!navigator.onLine ? 'offline' : /jwt|token|not authenticated|auth session/i.test(String(err?.message || err)) ? 'auth' : 'unreachable');
const errMsg = (err) => (isNetErr(err) ? 'You’re offline or the database can’t be reached – not saved. Try again later.' : `Couldn’t save – ${err?.message || err}`);
const offlineNow = () => be.kind !== 'mock' && !navigator.onLine;
function connMessage() {
  if (state.conn === 'offline') return `<b>You’re offline</b> – showing what was saved on this phone. Changes can’t be saved until you’re back online.`;
  if (state.conn === 'auth') return `<b>Your sign-in has expired.</b> <button type="button" class="link" data-relogin>Sign in again</button>`;
  return `<b>Can’t reach the database</b> – it may be paused (the free plan pauses after a week unused). Restore it at <a href="${DASH}" target="_blank" rel="noopener">supabase.com</a>, then tap Retry.`;
}
const connBanner = () => (state.conn && state.conn !== 'updating' ? `<div class="banner conn" role="alert"><span>${connMessage()}</span><button type="button" class="ghost" data-retry>Retry</button></div>` : '');
function renderUnreachable() {
  if (!state.conn || state.conn === 'updating') state.conn = navigator.onLine ? 'unreachable' : 'offline';
  header();
  $('#view').innerHTML = `<div class="card conn-card" role="alert"><p>${connMessage()}</p><button type="button" class="primary wide" data-retry>Retry</button></div>`;
}
function renderSetup() {
  header();
  $('#view').innerHTML = `<div class="card setup"><h2>One-time setup</h2>
    <p>The car tables aren’t in the database yet. This takes about a minute and only touches new <code>car_</code> tables.</p>
    <ol><li><button type="button" class="ghost" data-copy-sql>📋 Copy setup SQL</button> <a href="supabase/setup.sql" target="_blank" rel="noopener">(or open it)</a></li>
    <li>Open the <a href="${DASH}/sql/new" target="_blank" rel="noopener">Supabase SQL Editor</a>, paste it and tap <b>Run</b>.</li>
    <li>Come back here and tap <b>Retry</b> – your kit list, dates and wash steps fill in automatically.</li></ol>
    <button type="button" class="primary wide" data-retry>Retry</button></div>`;
}
const cacheKey = () => (be.kind === 'supabase' && be.user?.id ? `car.cache.v1.${be.user.id}` : null);
function saveCache(db) { const k = cacheKey(); if (k) try { localStorage.setItem(k, JSON.stringify({ saved_at: new Date().toISOString(), db })); } catch { /* full */ } }
function readCache() { const k = cacheKey(); try { return k ? JSON.parse(localStorage.getItem(k) || 'null') : null; } catch { return null; } }
const clearCaches = () => Object.keys(localStorage).filter((k) => k.startsWith('car.cache.')).forEach((k) => localStorage.removeItem(k));
async function retry() {
  if (!be.ready) return location.reload();
  state.conn = 'updating'; if (state.db) render(); else $('#view').innerHTML = '<p class="empty">Loading…</p>';
  refresh().catch(console.error);
}
const fail = (err) => { console.error(err); toast(errMsg(err)); refresh().catch(() => {}); };
const rows = (t) => state.db?.[t] || [];
const find = (t, id) => rows(t).find((x) => x.id === id);

// optimistic local change, then save; on failure reload from the database
async function save(t, id, patch, { quiet = true } = {}) {
  if (offlineNow()) return fail(new Error('offline'));
  const r = find(t, id); if (r) Object.assign(r, patch); render();
  try { await be.update(t, id, patch); saveCache(state.db); } catch (err) { return fail(err); }
  if (!quiet) toast('Saved');
}
async function act(fn, msg) {
  if (offlineNow()) return fail(new Error('offline'));
  try { await fn(); await refresh(); if (msg) toast(msg); return true; } catch (err) { fail(err); return false; }
}

let toastTimer;
function toast(msg, undo) {
  const t = $('#toast'); clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="undo">Undo</button>' : ''}`;
  t.hidden = false;
  if (undo) $('#undo').onclick = async () => { t.hidden = true; try { await undo(); } catch (err) { fail(err); } };
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

// ---------- rendering helpers
const bar = (n, of) => `<div class="bar" aria-hidden="true"><i style="width:${of ? Math.round((100 * n) / of) : 0}%"></i></div>`;
const crit = (it) => (it.critical ? `<span class="chip c-crit">Critical</span>` : '');
function header() {
  const today = localToday();
  $('#today').textContent = `${CFG.car?.reg || ''} · ${fmtDate(today, { long: true })}` + (be.kind === 'mock' ? ' · local mock' : '') + (state.conn === 'updating' ? ' · updating…' : '');
  $('#account').textContent = '⚙';
}

// ---------- Kit tab
function renderKit() {
  const items = rows('car_items'), k = kitCounts(items), last = lastCheck(rows('car_checks'));
  let h = `<div class="card stats">
    <div class="stat"><b>${k.have}/${k.n}</b><span>Have it</span>${bar(k.have, k.n)}</div>
    <div class="stat"><b>${k.packed}/${k.n}</b><span>In the car</span>${bar(k.packed, k.n)}</div>
    <p class="muted small">Critical: ${k.critHave}/${k.crit} owned, ${k.critPacked}/${k.crit} in the car${last ? ` · Last kit check ${fmtDate(last.completed_on)}` : ''}</p></div>`;
  const counts = { all: k.n, buy: k.toBuy, pack: k.notPacked, critical: k.crit };
  h += `<div class="filters" role="tablist">${FILTERS.map((f) => `<button type="button" class="pill ${state.filter === f.key ? 'on' : ''}" data-filter="${f.key}" aria-pressed="${state.filter === f.key}">${f.label} <small>${counts[f.key]}</small></button>`).join('')}</div>`;
  const shown = filterKit(items, state.filter);
  const hint = { buy: 'Not ticked “Have it” yet – your shopping list.', pack: 'Owned but not in the car yet.', critical: 'Get these first.' }[state.filter];
  if (hint) h += `<p class="muted small hint">${hint}</p>`;
  for (const g of groupKit(shown)) {
    h += `<h2 class="sec">${esc(g.label)} <small>${g.items.filter((i) => i.packed).length}/${g.items.length} in car</small></h2><div class="list">`;
    h += g.items.map((it) => `<div class="item kit ${it.have && it.packed ? 'all-done' : ''}" data-id="${esc(it.id)}">
      <div class="body" role="button" tabindex="0" data-edit-item><div class="name">${esc(it.name)}</div>
        ${it.critical || it.note ? `<div class="meta">${crit(it)}${it.note ? `<span>${esc(it.note)}</span>` : ''}</div>` : ''}</div>
      <div class="ticks">
        <button type="button" class="tk ${it.have ? 'on' : ''}" data-tick="have" aria-pressed="${!!it.have}" aria-label="Have it: ${esc(it.name)}"><span>✓</span>Have it</button>
        <button type="button" class="tk ${it.packed ? 'on' : ''}" data-tick="packed" aria-pressed="${!!it.packed}" aria-label="In the car: ${esc(it.name)}"><span>✓</span>In car</button>
      </div></div>`).join('') + '</div>';
  }
  if (!shown.length) h += `<p class="calm">${state.filter === 'buy' ? 'Nothing left to buy. 🎉' : state.filter === 'pack' ? 'Everything you own is in the car. 🎉' : 'No items yet.'}</p>`;
  h += `<button type="button" class="ghost wide add" data-add-item>+ Add item</button>`;
  return h;
}
function tickItem(id, field) {
  const it = find('car_items', id); if (!it) return;
  const v = !it[field], patch = { [field]: v };
  if (field === 'packed' && v) patch.have = true;      // in the car = have it
  if (field === 'have' && !v) patch.packed = false;    // don't have it = not in the car
  return save('car_items', id, patch);
}

// ---------- Kit check tab
function renderCheck() {
  const items = rows('car_items'), checks = rows('car_checks'), cur = openCheck(checks), last = lastCheck(checks);
  const lastLine = last ? `<p class="muted">Last completed check: <b>${fmtDate(last.completed_on)}</b> – ${last.missing?.length ? `${last.missing.length} missing` : 'nothing missing'}.</p>` : `<p class="muted">No check completed yet.</p>`;
  if (!cur) {
    const p = checkProgress(items, null);
    let h = `<div class="card"><h2>Kit check</h2><p>For collecting the car (e.g. from the bodyshop): go through everything ticked <b>In the car</b> and confirm it’s still there.</p>${lastLine}
      ${p.total ? `<button type="button" class="primary wide" data-check-start>Start kit check (${p.total} items)</button>` : `<p class="calm">Nothing is ticked “In the car” yet – tick items on the Kit tab first.</p>`}</div>`;
    if (last?.missing?.length) {
      h += `<h2 class="sec">Missing at the last check <small>${fmtDate(last.completed_on)}</small></h2><div class="list">${last.missing.map((n) => `<div class="item"><div class="body"><div class="name">✗ ${esc(n)}</div></div></div>`).join('')}</div>`;
      const stillPacked = items.filter((i) => i.packed && last.results?.[i.id] === 'missing');
      if (stillPacked.length) h += `<button type="button" class="ghost wide" data-unpack-missing="${esc(last.id)}">Untick “In the car” for these ${stillPacked.length}</button>`;
    }
    return h;
  }
  const p = checkProgress(items, cur), res = cur.results || {};
  let h = `<div class="card"><div class="check-top"><b>${p.done} of ${p.total} checked</b><span class="muted small">started ${fmtDate(cur.started_at.slice(0, 10))}</span></div>${bar(p.done, p.total)}
    <div class="seg" role="group" aria-label="View"><button type="button" class="${state.checkMode === 'one' ? 'on' : ''}" data-mode="one">One at a time</button><button type="button" class="${state.checkMode === 'list' ? 'on' : ''}" data-mode="list">List</button></div></div>`;
  if (!p.next) {
    h += `<div class="card summary"><h2>${p.missing.length ? `${p.missing.length} missing` : 'Everything’s there 🎉'}</h2>
      ${p.missing.length ? `<ul class="missing">${p.missing.map((i) => `<li>✗ ${esc(i.name)} <small>${esc(SECTION_LABEL[i.section] || '')}</small></li>`).join('')}</ul>` : `<p>All ${p.total} items are in the car.</p>`}
      <button type="button" class="primary wide" data-check-finish>Finish and save (${fmtDate(localToday())})</button></div>`;
  } else if (state.checkMode === 'one') {
    const it = p.next;
    h += `<div class="card one"><div class="muted small">${esc(SECTION_LABEL[it.section] || '')}</div><div class="big">${esc(it.name)}</div>
      <div class="meta">${crit(it)}${it.note ? `<span>${esc(it.note)}</span>` : ''}</div>
      <div class="row-btns big-btns"><button type="button" class="miss" data-answer="missing" data-id="${esc(it.id)}">✗ Missing</button><button type="button" class="primary" data-answer="ok" data-id="${esc(it.id)}">✓ It’s there</button></div>
      ${p.done ? `<button type="button" class="link" data-check-back>← Back</button>` : ''}</div>`;
  }
  if (state.checkMode === 'list' || !p.next) {
    h += `<div class="list">${p.list.map((it) => `<div class="item crow" data-id="${esc(it.id)}"><div class="body"><div class="name">${esc(it.name)}</div><div class="meta"><span>${esc(SECTION_LABEL[it.section] || '')}</span>${crit(it)}</div></div>
      <div class="ticks"><button type="button" class="tk miss-tk ${res[it.id] === 'missing' ? 'on' : ''}" data-answer="missing" data-id="${esc(it.id)}" aria-pressed="${res[it.id] === 'missing'}"><span>✗</span>Missing</button>
      <button type="button" class="tk ${res[it.id] === 'ok' ? 'on' : ''}" data-answer="ok" data-id="${esc(it.id)}" aria-pressed="${res[it.id] === 'ok'}"><span>✓</span>There</button></div></div>`).join('')}</div>`;
    if (p.next) h += `<button type="button" class="ghost wide" data-all-ok>Mark the other ${p.total - p.done} as there</button>`;
  }
  h += `<button type="button" class="ghost wide danger" data-check-reset>Reset check</button>`;
  return h;
}
async function answer(itemId, val) {
  const cur = openCheck(rows('car_checks')); if (!cur) return;
  const results = { ...(cur.results || {}) };
  if (state.checkMode === 'list' && results[itemId] === val) delete results[itemId]; else results[itemId] = val;
  cur._last = itemId;
  await save('car_checks', cur.id, { results });
}
async function checkBack() {
  const cur = openCheck(rows('car_checks')); if (!cur) return;
  const p = checkProgress(rows('car_items'), cur), answered = p.list.filter((i) => cur.results?.[i.id]);
  const lastId = cur._last && cur.results?.[cur._last] ? cur._last : answered[answered.length - 1]?.id; if (!lastId) return;
  const results = { ...cur.results }; delete results[lastId]; cur._last = null;
  await save('car_checks', cur.id, { results });
}

// ---------- Dates tab
function dueWhen(d, today) {
  const date = d.due_label || fmtDate(d.due_date);
  if (!d.due_date) return esc(date || 'No date');
  const days = daysBetween(today, d.due_date);
  return `${esc(date)} <span class="chip ${days < 0 ? 'c-over' : days <= 60 ? 'c-soon' : 'c-later'}">${inText(days)}</span>`;
}
function renderDates() {
  const today = localToday(), v = dateView(rows('car_dates'), today);
  let h = v.reminders.map((r) => `<div class="banner remind" data-id="${esc(r.d.id)}"><span>⏰ <b>Reminder:</b> ${esc(r.d.title)} – ${esc(r.d.due_label || fmtDate(r.d.due_date))}</span></div>`).join('');
  h += `<h2 class="sec">Upcoming <small>${v.rows.length}</small></h2>`;
  h += v.rows.length ? `<div class="list">${v.rows.map((r) => dateRow(r.d, today)).join('')}</div>` : `<p class="calm">Nothing coming up.</p>`;
  h += `<h2 class="sec">Recommended by Tesla app <small>${v.rec.filter((d) => !d.done_on).length} to do</small></h2>`;
  h += v.rec.length ? `<div class="list">${v.rec.map((d) => dateRow(d, today)).join('')}</div>` : `<p class="calm">Nothing recommended.</p>`;
  if (v.done.length) h += `<details class="fold"><summary><span>Done</span><small>${v.done.length}</small></summary><div class="list">${v.done.map((d) => dateRow(d, today)).join('')}</div></details>`;
  h += `<button type="button" class="ghost wide add" data-add-date>+ Add date</button>`;
  return h;
}
function dateRow(d, today) {
  const meta = d.done_on ? `<span class="chip c-done">Done ${fmtDate(d.done_on)}</span>` : d.kind === 'recommended' ? '' : `<span>${dueWhen(d, today)}</span>`;
  const remind = !d.done_on && d.remind_on ? `<span class="${d.remind_on <= today ? 'rem-now' : ''}">⏰ ${fmtDate(d.remind_on)}</span>` : '';
  return `<div class="item ${d.done_on ? 'muted-row' : ''}" data-id="${esc(d.id)}">
    <button type="button" class="tick ${d.done_on ? 'done' : ''}" data-date-done aria-pressed="${!!d.done_on}" aria-label="${d.done_on ? 'Not done' : 'Mark done'}: ${esc(d.title)}">✓</button>
    <div class="body" role="button" tabindex="0" data-edit-date><div class="name">${esc(d.title)}${d.cost ? ` <span class="cost">${esc(d.cost)}</span>` : ''}</div>
      <div class="meta">${meta}${remind}</div>${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}</div></div>`;
}
async function toggleDateDone(id) {
  const d = find('car_dates', id); if (!d) return;
  const prev = d.done_on, next = prev ? null : localToday();
  await save('car_dates', id, { done_on: next });
  toast(next ? `Done ${fmtDate(next)} – ${d.title}` : 'Marked not done', async () => { await be.update('car_dates', id, { done_on: prev }); await refresh(); });
}

// ---------- Wash tab
function renderWash() {
  const steps = rows('car_wash').slice().sort((a, b) => a.sort_order - b.sort_order), done = steps.filter((s) => s.done).length;
  const last = lastCheck(rows('car_checks'), 'wash');
  let h = `<div class="card"><div class="check-top"><b>${done} of ${steps.length}</b><span class="muted small">${last ? `Last full wash ${fmtDate(last.completed_on)}` : 'Jet wash order'}</span></div>${bar(done, steps.length)}</div>`;
  h += `<div class="list wash">${steps.map((s, i) => `<button type="button" class="wash-step ${s.done ? 'on' : ''}" data-wash="${esc(s.id)}" aria-pressed="${!!s.done}"><span class="num">${s.done ? '✓' : i + 1}</span><span>${esc(s.name)}</span></button>`).join('')}</div>`;
  if (steps.length && done === steps.length) h += `<p class="calm">All done – lovely and clean. ✨</p>`;
  h += `<div class="row-btns"><button type="button" class="ghost wide" data-wash-reset>↺ Reset</button><button type="button" class="ghost wide" data-wash-edit>✎ Edit steps</button></div>`;
  return h;
}
async function tickWash(id) {
  const s = find('car_wash', id); if (!s) return;
  const wasAll = rows('car_wash').every((x) => x.done);
  await save('car_wash', id, { done: !s.done });
  const all = rows('car_wash').length && rows('car_wash').every((x) => x.done);
  if (all && !wasAll && !rows('car_checks').some((c) => c.kind === 'wash' && c.completed_on === localToday())) {
    await act(() => be.insert('car_checks', { kind: 'wash', completed_on: localToday() }), 'Wash done ✨');
  }
}

// ---------- main render
function render() {
  header();
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  const fn = { kit: renderKit, check: renderCheck, dates: renderDates, wash: renderWash }[state.tab];
  $('#view').innerHTML = connBanner() + fn();
}

// ---------- sign-in (email code, or the link in the same email)
function renderLogin(msg = '', sentTo = '') {
  header(); $('#account').textContent = '';
  $('#view').innerHTML = `<div class="card login"><h2>Sign in</h2><p class="muted">Same account as the Chores app. We’ll email you a sign-in code – no password needed.</p>
    <form id="login"><input type="email" id="email" required placeholder="you@example.com" autocomplete="email" value="${esc(sentTo || CFG.email || '')}"><button class="${sentTo ? 'ghost wide' : 'primary'}">${sentTo ? 'Send again' : 'Send sign-in email'}</button></form>
    ${sentTo ? `<form id="code-form"><label class="field">Code from the email <input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="6-digit code"></label>
      <button class="primary wide">Sign in</button></form><p class="muted small">Or open the link in the email on this phone.</p>` : ''}
    <p class="${/Could not|wrong|expired|invalid/i.test(msg) ? 'err' : ''}">${esc(msg)}</p></div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault(); const email = $('#email').value.trim();
    try { await be.signIn(email); renderLogin(`Email sent to ${email}.`, email); $('#code')?.focus(); } catch (err) { renderLogin('Could not send: ' + err.message, sentTo); }
  };
  const cf = $('#code-form');
  if (cf) cf.onsubmit = async (e) => {
    e.preventDefault(); const code = $('#code').value.replace(/\s+/g, '');
    try { await be.verifyCode(sentTo, code); location.reload(); }
    catch (err) { renderLogin(/expired|invalid/i.test(err.message) ? 'That code is wrong or has expired – check the latest email, or send a new one.' : 'Could not sign in: ' + err.message, sentTo); }
  };
}

// ---------- sheets: add / edit
function sheet(html, onSubmit) {
  const d = $('#edit-sheet');
  d.innerHTML = `<form id="edit-form" novalidate>${html}<p class="err" id="e-err"></p></form>`;
  d.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => d.close()));
  $('#edit-form', d).onsubmit = async (e) => {
    e.preventDefault();
    if (offlineNow()) { $('#e-err', d).textContent = errMsg(new Error('offline')); return; }
    try { const msg = await onSubmit(d); if (msg === false) return; d.close(); await refresh().catch(() => {}); if (msg) toast(msg); }
    catch (err) { $('#e-err', d).textContent = errMsg(err); }
  };
  if (!d.open) d.showModal();
  return d;
}
const head = (t) => `<div class="sheet-head"><h2>${t}</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>`;
const btns = (canDelete) => `<div class="row-btns"><button type="button" class="ghost" data-close>Cancel</button><button class="primary">Save</button></div>${canDelete ? `<button type="button" class="ghost wide danger" data-delete>🗑 Delete</button>` : ''}`;
function wireDelete(d, t, it, label) {
  const b = $('[data-delete]', d); if (!b) return;
  b.onclick = async () => {
    if (!confirm(`Delete “${label}”?`)) return;
    d.close();
    const { id, owner_id, created_at, updated_at, ...copy } = it;
    await act(() => be.remove(t, it.id));
    toast(`Deleted – ${label}`, async () => { await be.insert(t, copy); await refresh(); });
  };
}
function openItem(it) {
  const isNew = !it; it ||= { name: '', section: state.lastSection || 'glovebox', note: '', critical: false, have: false, packed: false };
  const d = sheet(`${head(isNew ? 'Add item' : 'Edit item')}
    <label class="field">Item <input id="e-name" required maxlength="200" value="${esc(it.name)}"></label>
    <label class="field">Where <select id="e-section">${SECTIONS.map((s) => `<option value="${s.key}" ${s.key === it.section ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
    <label class="field">Note <input id="e-note" maxlength="300" value="${esc(it.note || '')}" placeholder="e.g. Ireland rain"></label>
    <label class="toggle"><input type="checkbox" id="e-crit" ${it.critical ? 'checked' : ''}> Critical (get this first)</label>
    <label class="toggle"><input type="checkbox" id="e-have" ${it.have ? 'checked' : ''}> Have it</label>
    <label class="toggle"><input type="checkbox" id="e-packed" ${it.packed ? 'checked' : ''}> In the car</label>
    ${btns(!isNew)}`, async (d) => {
    const name = $('#e-name', d).value.trim(); if (!name) { $('#e-err', d).textContent = 'Give it a name.'; return false; }
    const packed = $('#e-packed', d).checked, patch = { name, section: $('#e-section', d).value, note: $('#e-note', d).value.trim() || null,
      critical: $('#e-crit', d).checked, have: $('#e-have', d).checked || packed, packed };
    state.lastSection = patch.section;
    if (isNew) { patch.sort_order = Math.max(0, ...rows('car_items').filter((x) => x.section === patch.section).map((x) => x.sort_order || 0)) + 10; await be.insert('car_items', patch); return 'Added'; }
    await be.update('car_items', it.id, patch); return 'Saved';
  });
  wireDelete(d, 'car_items', it, it.name);
  if (isNew) $('#e-name', d).focus();
}
function openDate(it, kind = 'date') {
  const isNew = !it; it ||= { title: '', kind, due_date: null, due_label: '', remind_on: null, note: '', cost: '', done_on: null };
  const d = sheet(`${head(isNew ? 'Add date' : 'Edit')}
    <label class="field">What <input id="e-title" required maxlength="200" value="${esc(it.title)}"></label>
    <label class="field">Type <select id="e-kind"><option value="date" ${it.kind !== 'recommended' ? 'selected' : ''}>Upcoming date</option><option value="recommended" ${it.kind === 'recommended' ? 'selected' : ''}>Recommended by Tesla app</option></select></label>
    <label class="field">Due date <input type="date" id="e-due" value="${esc(it.due_date || '')}"></label>
    <label class="field">Wording instead of the date <small class="muted">optional, e.g. “January 2027”</small><input id="e-label" maxlength="60" value="${esc(it.due_label || '')}"></label>
    <label class="field">Reminder date <input type="date" id="e-remind" value="${esc(it.remind_on || '')}"></label>
    <label class="field">Cost <input id="e-cost" maxlength="60" value="${esc(it.cost || '')}" placeholder="e.g. about €85"></label>
    <label class="field">Note <textarea id="e-note" rows="2">${esc(it.note || '')}</textarea></label>
    <label class="field">Done on <small class="muted">leave empty if not done</small><input type="date" id="e-done" value="${esc(it.done_on || '')}"></label>
    ${btns(!isNew)}`, async (d) => {
    const title = $('#e-title', d).value.trim(); if (!title) { $('#e-err', d).textContent = 'Give it a name.'; return false; }
    const v = (s) => $(s, d).value.trim() || null;
    const patch = { title, kind: $('#e-kind', d).value, due_date: v('#e-due'), due_label: v('#e-label'), remind_on: v('#e-remind'), cost: v('#e-cost'), note: v('#e-note'), done_on: v('#e-done') };
    if (isNew) { patch.sort_order = Math.max(0, ...rows('car_dates').map((x) => x.sort_order || 0)) + 10; await be.insert('car_dates', patch); return 'Added'; }
    await be.update('car_dates', it.id, patch); return 'Saved';
  });
  wireDelete(d, 'car_dates', it, it.title);
  if (isNew) $('#e-title', d).focus();
}
function openWashEdit() {
  const steps = rows('car_wash').slice().sort((a, b) => a.sort_order - b.sort_order);
  sheet(`${head('Wash steps')}<p class="muted small">One step per line, in the order you wash.</p>
    <label class="field">Steps <textarea id="e-steps" rows="8">${esc(steps.map((s) => s.name).join('\n'))}</textarea></label>${btns(false)}`, async (d) => {
    const names = $('#e-steps', d).value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    if (!names.length) { $('#e-err', d).textContent = 'Add at least one step.'; return false; }
    const pool = [...steps];
    for (const [i, name] of names.entries()) {
      const k = pool.findIndex((s) => s.name === name);
      if (k >= 0) { const s = pool.splice(k, 1)[0]; if (s.sort_order !== (i + 1) * 10) await be.update('car_wash', s.id, { sort_order: (i + 1) * 10 }); }
      else await be.insert('car_wash', { name, done: false, sort_order: (i + 1) * 10 });
    }
    for (const s of pool) await be.remove('car_wash', s.id);
    return 'Saved';
  });
}

// ---------- settings
async function downloadBackup() {
  let db = state.db, note = '';
  try { db = await be.load(); } catch { note = ' (from the copy on this phone – offline)'; }
  const data = { app: 'car', format: 1, exported_at: new Date().toISOString(), account: be.user?.email || null, ...db };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `car-backup-${new Date().toLocaleDateString('en-CA')}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Backup saved: ${a.download}${note}`);
}
function openSettings() {
  const d = $('#settings');
  d.innerHTML = `<div class="sheet-head"><h2>Settings</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>
    <p class="muted">${esc(CFG.car?.name || 'Tesla Model 3')} · ${esc(CFG.car?.reg || '')}</p>
    <h3>Backup</h3><p class="muted small">A file with your kit list, dates, checks and wash steps.</p>
    <button type="button" class="ghost wide" id="backup" ${state.db ? '' : 'disabled'}>⬇ Download backup</button>
    <h3>Account</h3><p class="muted small">${be.kind === 'mock' ? 'Local mock data (this device only).' : `Signed in as ${esc(be.user?.email || '')}`}</p>
    <button type="button" class="ghost wide" id="acct">${be.kind === 'mock' ? 'Reset mock data' : 'Sign out'}</button>
    <p class="muted small">Add to Home Screen: iPhone Safari → Share → Add to Home Screen; Android Chrome → ⋮ → Add to Home screen / Install app.</p>`;
  $('[data-close]', d).onclick = () => d.close();
  $('#backup', d).onclick = downloadBackup;
  $('#acct', d).onclick = async () => {
    if (be.kind === 'mock') { if (confirm('Reset the local mock data?')) { be.reset(); location.reload(); } return; }
    if (confirm('Sign out on this phone?')) { clearCaches(); await be.signOut().catch(() => {}); location.reload(); }
  };
  if (!d.open) d.showModal();
}

// ---------- events
const view = $('#view');
view.addEventListener('click', async (e) => {
  const b = e.target.closest('button'), ds = b?.dataset || {};
  if (ds.retry !== undefined) return retry();
  if (ds.relogin !== undefined) { clearCaches(); await be.signOut().catch(() => {}); return location.reload(); }
  if (ds.copySql !== undefined) {
    try { const sql = await (await fetch('supabase/setup.sql', { cache: 'no-cache' })).text(); await navigator.clipboard.writeText(sql); toast('Copied – now paste it in the SQL Editor'); }
    catch { window.open('supabase/setup.sql', '_blank'); }
    return;
  }
  if (!state.db) return;
  const host = e.target.closest('[data-id]'), id = ds.id || host?.dataset.id;
  // kit
  if (ds.filter) { state.filter = ds.filter; LS('filter', state.filter); return render(); }
  if (ds.tick && id) return tickItem(id, ds.tick);
  if (ds.addItem !== undefined) return openItem(null);
  if (e.target.closest('[data-edit-item]') && id) return openItem(find('car_items', id));
  // check
  if (ds.checkStart !== undefined) return act(() => be.insert('car_checks', { kind: 'kit', results: {}, missing: [] }));
  if (ds.mode) { state.checkMode = ds.mode; LS('checkMode', ds.mode); return render(); }
  if (ds.answer && id) return answer(id, ds.answer);
  if (ds.checkBack !== undefined) return checkBack();
  if (ds.allOk !== undefined) {
    const cur = openCheck(rows('car_checks')), p = checkProgress(rows('car_items'), cur), results = { ...cur.results };
    p.list.forEach((i) => { results[i.id] ||= 'ok'; }); return save('car_checks', cur.id, { results });
  }
  if (ds.checkFinish !== undefined) {
    const cur = openCheck(rows('car_checks')), p = checkProgress(rows('car_items'), cur);
    return act(() => be.update('car_checks', cur.id, { completed_on: localToday(), missing: p.missing.map((i) => i.name) }), `Kit check saved – ${fmtDate(localToday())}`);
  }
  if (ds.checkReset !== undefined) { const cur = openCheck(rows('car_checks')); if (cur && confirm('Reset this check and start again later?')) return act(() => be.remove('car_checks', cur.id), 'Check reset'); return; }
  if (ds.unpackMissing) {
    const last = find('car_checks', ds.unpackMissing), its = rows('car_items').filter((i) => i.packed && last?.results?.[i.id] === 'missing');
    return act(async () => { for (const i of its) await be.update('car_items', i.id, { packed: false }); }, `Unticked ${its.length} – they’ll show under “Not in car”`);
  }
  // dates
  if (ds.dateDone !== undefined && id) return toggleDateDone(id);
  if (ds.addDate !== undefined) return openDate(null);
  if (e.target.closest('[data-edit-date]') && id) return openDate(find('car_dates', id));
  if (host?.classList.contains('remind')) return openDate(find('car_dates', host.dataset.id));
  // wash
  if (ds.wash) return tickWash(ds.wash);
  if (ds.washReset !== undefined) {
    const on = rows('car_wash').filter((s) => s.done); if (!on.length) return;
    return act(async () => { for (const s of on) await be.update('car_wash', s.id, { done: false }); }, 'Reset – ready for next time');
  }
  if (ds.washEdit !== undefined) return openWashEdit();
});
view.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; LS('tab', state.tab); $('#toast').hidden = true; if (state.db) render(); scrollTo(0, 0); }));
$('#account').onclick = () => openSettings();

(async () => {
  try {
    const ok = await be.init();
    be.ready = true;
    if (!ok) return renderLogin();
    const cached = readCache();
    if (cached?.db) { state.db = cached.db; state.seeded = true; state.conn = 'updating'; render(); }
    let rt; be.onChange(() => { clearTimeout(rt); rt = setTimeout(() => refresh().catch(console.error), 400); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.db) refresh().catch(console.error); });
    window.addEventListener('online', () => { if (state.conn) retry(); });
    window.addEventListener('offline', () => { if (state.db && be.kind !== 'mock') { state.conn = 'offline'; render(); } });
    await refresh().catch(console.error);
  } catch (err) { console.error(err); state.conn = connProblem(err); renderUnreachable(); }
  finally {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
})();
