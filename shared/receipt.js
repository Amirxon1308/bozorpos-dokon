import { h, money, num, qtyFmt, dateTimeLabel } from './ui.js';
import { PAY } from './db.js';

// ---------- Chek chop etish (72 mm termoprinter uchun) ----------
export function printReceipt(sale, ctx) {
  const s = ctx.data.settings;
  const old = document.querySelector('.print-only'); if (old) old.remove();
  const row = (a, b) => h('div', { class: 'pr-row' }, h('span', {}, a), h('span', {}, b));
  const box = h('div', { class: 'print-only' },
    h('div', { style: 'text-align:center;font-weight:700;font-size:14px' }, s.name),
    s.address ? h('div', { style: 'text-align:center' }, s.address) : null,
    s.phone ? h('div', { style: 'text-align:center' }, s.phone) : null,
    h('hr'),
    row(`Chek № ${String(sale.no).padStart(5, '0')}`, dateTimeLabel(sale.ts)),
    row('Kassir', sale.cashierName),
    h('hr'),
    sale.items.map((it) => h('div', {}, h('div', {}, it.name), row(`${qtyFmt(it.qty)} × ${num(it.price)}`, num(Math.round((it.qty * it.price) / 100) * 100)))),
    h('hr'),
    sale.discount ? row('Chegirma', `−${num(sale.discount)}`) : null,
    row('JAMI', money(sale.total)),
    row('To’lov', PAY[sale.pay]),
    h('hr'),
    h('div', { style: 'text-align:center' }, s.footer || ''));
  document.body.append(box);
  window.print();
  setTimeout(() => box.remove(), 500);
}

// ---------- Oshxona cheki ----------
export function printTicket(order, items, store) {
  const old = document.querySelector('.print-only'); if (old) old.remove();
  const box = h('div', { class: 'print-only' },
    h('div', { style: 'text-align:center;font-weight:700;font-size:18px' }, order.tableName),
    h('div', { style: 'text-align:center' }, `${order.waiterName} · ${dateTimeLabel(Date.now())}`),
    h('hr'),
    items.map((i) => h('div', { style: 'font-size:15px;font-weight:600;padding:2px 0' }, `${qtyFmt(i.qty)} × ${i.name}`)),
    h('hr'), h('div', { style: 'text-align:center' }, store ? store.name : ''));
  document.body.append(box); window.print(); setTimeout(() => box.remove(), 500);
}
