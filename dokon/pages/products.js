import { h, icon, money, num, qtyFmt, toast, modal, field, confirmBox, emptyState, download, toCSV, parseCSV, uid, debounce } from '../../shared/ui.js';
import { openCameraScanner } from '../../shared/scanner.js';
import { searchProducts, sameCode } from '../../shared/search.js';
import { nextExpiry, daysLeft } from '../batches.js';
import { audit } from '../../shared/audit.js';

const UNITS = ['dona', 'kg', 'litr', 'qadoq'];

async function lookupOFF(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity`);
  if (!r.ok) throw new Error('Open Food Facts javob bermadi');
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  const p = j.product;
  const name = [p.brands && p.brands.split(',')[0], p.product_name, p.quantity].filter(Boolean).join(' ').trim();
  return name || null;
}

export default async function products(ctx) {
  const data = ctx.data;
  const canEdit = ctx.can(['owner', 'manager']);
  let q = ''; let cat = 'Hammasi'; let stock = 'all';

  const body = h('div', {});
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Nomi yoki kodi bo’yicha qidirish', 'aria-label': 'Qidirish' });
  let raf = 0;
  search.addEventListener('input', () => { q = search.value; cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });
  const catSel = h('select', { class: 'select', style: 'max-width:200px', 'aria-label': 'Kategoriya', onchange: (e) => { cat = e.target.value; render(); } });
  const stockSel = h('select', { class: 'select', style: 'max-width:190px', 'aria-label': 'Qoldiq holati', onchange: (e) => { stock = e.target.value; render(); } },
    h('option', { value: 'all' }, 'Barcha qoldiq'), h('option', { value: 'low' }, 'Kam qolgan'), h('option', { value: 'out' }, 'Qolmagan'));
  const count = h('span', { class: 'pill' });

  function statusOf(p) {
    if (p.menu) return h('span', { class: 'pill pill-blue' }, 'tez tugma');
    const ex = nextExpiry(p); const dl = ex ? daysLeft(ex) : null;
    const exPill = ex && dl <= 7 ? h('span', { class: `pill ${dl < 0 ? 'pill-bad' : 'pill-warn'}`, style: 'margin-left:6px' }, dl < 0 ? 'muddati o’tgan' : `${dl} kun qoldi`) : null;
    if (p.stock <= 0) return h('span', { class: 'pill pill-bad' }, 'qolmagan');
    if (p.stock <= p.min) return h('span', {}, h('span', { class: 'pill pill-warn' }, `${qtyFmt(p.stock)} ${p.unit} · kam`), exPill);
    return h('span', {}, h('span', { class: 'pill pill-ok' }, `${qtyFmt(p.stock)} ${p.unit}`), exPill);
  }

  function render() {
    catSel.replaceChildren(...['Hammasi', ...new Set(data.products.map((p) => p.category))].map((c) => h('option', { value: c, selected: c === cat }, c)));
    const pre = data.products.filter((p) => (cat === 'Hammasi' || p.category === cat)
      && (stock === 'all' || (stock === 'low' && !p.menu && p.stock > 0 && p.stock <= p.min) || (stock === 'out' && !p.menu && p.stock <= 0)));
    const list = q ? searchProducts(pre, q, 300) : pre.sort((a, b) => a.name.localeCompare(b.name, 'uz'));
    count.textContent = `${list.length} ta`;
    if (!list.length) {
      body.replaceChildren(emptyState('box', data.products.length ? 'Hech narsa topilmadi' : 'Mahsulotlar hali yo’q',
        data.products.length ? 'Filtrni o’zgartiring yoki boshqa nom yozing.' : 'Birinchi mahsulotni qo’shing yoki distribyutor ro’yxatini CSV orqali yuklang.',
        canEdit && !data.products.length ? h('button', { class: 'btn btn-primary', onclick: () => edit() }, icon('plus'), 'Mahsulot qo’shish') : null));
      return;
    }
    body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'ptable' },
      h('thead', {}, h('tr', {}, ['Mahsulot', 'Kategoriya', 'Kirim narxi', 'Sotuv narxi', 'Qoldiq', canEdit ? '' : null].map((t, i) => t === null ? null : h('th', { class: i === 2 || i === 3 ? 't-right' : '' }, t)))),
      h('tbody', {}, list.map((p) => h('tr', {},
        h('td', {}, h('div', { class: 't-name' }, p.name), h('div', { class: 't-sub code' }, p.code || 'kodsiz')),
        h('td', {}, p.category),
        h('td', { class: 't-right num' }, num(p.cost)),
        h('td', { class: 't-right num' }, h('b', {}, num(p.price)), h('span', { class: 'faint' }, ` / ${p.unit}`)),
        h('td', {}, statusOf(p)),
        canEdit ? h('td', { class: 't-right', style: 'white-space:nowrap' },
          h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': `${p.name}ni tahrirlash`, onclick: () => edit(p) }, icon('edit')),
          h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': `${p.name}ni o’chirish`, onclick: () => remove(p) }, icon('trash'))) : null))))));
  }

  // ---------- Qo'shish / tahrirlash ----------
  function edit(p, presetCode) {
    const isNew = !p;
    const v = p || { name: '', code: presetCode || '', category: '', unit: 'dona', cost: '', price: '', stock: 0, min: 0, menu: false };
    const name = h('input', { class: 'input', value: v.name, required: true, placeholder: 'Masalan: Coca-Cola 1,5 l' });
    const code = h('input', { class: 'input', value: v.code, inputmode: 'numeric', placeholder: 'Shtrix-kod yoki QR' });
    const category = h('input', { class: 'input', value: v.category, list: 'cats', placeholder: 'Masalan: Ichimliklar' });
    const cats = h('datalist', { id: 'cats' }, [...new Set(data.products.map((x) => x.category))].map((c) => h('option', { value: c })));
    const unit = h('select', { class: 'select' }, UNITS.map((u) => h('option', { value: u, selected: u === v.unit }, u)));
    const cost = h('input', { class: 'input num', type: 'number', min: '0', value: v.cost, inputmode: 'numeric' });
    const price = h('input', { class: 'input num', type: 'number', min: '0', value: v.price, inputmode: 'numeric' });
    const stockIn = h('input', { class: 'input num', type: 'number', min: '0', step: '0.001', value: v.stock });
    const min = h('input', { class: 'input num', type: 'number', min: '0', step: '0.001', value: v.min });
    const menu = { checked: false };
    const err = h('div', { class: 'error-text', role: 'alert' });
    const offMsg = h('div', { class: 'hint' });

    async function offLookup(auto) {
      const c = code.value.trim();
      if (!c) { offMsg.textContent = 'Avval kodni kiriting yoki skaner qiling.'; return; }
      offMsg.textContent = 'Open Food Facts’dan qidirilmoqda…';
      try {
        const n = await lookupOFF(c);
        if (n) { if (!name.value.trim()) name.value = n; offMsg.textContent = `Topildi: ${n}`; if (!price.value) price.focus(); }
        else { offMsg.textContent = 'Bu kod Open Food Facts bazasida yo’q (mahalliy mahsulotlar ko’pincha yo’q). Nomini o’zingiz kiriting.'; name.focus(); }
      } catch { offMsg.textContent = 'Internet yoki Open Food Facts bilan aloqa yo’q. Nomini o’zingiz kiriting.'; }
    }

    const m = modal({
      title: isNew ? 'Yangi mahsulot' : 'Mahsulotni tahrirlash', wide: true,
      body: [
        h('div', { class: 'form-grid' },
          h('div', { class: 'span-2' }, field('Shtrix-kod / QR', h('div', { class: 'input-group' }, code,
            h('button', { class: 'btn', type: 'button', onclick: () => openCameraScanner({ title: 'Kodni skaner qiling', onDetect: (c) => { code.value = c; offLookup(); return true; } }) }, icon('camera'), 'Skaner'),
            h('button', { class: 'btn', type: 'button', onclick: () => offLookup() }, icon('search'), 'Nomini topish')), 'Menyu taomlari (somsa, lavash) uchun kod shart emas.'), offMsg),
          h('div', { class: 'span-2' }, field('Nomi', name)),
          field('Kategoriya', category), field('O’lchov birligi', unit),
          field('Kirim narxi (so’m)', cost), field('Sotuv narxi (so’m)', price),
          field('Qoldiq', stockIn), field('Minimal qoldiq', min, 'Shundan kamaysa «kam qolgan» deb chiqadi.'),
          null),
        cats, err],
      actions: [{ label: 'Bekor qilish' }, { label: 'Saqlash', kind: 'primary', icon: 'check', onClick: () => {
        const c = code.value.trim();
        if (!name.value.trim()) { err.textContent = 'Mahsulot nomini kiriting.'; return false; }
        if (!(parseFloat(price.value) > 0)) { err.textContent = 'Sotuv narxini kiriting.'; return false; }
        if (c && data.products.some((x) => sameCode(x.code, c) && x !== p)) { err.textContent = 'Bu kod boshqa mahsulotda bor.'; return false; }
        const next = { name: name.value.trim(), code: c, category: category.value.trim() || 'Boshqa', unit: unit.value, cost: parseFloat(cost.value) || 0, price: parseFloat(price.value), stock: menu.checked ? 9999 : parseFloat(stockIn.value) || 0, min: parseFloat(min.value) || 0, menu: menu.checked };
        if (isNew) { data.products.push({ id: uid('p'), ...next }); audit(ctx, 'Mahsulot qo’shildi', `${next.name}, ${num(next.price)} so’m`); } else { if (p.price !== next.price) audit(ctx, 'Narx o’zgardi', `${p.name}: ${num(p.price)} → ${num(next.price)} so’m`); if (p.stock !== next.stock) audit(ctx, 'Qoldiq qo’lda o’zgartirildi', `${p.name}: ${qtyFmt(p.stock)} → ${qtyFmt(next.stock)}`); Object.assign(p, next); }
        ctx.save(); render(); toast(isNew ? 'Mahsulot qo’shildi' : 'O’zgarishlar saqlandi');
      } }],
    });
    if (presetCode) offLookup(true);
    return m;
  }

  async function remove(p) {
    if (!(await confirmBox('Mahsulotni o’chirish', `«${p.name}» ro’yxatdan o’chiriladi. Oldingi cheklar o’zgarmaydi.`, 'O’chirish', 'danger'))) return;
    data.products = data.products.filter((x) => x !== p); audit(ctx, 'Mahsulot o’chirildi', p.name); ctx.save(); render(); toast('Mahsulot o’chirildi');
  }

  // ---------- CSV ----------
  const HEAD = ['nom', 'kod', 'kategoriya', 'birlik', 'kirim_narxi', 'sotuv_narxi', 'qoldiq', 'minimal'];
  function exportCSV() {
    download('mahsulotlar.csv', toCSV([HEAD, ...data.products.filter((p) => !p.menu).map((p) => [p.name, p.code, p.category, p.unit, p.cost, p.price, p.stock, p.min])]), 'text/csv');
  }
  function template() {
    download('mahsulotlar-shablon.csv', toCSV([HEAD, ['Coca-Cola 1,5 l', '4780000000012', 'Ichimliklar', 'dona', 11000, 14000, 48, 12]]), 'text/csv');
  }
  function importCSV() {
    const file = h('input', { type: 'file', accept: '.csv,text/csv', class: 'input', style: 'padding-top:8px' });
    const out = h('div', {});
    let rows = [];
    modal({
      title: 'CSV orqali yuklash',
      body: [h('p', { class: 'muted' }, 'Distribyutor ro’yxatini yuklang. Ustunlar: ', h('span', { class: 'code' }, HEAD.join(', ')), '. Kodi bor mahsulotlar yangilanadi, qolganlari qo’shiladi.'),
        h('button', { class: 'btn btn-sm', style: 'justify-self:start', onclick: template }, icon('down'), 'Shablonni yuklab olish'), file, out],
      actions: [{ label: 'Bekor qilish' }, { label: 'Yuklash', kind: 'primary', icon: 'up', onClick: () => {
        if (!rows.length) { toast('Avval fayl tanlang', 'bad'); return false; }
        let added = 0, updated = 0;
        for (const r of rows) {
          const [nm, cd, ct, un, co, pr, st, mn] = r.map((x) => x.trim());
          if (!nm || !(parseFloat(pr) > 0)) continue;
          const rec = { name: nm, code: cd, category: ct || 'Boshqa', unit: UNITS.includes(un) ? un : 'dona', cost: parseFloat(co) || 0, price: parseFloat(pr), stock: parseFloat((st || '0').replace(',', '.')) || 0, min: parseFloat((mn || '0').replace(',', '.')) || 0, menu: false };
          const ex = cd && data.products.find((x) => x.code === cd);
          if (ex) { Object.assign(ex, rec); updated++; } else { data.products.push({ id: uid('p'), ...rec }); added++; }
        }
        ctx.save(); render(); toast(`${added} ta qo’shildi, ${updated} ta yangilandi`);
      } }],
    });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const all = parseCSV(await f.text());
      rows = all.length && isNaN(parseFloat(all[0][5])) ? all.slice(1) : all;
      out.replaceChildren(h('div', { class: 'notice' }, icon('info'), h('div', {}, `${rows.length} qator o’qildi.`)));
    });
  }

  const el = h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Mahsulotlar'), h('p', {}, canEdit ? 'Narx, qoldiq va shtrix-kodlarni boshqaring.' : 'Narx va qoldiqni ko’rish (tahrirlash menejer va egada).')),
      canEdit ? h('div', { class: 'page-actions' },
        h('button', { class: 'btn', onclick: importCSV }, icon('up'), 'CSV yuklash'),
        h('button', { class: 'btn', onclick: exportCSV }, icon('down'), 'CSV eksport'),
        h('button', { class: 'btn btn-primary', onclick: () => edit() }, icon('plus'), 'Mahsulot qo’shish')) : null),
    h('section', { class: 'panel' },
      h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search'), search), catSel, stockSel,
        h('button', { class: 'btn', onclick: () => openCameraScanner({ title: 'Mahsulotni topish', onDetect: (c) => { search.value = c; q = c; render(); return true; } }) }, icon('camera'), 'Skaner'), count),
      body));

  render();
  const preset = sessionStorage.getItem('bpos:newCode');
  if (preset && canEdit) { sessionStorage.removeItem('bpos:newCode'); setTimeout(() => edit(null, preset), 80); }
  return { el };
}
