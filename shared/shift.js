// Smena: ochish (boshlang'ich naqd), yopish (sanash, farq). Ikkala ilovada ishlaydi.
import { h, icon, money, num, toast, modal, field, dateTimeLabel, emptyState } from './ui.js';
import { PAY } from './db.js';
import { audit } from './audit.js';
import { notify } from './notify.js';

export const openShiftOf = (ctx) => ctx.data.shifts.find((s) => !s.closedAt && s.userId === ctx.user.id);

export function shiftTotals(data, sh, until = Date.now()) {
  const sales = data.sales.filter((s) => s.status === 'paid' && s.ts >= sh.openedAt && s.ts <= until && (s.cashierId === sh.userId));
  const by = {}; for (const s of sales) by[s.pay] = (by[s.pay] || 0) + s.total;
  return { count: sales.length, by, total: sales.reduce((a, s) => a + s.total, 0), cash: by.naqd || 0 };
}

export default async function shift(ctx) {
  const body = h('div', {});
  const num$ = (v) => h('input', { class: 'input num', type: 'number', min: '0', inputmode: 'numeric', value: v });

  function openForm() {
    const start = num$(0);
    modal({ title: 'Smenani ochish', body: [h('p', { class: 'muted' }, 'Kassadagi boshlang’ich naqd pulni kiriting.'), field('Boshlang’ich naqd (so’m)', start)],
      actions: [{ label: 'Bekor qilish' }, { label: 'Smenani ochish', kind: 'primary', icon: 'check', onClick: () => {
        const sh = { id: `sh_${Date.now().toString(36)}`, userId: ctx.user.id, userName: ctx.user.name, openedAt: Date.now(), start: parseFloat(start.value) || 0, closedAt: null };
        ctx.data.shifts.push(sh); audit(ctx, 'Smena ochildi', `Boshlang’ich naqd: ${num(sh.start)} so’m`); ctx.save(); render(); toast('Smena ochildi');
      } }] });
  }

  function closeForm(sh) {
    const t = shiftTotals(ctx.data, sh); const expected = sh.start + t.cash;
    const counted = num$(expected); const note = h('input', { class: 'input', placeholder: 'Izoh (ixtiyoriy)' });
    const diffEl = h('div', {});
    const upd = () => { const d = (parseFloat(counted.value) || 0) - expected; diffEl.replaceChildren(h('div', { class: `change-box${d < 0 ? ' short' : ''}` }, h('span', {}, d === 0 ? 'Farq yo’q' : d < 0 ? 'Kamomad' : 'Ortiqcha'), h('span', { class: 'num' }, money(Math.abs(d))))); };
    counted.addEventListener('input', upd); upd();
    modal({ title: 'Smenani yopish',
      body: [h('div', { class: 'list' }, h('div', { class: 'list-row' }, h('div', { class: 'grow' }, 'Boshlang’ich naqd'), h('b', { class: 'num' }, money(sh.start))), h('div', { class: 'list-row' }, h('div', { class: 'grow' }, `Naqd savdo (${t.count} chek jami)`), h('b', { class: 'num' }, money(t.cash))), h('div', { class: 'list-row' }, h('div', { class: 'grow' }, 'Kassada bo’lishi kerak'), h('b', { class: 'num' }, money(expected)))),
        field('Haqiqiy sanalgan naqd (so’m)', counted), diffEl, field('Izoh', note)],
      actions: [{ label: 'Bekor qilish' }, { label: 'Smenani yopish', kind: 'primary', icon: 'check', onClick: () => {
        const c = parseFloat(counted.value) || 0;
        Object.assign(sh, { closedAt: Date.now(), counted: c, expected, diff: c - expected, total: t.total, count: t.count, by: t.by, note: note.value.trim() });
        audit(ctx, 'Smena yopildi', `Savdo ${num(t.total)} so’m, farq ${num(c - expected)} so’m`); ctx.save();
        notify(ctx, `🧾 ${ctx.store.name}: smena yopildi\n${ctx.user.name}\nSavdo: ${num(t.total)} so’m (${t.count} chek)\nNaqd farqi: ${num(c - expected)} so’m`);
        render(); toast('Smena yopildi');
      } }] });
  }

  function render() {
    const sh = openShiftOf(ctx);
    const past = ctx.data.shifts.filter((s) => s.closedAt && (ctx.can(['owner', 'manager']) || s.userId === ctx.user.id)).sort((a, b) => b.closedAt - a.closedAt).slice(0, 30);
    const cur = sh ? shiftTotals(ctx.data, sh) : null;
    body.replaceChildren(
      h('section', { class: 'panel', style: 'margin-bottom:16px' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Joriy smena'), sh ? h('span', { class: 'pill pill-ok' }, 'ochiq') : h('span', { class: 'pill' }, 'yopiq')),
        sh ? h('div', { class: 'panel-body', style: 'display:grid;gap:12px' },
          h('div', { class: 'muted' }, `${dateTimeLabel(sh.openedAt)} dan beri · boshlang’ich naqd ${money(sh.start)}`),
          h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('span', { class: 'label' }, 'Savdo'), h('div', { class: 'value num' }, num(cur.total), h('small', {}, 'so’m'))), h('div', { class: 'kpi' }, h('span', { class: 'label' }, 'Cheklar'), h('div', { class: 'value num' }, num(cur.count))), h('div', { class: 'kpi' }, h('span', { class: 'label' }, 'Kassada naqd bo’lishi kerak'), h('div', { class: 'value num' }, num(sh.start + cur.cash), h('small', {}, 'so’m')))),
          h('div', {}, h('button', { class: 'btn btn-primary', onclick: () => closeForm(sh) }, icon('check'), 'Smenani yopish')))
          : h('div', { class: 'panel-body' }, h('p', { class: 'muted', style: 'margin-bottom:12px' }, 'Ish boshlashdan oldin smenani oching. Kassadagi naqd pul kun oxirida shu smena bilan solishtiriladi.'), h('button', { class: 'btn btn-primary', onclick: openForm }, icon('plus'), 'Smenani ochish'))),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Oldingi smenalar')),
        past.length ? h('div', { class: 'list' }, past.map((s) => h('div', { class: 'list-row' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, s.userName), h('div', { class: 't-sub' }, `${dateTimeLabel(s.openedAt)} → ${dateTimeLabel(s.closedAt)} · ${Object.entries(s.by || {}).map(([k, v]) => `${PAY[k]} ${num(v)}`).join(', ') || 'savdo yo’q'}`)),
          h('div', { style: 'text-align:right' }, h('b', { class: 'num' }, money(s.total)), h('div', { class: `t-sub${s.diff < 0 ? ' neg' : ''}` }, s.diff ? `farq ${num(s.diff)} so’m` : 'farq yo’q'))))) : emptyState('file', 'Hali smena yopilmagan', 'Yopilgan smenalar shu yerda ko’rinadi.')));
  }
  render();
  return { el: h('div', {}, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Smena'), h('p', {}, 'Kassadagi naqd pulni nazorat qiling.'))), body) };
}
