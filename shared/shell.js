// Ilova qobig'i: kirish, rollar, yo'naltirish (router), sidebar va mobil navigatsiya.
// Har ilova (dokon / choyxona) start(config) bilan o'z sahifalarini beradi.
import { h, $, icon, toast, modal } from './ui.js';
import * as db from './db.js';
import * as be from './backend.js';

const app = document.getElementById('app');
let ctx = null;
let CFG = null; // {type, ns, brand, routes, demo, title, lead, points}
let current = null;

const TYPE_NAME = { dokon: 'oziq-ovqat do’koni', restoran: 'choyxona / restoran' };

// ---------- Kirish ----------
function renderAuth(error) {
  const login = h('input', { class: 'input', name: 'login', autocomplete: 'username', autocapitalize: 'none', required: true });
  const pass = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'error-text', role: 'alert' }, error || '');
  const fill = (l, p) => { login.value = l; pass.value = p; pass.focus(); };
  const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Kirish');

  const form = h('form', { class: 'auth-form', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    const res = await be.login(login.value, pass.value);
    btn.disabled = false;
    if (res.error) { err.textContent = res.error; return; }
    if (res.store && res.store.type !== CFG.type) { await be.logout(); err.textContent = `Bu hisob ${TYPE_NAME[res.store.type]} tizimiga tegishli. Boshqa ilovadan kiring.`; return; }
    start(res);
  } },
    h('div', {}, h('h2', {}, 'Tizimga kirish'), h('p', { class: 'muted', style: 'margin-top:6px' }, 'Loginingizni kiriting. Faqat o’z bo’limingiz ma’lumoti ochiladi.')),
    h('div', { class: 'field' }, h('label', { for: 'lg' }, 'Login'), login),
    h('div', { class: 'field' }, h('label', { for: 'ps' }, 'Parol'), pass),
    err, btn,
    !be.isRemote() && CFG.demo ? h('div', { class: 'demo-box' }, 'Sinov uchun hisoblar (bosing):',
      h('div', {}, CFG.demo.map(([l, p, t]) => h('button', { type: 'button', onclick: () => fill(l, p) }, `${l} · ${p}${t ? ` (${t})` : ''}`)))) : null);
  login.id = 'lg'; pass.id = 'ps';

  const point = (t) => h('div', {}, icon('check'), h('span', {}, t));
  app.replaceChildren(h('div', { class: 'auth' },
    h('section', { class: 'auth-art' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('logo')), CFG.brand),
      h('div', {}, h('h1', {}, CFG.title), h('p', { class: 'lead' }, CFG.lead)),
      h('div', { class: 'auth-points' }, CFG.points.map(point))),
    h('section', { class: 'auth-form-wrap' }, form)));
  login.focus();
}

// ---------- Qobiq ----------
function visibleRoutes() { return CFG.routes.filter((r) => r.roles.includes(ctx.user.role)); }

async function logout() {
  await be.logout(); ctx = null; current && current.destroy && current.destroy(); current = null; location.hash = ''; boot();
}

function initials(name) { return name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase(); }

function lowStockCount() {
  if (!ctx.data || !ctx.data.products) return 0;
  return ctx.data.products.filter((p) => !p.menu && p.stock <= p.min).length;
}

function renderShell() {
  const routes = visibleRoutes();
  const low = CFG.type === 'dokon' ? lowStockCount() : 0;
  const link = (r) => h('a', { href: `#/${r.id}`, 'data-route': r.id }, icon(r.icon), h('span', {}, r.label),
    r.id === 'products' && low ? h('span', { class: 'badge', title: 'Kam qolgan mahsulotlar' }, low) : null);

  const storeName = ctx.store ? ctx.store.name : 'Barcha do’konlar';
  const net = h('span', { class: 'net-dot', id: 'netdot', title: be.isRemote() ? 'Server bilan ulangan' : 'Demo rejim: ma’lumot shu brauzerda' });
  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('logo')), CFG.brand),
    h('div', { class: 'store-chip' }, h('small', {}, ctx.store ? (ctx.store.type === 'restoran' ? 'Choyxona' : 'Do’kon') : 'Boshqaruv'), h('strong', {}, storeName)),
    h('nav', { class: 'nav', 'aria-label': 'Asosiy' }, routes.map(link)),
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'user-row' }, h('span', { class: 'avatar' }, initials(ctx.user.name)),
        h('div', {}, h('strong', {}, ctx.user.name), h('small', {}, db.roleLabel(ctx.user.role, ctx.store && ctx.store.type)))),
      h('button', { class: 'btn btn-sm', onclick: logout }, icon('out'), 'Chiqish')));

  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('logo')), CFG.brand),
    h('button', { class: 'btn btn-ghost', style: 'color:#fff;text-align:right;display:grid;gap:0;min-height:0;padding:4px 8px', onclick: userMenu },
      h('strong', {}, storeName), h('small', {}, `${ctx.user.name} · ${db.roleLabel(ctx.user.role, ctx.store && ctx.store.type)}`)));

  const mob = routes.filter((r) => r.id !== 'settings');
  const moreBtn = () => h('button', { class: 'more-btn', onclick: () => {
    const m = modal({ title: 'Bo’limlar', body: h('div', { class: 'more-grid' }, routes.map((r) => h('a', { class: 'btn', href: `#/${r.id}`, onclick: () => m.close() }, icon(r.icon), r.label)), h('button', { class: 'btn btn-danger', onclick: () => { m.close(); logout(); } }, icon('out'), 'Chiqish')) });
  } }, icon('menu'), h('span', {}, 'Yana'));
  const bottom = h('nav', { class: 'bottom-nav', 'aria-label': 'Mobil' }, mob.length > 5 ? [...mob.slice(0, 4).map(link), moreBtn()] : mob.map(link));
  const main = h('main', { class: 'main', id: 'view', tabindex: '-1' });
  const banner = h('div', { class: 'offline-banner', id: 'offbanner', hidden: true }, 'Server bilan aloqa yo’q. O’zgarishlar saqlanib turibdi, aloqa tiklanganda yuboriladi.');
  app.replaceChildren(h('div', { class: 'shell' }, sidebar, h('div', {}, banner, topbar, main)), bottom);
  sidebar.querySelector('.store-chip').append(net);
}

