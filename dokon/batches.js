// Partiyalar va yaroqlilik muddati. Sotilganda eng yaqin muddatli partiyadan (FIFO) ayriladi.
const r3 = (n) => Math.round(n * 1000) / 1000;

export function addBatch(p, qty, expiry, cost) {
  p.batches = p.batches || [];
  if (!expiry) { p.batches.push({ qty, expiry: '', cost, ts: Date.now() }); return; }
  const ex = p.batches.find((b) => b.expiry === expiry);
  if (ex) ex.qty = r3(ex.qty + qty); else p.batches.push({ qty, expiry, cost, ts: Date.now() });
  p.batches.sort((a, b) => (a.expiry || '9999') < (b.expiry || '9999') ? -1 : 1);
}

// stockBefore: sotuvdan oldingi umumiy qoldiq. Partiyasiz (eski) qoldiq birinchi ketadi, qolgani eng yaqin muddatli partiyadan.
export function consume(p, qty, stockBefore) {
  const batched = (p.batches || []).reduce((a, b) => a + b.qty, 0);
  const unbatched = Math.max(0, (stockBefore ?? batched) - batched);
  let left = r3(Math.max(0, qty - unbatched));
  for (const b of (p.batches || [])) { if (left <= 0) break; const t = Math.min(b.qty, left); b.qty = r3(b.qty - t); left = r3(left - t); }
  p.batches = (p.batches || []).filter((b) => b.qty > 0);
}

export function nextExpiry(p) {
  const b = (p.batches || []).filter((x) => x.expiry && x.qty > 0).sort((a, c) => (a.expiry < c.expiry ? -1 : 1))[0];
  return b ? b.expiry : '';
}

export const daysLeft = (iso) => Math.floor((new Date(`${iso}T23:59:59`) - Date.now()) / 86400e3);

export function expiring(products, days = 7) {
  const out = [];
  for (const p of products) for (const b of (p.batches || [])) if (b.expiry && b.qty > 0 && daysLeft(b.expiry) <= days) out.push({ p, b, left: daysLeft(b.expiry) });
  return out.sort((a, c) => a.left - c.left);
}
