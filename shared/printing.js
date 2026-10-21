// Chek chiqarish: server rejimida chek navbatga tushadi va kassadagi Windows print-agent uni printerdan chiqaradi.
// Sozlama o'chiq bo'lsa yoki demo rejimda brauzer chop etish oynasi ishlatiladi (kassada qo'lda).
import { isRemote, queuePrint } from './backend.js';
import { dateTimeLabel } from './ui.js';
import { PAY } from './db.js';
import { toast } from './ui.js';

export const DEFAULT_PRINTERS = { enabled: false, kitchen: { width: 80, auto: true, copies: 1 }, receipt: { width: 80, auto: true, copies: 1 } };

export function printerCfg(ctx) {
  const s = ctx.data.settings;
  const p = s.printers || {};
  return {
    enabled: !!p.enabled,
    kitchen: { ...DEFAULT_PRINTERS.kitchen, ...(p.kitchen || {}) },
    receipt: { ...DEFAULT_PRINTERS.receipt, ...(p.receipt || {}) },
  };
}
export const agentOn = (ctx) => isRemote() && printerCfg(ctx).enabled;

async function send(ctx, kind, payload) {
  const c = printerCfg(ctx)[kind];
  try { await queuePrint(kind, payload, c.width, c.copies); return true; }
  catch (e) { toast(`Printerga yuborilmadi: ${e.message}`, 'bad'); return false; }
}

export function kitchenPayload(order, items, extra = false) {
  return { table: order.tableName, waiter: order.waiterName, when: dateTimeLabel(Date.now()), no: order.no, extra, items: items.map((i) => ({ qty: i.qty, name: i.name })) };
}
export function receiptPayload(sale, ctx) {
  const s = ctx.data.settings;
  return {
    store: { name: s.name, address: s.address, phone: s.phone, footer: s.footer }, no: sale.no, when: dateTimeLabel(sale.ts), table: sale.tableName, cashier: sale.cashierName,
    items: sale.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })), discount: sale.discount || 0, service: sale.service || 0, total: sale.total, pay: PAY[sale.pay],
  };
}

// Oshxona cheki. Agent yoqilgan bo'lsa navbatga qo'yadi va true qaytaradi.
export async function sendKitchen(ctx, order, items, extra = false, force = false) {
  if (!agentOn(ctx)) return false;
  if (!force && !printerCfg(ctx).kitchen.auto) return false;
  return send(ctx, 'kitchen', kitchenPayload(order, items, extra));
}
export async function sendReceipt(ctx, sale, force = false) {
  if (!agentOn(ctx)) return false;
  if (!force && !printerCfg(ctx).receipt.auto) return false;
  return send(ctx, 'receipt', receiptPayload(sale, ctx));
}
