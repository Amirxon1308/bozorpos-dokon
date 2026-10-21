// Reviziya: haqiqiy qoldiqni sanab, tizim qoldig'i bilan solishtirish.
import { h, icon, num, qtyFmt, toast, confirmBox, emptyState, dateTimeLabel, uid } from '../../shared/ui.js';
import { searchProducts } from '../../shared/search.js';
import { audit } from '../../shared/audit.js';

let draft = {}; // pid -> sanalgan qiymat

export default async function counts(ctx) {
  const data = ctx.data;
  let q = '';
  const body = h('div', {});
  const summary = h('div', {});
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Mahsulot qidirish', oninput: (e) => { q = e.target.value; render(); } });

  function render() {
    const base = data.products.filter((p) => !p.menu);
    const list = (q ? searchProducts(base, q, 100) : base.slice().sort((a, b) => a.category.localeCompare(b.category, 'uz') || a.name.localeCompare(b.name, 'uz'))).slice(0, 150);
    body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'ptable' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Mahsulot'), h('th', { class: 't-right' }, 'Tizimda'), h('th', { class: 't-right' }, 'Sanaldi'), h('th', { class: 't-right' }, 'Farq'))),
      h('tbody', {}, list.map((p) => {
        const v = draft[p.id]; const diff = v === undefined ? null : Math.round((v - p.stock) * 1000) / 1000;
        return h('tr', {}, h('td', {}, h('div', { class: 't-name' }, p.name), h('div', { class: 't-sub' }, p.category)),
          h('td', { class: 't-right num' }, `${qtyFmt(p.stock)} ${p.unit}`),
          h('td', { class: 't-right' }, h('input', { class: 'input num', style: 'width:96px;min-height:38px;text-align:right', type: 'number', min: '0', step: '0.001', value: v ?? '', placeholder: '—', 'aria-label': `${p.name} sanaldi`, onchange: (e) => { if (e.target.value === '') delete draft[p.id]; else draft[p.id] = parseFloat(e.target.value) || 0; setTimeout(render, 0); } })),
          h('td', { class: `t-right num${diff ? (diff < 0 ? ' neg' : '') : ''}`, style: diff ? `color:${diff < 0 ? 'var(--bad, #c0392b)' : 'var(--ok, #1d8a5b)'};font-weight:600` : '' }, diff === null ? '' : (diff > 0 ? '+' : '') + qtyFmt(diff)));
      })))));
    const items = Object.entries(draft).map(([id, v]) => ({ p: data.products.find((x) => x.id === id), v })).filter((x) => x.p && x.v !== x.p.stock);
    summary.replaceChildren(h('div', { class: 'notice' }, icon('info'), h('div', {}, `${Object.keys(draft).length} ta mahsulot sanaldi, ${items.length} tasida farq bor.`)),
      h('div', { class: 'page-actions', style: 'margin-top:12px' }, h('button', { class: 'btn btn-primary', disabled: !Object.keys(draft).length, onclick: apply }, icon('check'), 'Reviziyani qo’llash'), h('button', { class: 'btn', disabled: !Object.keys(draft).length, onclick: () => { draft = {}; render(); } }, 'Tozalash')));
  }

  async function apply() {
    const diffs = Object.entries(draft).map(([id, v]) => ({ p: data.products.find((x) => x.id === id), v })).filter((x) => x.p && x.v !== x.p.stock);
    if (!(await confirmBox('Reviziyani qo’llash', `${diffs.length} ta mahsulot qoldig’i sanalgan qiymatga o’zgaradi. Farqlar jurnalga yoziladi.`, 'Qo’llash'))) return;
    const rec = { id: uid('cn'), ts: Date.now(), by: ctx.user.name, items: diffs.map(({ p, v }) => ({ pid: p.id, name: p.name, was: p.stock, now: v, cost: p.cost })) };
    for (const { p, v } of diffs) { audit(ctx, 'Reviziya', `${p.name}: ${qtyFmt(p.stock)} → ${qtyFmt(v)}`); p.stock = v; p.batches = []; }
    data.counts.push(rec); draft = {}; ctx.save(); render(); renderHist();
    toast(`Reviziya qo’llandi, ${diffs.length} ta o’zgarish`);
  }

  const hist = h('div', {});
  function renderHist() {
    const list = data.counts.slice().sort((a, b) => b.ts - a.ts).slice(0, 8);
    hist.replaceChildren(list.length ? h('div', { class: 'list' }, list.map((c) => { const loss = c.items.reduce((a, i) => a + (i.now - i.was) * i.cost, 0); return h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, dateTimeLabel(c.ts)), h('div', { class: 't-sub' }, `${c.items.length} ta farq · ${c.by}`)), h('b', { class: 'num', style: `color:${loss < 0 ? 'var(--bad, #c0392b)' : 'var(--ok, #1d8a5b)'}` }, `${loss > 0 ? '+' : ''}${num(Math.round(loss))} so’m`)); })) : emptyState('file', 'Reviziya hali o’tkazilmagan', 'Tokchadagi haqiqiy sonni kiriting, tizim farqni topadi.'));
  }
  const el = h('div', {}, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Reviziya'), h('p', {}, 'Haqiqiy qoldiqni sanab kiriting. Kamomad va ortiqcha tannarx bo’yicha hisoblanadi.'))),
    h('section', { class: 'panel', style: 'margin-bottom:16px' }, h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search'), search)), body, h('div', { class: 'panel-body' }, summary)),
    h('h2', { style: 'margin:24px 0 12px' }, 'Oldingi reviziyalar'), h('section', { class: 'panel' }, hist));
  render(); renderHist();
  return { el };
}
