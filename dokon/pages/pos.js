import { h, $, icon, money, num, qtyFmt, toast, modal, uid, debounce, dateTimeLabel } from '../../shared/ui.js';
import { PAY } from '../../shared/db.js';
import { openCameraScanner, listenHardwareScanner, beep } from '../../shared/scanner.js';
import { searchProducts, sameCode } from '../../shared/search.js';
import { nextNo as nextNoOf } from '../../shared/backend.js';
import { consume } from '../batches.js';
import { audit } from '../../shared/audit.js';
import { notify } from '../../shared/notify.js';
import { printReceipt } from '../../shared/receipt.js';

// Savat navigatsiya orasida yo'qolmasligi uchun modul darajasida saqlanadi.
let cart = [];
let discount = { type: 'sum', value: 0 };
let lastAdded = null;

const lineSum = (l) => Math.round((l.qty * l.price) / 100) * 100;
const subtotalOf = () => cart.reduce((a, l) => a + lineSum(l), 0);
const discountAmount = () => {
  const sub = subtotalOf();
  const d = discount.type === 'pct' ? (sub * Math.min(discount.value, 100)) / 100 : discount.value;
  return Math.min(Math.round(d / 100) * 100, sub);
};
const totalOf = () => subtotalOf() - discountAmount();

export default async function pos(ctx) {
  const data = ctx.data;
  let query = '';
  let category = 'Hammasi';
  const canDiscount = ctx.can(['owner', 'manager']);
  const canManage = ctx.can(['owner', 'manager']);

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Nomi bo’yicha qidiring yoki kodni skaner qiling', autocomplete: 'off', 'aria-label': 'Mahsulot qidirish' });
  const tilesEl = h('div', { class: 'tiles' });
  const chipsEl = h('div', { class: 'chips', role: 'group', 'aria-label': 'Kategoriyalar' });
  const linesEl = h('div', { class: 'rc-lines' });
  const totalsEl = h('div', {});
  const noEl = h('span', { class: 'rc-no num' });
  const cartbar = h('button', { class: 'mobile-cartbar', onclick: () => openSheet(true) });
  const sheet = h('aside', { class: 'receipt-wrap', 'aria-label': 'Joriy chek' });

  const categories = () => ['Hammasi', ...new Set(data.products.map((p) => p.category))];
  const nextNo = () => nextNoOf(data, 'sales');

  // ---------- Mahsulot topish va savatga qo'shish ----------
  const findByCode = (code) => data.products.find((p) => p.code && sameCode(p.code, code));

  function add(p, qty) {
    const step = qty ?? (p.unit === 'kg' ? 0.5 : 1);
    const line = cart.find((l) => l.pid === p.id);
    const have = line ? line.qty : 0;
    if (!p.menu && have + step > p.stock) toast(`Qoldiq yetmaydi: ${qtyFmt(p.stock)} ${p.unit} bor`, 'bad');
    if (line) line.qty = Math.round((line.qty + step) * 1000) / 1000;
    else cart.push({ pid: p.id, name: p.name, price: p.price, cost: p.cost, unit: p.unit, qty: step, menu: p.menu });
    beep(true); lastAdded = p.id; renderCart();
    const t = tilesEl.querySelector(`.tile[data-pid="${p.id}"]`);
    if (t) { t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse'); }
  }

  function addByCode(code) {
    const p = findByCode(code.trim());
    if (p) { add(p); search.value = ''; query = ''; renderTiles(); return true; }
    beep(false);
    if (canManage) {
      modal({
        title: 'Kod bazada topilmadi',
        body: h('p', { class: 'muted' }, `«${code}» kodli mahsulot yo’q. Yangi mahsulot sifatida qo’shasizmi? Nomi avval Open Food Facts bazasidan qidiriladi.`),
        actions: [{ label: 'Bekor qilish' }, { label: 'Yangi mahsulot qo’shish', kind: 'primary', icon: 'plus', onClick: () => { sessionStorage.setItem('bpos:newCode', code); ctx.go('products'); } }],
      });
    } else toast(`«${code}» kodli mahsulot topilmadi. Menejerga xabar bering.`, 'bad');
    return false;
  }

  let raf = 0;
  search.addEventListener('input', () => {
    query = search.value;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderTiles);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = search.value.trim();
    if (!v) return;
    if (/^\d{6,}$/.test(v)) { addByCode(v); return; }
    const list = filtered();
    if (list.length >= 1) { add(list[0]); search.value = ''; query = ''; renderTiles(); }
  });

  // ---------- Ro'yxat ----------
  let sortedAll = null;
  function filtered() {
    if (!sortedAll || sortedAll.length !== data.products.length) sortedAll = [...data.products].sort((a, b) => (b.menu - a.menu) || a.name.localeCompare(b.name, 'uz'));
    const base = category === 'Hammasi' ? sortedAll : sortedAll.filter((p) => p.category === category);
    return query ? searchProducts(base, query, 90) : base;
  }

  function renderChips() {
    chipsEl.replaceChildren(...categories().map((c) => h('button', { class: 'chip', 'aria-pressed': String(c === category), onclick: () => { category = c; renderChips(); renderTiles(); } }, c)));
  }

  function renderTiles() {
    const list = filtered().slice(0, 90);
    if (!list.length) {
      tilesEl.replaceChildren(h('div', { class: 'empty', style: 'grid-column:1/-1' }, icon('search'), h('strong', {}, 'Hech narsa topilmadi'), h('p', {}, 'Boshqa nom yozing yoki kodni skaner qiling.')));
      return;
    }
    tilesEl.replaceChildren(...list.map((p) => {
      const out = !p.menu && p.stock <= 0; const low = !p.menu && !out && p.stock <= p.min;
      return h('button', { class: `tile${p.menu ? ' menu' : ''}${low ? ' low' : ''}${out ? ' out' : ''}`, 'data-pid': p.id, onclick: () => add(p), 'aria-label': `${p.name}, ${money(p.price)}` },
        h('span', { class: 'tname' }, p.name),
        h('span', {}, h('span', { class: 'tprice num' }, num(p.price)), h('span', { class: 'faint' }, ` / ${p.unit}`)),
        h('span', { class: 'tstock' }, p.menu ? 'tez tugma' : out ? 'qolmagan' : `${qtyFmt(p.stock)} ${p.unit} bor`));
    }));
  }

  // ---------- Chek ----------
  function renderCart() {
    noEl.textContent = `№ ${String(nextNo()).padStart(5, '0')}`;
    if (!cart.length) {
      linesEl.replaceChildren(h('div', { class: 'rc-empty' }, icon('scan'), h('strong', {}, 'Chek bo’sh'), h('span', {}, 'Mahsulotni skaner qiling yoki ro’yxatdan tanlang')));
    } else {
      linesEl.replaceChildren(...cart.map((l, i) => {
        const step = l.unit === 'kg' ? 0.1 : 1;
        const input = h('input', { type: 'number', min: '0', step: String(step), value: l.qty, inputmode: 'decimal', 'aria-label': `${l.name} miqdori`, onchange: (e) => {
          const v = parseFloat(String(e.target.value).replace(',', '.'));
          if (!(v > 0)) cart.splice(i, 1); else l.qty = Math.round(v * 1000) / 1000;
          renderCart();
        } });
        return h('div', { class: `rc-line${l.pid === lastAdded ? ' enter' : ''}` },
          h('div', {}, h('div', { class: 'nm' }, l.name), h('div', { class: 'each num' }, `${num(l.price)} × ${qtyFmt(l.qty)} ${l.unit}`)),
          h('div', { class: 'sum num' }, num(lineSum(l))),
          h('div', { class: 'qty' },
            h('button', { 'aria-label': 'Kamaytirish', onclick: () => { l.qty = Math.round((l.qty - step) * 1000) / 1000; if (l.qty <= 0) cart.splice(i, 1); renderCart(); } }, '−'),
            input,
            h('button', { 'aria-label': 'Ko’paytirish', onclick: () => { l.qty = Math.round((l.qty + step) * 1000) / 1000; renderCart(); } }, '+')),
          h('button', { class: 'rm', onclick: () => { cart.splice(i, 1); renderCart(); } }, 'Olib tashlash'));
      }));
    }
    renderTotals();
  }

  function renderTotals() {
    const sub = subtotalOf(); const dis = discountAmount(); const total = totalOf();
    const dInput = h('input', { class: 'input num', type: 'number', min: '0', value: discount.value || '', placeholder: '0', disabled: !canDiscount || !cart.length, 'aria-label': 'Chegirma miqdori', style: 'max-width:110px', onchange: (e) => { discount.value = Math.max(0, parseFloat(e.target.value) || 0); setTimeout(renderTotals, 0); } });
    const dType = h('select', { class: 'select', style: 'max-width:90px;min-height:36px', disabled: !canDiscount || !cart.length, 'aria-label': 'Chegirma turi', onchange: (e) => { discount.type = e.target.value; setTimeout(renderTotals, 0); } },
      h('option', { value: 'sum', selected: discount.type === 'sum' }, 'so’m'), h('option', { value: 'pct', selected: discount.type === 'pct' }, '%'));
    totalsEl.replaceChildren(
      h('div', { class: 'rc-totals' },
        h('div', { class: 'row' }, h('span', {}, `Mahsulotlar (${cart.length})`), h('span', { class: 'num' }, money(sub))),
        h('div', { class: 'row discount-row' }, h('span', {}, 'Chegirma'), h('span', { style: 'margin-left:auto;display:flex;gap:6px' }, dInput, dType)),
        dis ? h('div', { class: 'row' }, h('span', {}, 'Chegirma summasi'), h('span', { class: 'num' }, `−${money(dis)}`)) : null,
        !canDiscount ? h('div', { class: 'hint' }, 'Chegirmani menejer yoki ega beradi.') : null,
        h('div', { class: 'rc-total' }, h('span', {}, 'Jami'), h('strong', { class: `num${lastAdded ? ' bump' : ''}` }, num(total)))),
      h('div', { class: 'rc-actions' },
        h('button', { class: 'btn btn-primary btn-lg', disabled: !cart.length, onclick: pay }, icon('check'), 'To’lovga o’tish'),
        h('button', { class: 'btn', disabled: !cart.length, onclick: () => { cart = []; discount = { type: 'sum', value: 0 }; renderCart(); } }, icon('trash'), 'Chekni tozalash')));
    lastAdded = null;
    const count = cart.reduce((a, l) => a + (l.unit === 'kg' ? 1 : l.qty), 0);
    cartbar.replaceChildren(h('span', {}, `${Math.round(count)} ta mahsulot`), h('strong', { class: 'num' }, money(total)), h('span', { class: 'go' }, 'Chek'));
    cartbar.style.display = cart.length ? '' : 'none';
  }

  function openSheet(open) { sheet.classList.toggle('open', open); }

  // ---------- To'lov ----------
  function pay() {
    const total = totalOf();
    let method = 'naqd';
    const received = h('input', { class: 'input num', type: 'number', min: '0', inputmode: 'numeric', value: total, 'aria-label': 'Olingan summa' });
    const changeEl = h('div', {});
    const methodsEl = h('div', { class: 'pay-methods' });
    const cashBox = h('div', { class: 'field' });
    const noteEl = h('div', { class: 'notice' }, icon('info'), h('div', {}, 'Mijoz o’z telefonidan to’laydi. To’lov tushganini ko’rganingizdan keyin chekni yoping. Avtomatik tasdiqlash keyingi bosqichda ulanadi.'));

    const notes = { naqd: 'qaytim hisoblanadi', karta: 'terminal orqali', click: 'mijoz ilovasidan', payme: 'mijoz ilovasidan', nasiya: 'qarzga yoziladi' };
    let custId = '';
    const custSel = h('select', { class: 'select', 'aria-label': 'Mijoz', onchange: (e) => { custId = e.target.value; renderCash(); } });
    const custBox = h('div', { class: 'field' }, h('label', {}, 'Mijoz (nasiya)'), custSel, h('button', { class: 'btn btn-sm', type: 'button', style: 'justify-self:start;margin-top:8px', onclick: newCustomer }, icon('plus'), 'Yangi mijoz'));
    function fillCust() { custSel.replaceChildren(h('option', { value: '' }, 'Mijozni tanlang'), ...data.customers.map((c) => h('option', { value: c.id, selected: c.id === custId }, `${c.name}${c.debt ? ` · qarz ${num(c.debt)}` : ''}`))); }
    function newCustomer() {
      const nm = h('input', { class: 'input', placeholder: 'Ism' }); const ph = h('input', { class: 'input', placeholder: '+998 ...', inputmode: 'tel' });
      modal({ title: 'Yangi mijoz', body: [h('div', { class: 'form-grid' }, h('div', {}, nm), h('div', {}, ph))], actions: [{ label: 'Bekor qilish' }, { label: 'Qo’shish', kind: 'primary', onClick: () => { if (!nm.value.trim()) return false; const c = { id: uid('c'), name: nm.value.trim(), phone: ph.value.trim(), debt: 0 }; data.customers.push(c); custId = c.id; ctx.save(); fillCust(); renderCash(); } }] });
    }
    function renderMethods() {
      methodsEl.replaceChildren(...Object.keys(PAY).map((k) => h('button', { class: 'pay-method', 'aria-pressed': String(k === method), onclick: () => { method = k; renderMethods(); renderCash(); } }, PAY[k], h('small', {}, notes[k]))));
    }
    function renderCash() {
      const isCash = method === 'naqd';
      cashBox.style.display = isCash ? '' : 'none';
      noteEl.style.display = method === 'click' || method === 'payme' ? '' : 'none';
      const got = parseFloat(received.value) || 0; const diff = got - total;
      changeEl.replaceChildren(isCash ? h('div', { class: `change-box${diff < 0 ? ' short' : ''}` }, h('span', {}, diff < 0 ? 'Yetmayapti' : 'Qaytim'), h('span', { class: 'num' }, money(Math.abs(diff)))) : '');
      custBox.style.display = method === 'nasiya' ? '' : 'none';
      confirmBtn.disabled = (isCash && diff < 0) || (method === 'nasiya' && !custId);
    }
    received.addEventListener('input', renderCash);
    const quick = [total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000]
      .filter((v, i, a) => v >= total && a.indexOf(v) === i).slice(0, 4);
    cashBox.append(h('label', {}, 'Olingan summa'), received,
      h('div', { class: 'chips', style: 'margin-top:8px' }, quick.map((v, i) => h('button', { class: 'chip', type: 'button', onclick: () => { received.value = v; renderCash(); } }, i === 0 ? 'Aniq summa' : num(v)))));
    const confirmBtn = h('button', { class: 'btn btn-primary btn-lg', onclick: () => finish(method, parseFloat(received.value) || total, m, custId) }, icon('check'), 'Chekni yopish');

    const m = modal({
      title: `To’lov: ${money(total)}`,
      body: [methodsEl, cashBox, custBox, noteEl, changeEl],
      actions: [],
    });
    m.el.querySelector('.modal-body').after(h('div', { class: 'modal-foot' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Orqaga'), confirmBtn));
    fillCust(); renderMethods(); renderCash();
    setTimeout(() => received.select(), 40);
  }

  function finish(method, got, m, custId) {
    const items = cart.map((l) => ({ pid: l.pid, name: l.name, qty: l.qty, price: l.price, cost: l.cost }));
    const subtotal = subtotalOf(); const dis = discountAmount(); const total = subtotal - dis;
    const sale = { id: uid('s'), no: nextNo(), ts: Date.now(), cashierId: ctx.user.id, cashierName: ctx.user.name, items, subtotal, discount: dis, total, pay: method, received: method === 'naqd' ? got : total, status: 'paid' };
    if (method === 'nasiya') { const c = data.customers.find((x) => x.id === custId); if (c) { sale.customerId = c.id; sale.customerName = c.name; c.debt = Math.round(c.debt + total); audit(ctx, 'Nasiyaga sotuv', `${c.name}: +${num(total)} so’m (chek № ${sale.no})`); } }
    for (const it of items) { const p = data.products.find((x) => x.id === it.pid); if (p && !p.menu) { const was = p.stock; p.stock = Math.max(0, Math.round((p.stock - it.qty) * 1000) / 1000); consume(p, it.qty, was); if (was > p.min && p.stock <= p.min) notify(ctx, `⚠️ ${ctx.store.name}: «${p.name}» kam qoldi (${p.stock} ${p.unit}, minimal ${p.min})`); } }
    data.sales.push(sale);
    ctx.save();
    cart = []; discount = { type: 'sum', value: 0 };
    m.close(); openSheet(false);
    renderCart(); renderTiles();
    done(sale);
    ctx.refreshShell && refreshBadge();
  }

  function refreshBadge() {
    const low = data.products.filter((p) => !p.menu && p.stock <= p.min).length;
    const badge = document.querySelector('.nav a[data-route="products"] .badge');
    if (badge) { if (low) badge.textContent = low; else badge.remove(); }
  }

  function done(sale) {
    const change = sale.pay === 'naqd' ? Math.max(0, sale.received - sale.total) : 0;
    const dlg = modal({
      title: `Chek № ${String(sale.no).padStart(5, '0')} yopildi`,
      body: h('div', { style: 'display:grid;gap:10px' },
        h('div', { class: 'rc-total' }, h('span', {}, PAY[sale.pay]), h('strong', { class: 'num' }, money(sale.total))),
        change ? h('div', { class: 'change-box' }, h('span', {}, 'Qaytim'), h('span', { class: 'num' }, money(change))) : null,
        h('p', { class: 'hint' }, `${sale.items.length} xil mahsulot · ${dateTimeLabel(sale.ts)}`)),
      actions: [{ label: 'Chop etish', icon: 'print', stay: true, onClick: () => { printReceipt(sale, ctx); return false; } }, { label: 'Yangi chek', kind: 'primary', icon: 'plus' }],
    });
    setTimeout(() => dlg.el.querySelector('.btn-primary')?.focus(), 40);
  }

  // ---------- Qobiq ----------
  const scanBtn = h('button', { class: 'btn btn-primary', onclick: () => openCameraScanner({ title: 'Kassa: kamera skaneri', continuous: true, onDetect: (c) => { addByCode(c); return false; } }) }, icon('camera'), h('span', {}, 'Kamera'));
  sheet.append(
    h('button', { class: 'btn btn-ghost mobile-only-back', style: 'margin-bottom:8px', onclick: () => openSheet(false) }, '← Mahsulotlarga qaytish'),
    h('div', { class: 'receipt-shadow' }, h('div', { class: 'receipt' },
      h('div', { class: 'rc-head' }, h('h2', {}, ctx.store.name), noEl),
      linesEl, totalsEl)));

  const el = h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Kassa'), h('p', {}, `${ctx.user.name} · ${dateTimeLabel(Date.now())}`))),
    h('div', { class: 'pos' },
      h('div', { class: 'pos-left' },
        h('div', { class: 'scan-bar' }, h('label', { class: 'search' }, icon('search'), search), scanBtn),
        h('div', { class: 'scan-hint' }, h('span', { class: 'dot' }), 'USB skaner tayyor: kodni skaner qilsangiz, mahsulot avtomatik savatga tushadi.'),
        chipsEl, tilesEl),
      sheet),
    cartbar);

  renderChips(); renderTiles(); renderCart();
  const stopHw = listenHardwareScanner((code) => addByCode(code));
  if (matchMedia('(min-width: 901px)').matches) setTimeout(() => search.focus(), 50);
  return { el, destroy: () => { stopHw(); cartbar.remove(); } };
}
