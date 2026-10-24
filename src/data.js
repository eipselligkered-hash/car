// Data layer: MockBackend (localStorage, this device only) and SupabaseBackend (vendored supabase-js, email code / link, RLS).
// Both expose: init(), user, signIn(email), verifyCode(email, code), signOut(), load() -> {car_items, car_dates, car_checks, car_wash},
//              insert(table, row), update(table, id, patch), remove(table, id), seed(table, rows), onChange(cb)
import { ITEMS, DATES, WASH } from './seed.js?v=1';
export const TABLES = ['car_items', 'car_dates', 'car_checks', 'car_wash'];
const SEED = { car_items: ITEMS, car_dates: DATES, car_wash: WASH };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const AUTH_KEY = 'car-auth';
const now = () => new Date().toISOString();
// column defaults the database fills in (mock only)
const DEFAULTS = { car_checks: { kind: 'kit', completed_on: null, results: {}, missing: [] }, car_items: { note: null, critical: false, have: false, packed: false, sort_order: 0 },
  car_dates: { kind: 'date', due_date: null, due_label: null, remind_on: null, note: null, cost: null, done_on: null, sort_order: 0 }, car_wash: { done: false, sort_order: 0 } };

// first sign-in: fill any empty table with the starting data (fixed ids, so two phones can't double it)
export async function seedIfEmpty(be, db) {
  let added = false;
  for (const [t, rows] of Object.entries(SEED)) if (!db[t].length) { await be.seed(t, rows); added = true; }
  return added;
}

export class MockBackend {
  constructor(key = 'car.mock.v1') { this.key = key; this.kind = 'mock'; this.user = { email: 'local mock (this device only)' }; this.cbs = []; }
  async init() {
    try { this.db = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch { this.db = null; }
    this.db ||= Object.fromEntries(TABLES.map((t) => [t, []])); this.save();
    window.addEventListener('storage', (e) => { if (e.key === this.key && e.newValue) { this.db = JSON.parse(e.newValue); this.cbs.forEach((f) => f()); } });
    return true;
  }
  save() { localStorage.setItem(this.key, JSON.stringify(this.db)); }
  async signIn() {} async verifyCode() {} async signOut() {}
  async load() { return structuredClone(this.db); }
  async insert(t, row) { const r = { id: uid(), created_at: now(), updated_at: now(), ...(DEFAULTS[t] || {}), ...(t === 'car_checks' ? { started_at: now() } : {}), ...row }; this.db[t].push(r); this.save(); return structuredClone(r); }
  async update(t, id, patch) { const r = this.db[t].find((x) => x.id === id); if (!r) throw new Error('Not found'); Object.assign(r, patch, { updated_at: now() }); this.save(); return structuredClone(r); }
  async remove(t, id) { this.db[t] = this.db[t].filter((x) => x.id !== id); this.save(); }
  async seed(t, rows) { for (const r of rows) if (!this.db[t].some((x) => x.id === r.id)) this.db[t].push({ created_at: now(), updated_at: now(), ...structuredClone(r) }); this.save(); }
  onChange(cb) { this.cbs.push(cb); }
  reset() { localStorage.removeItem(this.key); }
}

export class SupabaseBackend {
  constructor(url, anonKey) { this.url = url; this.anonKey = anonKey; this.kind = 'supabase'; this.user = null; }
  async init() {
    const { createClient } = await loadSupabase();
    // own storage key, so signing in or out here doesn't affect the other apps on the same site
    this.sb = createClient(this.url, this.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: AUTH_KEY } });
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('access_token') && h.get('refresh_token')) {
      await this.sb.auth.setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') });
      history.replaceState(null, '', location.pathname + location.search);
    }
    const { data, error } = await this.sb.auth.getSession();
    this.user = data.session?.user || null;
    if (!this.user && error) this.user = savedSessionUser();
    this.sb.auth.onAuthStateChange((_e, s) => { const was = !!this.user; this.user = s?.user || null; if (was !== !!this.user) location.reload(); });
    return !!this.user;
  }
  async signIn(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    if (error) throw error;
  }
  async verifyCode(email, token) { const { error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' }); if (error) throw error; }
  async signOut() { await this.sb.auth.signOut(); }
  async q(p) { const { data, error } = await p; if (error) throw error; return data; }
  async load() {
    const rows = await Promise.all(TABLES.map((t) => this.q(this.sb.from(t).select('*').order(t === 'car_checks' ? 'started_at' : 'sort_order'))));
    return Object.fromEntries(TABLES.map((t, i) => [t, rows[i]]));
  }
  async insert(t, row) { return this.q(this.sb.from(t).insert({ id: uid(), owner_id: this.user?.id, ...row }).select().single()); }
  async update(t, id, patch) { return this.q(this.sb.from(t).update(patch).eq('id', id).select().single()); }
  async remove(t, id) { await this.q(this.sb.from(t).delete().eq('id', id)); }
  async seed(t, rows) { await this.q(this.sb.from(t).upsert(rows.map((r) => ({ ...r, owner_id: this.user?.id })), { onConflict: 'id', ignoreDuplicates: true })); }
  onChange(cb) {
    const ch = this.sb.channel('car');
    TABLES.forEach((table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb()));
    ch.subscribe();
  }
}

function loadSupabase() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  return new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = new URL('../vendor/supabase.js?v=1', import.meta.url).href;
    s.onload = () => (window.supabase?.createClient ? ok(window.supabase) : ko(new Error('supabase-js did not load')));
    s.onerror = () => ko(new Error('Could not load supabase-js (offline?)'));
    document.head.appendChild(s);
  });
}
function savedSessionUser() {
  try { const v = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); return v?.user || v?.currentSession?.user || null; } catch { return null; }
}

export function makeBackend(cfg = window.CAR_CONFIG || {}) {
  const filled = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR-') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes('YOUR-');
  const mode = new URLSearchParams(location.search).get('backend') || cfg.backend || 'auto';
  if (mode === 'supabase' || (mode === 'auto' && filled)) return new SupabaseBackend(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return new MockBackend();
}
