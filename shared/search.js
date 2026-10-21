// Tez qidiruv: har mahsulot uchun qidiruv kaliti bir marta hisoblanadi (keshlanadi).
// Bir nechta so'z bo'yicha ishlaydi, apostrof yozilishidan qat'i nazar topadi (go'sht = gosht = go‘sht).

const cache = new WeakMap();

export const norm = (s) => (s || '').toLowerCase().replace(/[’‘ʻʼ'`′]/g, '').replace(/\s+/g, ' ').trim();

function keyOf(p) {
  const sig = `${p.name}|${p.code}`;
  let e = cache.get(p);
  if (!e || e.sig !== sig) {
    const name = norm(p.name);
    e = { sig, name, code: p.code || '', words: name.split(' ') };
    cache.set(p, e);
  }
  return e;
}

export function searchProducts(list, rawQuery, limit = 200) {
  const q = norm(rawQuery);
  if (!q) return list;
  const tokens = q.split(' ');
  const out = [];
  for (const p of list) {
    const e = keyOf(p);
    let score = 3;
    if (e.code && sameCode(e.code, rawQuery)) score = 0;
    else {
      let ok = true;
      for (const t of tokens) {
        if (!(e.name.includes(t) || (e.code && e.code.includes(t)))) { ok = false; break; }
      }
      if (!ok) continue;
      if (e.name.startsWith(q)) score = 1;
      else if (e.words.some((w) => w.startsWith(tokens[0]))) score = 2;
    }
    out.push([score, e.name, p]);
    if (out.length > limit * 4) break;
  }
  out.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], 'uz'));
  return out.slice(0, limit).map((x) => x[2]);
}

// Shtrix-kodlarni solishtirish: bo'shliqlar va old nollar (UPC-A 12 xonali = EAN-13 old nol bilan) e'tiborga olinmaydi.
export function sameCode(a, b) {
  const x = String(a || '').replace(/\s+/g, ''), y = String(b || '').replace(/\s+/g, '');
  if (!x || !y) return false;
  if (x === y) return true;
  return /^\d+$/.test(x) && /^\d+$/.test(y) && x.replace(/^0+/, '') === y.replace(/^0+/, '');
}
