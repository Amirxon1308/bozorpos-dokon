import { h, icon, money, num, qtyFmt, toast, modal, confirmBox, emptyState, download, toCSV, dateTimeLabel, dayLabel } from './ui.js';
import { PAY } from './db.js';
import * as st from './stats.js';
import { printReceipt } from './receipt.js';
import { audit } from './audit.js';

export default async function reports(ctx) {
  const data = ctx.data;
  const isCashier = ctx.user.role === 'cashier';
  const canRefund = ctx.can(['owner', 'manager']);
  const PERIODS = { today: ['Bugun', 0, 1], yesterday: ['Kecha', 1, 1], d7: ['7 kun', 6, 7], d14: ['14 kun', 13, 14] };
  let period = 'today';

  const out = h('div', {});
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Davr' });

  function range() {
    const [, back, len] = PERIODS[period]; const from = st.today() - back * st.DAY;
    return [from, from + len * st.DAY];
  }
  function currentSales(includeRefunded = false) {
    const [a, b] = range();
    let list = st.inRange(data.sales, a, b);
    if (isCashier) list = list.filter((s) => s.cashierId === ctx.user.id);
    return includeRefunded ? list : st.paid(list);
  }

  function render() {
    chips.replaceChildren(...Object.entries(PERIODS).filter(([k]) => !isCashier || k === 'today').map(([k, [label]]) => h('button', { class: 'chip', 'aria-pressed': String(k === period), onclick: () => { period = k; render(); } }, label)));
    const all = currentSales(true).sort((a, b) => b.ts - a.ts);
    const sales = all.filter((s) => s.status === 'paid');
    const S = st.summary(sales);
    const byPay = st.byPay(sales);
    const cashiers = new Map();
    for (const s of sales) { const r = cashiers.get(s.cashierName) || { n: 0, t: 0 }; r.n++; r.t += s.total; cashiers.set(s.cashierName, r); }
    const refunded = all.length - sales.length;

    const kpi = (label, value, unit) => h('div', { class: 'kpi' }, h('span', { class: 'label' }, label), h('div', { class: 'value num' }, value, unit ? h('small', {}, unit) : null));
    out.replaceChildren(
      h('section', { class: 'kpis' }, kpi('Savdo', num(S.total), 'so’m'), kpi('Cheklar', num(S.count)), kpi('O’rtacha chek', num(S.avg), 'so’m'), isCashier ? kpi('Qaytarilgan', num(refunded)) : kpi('Taxminiy foyda', num(S.profit), 'so’m')),
      !isCashier ? h('div', { class: 'grid-eq' },
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'To’lov turlari bo’yicha')),
          h('div', { class: 'list' }, Object.entries(byPay).map(([k, v]) => h('div', { class: 'list-row' }, h('div', { class: 'grow title' }, PAY[k]), h('span', { class: 'faint num' }, `${S.total ? Math.round((v / S.total) * 100) : 0}%`), h('b', { class: 'num' }, money(v)))))),
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Kassirlar bo’yicha')),
          cashiers.size ? h('div', { class: 'list' }, [...cashiers.entries()].sort((a, b) => b[1].t - a[1].t).map(([n, r]) => h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, n), h('div', { class: 't-sub' }, `${r.n} ta chek`)), h('b', { class: 'num' }, money(r.t))))) : emptyState('receipt', 'Ma’lumot yo’q'))) : null,
      h('section', { class: 'panel', style: 'margin-top:20px' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Cheklar'), !isCashier ? h('button', { class: 'btn btn-sm', onclick: () => exportCSV(all) }, icon('down'), 'CSV eksport') : null),
        all.length ? h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['№', 'Vaqt', 'Kassir', 'To’lov', 'Jami', 'Holat'].map((t, i) => h('th', { class: i === 4 ? 't-right' : '' }, t)))),
          h('tbody', {}, all.slice(0, 120).map((s) => h('tr', { style: 'cursor:pointer', tabindex: '0', onclick: () => view(s), onkeydown: (e) => { if (e.key === 'Enter') view(s); } },
            h('td', { class: 'num code' }, String(s.no).padStart(5, '0')), h('td', {}, dateTimeLabel(s.ts)), h('td', {}, s.cashierName), h('td', {}, PAY[s.pay]),
            h('td', { class: 't-right num' }, h('b', {}, num(s.total))), h('td', {}, s.status === 'paid' ? h('span', { class: 'pill pill-ok' }, 'to’langan') : h('span', { class: 'pill pill-bad' }, 'qaytarilgan'))))))) :
          emptyState('receipt', 'Bu davrda cheklar yo’q', 'Kassada birinchi chek yopilgach shu yerda ko’rinadi.')));
  }

  function exportCSV(list) {
    download(`cheklar-${period}.csv`, toCSV([['chek', 'sana', 'kassir', 'tolov', 'chegirma', 'jami', 'holat'], ...list.map((s) => [s.no, new Date(s.ts).toISOString().slice(0, 16).replace('T', ' '), s.cashierName, PAY[s.pay], s.discount, s.total, s.status])]), 'text/csv');
  }

  function view(s) {
    const actions = [{ label: 'Chop etish', icon: 'print', stay: true, onClick: () => { printReceipt(s, ctx); return false; } }];
    if (canRefund && s.status === 'paid') actions.push({ label: 'Qaytarish (vozvrat)', kind: 'danger', icon: 'x', onClick: async (close) => {
      if (!(await confirmBox('Chekni qaytarish', `Chek № ${String(s.no).padStart(5, '0')} (${money(s.total)}) bekor qilinadi, mahsulotlar omborga qaytadi.`, 'Qaytarish', 'danger'))) return false;
      s.status = 'refunded'; s.refundedBy = ctx.user.name; s.refundedAt = Date.now();
      if (s.pay === 'nasiya' && s.customerId && data.customers) { const c = data.customers.find((x) => x.id === s.customerId); if (c) c.debt = Math.max(0, Math.round(c.debt - s.total)); }
      audit(ctx, 'Chek qaytarildi', `№ ${s.no}, ${money(s.total)}`);
      for (const it of s.items) { const p = data.products.find((x) => x.id === it.pid); if (p && !p.menu) p.stock = Math.round((p.stock + it.qty) * 1000) / 1000; }
      ctx.save(); render(); toast('Chek qaytarildi'); close();
    }, stay: true });
    actions.push({ label: 'Yopish', kind: 'primary' });
    modal({
      title: `Chek № ${String(s.no).padStart(5, '0')}`, wide: true,
      body: [h('p', { class: 'muted' }, `${dateTimeLabel(s.ts)} · ${s.cashierName} · ${PAY[s.pay]}${s.status === 'refunded' ? ` · qaytarildi (${s.refundedBy || ''})` : ''}`),
        h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Mahsulot'), h('th', { class: 't-right' }, 'Soni'), h('th', { class: 't-right' }, 'Narx'), h('th', { class: 't-right' }, 'Summa'))),
          h('tbody', {}, s.items.map((i) => h('tr', {}, h('td', {}, i.name), h('td', { class: 't-right num' }, qtyFmt(i.qty)), h('td', { class: 't-right num' }, num(i.price)), h('td', { class: 't-right num' }, num(Math.round((i.qty * i.price) / 100) * 100))))))),
        s.discount ? h('div', { class: 'rc-totals', style: 'margin:0' }, h('div', { class: 'row' }, h('span', {}, 'Chegirma'), h('span', { class: 'num' }, `−${money(s.discount)}`))) : null,
        h('div', { class: 'rc-total' }, h('span', {}, 'Jami'), h('strong', { class: 'num' }, money(s.total)))],
      actions,
    });
  }

  const el = h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Hisobotlar'), h('p', {}, isCashier ? 'Sizning bugungi smenangiz.' : `${ctx.store.name} · ${dayLabel(new Date(range()[0]))}${period === 'd7' || period === 'd14' ? ' dan' : ''}`)), chips),
    out);
  render();
  return { el };
}
