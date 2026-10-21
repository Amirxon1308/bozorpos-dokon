import { h, icon, money, num, dayLabel, emptyState, qtyFmt } from '../../shared/ui.js';
import { PAY } from '../../shared/db.js';
import * as st from '../../shared/stats.js';
import { expiring } from '../batches.js';

function chartSVG(days) {
  const W = 720, H = 230, padL = 46, padB = 28, padT = 12, padR = 8;
  const max = Math.max(...days.map((d) => d.total), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const iw = W - padL - padR, ih = H - padT - padB, bw = iw / days.length;
  let g = '';
  for (let v = 0; v <= top; v += step) {
    const y = padT + ih - (v / top) * ih;
    g += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/><text x="${padL - 8}" y="${y + 4}" text-anchor="end">${v >= 1e6 ? (v / 1e6).toString().replace('.', ',') + ' mln' : v / 1000 + ' ming'}</text>`;
  }
  days.forEach((d, i) => {
    const bh = (d.total / top) * ih; const x = padL + i * bw + bw * 0.18; const w = bw * 0.64; const y = padT + ih - bh;
    g += `<rect class="bar${d.isToday ? ' today' : ''}" x="${x}" y="${y}" width="${w}" height="${Math.max(bh, 1)}" rx="4"><title>${dayLabel(d.date)}: ${money(d.total)} (${d.count} chek)</title></rect>`;
    if (days.length <= 14 || i % 2 === 0) g += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${d.date.getDate()}</text>`;
  });
  const svg = document.createElement('div');
  svg.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="So’nggi 14 kunlik savdo diagrammasi">${g}</svg>`;
  return svg.firstChild;
}
function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw || 1)); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

export default async function dashboard(ctx) {
  const sales = st.paid(ctx.data.sales);
  const t0 = st.today();
  const todays = st.inRange(sales, t0, t0 + st.DAY);
  const week = st.inRange(sales, t0 - 6 * st.DAY, t0 + st.DAY);
  const prev7 = st.inRange(sales, t0 - 7 * st.DAY, t0);
  const S = st.summary(todays);
  const avgDay = st.sum(prev7, (s) => s.total) / 7;
  const delta = avgDay ? ((S.total - avgDay) / avgDay) * 100 : 0;
  const days = st.byDay(sales, 14);
  const top = st.topProducts(week, 5);
  const pay = st.byPay(week);
  const payTotal = Object.values(pay).reduce((a, b) => a + b, 0) || 1;
  const low = ctx.data.products.filter((p) => !p.menu && p.stock <= p.min).sort((a, b) => a.stock / (a.min || 1) - b.stock / (b.min || 1));
  const exp = expiring(ctx.data.products, 7);
  const owed = ctx.data.customers.reduce((a, c) => a + c.debt, 0), owe = ctx.data.suppliers.reduce((a, c) => a + c.debt, 0);
  const colors = { naqd: 'var(--cobalt)', karta: 'var(--zira)', click: 'var(--ok)', payme: '#7a5cc4', nasiya: '#c2410c' };

  const kpi = (label, value, extra, cls = '') => h('div', { class: `kpi ${cls}` }, h('span', { class: 'label' }, label), h('div', { class: 'value num' }, value, h('small', {}, 'so’m')), extra);
  const kpiN = (label, value, extra) => h('div', { class: 'kpi' }, h('span', { class: 'label' }, label), h('div', { class: 'value num' }, value), extra);

  const el = h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Boshqaruv'), h('p', {}, `${ctx.store.name} · bugun, ${dayLabel(new Date())}`)),
      h('div', { class: 'page-actions' }, h('a', { class: 'btn btn-primary', href: '#/pos' }, icon('cart'), 'Kassani ochish'))),
    h('section', { class: 'kpis', 'aria-label': 'Bugungi ko’rsatkichlar' },
      kpi('Bugungi savdo', num(S.total), h('div', { class: `delta ${delta >= 0 ? 'up' : 'down'}` }, (avgDay && S.count) ? `${delta >= 0 ? '+' : '−'}${Math.abs(Math.round(delta))}% o’tgan 7 kun o’rtachasiga nisbatan` : 'Hali taqqoslash uchun ma’lumot yo’q'), 'accent'),
      kpiN('Cheklar soni', num(S.count), h('div', { class: 'delta muted' }, `7 kunda ${num(week.length)} ta`)),
      kpi('O’rtacha chek', num(S.avg), h('div', { class: 'delta muted' }, 'bugungi cheklar bo’yicha')),
      kpi('Taxminiy foyda', num(S.profit), h('div', { class: 'delta muted' }, 'sotuv − kirim narxi'))),
    h('div', { class: 'grid-2' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Kunlik savdo'), h('span', { class: 'pill' }, 'so’nggi 14 kun')),
        h('div', { class: 'panel-body' }, chartSVG(days))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'To’lov turlari'), h('span', { class: 'pill' }, '7 kun')),
        h('div', { class: 'panel-body' },
          h('div', { class: 'split-bar', role: 'img', 'aria-label': 'To’lov turlari ulushi' }, Object.entries(pay).filter(([, v]) => v > 0).map(([k, v]) => h('span', { style: `width:${(v / payTotal) * 100}%;background:${colors[k]}`, title: `${PAY[k]}: ${money(v)}` }))),
          h('div', { class: 'legend' }, Object.entries(pay).map(([k, v]) => h('div', {}, h('i', { style: `background:${colors[k]}` }), PAY[k], h('span', { class: 'faint num' }, `${Math.round((v / payTotal) * 100)}%`), h('b', { class: 'num' }, money(v)))))))),
    h('div', { class: 'grid-eq' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Ko’p sotilganlar'), h('span', { class: 'pill' }, '7 kun')),
        top.length ? h('div', { class: 'list' }, top.map((p, i) => h('div', { class: 'list-row' },
          h('span', { class: `rank${i === 0 ? ' first' : ''}` }, i + 1),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, p.name), h('div', { class: 't-sub' }, `${qtyFmt(p.qty)} sotildi`)),
          h('b', { class: 'num' }, money(p.revenue))))) : emptyState('receipt', 'Hali sotuv yo’q', 'Birinchi chekdan keyin bu yerda eng ko’p sotilganlar chiqadi.')),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Kam qolganlar'), low.length ? h('span', { class: 'pill pill-bad' }, `${low.length} ta`) : h('span', { class: 'pill pill-ok' }, 'hammasi yetarli'),
          h('a', { class: 'btn btn-sm', href: '#/receiving' }, icon('inbox'), 'Kirim qilish')),
        low.length ? h('div', { class: 'list' }, low.slice(0, 6).map((p) => h('div', { class: 'list-row' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, p.name), h('div', { class: 't-sub' }, `minimal: ${qtyFmt(p.min)} ${p.unit}`)),
          h('span', { class: `pill ${p.stock === 0 ? 'pill-bad' : 'pill-warn'}` }, `${qtyFmt(p.stock)} ${p.unit}`)))) : emptyState('check', 'Qoldiq yetarli', 'Minimal chegaradan pastga tushgan mahsulotlar shu yerda ko’rinadi.'))),
    h('div', { class: 'grid-eq', style: 'margin-top:20px' },
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Muddati yaqin'), exp.length ? h('span', { class: 'pill pill-bad' }, `${exp.length} ta partiya`) : h('span', { class: 'pill pill-ok' }, 'yo’q')),
        exp.length ? h('div', { class: 'list' }, exp.slice(0, 6).map(({ p, b, left }) => h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, p.name), h('div', { class: 't-sub' }, `${qtyFmt(b.qty)} ${p.unit} · ${b.expiry}`)), h('span', { class: `pill ${left < 0 ? 'pill-bad' : 'pill-warn'}` }, left < 0 ? 'o’tgan' : `${left} kun`)))) : emptyState('check', 'Muddati o’tayotgan mahsulot yo’q', 'Kirimda yaroqlilik muddatini kiritsangiz, shu yerda eslatiladi.')),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Qarzlar'), h('a', { class: 'btn btn-sm', href: '#/debts' }, 'Ochish')),
        h('div', { class: 'panel-body', style: 'display:grid;gap:12px' }, h('div', { class: 'kv' }, h('small', {}, 'Mijozlar bizga qarz (nasiya)'), h('b', { class: 'num' }, money(owed))), h('div', { class: 'kv' }, h('small', {}, 'Biz yetkazib beruvchilarga qarz'), h('b', { class: 'num' }, money(owe)))))));
  return { el };
}
