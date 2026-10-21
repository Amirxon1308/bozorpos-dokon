import { h, icon, money, num, qtyFmt, toast, modal, uid, debounce, dateTimeLabel, emptyState } from '../../shared/ui.js';
import { openCameraScanner, listenHardwareScanner, beep } from '../../shared/scanner.js';
import { searchProducts, sameCode } from '../../shared/search.js';
import { addBatch } from '../batches.js';
import { audit } from '../../shared/audit.js';

let lines = []; // yarim tugagan kirim sahifalar orasida saqlanadi
let supplier = '';
let paidIn = null; // null = to'liq to'langan

export default async function receiving(ctx) {
  const data = ctx.data;
  data.receipts = data.receipts || [];
  data.suppliers = data.suppliers || [];

  const linesEl = h('div', {});
  const sumEl = h('div', {});
  const histEl = h('div', {});
  const results = h('div', { class: 'list', style: 'border:1px solid var(--line);border-radius:10px;background:#fff;display:none' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Nomi bo’yicha qo’shish yoki kodni skaner qiling', autocomplete: 'off', 'aria-label': 'Kirimga mahsulot qo’shish' });
  const supplierIn = h('input', { class: 'input', value: supplier, placeholder: 'Yetkazib beruvchi (ixtiyoriy)', list: 'suppl', 'aria-label': 'Yetkazib beruvchi', oninput: (e) => { supplier = e.target.value; } });

  function addProduct(p, qty = 1) {
    const l = lines.find((x) => x.pid === p.id);
    if (l) l.qty = Math.round((l.qty + qty) * 1000) / 1000;
    else lines.push({ pid: p.id, name: p.name, unit: p.unit, qty, cost: p.cost, expiry: '' });
    beep(true); renderLines();
  }

  function addByCode(code) {
    const p = data.products.find((x) => x.code && sameCode(x.code, code));
    if (p) { addProduct(p); return true; }
    beep(false);
    modal({
      title: 'Kod bazada topilmadi',
      body: h('p', { class: 'muted' }, `«${code}» kodli mahsulot yo’q. Avval uni mahsulotlar ro’yxatiga qo’shing (nomi Open Food Facts'dan olinadi), keyin kirim qiling.`),
      actions: [{ label: 'Yopish' }, { label: 'Mahsulot qo’shish', kind: 'primary', icon: 'plus', onClick: () => { sessionStorage.setItem('bpos:newCode', code); ctx.go('products'); } }],
    });
    return false;
  }

  search.addEventListener('input', debounce(() => {
    const q = search.value.trim();
    if (!q) { results.style.display = 'none'; return; }
    const list = searchProducts(data.products.filter((p) => !p.menu), q, 6);
    results.replaceChildren(...(list.length ? list.map((p) => h('button', { class: 'list-row', style: 'border:0;background:none;text-align:left;width:100%', onclick: () => { addProduct(p); search.value = ''; results.style.display = 'none'; search.focus(); } },
      h('div', { class: 'grow' }, h('div', { class: 'title' }, p.name), h('div', { class: 't-sub' }, `qoldiq: ${qtyFmt(p.stock)} ${p.unit}`)), icon('plus'))) : [h('div', { class: 'list-row muted' }, 'Mahsulot topilmadi')]));
    results.style.display = '';
  }, 40));
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; const v = search.value.trim();
    if (/^\d{6,}$/.test(v)) { if (addByCode(v)) { search.value = ''; results.style.display = 'none'; } }
  });

  function renderLines() {
    if (!lines.length) {
      linesEl.replaceChildren(emptyState('inbox', 'Kirim ro’yxati bo’sh', 'Yetkazib beruvchidan kelgan mahsulotni skaner qiling. Har skanda soni +1 bo’ladi, keyin sonini o’zgartirishingiz mumkin.'));
    } else {
      linesEl.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Mahsulot'), h('th', { class: 't-right' }, 'Soni'), h('th', { class: 't-right' }, 'Kirim narxi'), h('th', { class: 't-right' }, 'Summa'), h('th', {}, 'Yaroqlilik'), h('th', {}))),
        h('tbody', {}, lines.map((l, i) => h('tr', {},
          h('td', {}, h('div', { class: 't-name' }, l.name), h('div', { class: 't-sub' }, l.unit)),
          h('td', { class: 't-right' }, h('input', { class: 'input num', style: 'width:92px;min-height:38px;text-align:right', type: 'number', min: '0', step: '0.001', value: l.qty, 'aria-label': `${l.name} soni`, onchange: (e) => { const v = parseFloat(e.target.value); if (v > 0) l.qty = v; else lines.splice(i, 1); setTimeout(renderLines, 0); } })),
          h('td', { class: 't-right' }, h('input', { class: 'input num', style: 'width:116px;min-height:38px;text-align:right', type: 'number', min: '0', value: l.cost, 'aria-label': `${l.name} kirim narxi`, onchange: (e) => { l.cost = parseFloat(e.target.value) || 0; setTimeout(renderLines, 0); } })),
          h('td', { class: 't-right num' }, num(l.qty * l.cost)),
          h('td', {}, h('input', { class: 'input', style: 'width:140px;min-height:38px', type: 'date', value: l.expiry || '', 'aria-label': `${l.name} yaroqlilik muddati`, onchange: (e) => { l.expiry = e.target.value; } })),
          h('td', { class: 't-right' }, h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': 'Olib tashlash', onclick: () => { lines.splice(i, 1); renderLines(); } }, icon('x')))))))));
    }
    const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);
    const paid = paidIn === null ? total : Math.min(paidIn, total);
    sumEl.replaceChildren(
      h('div', { class: 'rc-totals', style: 'border-top:0;margin-top:0' },
        h('div', { class: 'row' }, h('span', {}, 'Pozitsiyalar'), h('span', { class: 'num' }, lines.length)),
        h('div', { class: 'rc-total' }, h('span', {}, 'Kirim summasi'), h('strong', { class: 'num', style: 'font-size:28px' }, num(total))),
        h('div', { class: 'field', style: 'margin-top:10px' }, h('label', {}, 'Hozir to’langan (so’m)'), h('input', { class: 'input num', type: 'number', min: '0', inputmode: 'numeric', value: paid, onchange: (e) => { paidIn = Math.max(0, parseFloat(e.target.value) || 0); setTimeout(renderLines, 0); } })),
        total - paid > 0 ? h('div', { class: 'notice' }, icon('info'), h('div', {}, `${num(total - paid)} so’m qarz yetkazib beruvchi hisobiga yoziladi.`)) : null),
      h('div', { class: 'rc-actions' },
        h('button', { class: 'btn btn-primary btn-lg', disabled: !lines.length, onclick: save }, icon('check'), 'Kirimni saqlash'),
        h('button', { class: 'btn', disabled: !lines.length, onclick: () => { lines = []; renderLines(); } }, icon('trash'), 'Ro’yxatni tozalash')));
  }

  function save() {
    const items = lines.map((l) => ({ pid: l.pid, name: l.name, qty: l.qty, cost: l.cost, expiry: l.expiry || '' }));
    for (const it of items) {
      const p = data.products.find((x) => x.id === it.pid); if (!p) continue;
      p.stock = Math.round((p.stock + it.qty) * 1000) / 1000;
      if (it.cost > 0) { if (it.cost !== p.cost) audit(ctx, 'Kirim narxi o’zgardi', `${p.name}: ${num(p.cost)} → ${num(it.cost)}`); p.cost = it.cost; }
      addBatch(p, it.qty, it.expiry, it.cost);
    }
    const total = items.reduce((a, l) => a + l.qty * l.cost, 0);
    const paid = paidIn === null ? total : Math.min(paidIn, total);
    const sname = supplier.trim();
    if (sname && total - paid > 0) {
      let sp = data.suppliers.find((x) => x.name.toLowerCase() === sname.toLowerCase());
      if (!sp) { sp = { id: uid('sp'), name: sname, debt: 0 }; data.suppliers.push(sp); }
      sp.debt = Math.round(sp.debt + total - paid); audit(ctx, 'Yetkazib beruvchiga qarz', `${sname}: +${num(total - paid)} so’m`);
    }
    data.receipts.push({ id: uid('r'), no: data.receipts.length + 1, ts: Date.now(), supplier: sname, items, total, paid, by: ctx.user.name });
    ctx.save();
    lines = []; supplier = ''; paidIn = null; supplierIn.value = '';
    renderLines(); renderHist(); toast(`Kirim saqlandi: ${money(total)}`);
    const badge = document.querySelector('.nav a[data-route="products"] .badge');
    const low = data.products.filter((p) => !p.menu && p.stock <= p.min).length;
    if (badge) { if (low) badge.textContent = low; else badge.remove(); }
  }

  function renderHist() {
    const list = [...data.receipts].reverse().slice(0, 12);
    histEl.replaceChildren(list.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Sana', 'Yetkazib beruvchi', 'Pozitsiya', 'Summa', 'Qabul qildi'].map((t, i) => h('th', { class: i === 3 ? 't-right' : '' }, t)))),
      h('tbody', {}, list.map((r) => h('tr', { style: 'cursor:pointer', tabindex: '0', onclick: () => view(r), onkeydown: (e) => { if (e.key === 'Enter') view(r); } },
        h('td', {}, dateTimeLabel(r.ts)), h('td', {}, r.supplier || h('span', { class: 'faint' }, 'ko’rsatilmagan')), h('td', { class: 'num' }, r.items.length),
        h('td', { class: 't-right num' }, num(r.total)), h('td', {}, r.by)))))) : emptyState('file', 'Kirimlar tarixi bo’sh', 'Saqlangan kirimlar shu yerda ko’rinadi.'));
  }

  function view(r) {
    modal({ title: `Kirim № ${r.no} · ${dateTimeLabel(r.ts)}`, wide: true,
      body: [h('p', { class: 'muted' }, `${r.supplier || 'Yetkazib beruvchi ko’rsatilmagan'} · qabul qildi: ${r.by}`),
        h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Mahsulot'), h('th', { class: 't-right' }, 'Soni'), h('th', { class: 't-right' }, 'Narx'), h('th', { class: 't-right' }, 'Summa'))),
          h('tbody', {}, r.items.map((i) => h('tr', {}, h('td', {}, i.name), h('td', { class: 't-right num' }, qtyFmt(i.qty)), h('td', { class: 't-right num' }, num(i.cost)), h('td', { class: 't-right num' }, num(i.qty * i.cost)))))))],
      actions: [{ label: 'Yopish' }] });
  }

  const el = h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Kirim'), h('p', {}, 'Omborga mahsulot qabul qilish.'))),
    h('div', { class: 'recv' },
      h('div', { style: 'display:grid;gap:14px;min-width:0' },
        h('div', { class: 'mode-banner' }, icon('scan'), 'Kirim rejimi: skan qilsangiz mahsulot ro’yxatga tushadi va soni +1 bo’ladi.'),
        h('div', { class: 'scan-bar' }, h('label', { class: 'search' }, icon('search'), search),
          h('button', { class: 'btn btn-primary', onclick: () => openCameraScanner({ title: 'Kirim: kamera skaneri', continuous: true, onDetect: (c) => { addByCode(c); return false; } }) }, icon('camera'), 'Kamera')),
        results,
        h('section', { class: 'panel' }, linesEl)),
      h('aside', { class: 'panel panel-body', style: 'display:grid;gap:14px;position:sticky;top:20px' }, h('h2', {}, 'Kirim hujjati'), supplierIn, h('datalist', { id: 'suppl' }, data.suppliers.map((x) => h('option', { value: x.name }))), sumEl)),
    h('h2', { style: 'margin:32px 0 14px' }, 'Oxirgi kirimlar'),
    h('section', { class: 'panel' }, histEl));

  renderLines(); renderHist();
  const stop = listenHardwareScanner((c) => addByCode(c));
  return { el, destroy: stop };
}
