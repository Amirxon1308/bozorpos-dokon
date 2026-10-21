// Ma'lumot manbai: server bo'lsa (FastAPI) — sinxronlash, bo'lmasa brauzer xotirasi (demo).
// Sahifalar ikkala holatda ham bir xil ishlaydi: ctx.data ni o'zgartiradi va ctx.save() chaqiradi.
import * as db from './db.js';

let remote = false;
let token = null;
let timer = null;
const TOKEN_KEY = () => `${db.nsKey()}:token`;
export const isRemote = () => remote;
export const nextNo = (data, coll) => Math.max(0, ...data[coll].map((x) => x.no || 0)) + 1;

const COLLS = ['products', 'sales', 'receipts', 'tables', 'orders', 'shifts', 'audit', 'customers', 'debts', 'suppliers', 'counts', 'reservations', 'ingredients'];
const blank = () => Object.fromEntries([...COLLS.map((c) => [c, []]), ['settings', {}], ['counter', 0]]);

async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('Server bilan aloqa yo’q'); e.offline = true; throw e; }
  if (!r.ok) {
    let msg = r.statusText; try { const j = await r.json(); msg = typeof j.detail === 'string' ? j.detail : msg; } catch { /* ignore */ }
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return r.json();
}

export async function detect() {
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    const j = await r.json(); remote = !!j.ok;
  } catch { remote = false; }
  return remote;
}

// ---------- Server rejimi: hujjatlar sinxroni ----------
class Sync {
  constructor(storeId) { this.storeId = storeId; this.data = blank(); this.snap = new Map(); this.rev = 0; this.pending = new Map(); this.flushing = false; this.dead = false; this.inited = false; }

  key(c, id) { return `${c}/${id}`; }

  // Mahalliy o'zgarishlarni topish va navbatga qo'yish
  save() {
    const cur = new Map();
    for (const c of COLLS) for (const it of this.data[c]) cur.set(this.key(c, it.id), [c, it.id, it]);
    cur.set('meta/settings', ['meta', 'settings', this.data.settings]);
    for (const [k, [c, id, it]] of cur) {
      const j = JSON.stringify(it);
      if (this.snap.get(k) !== j) { this.snap.set(k, j); this.pending.set(k, { c, id, data: it }); }
    }
    for (const k of [...this.snap.keys()]) if (!cur.has(k) && !k.startsWith('meta/')) { this.snap.delete(k); const [c, id] = k.split('/'); this.pending.set(k, { c, id, data: null }); }
    this.persistQueue(); clearTimeout(this.ft); this.ft = setTimeout(() => this.flush(), 80);
  }
  persistQueue() { try { localStorage.setItem(`${db.nsKey()}:q:${this.storeId}`, JSON.stringify([...this.pending.values()])); } catch { /* to'lgan */ } }

  async flush() {
    if (this.flushing || !this.pending.size || this.dead) return;
    this.flushing = true;
    const batch = [...this.pending.entries()];
    try {
      const r = await api('/api/push', { method: 'POST', body: { docs: batch.map(([, d]) => ({ c: d.c, id: d.id, data: d.data })) } });
      for (const [k, d] of batch) if (this.pending.get(k) === d) this.pending.delete(k);
      for (const a of r.assigned || []) { const it = this.data[a.c].find((x) => x.id === a.id); if (it) { it.no = a.no; this.snap.set(this.key(a.c, a.id), JSON.stringify(it)); } }
      this.persistQueue();
      document.dispatchEvent(new CustomEvent('bpos:saved'));
    } catch (e) {
      if (e.status === 401) { this.dead = true; document.dispatchEvent(new CustomEvent('bpos:expired')); }
      else if (e.status === 403) { // ruxsat yo'q: navbatni tozalab, serverdagi holatni qaytaramiz
        for (const [k, d] of batch) if (this.pending.get(k) === d) this.pending.delete(k);
        this.snap.clear(); this.persistQueue(); document.dispatchEvent(new CustomEvent('bpos:denied', { detail: e.message })); await this.pull(true);
      } else document.dispatchEvent(new CustomEvent('bpos:offline'));
    } finally { this.flushing = false; if (this.pending.size && !this.dead) setTimeout(() => this.flush(), 3000); }
  }

