import { h, icon, dateTimeLabel, emptyState } from './ui.js';
import { roleLabel } from './db.js';

export default async function journal(ctx) {
  const rows = h('div', { class: 'list' });
  let who = 'all'; let q = '';
  const users = [...new Set(ctx.data.audit.map((a) => a.userName))];
  const sel = h('select', { class: 'select', style: 'max-width:220px', 'aria-label': 'Xodim', onchange: (e) => { who = e.target.value; render(); } }, h('option', { value: 'all' }, 'Barcha xodimlar'), users.map((u) => h('option', { value: u }, u)));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Harakat bo’yicha qidirish', oninput: (e) => { q = e.target.value.toLowerCase(); render(); } });
  function render() {
    const list = ctx.data.audit.filter((a) => (who === 'all' || a.userName === who) && (!q || `${a.action} ${a.detail}`.toLowerCase().includes(q))).sort((a, b) => b.ts - a.ts).slice(0, 300);
    rows.replaceChildren(...(list.length ? list.map((a) => h('div', { class: 'list-row' },
      h('div', { class: 'grow' }, h('div', { class: 'title' }, a.action), h('div', { class: 't-sub' }, a.detail || '—')),
      h('div', { style: 'text-align:right' }, h('div', { class: 'title' }, a.userName), h('div', { class: 't-sub' }, `${roleLabel(a.role, ctx.store.type)} · ${dateTimeLabel(a.ts)}`)))) : [emptyState('file', 'Jurnal bo’sh', 'Narx o’zgartirish, chek qaytarish, smena yopish kabi harakatlar shu yerda saqlanadi.')]));
  }
  const el = h('div', {}, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Harakatlar jurnali'), h('p', {}, 'Kim, qachon, nima qilgani. Yozuvlarni o’chirib bo’lmaydi.'))),
    h('section', { class: 'panel' }, h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search'), search), sel), rows));
  render();
  return { el };
}
