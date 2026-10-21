// Ma'lumotlar qatlami (demo): brauzer xotirasi (localStorage).
//
// Tuzilma backend'dagi rejaga o'xshash:
//   bpos:central        -> markaziy baza: do'konlar ro'yxati va foydalanuvchilar
//   bpos:store:<id>     -> har do'kon uchun ALOHIDA baza "fayli": mahsulot, sotuv, kirim, sozlama
// Bitta do'kon sessiyasi faqat o'z kalitini o'qiydi, shuning uchun ma'lumot aralashmaydi.
// Keyingi bosqichda bu qatlam FastAPI so'rovlari bilan almashtiriladi.

import { uid } from './ui.js';

let NS = 'bpos';
const CENTRAL = () => `${NS}:central`;
const SESSION = () => `${NS}:session`;
const cache = new Map();
// Ikki ilova (dokon, choyxona) bitta saytda ishlasa ham brauzer xotirasi aralashmasin
export const nsKey = () => NS;
export { uid };
export const setNamespace = (ns) => { NS = `bpos:${ns}`; };

export async function hash(s) {
  if (globalThis.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bpos|${s}`));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  let x = 5381; for (const c of `bpos|${s}`) x = ((x << 5) + x + c.charCodeAt(0)) >>> 0;
  return `weak${x}`;
}

function read(key) {
  if (cache.has(key)) return cache.get(key);
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (v) cache.set(key, v); return v; } catch { return null; }
}
function write(key, val) {
  cache.set(key, val);
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error('Xotira to’ldi', e); }
}

export const getCentral = () => read(CENTRAL());
export const saveCentral = (d) => write(CENTRAL(), d);
export const getStore = (id) => read(`${NS}:store:${id}`);
export const saveStore = (id, d) => write(`${NS}:store:${id}`, d);
export const storeBytes = (id) => (localStorage.getItem(`${NS}:store:${id}`) || '').length * 2;
export const dropStore = (id) => { cache.delete(`${NS}:store:${id}`); localStorage.removeItem(`${NS}:store:${id}`); };

export const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION()) || 'null'); } catch { return null; } };
export const setSession = (s) => (s ? localStorage.setItem(SESSION(), JSON.stringify(s)) : localStorage.removeItem(SESSION()));

// ---------- Boshlang'ich (demo) ma'lumotlar ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function ean13(base12) {
  let s = 0; for (let i = 0; i < 12; i++) s += +base12[i] * (i % 2 ? 3 : 1);
  return base12 + ((10 - (s % 10)) % 10);
}

const CATALOG = [
  // [nom, kategoriya, birlik, kirim, sotuv, qoldiq, minimal]
  ['Coca-Cola 1,5 l', 'Ichimliklar', 'dona', 11000, 14000, 48, 12],
  ['Coca-Cola 0,5 l', 'Ichimliklar', 'dona', 5000, 7000, 72, 18],
  ['Pepsi 1,5 l', 'Ichimliklar', 'dona', 10500, 13500, 40, 12],
  ['Fanta 1 l', 'Ichimliklar', 'dona', 8000, 10500, 34, 10],
  ['Suv «BulOq» 1,5 l', 'Ichimliklar', 'dona', 2500, 4000, 90, 24],
  ['Muzdek choy 0,5 l', 'Ichimliklar', 'dona', 5500, 7500, 26, 8],
  ['Tandir non', 'Non va un', 'dona', 2500, 4000, 60, 20],
  ['Patir non', 'Non va un', 'dona', 4500, 7000, 24, 10],
  ['Un «Baraka» 2 kg', 'Non va un', 'dona', 17000, 21000, 30, 10],
  ['Un «Baraka» 10 kg', 'Non va un', 'dona', 78000, 92000, 11, 5],
  ['Sut «Nestle» 1 l', 'Sut mahsulotlari', 'dona', 10500, 13500, 36, 12],
  ['Qatiq 0,5 l', 'Sut mahsulotlari', 'dona', 5000, 7000, 28, 10],
  ['Qaymoq 200 g', 'Sut mahsulotlari', 'dona', 7500, 10000, 4, 8],
  ['Sariyog’ 180 g', 'Sut mahsulotlari', 'dona', 18000, 23000, 22, 8],
  ['Tuxum (10 dona)', 'Sut mahsulotlari', 'dona', 14000, 18000, 40, 12],
  ['Kolbasa «Doktorskaya»', 'Go’sht va kolbasa', 'kg', 62000, 78000, 14.5, 5],
  ['Sosiska «Sut»', 'Go’sht va kolbasa', 'kg', 48000, 62000, 9.2, 4],
  ['Mol go’shti', 'Go’sht va kolbasa', 'kg', 92000, 110000, 18, 6],
  ['Tovuq (butun)', 'Go’sht va kolbasa', 'kg', 32000, 41000, 21, 8],
  ['Shokolad «Alpen Gold»', 'Shirinliklar', 'dona', 9000, 12500, 55, 15],
  ['Pechenye «Yubileynoye»', 'Shirinliklar', 'dona', 7000, 9500, 3, 10],
  ['Chips «Lay’s» 90 g', 'Shirinliklar', 'dona', 8500, 11500, 44, 12],
  ['Holva 400 g', 'Shirinliklar', 'dona', 16000, 21000, 17, 6],
  ['Guruch «Lazer» 1 kg', 'Yormalar', 'kg', 16000, 20000, 85, 25],
  ['Grechka 1 kg', 'Yormalar', 'kg', 14000, 18000, 38, 12],
  ['Makaron 400 g', 'Yormalar', 'dona', 5500, 7500, 66, 20],
  ['Shakar 1 kg', 'Yormalar', 'kg', 11000, 14000, 52, 20],
  ['O’simlik yog’i 1 l', 'Yormalar', 'dona', 17000, 21500, 31, 12],
  ['Tuz 1 kg', 'Yormalar', 'dona', 1800, 3000, 60, 15],
  ['Choy «Akbar» 100 g', 'Yormalar', 'dona', 14000, 18500, 25, 8],
  ['Idish yuvish vositasi', 'Maishiy', 'dona', 12000, 16000, 19, 6],
  ['Qog’oz salfetka', 'Maishiy', 'dona', 4000, 6000, 45, 12],
  ['Paket (katta)', 'Maishiy', 'dona', 200, 500, 300, 100],
];

const MENU = [
  ['Somsa', 'Milliy taomlar', 'dona', 4500, 8000],
  ['Lavash (tovuq)', 'Milliy taomlar', 'dona', 14000, 26000],
  ['Osh (porsiya)', 'Milliy taomlar', 'dona', 16000, 32000],
  ['Shashlik (1 six)', 'Milliy taomlar', 'dona', 9000, 17000],
  ['Choy (choynak)', 'Milliy taomlar', 'dona', 1500, 5000],
];

function makeProducts(prefixSeed) {
  const list = CATALOG.map((r, i) => ({
    id: uid('p'), name: r[0], code: ean13(`478${String(prefixSeed * 1000 + i + 100).padStart(4, '0')}${String(i * 37 % 1000).padStart(3, '0')}00`.slice(0, 12)),
    category: r[1], unit: r[2], cost: r[3], price: r[4], stock: r[5], min: r[6], menu: false,
  }));
  return list;
}

function makeSales(products, cashiers, seed, perDay) {
  const r = rng(seed); const sales = []; const now = Date.now(); let no = 0;
  const pays = ['naqd', 'naqd', 'naqd', 'naqd', 'naqd', 'karta', 'karta', 'click', 'click', 'payme'];
  for (let d = 13; d >= 0; d--) {
    const base = new Date(now); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - d);
    const weekend = [0, 6].includes(base.getDay());
    const n = Math.round(perDay * (weekend ? 1.35 : 1) * (0.8 + r() * 0.4));
    const times = Array.from({ length: n }, () => base.getTime() + (8 + r() * 13) * 3600e3).sort((a, b) => a - b);
    for (const ts of times) {
      if (ts > now) continue;
      const k = 1 + Math.floor(r() * 4); const items = [];
      for (let i = 0; i < k; i++) {
        const p = products[Math.floor(r() * products.length)];
        const qty = p.unit === 'kg' ? Math.round((0.3 + r() * 1.4) * 10) / 10 : 1 + Math.floor(r() * (r() > 0.8 ? 4 : 2));
        items.push({ pid: p.id, name: p.name, qty, price: p.price, cost: p.cost });
      }
      const subtotal = items.reduce((s, x) => s + x.qty * x.price, 0);
      const c = cashiers[Math.floor(r() * cashiers.length)];
      no++;
      sales.push({ id: uid('s'), no, ts, cashierId: c.id, cashierName: c.name, items, subtotal: Math.round(subtotal), discount: 0, total: Math.round(subtotal / 100) * 100, pay: pays[Math.floor(r() * pays.length)], status: 'paid' });
    }
  }
  return sales;
}

function makeStoreData(name, seedNo, cashiers, perDay) {
  const products = makeProducts(seedNo);
  const sales = makeSales(products, cashiers, 777 * seedNo, perDay);
  return {
    products, sales, receipts: [],
    counter: sales.length,
    settings: { name, phone: '+998 90 123 45 67', address: 'Toshkent', footer: 'Xaridingiz uchun rahmat!', merchant: { click: { id: '', key: '' }, payme: { id: '', key: '' } } },
  };
}

// ---------- Choyxona / restoran ----------
const RMENU = [
  ['Mastava', 'Birinchi taomlar', 12000, 28000], ['Lag’mon', 'Birinchi taomlar', 14000, 32000],
  ['Sho’rva', 'Birinchi taomlar', 18000, 38000], ['Chuchvara', 'Birinchi taomlar', 13000, 30000],
  ['Osh (porsiya)', 'Ikkinchi taomlar', 16000, 35000], ['Dimlama', 'Ikkinchi taomlar', 22000, 48000],
  ['Manti (4 dona)', 'Ikkinchi taomlar', 12000, 26000], ['Shashlik mol (1 six)', 'Ikkinchi taomlar', 9000, 17000],
  ['Kabob jigar (1 six)', 'Ikkinchi taomlar', 8000, 15000], ['Qozon kabob', 'Ikkinchi taomlar', 30000, 65000],
  ['Achichuk', 'Salatlar', 3000, 9000], ['Sezar salati', 'Salatlar', 12000, 28000],
  ['Tandir non', 'Non', 2500, 4000], ['Patir non', 'Non', 4500, 9000],
  ['Choy (choynak)', 'Ichimliklar', 1500, 6000], ['Coca-Cola 0,5 l', 'Ichimliklar', 5000, 9000],
  ['Kompot', 'Ichimliklar', 3000, 8000], ['Suv 0,5 l', 'Ichimliklar', 2500, 5000],
];

export function defaultTables() {
  const t = [];
  for (let i = 1; i <= 8; i++) t.push({ id: uid('t'), name: `Stol ${i}`, zone: 'Zal', seats: 4 });
  for (let i = 1; i <= 4; i++) t.push({ id: uid('t'), name: `Tapchan ${i}`, zone: 'Tapchan', seats: 8 });
  for (let i = 1; i <= 2; i++) t.push({ id: uid('t'), name: `VIP ${i}`, zone: 'VIP xona', seats: 12 });
  return t;
}
export function defaultMenu() {
  return RMENU.map((r) => ({ id: uid('p'), name: r[0], code: '', category: r[1], unit: 'dona', cost: r[2], price: r[3], stock: 9999, min: 0, menu: true }));
}

// Namunaviy xom ashyo va retseptlar: ombor birinchi kundan ishlaydi (egasi o'zgartiradi)
const RING = [['Guruch', 'kg', 40, 10, 14000], ['Go’sht (mol)', 'kg', 30, 8, 95000], ['Un', 'kg', 50, 10, 7000], ['Sabzi', 'kg', 25, 6, 5000],
  ['Piyoz', 'kg', 20, 5, 4000], ['Kartoshka', 'kg', 25, 6, 6000], ['Yog’', 'litr', 20, 5, 22000]];
const RREC = {
  'Osh (porsiya)': [['Guruch', 0.15], ['Go’sht (mol)', 0.12], ['Sabzi', 0.15], ['Piyoz', 0.03], ['Yog’', 0.03]],
  'Lag’mon': [['Un', 0.15], ['Go’sht (mol)', 0.1], ['Sabzi', 0.05], ['Piyoz', 0.04], ['Yog’', 0.02]],
  'Mastava': [['Guruch', 0.05], ['Go’sht (mol)', 0.08], ['Kartoshka', 0.1], ['Sabzi', 0.05], ['Piyoz', 0.03]],
  'Sho’rva': [['Go’sht (mol)', 0.15], ['Kartoshka', 0.15], ['Sabzi', 0.08], ['Piyoz', 0.04]],
  'Shashlik mol (1 six)': [['Go’sht (mol)', 0.1], ['Piyoz', 0.02]],
  'Tandir non': [['Un', 0.25]],
};
export function defaultStocked() {
  const ingredients = RING.map((r) => ({ id: uid('ig'), name: r[0], unit: r[1], stock: r[2], min: r[3], cost: r[4] }));
  const products = defaultMenu();
  for (const p of products) {
    const rec = RREC[p.name];
    if (rec) p.recipe = rec.map(([n, q]) => ({ ingId: ingredients.find((i) => i.name === n).id, qty: q }));
  }
  return { products, ingredients };
}

function makeRestaurantData(name, cashiers, perDay) {
  const { products, ingredients } = defaultStocked();
  ingredients.find((i) => i.name === 'Sabzi').stock = 4;   // demo: «kam qolgan» holatini ko'rsatish uchun
  const sales = makeSales(products, cashiers, 4242, perDay);
  return {
    products, ingredients, sales, receipts: [], tables: defaultTables(), orders: [], counter: sales.length,
    settings: { name, phone: '+998 90 555 44 33', address: 'Toshkent', footer: 'Tashrifingiz uchun rahmat!', serviceFee: 10, merchant: { click: { id: '', key: '' }, payme: { id: '', key: '' } } },
  };
}

export async function ensureSeed(type = 'dokon') {
  const cur = getCentral();
  if (cur && cur.v >= 4) return;
  if (cur) resetAll();
  const s1 = 'st_baraka', s2 = 'st_yangi', s3 = 'st_registon';
  const admin = { id: 'u_admin', login: 'admin', name: 'Tizim administratori', role: 'super', storeId: null, hash: await hash('admin123') };
  if (type === 'restoran') {
    const users = [admin,
      { id: 'u_ega3', login: 'ega3', name: 'Rustam Ergashev', role: 'owner', storeId: s3, hash: await hash('ega123') },
      { id: 'u_kas3', login: 'kassir3', name: 'Nodira Saidova', role: 'cashier', storeId: s3, hash: await hash('kassir123') },
      { id: 'u_ofi1', login: 'ofitsiant', name: 'Jasur Tursunov', role: 'waiter', storeId: s3, hash: await hash('ofitsiant123') },
      { id: 'u_ofi2', login: 'ofitsiant2', name: 'Sevara Qodirova', role: 'waiter', storeId: s3, hash: await hash('ofitsiant123') },
      { id: 'u_osh', login: 'oshpaz', name: 'Anvar Karimov', role: 'chef', storeId: s3, hash: await hash('oshpaz123') }];
    saveCentral({ v: 4, stores: [{ id: s3, name: 'Registon Choyxonasi', type: 'restoran', address: 'Mirzo Ulug’bek, Toshkent', status: 'active', createdAt: Date.now() - 86400e3 * 9 }], users });
    saveStore(s3, makeRestaurantData('Registon Choyxonasi', users.filter((u) => ['owner', 'cashier'].includes(u.role)), 16));
    return;
  }
  const users = [admin,
    { id: 'u_ega', login: 'ega', name: 'Sardor Karimov', role: 'owner', storeId: s1, hash: await hash('ega123') },
    { id: 'u_men', login: 'menejer', name: 'Dilnoza Aliyeva', role: 'manager', storeId: s1, hash: await hash('menejer123') },
    { id: 'u_kas', login: 'kassir', name: 'Bobur Yo’ldoshev', role: 'cashier', storeId: s1, hash: await hash('kassir123') },
    { id: 'u_ega2', login: 'ega2', name: 'Malika Rahimova', role: 'owner', storeId: s2, hash: await hash('ega123') }];
  saveCentral({ v: 4, stores: [
    { id: s1, name: 'Baraka Market', type: 'dokon', address: 'Chilonzor, Toshkent', status: 'active', createdAt: Date.now() - 86400e3 * 60 },
    { id: s2, name: 'Yangi Bozor', type: 'dokon', address: 'Yunusobod, Toshkent', status: 'active', createdAt: Date.now() - 86400e3 * 20 }], users });
  saveStore(s1, makeStoreData('Baraka Market', 1, users.filter((u) => u.storeId === s1 && u.role !== 'super'), 22));
  saveStore(s2, makeStoreData('Yangi Bozor', 2, users.filter((u) => u.storeId === s2), 11));
}

export function createEmptyStore(name, type = 'dokon') {
  const base = { products: [], sales: [], receipts: [], counter: 0, settings: { name, phone: '', address: '', footer: 'Xaridingiz uchun rahmat!', merchant: { click: { id: '', key: '' }, payme: { id: '', key: '' } } } };
  if (type === 'restoran') return { ...base, ...defaultStocked(), tables: defaultTables(), orders: [], settings: { ...base.settings, footer: 'Tashrifingiz uchun rahmat!', serviceFee: 10 } };
  return base;
}

export function resetAll() {
  Object.keys(localStorage).filter((k) => k.startsWith(`${NS}:`)).forEach((k) => localStorage.removeItem(k));
  cache.clear();
}

// ---------- Hisob-kitoblar ----------
export const saleProfit = (s) => s.total - s.items.reduce((a, x) => a + x.qty * x.cost, 0) * (s.total / (s.subtotal || 1));
export const ROLES = { super: 'Super-admin', owner: 'Ega', manager: 'Menejer', cashier: 'Kassir', waiter: 'Ofitsiant', chef: 'Oshpaz', agent: 'Print-agent' };
export const roleLabel = (role, type) => (role === 'owner' && type === 'restoran' ? 'Admin' : ROLES[role]);
export const STORE_TYPES = { dokon: 'Oziq-ovqat do\u2019koni', restoran: 'Choyxona / restoran' };
export const PAY = { naqd: 'Naqd', karta: 'Karta', click: 'Click', payme: 'Payme', nasiya: 'Nasiya' };