function userMenu() {
  const items = [];
  if (ctx.user.role === 'owner') items.push(h('a', { class: 'btn', href: '#/settings', onclick: () => m.close() }, icon('gear'), 'Sozlamalar'));
  items.push(h('button', { class: 'btn btn-danger', onclick: () => { m.close(); logout(); } }, icon('out'), 'Chiqish'));
  const m = modal({ title: ctx.user.name, body: h('div', { style: 'display:grid;gap:10px' }, h('p', { class: 'muted' }, db.roleLabel(ctx.user.role, ctx.store && ctx.store.type)), items) });
}

function markActive(id) {
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

async function route() {
  if (!ctx) return;
  const routes = visibleRoutes();
  const id = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  const def = routes.find((r) => r.id === id) || routes[0];
  if (def.id !== id) history.replaceState(null, '', `#/${def.id}`);
  markActive(def.id);
  if (current && current.destroy) current.destroy();
  current = null;
  const view = $('#view');
  view.replaceChildren(h('p', { class: 'muted' }, 'Yuklanmoqda…'));
  try {
    const mod = await def.load();
    const page = await mod.default(ctx);
    if (!ctx || $('#view') !== view) return;
    view.replaceChildren(page.el);
    current = page;
    document.title = `${def.label} · ${CFG.brand}`;
    window.scrollTo(0, 0);
    const badge = document.querySelector('.nav a[data-route="products"] .badge');
    const low = lowStockCount();
    if (badge) { if (low) badge.textContent = low; else badge.remove(); }
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'notice' }, icon('alert'), h('div', {}, 'Sahifani ochib bo’lmadi: ', String(e.message || e))));
  }
}

function start(res) {
  const { user, store, data, save } = res;
  ctx = {
    user, store, data, save,
    can: (role) => (Array.isArray(role) ? role : [role]).includes(user.role),
    refreshShell: () => { renderShell(); markActive((location.hash.replace(/^#\/?/, '') || '')); },
    go: (id) => { location.hash = `#/${id}`; },
    onSynced: (fn) => { document.addEventListener('bpos:synced', fn); return () => document.removeEventListener('bpos:synced', fn); },
  };
  ctx.admin = be.adminFor(ctx);
  renderShell();
  route();
}

export async function boot() {
  const res = await be.restore();
  if (!res) { ctx = null; renderAuth(); return; }
  if (res.store && res.store.type !== CFG.type) { await be.logout(); renderAuth(`Bu hisob ${TYPE_NAME[res.store.type]} tizimiga tegishli.`); return; }
  start(res);
}

const bannerSet = (show) => { const b = document.getElementById('offbanner'); if (b) b.hidden = !show; const d = document.getElementById('netdot'); if (d) d.classList.toggle('off', show); };
document.addEventListener('bpos:offline', () => bannerSet(true));
document.addEventListener('bpos:online', () => bannerSet(false));
document.addEventListener('bpos:expired', () => { toast('Sessiya tugadi, qayta kiring', 'bad'); logout(); });
document.addEventListener('bpos:denied', (e) => toast(e.detail || 'Bu amalga ruxsat yo’q', 'bad'));

export async function startApp(config) {
  CFG = config;
  db.setNamespace(config.ns);
  await be.detect();
  if (!be.isRemote()) await db.ensureSeed(config.type);
  window.addEventListener('hashchange', route);
  boot();
}