  apply(docs) {
    let changed = false;
    for (const d of docs) {
      const k = this.key(d.c, d.id);
      if (this.pending.has(k)) continue; // mahalliy yangi o'zgarish ustun
      if (d.c === 'meta') { if (d.id === 'settings' && d.data) { replaceIn(this.data.settings, d.data); this.snap.set(k, JSON.stringify(this.data.settings)); changed = true; } if (d.id === 'init') this.inited = true; continue; }
      const arr = this.data[d.c]; if (!arr) continue;
      const i = arr.findIndex((x) => x.id === d.id);
      if (d.data === null) { if (i >= 0) { arr.splice(i, 1); changed = true; } this.snap.delete(k); continue; }
      if (i >= 0) replaceIn(arr[i], d.data); else arr.push(d.data);
      this.snap.set(k, JSON.stringify(d.data)); changed = true;
    }
    return changed;
  }

  async pull(full = false) {
    if (this.dead) return;
    try {
      const r = await api(`/api/sync?since=${full ? 0 : this.rev}`);
      this.rev = r.rev;
      if (this.apply(r.docs)) document.dispatchEvent(new CustomEvent('bpos:synced'));
      document.dispatchEvent(new CustomEvent('bpos:online'));
    } catch (e) {
      if (e.status === 401) { this.dead = true; document.dispatchEvent(new CustomEvent('bpos:expired')); } else document.dispatchEvent(new CustomEvent('bpos:offline'));
    }
  }
  start() { clearInterval(timer); timer = setInterval(() => { this.flush(); this.pull(); }, 3000); document.onvisibilitychange = () => { if (!document.hidden) this.pull(); }; }
  stop() { this.dead = true; clearInterval(timer); clearTimeout(this.ft); }
}

function replaceIn(target, src) { for (const k of Object.keys(target)) if (!(k in src)) delete target[k]; Object.assign(target, src); }

let sync = null;

async function openRemote(res) {
  token = res.token || token; localStorage.setItem(TOKEN_KEY(), token);
  if (sync) sync.stop();
  sync = new Sync(res.store ? res.store.id : null);
  if (res.store) {
    try { sync.pending = new Map(JSON.parse(localStorage.getItem(`${db.nsKey()}:q:${res.store.id}`) || '[]').map((d) => [`${d.c}/${d.id}`, d])); } catch { /* ignore */ }
    await sync.pull(true);
    // Birinchi marta: ega namunaviy menyu va stollarni yaratadi
    if (!sync.inited && res.user.role === 'owner') {
      const seed = db.createEmptyStore(res.store.name, res.store.type);
      for (const c of COLLS) if (seed[c] && !sync.data[c].length) sync.data[c].push(...seed[c]);
      replaceIn(sync.data.settings, { ...seed.settings, ...sync.data.settings });
      sync.inited = true; sync.save();
      sync.pending.set('meta/init', { c: 'meta', id: 'init', data: { at: Date.now() } });
      await sync.flush();
    }
    sync.start();
  }
  return { user: res.user, store: res.store, data: sync.data, save: () => sync.save() };
}

// ---------- Printer navbati (faqat server rejimida) ----------
export const queuePrint = (kind, payload, width, copies = 1) => api('/api/print', { method: 'POST', body: { kind, width, copies, payload } });
export const printStatus = () => api('/api/print/status');
export const printRetry = () => api('/api/print/retry', { method: 'POST' });

