// Nasiya (mijoz qarzi) va yetkazib beruvchilarga qarz.
import { h, icon, money, num, toast, modal, field, emptyState, uid, dateTimeLabel } from '../../shared/ui.js';
import { audit } from '../../shared/audit.js';

export default async function debts(ctx) {
  const data = ctx.data;
  let tab = 'customers';
  const body = h('div', {});
  const tabs = h('div', { class: 'chips', style: 'margin-bottom:16px' });

  function pay(kind, who) {
    const amount = h('input', { class: 'input num', type: 'number', min: '0', inputmode: 'numeric', value: who.debt });
    const err = h('div', { class: 'error-text', role: 'alert' });
    const mine = kind === 'customers';
    modal({ title: mine ? `${who.name}: to’lov qabul qilish` : `${who.name}ga to’lash`,
      body: [h('p', { class: 'muted' }, `Joriy qarz: ${money(who.debt)}`), field('Summa (so’m)', amount), err],
      actions: [{ label: 'Bekor qilish' }, { label: mine ? 'Qabul qilish' : 'To’lash', kind: 'primary', icon: 'check', onClick: () => {
        const v = Math.round(parseFloat(amount.value) || 0);
        if (v <= 0 || v > who.debt) { err.textContent = 'Summa qarzdan oshmasin va 0 dan katta bo’lsin.'; return false; }
        who.debt -= v; data.debts.push({ id: uid('d'), ts: Date.now(), kind, whoId: who.id, whoName: who.name, amount: v, by: ctx.user.name });
        audit(ctx, mine ? 'Nasiya to’lovi' : 'Yetkazib beruvchiga to’lov', `${who.name}: ${num(v)} so’m`); ctx.save(); render(); toast('Saqlandi');
      } }] });
  }

  function addCustomer() {
    const nm = h('input', { class: 'input', placeholder: 'Ism' }); const ph = h('input', { class: 'input', placeholder: '+998 ...', inputmode: 'tel' });
    modal({ title: 'Yangi mijoz', body: [h('div', { class: 'form-grid' }, field('Ism', nm), field('Telefon', ph))],
      actions: [{ label: 'Bekor qilish' }, { label: 'Qo’shish', kind: 'primary', onClick: () => { if (!nm.value.trim()) return false; data.customers.push({ id: uid('c'), name: nm.value.trim(), phone: ph.value.trim(), debt: 0 }); ctx.save(); render(); } }] });
  }

  function render() {
    tabs.replaceChildren(...[['customers', 'Mijozlar (nasiya)'], ['suppliers', 'Yetkazib beruvchilar']].map(([k, t]) => h('button', { class: 'chip', 'aria-pressed': String(tab === k), onclick: () => { tab = k; render(); } }, t)));
    const list = (tab === 'customers' ? data.customers : data.suppliers).slice().sort((a, b) => b.debt - a.debt);
    const total = list.reduce((a, x) => a + x.debt, 0);
    const hist = data.debts.filter((d) => d.kind === tab).sort((a, b) => b.ts - a.ts).slice(0, 10);
    body.replaceChildren(
      h('section', { class: 'panel', style: 'margin-bottom:16px' }, h('div', { class: 'panel-head' }, h('h2', {}, tab === 'customers' ? 'Mijozlar' : 'Yetkazib beruvchilar'), h('span', { class: 'pill pill-warn' }, `jami qarz ${money(total)}`)),
        list.length ? h('div', { class: 'list' }, list.map((x) => h('div', { class: 'list-row' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, x.name), h('div', { class: 't-sub' }, x.phone || (tab === 'customers' ? 'telefon yo’q' : ''))),
          h('b', { class: 'num' }, money(x.debt)),
          h('button', { class: 'btn btn-sm', disabled: !x.debt, onclick: () => pay(tab, x) }, tab === 'customers' ? 'To’lov olish' : 'To’lash')))) :
          emptyState('file', tab === 'customers' ? 'Mijozlar yo’q' : 'Yetkazib beruvchilar yo’q', tab === 'customers' ? 'Kassada «Nasiya» to’lov turini tanlang yoki mijoz qo’shing.' : 'Kirimda to’liq to’lanmagan summa shu yerga yoziladi.')),
      hist.length ? h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'So’nggi to’lovlar')), h('div', { class: 'list' }, hist.map((d) => h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, d.whoName), h('div', { class: 't-sub' }, `${dateTimeLabel(d.ts)} · ${d.by}`)), h('b', { class: 'num' }, money(d.amount)))))) : null);
  }
  const el = h('div', {}, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Qarzlar'), h('p', {}, 'Nasiya va yetkazib beruvchilar hisobi.')), h('div', { class: 'page-actions' }, h('button', { class: 'btn', onclick: addCustomer }, icon('plus'), 'Mijoz qo’shish'))), tabs, body);
  render();
  return { el };
}
