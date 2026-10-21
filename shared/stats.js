// Hisobot hisob-kitoblari (barcha sahifalar uchun umumiy).
import { startOfDay, dayKey } from './ui.js';

export const paid = (sales) => sales.filter((s) => s.status === 'paid');
export const inRange = (sales, from, to) => sales.filter((s) => s.ts >= from && s.ts < to);
export const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
export const cost = (s) => s.items.reduce((a, x) => a + x.qty * x.cost, 0) * (s.total / (s.subtotal || 1));
export const profit = (s) => s.total - cost(s);

export const DAY = 86400e3;
export function today() { return startOfDay(Date.now()); }

export function summary(sales) {
  const total = sum(sales, (s) => s.total);
  return { count: sales.length, total, avg: sales.length ? total / sales.length : 0, profit: sum(sales, profit) };
}

export function byDay(sales, days) {
  const t0 = today(); const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = t0 - i * DAY;
    const list = inRange(sales, from, from + DAY);
    out.push({ date: new Date(from), key: dayKey(from), total: sum(list, (s) => s.total), count: list.length, isToday: i === 0 });
  }
  return out;
}

export function topProducts(sales, n = 5) {
  const m = new Map();
  for (const s of sales) for (const it of s.items) {
    const r = m.get(it.pid) || { name: it.name, qty: 0, revenue: 0 };
    r.qty += it.qty; r.revenue += it.qty * it.price; m.set(it.pid, r);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, n);
}

export function byPay(sales) {
  const m = { naqd: 0, karta: 0, click: 0, payme: 0, nasiya: 0 };
  for (const s of sales) m[s.pay] = (m[s.pay] || 0) + s.total;
  return m;
}