// ---------- Umumiy interfeys ----------
export async function login(loginName, password) {
  if (remote) {
    try { return await openRemote(await api('/api/login', { method: 'POST', body: { login: loginName, password } })); }
    catch (e) { return { error: e.message }; }
  }
  const central = db.getCentral();
  const u = central.users.find((x) => x.login === loginName.trim().toLowerCase());
  if (!u || u.hash !== await db.hash(password)) return { error: 'Login yoki parol noto’g’ri. Qayta urinib ko’ring.' };
  const store = central.stores.find((s) => s.id === u.storeId) || null;
  if (store && store.status === 'blocked') return { error: 'Bu do’kon bloklangan. Administrator bilan bog’laning.' };
  db.setSession({ userId: u.id });
  return openLocal(u, store, central);
}

function openLocal(user, store, central) {
  const data = store ? db.getStore(store.id) : null;
  if (data) for (const c of COLLS) if (!data[c]) data[c] = [];
  return { user, store, data, save: () => { if (store) db.saveStore(store.id, data); }, central };
}

export async function restore() {
  if (remote) {
    token = localStorage.getItem(TOKEN_KEY());
    if (!token) return null;
    try { const me = await api('/api/me'); return await openRemote({ ...me, token }); } catch { token = null; return null; }
  }
  const session = db.getSession(); const central = db.getCentral();
  const user = session && central.users.find((u) => u.id === session.userId);
  if (!user) return null;
  const store = central.stores.find((s) => s.id === user.storeId) || null;
  if (store && store.status === 'blocked') { db.setSession(null); return null; }
  return openLocal(user, store, central);
}

export async function logout() {
  if (sync) { await sync.flush().catch(() => {}); sync.stop(); sync = null; }
  if (remote) { try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ } localStorage.removeItem(TOKEN_KEY()); token = null; } else db.setSession(null);
}

// Xodimlar, do'konlar (ega / super-admin)
export function adminFor(ctx) {
  if (remote) {
    return {
      users: () => api('/api/users'),
      addUser: (u) => api('/api/users', { method: 'POST', body: u }),
      delUser: (id) => api(`/api/users/${id}`, { method: 'DELETE' }),
      renameStore: async (name) => { await api('/api/store', { method: 'PUT', body: { name } }); },
      stores: () => api('/api/stores'),
      addStore: (s) => api('/api/stores', { method: 'POST', body: s }),
      setStatus: (id, status) => api(`/api/stores/${id}`, { method: 'PATCH', body: { status } }),
    };
  }
  const central = db.getCentral();
  const sid = ctx.store && ctx.store.id;
  return {
    users: async () => central.users.filter((u) => u.storeId === sid).map(({ hash, ...u }) => u),
    addUser: async (u) => {
      if (central.users.some((x) => x.login === u.login.toLowerCase())) throw new Error('Bu login band.');
      central.users.push({ id: db.uid('u'), login: u.login.toLowerCase(), name: u.name, role: u.role, storeId: sid, hash: await db.hash(u.password) }); db.saveCentral(central);
    },
    delUser: async (id) => { central.users = central.users.filter((x) => x.id !== id); db.saveCentral(central); },
    renameStore: async (name) => { const s = central.stores.find((x) => x.id === sid); if (s) s.name = name; db.saveCentral(central); },
    stores: async () => central.stores.map((s) => ({ ...s, owner: central.users.find((u) => u.storeId === s.id && u.role === 'owner') || null, bytes: db.storeBytes(s.id) })),
    addStore: async (b) => {
      if (central.users.some((u) => u.login === b.login.toLowerCase())) throw new Error('Bu login band. Boshqasini tanlang.');
      const id = db.uid('st');
      central.stores.push({ id, name: b.name, type: b.type, address: b.address, status: 'active', created: Date.now() });
      central.users.push({ id: db.uid('u'), login: b.login.toLowerCase(), name: b.owner_name, role: 'owner', storeId: id, hash: await db.hash(b.password) });
      db.saveStore(id, db.createEmptyStore(b.name, b.type)); db.saveCentral(central);
    },
    setStatus: async (id, status) => { central.stores.find((s) => s.id === id).status = status; db.saveCentral(central); },
  };
}
