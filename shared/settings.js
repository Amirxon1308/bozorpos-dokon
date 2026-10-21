import { h, icon, toast, modal, field, confirmBox, uid, download } from './ui.js';
import * as db from './db.js';
import { isRemote, printStatus, printRetry } from './backend.js';
import { printerCfg, sendKitchen, sendReceipt } from './printing.js';

export default async function settings(ctx) {
  const data = ctx.data; const s = data.settings;
  s.merchant = s.merchant || { click: { id: '', key: '' }, payme: { id: '', key: '' } };

  const inp = (v, ph, extra = {}) => h('input', { class: 'input', value: v || '', placeholder: ph || '', ...extra });
  const fee = inp(s.serviceFee ?? 0, '0', { type: 'number', min: '0' }); const name = inp(s.name), phone = inp(s.phone, '+998 ...'), address = inp(s.address), footer = h('textarea', { class: 'textarea', style: 'min-height:70px' }, s.footer || '');
  const clickId = inp(s.merchant.click.id, 'Merchant ID'), clickKey = inp(s.merchant.click.key, 'Secret key', { type: 'password', autocomplete: 'off' });
  const paymeId = inp(s.merchant.payme.id, 'Merchant ID'), paymeKey = inp(s.merchant.payme.key, 'Key', { type: 'password', autocomplete: 'off' });
  const tgToken = inp('', 'Bot token (BotFather)', { type: 'password', autocomplete: 'off' }), tgChat = inp('', 'Chat ID (masalan 123456789)');
  const tgState = h('div', { class: 'hint' });
  const tgHead = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(`${db.nsKey()}:token`)}` });
  async function tgSave() {
    if (!tgToken.value.trim() || !tgChat.value.trim()) { toast('Token va Chat ID ni kiriting', 'bad'); return; }
    const r = await fetch('/api/telegram', { method: 'PUT', headers: tgHead(), body: JSON.stringify({ token: tgToken.value, chat_id: tgChat.value }) }).then((x) => x.json()).catch(() => ({}));
    tgState.textContent = r.ok ? 'Ulandi. Telegramga sinov xabari yuborildi.' : 'Saqlandi, lekin sinov xabari yuborilmadi. Token yoki Chat ID ni tekshiring.'; toast(r.ok ? 'Telegram ulandi' : 'Sinov xabari yuborilmadi', r.ok ? 'ok' : 'bad');
  }
  if (isRemote()) fetch('/api/telegram', { headers: tgHead() }).then((x) => x.json()).then((j) => { tgChat.value = j.chat_id || ''; tgState.textContent = j.configured ? 'Hozir ulangan. Tokenni almashtirish uchun qayta kiriting.' : 'Hali ulanmagan.'; }).catch(() => {});
  const staff = h('div', { class: 'list', style: 'margin:0 -4px' });

  const block = (title, text, ...content) => h('div', { class: 'setting-block' }, h('div', {}, h('h3', {}, title), h('p', {}, text)), h('div', { style: 'display:grid;gap:14px;align-content:start' }, content));

  // ---------- Printerlar (faqat choyxona, server rejimida) ----------
  const pc = printerCfg(ctx);
  const pOn = h('input', { type: 'checkbox', checked: pc.enabled, id: 'pon' });
  const wSel = (v) => h('select', { class: 'select' }, [58, 80].map((w) => h('option', { value: w, selected: w === v }, `${w} mm`)));
  const kW = wSel(pc.kitchen.width), rW = wSel(pc.receipt.width);
  const kAuto = h('input', { type: 'checkbox', checked: pc.kitchen.auto, id: 'kauto' }), rAuto = h('input', { type: 'checkbox', checked: pc.receipt.auto, id: 'rauto' });
  const pState = h('div', { class: 'hint' });
  async function pRefresh() {
    try {
      const st = await printStatus();
      const seen = st.agentSeenAgo == null ? 'Print-agent hali ulanmagan.' : st.agentSeenAgo < 30 ? 'Print-agent ulangan va ishlayapti.' : `Print-agent ${Math.round(st.agentSeenAgo / 60) || '<1'} daqiqa oldin ko’rindi. Kompyuter yoqilganini tekshiring.`;
      pState.replaceChildren(`${seen} Navbatda: ${st.pending} ta`, st.failed ? [`, chiqmagan: ${st.failed} ta `, h('button', { class: 'btn btn-sm', onclick: async () => { await printRetry(); pRefresh(); } }, 'Qayta urinish')] : '');
    } catch { pState.textContent = 'Holatni olib bo’lmadi.'; }
  }
  function savePrinters() {
    s.printers = { enabled: pOn.checked, kitchen: { width: parseInt(kW.value, 10), auto: kAuto.checked, copies: 1 }, receipt: { width: parseInt(rW.value, 10), auto: rAuto.checked, copies: 1 } };
    ctx.save(); toast('Printer sozlamalari saqlandi'); pRefresh();
  }
  async function testPrint() {
    savePrinters();
    const order = { tableName: 'SINOV', waiterName: ctx.user.name, no: 0 };
    const k = await sendKitchen(ctx, order, [{ qty: 2, name: 'Lag’mon' }, { qty: 1, name: 'Choy (choynak)' }], false, true);
    const r = await sendReceipt(ctx, { no: 0, ts: Date.now(), tableName: 'SINOV', cashierName: ctx.user.name, items: [{ name: 'Lag’mon', qty: 2, price: 32000 }], total: 64000, pay: 'naqd' }, true);
    toast(k && r ? 'Sinov cheklari navbatga qo’yildi' : 'Yuborilmadi: «Printer orqali chiqarish» yoqilganini tekshiring', k && r ? 'ok' : 'bad');
  }
  const printersBlock = ctx.store.type === 'restoran' && isRemote() ? block('Printerlar', 'Buyurtma oshxona printeridan, hisob kassa printeridan chiqadi. Kassadagi Windows kompyuterda «print-agent» ishlab turadi (qo’llanma: print-agent papkasi).',
    h('label', { class: 'check', for: 'pon' }, pOn, h('span', {}, 'Cheklarni printer orqali chiqarish')),
    h('div', { class: 'form-grid' }, field('Oshxona printeri kengligi', kW), field('Kassa printeri kengligi', rW)),
    h('label', { class: 'check', for: 'kauto' }, kAuto, h('span', {}, 'Buyurtma yuborilganda oshxona cheki o’zi chiqsin')),
    h('label', { class: 'check', for: 'rauto' }, rAuto, h('span', {}, 'Hisob yopilganda mijoz cheki o’zi chiqsin')),
    pState,
    h('div', { class: 'page-actions' }, h('button', { class: 'btn btn-primary', onclick: savePrinters }, icon('check'), 'Saqlash'), h('button', { class: 'btn', onclick: testPrint }, icon('print'), 'Sinov cheki'))) : null;
  if (printersBlock) pRefresh();

  async function renderStaff() {
    let users = [];
    try { users = await ctx.admin.users(); } catch (e) { staff.replaceChildren(h('p', { class: 'muted', style: 'padding:12px' }, e.message)); return; }
    staff.replaceChildren(...users.map((u) => h('div', { class: 'list-row' },
      h('span', { class: 'avatar', style: 'width:34px;height:34px;font-size:13px' }, u.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, u.name), h('div', { class: 't-sub' }, `login: ${u.login}`)),
      h('span', { class: `pill ${u.role === 'owner' ? 'pill-blue' : ''}` }, db.roleLabel(u.role, ctx.store.type)),
      u.id !== ctx.user.id ? h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': `${u.name}ni o’chirish`, onclick: async () => {
        if (!(await confirmBox('Xodimni o’chirish', `«${u.name}» tizimga kira olmaydi. Uning oldingi cheklari saqlanadi.`, 'O’chirish', 'danger'))) return;
        try { await ctx.admin.delUser(u.id); renderStaff(); toast('Xodim o’chirildi'); } catch (e) { toast(e.message, 'bad'); }
      } }, icon('trash')) : null)));
  }

  function addStaff() {
    const nm = inp('', 'Ism familiya'); const lg = inp('', 'Login', { autocapitalize: 'none' }); const ps = inp('', 'Kamida 6 belgi', { autocomplete: 'off' });
    const rest = ctx.store.type === 'restoran';
    const role = h('select', { class: 'select' }, h('option', { value: 'cashier' }, 'Kassir'), rest ? [h('option', { value: 'waiter' }, 'Ofitsiant'), h('option', { value: 'chef' }, 'Oshpaz'), isRemote() ? h('option', { value: 'agent' }, 'Print-agent (kassadagi kompyuter)') : null] : h('option', { value: 'manager' }, 'Menejer'));
    const err = h('div', { class: 'error-text', role: 'alert' });
    modal({ title: 'Xodim qo’shish',
      body: [h('div', { class: 'form-grid' }, h('div', { class: 'span-2' }, field('Ism', nm)), field('Login', lg), field('Parol', ps), h('div', { class: 'span-2' }, field('Lavozim', role,
        rest ? 'Ofitsiant telefondan buyurtma oladi. Kassir hisobni yopadi. Oshpaz taom qo’shadi, porsiya kiritadi va stop-listni boshqaradi. Print-agent faqat printerga chek chiqaradi.' : 'Kassir faqat kassada ishlaydi. Menejer kirim, mahsulot va hisobotni ko’radi.'))), err],
      actions: [{ label: 'Bekor qilish' }, { label: 'Qo’shish', kind: 'primary', icon: 'plus', onClick: async () => {
        const l = lg.value.trim().toLowerCase();
        if (!nm.value.trim() || !l) { err.textContent = 'Ism va loginni kiriting.'; return false; }
        if (ps.value.length < 6) { err.textContent = 'Parol kamida 6 belgidan iborat bo’lsin.'; return false; }
        try { await ctx.admin.addUser({ login: l, name: nm.value.trim(), role: role.value, password: ps.value }); } catch (e) { err.textContent = e.message; return false; }
        renderStaff(); toast('Xodim qo’shildi');
      } }] });
  }

  function saveInfo() {
    s.name = name.value.trim() || s.name; s.phone = phone.value.trim(); s.address = address.value.trim(); s.footer = footer.value.trim(); if (ctx.store.type === 'restoran') s.serviceFee = Math.max(0, parseFloat(fee.value) || 0);
    ctx.store.name = s.name; ctx.admin.renameStore(s.name).catch(() => {}); ctx.save();
    toast('Sozlamalar saqlandi'); ctx.refreshShell();
  }
  function saveMerchant() {
    s.merchant = { click: { id: clickId.value.trim(), key: clickKey.value.trim() }, payme: { id: paymeId.value.trim(), key: paymeKey.value.trim() } };
    ctx.save(); toast('To’lov kalitlari saqlandi');
  }

  function backup() {
    download(`${ctx.store.name.replace(/\s+/g, '-').toLowerCase()}-zaxira-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
  function restore() {
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'input', style: 'padding-top:8px' });
    modal({ title: 'Zaxiradan tiklash', body: [h('div', { class: 'notice' }, icon('alert'), h('div', {}, 'Joriy do’kon ma’lumoti zaxira fayli bilan almashtiriladi. Faqat shu do’konga tegishli ma’lumot o’zgaradi.')), file],
      actions: [{ label: 'Bekor qilish' }, { label: 'Tiklash', kind: 'danger', onClick: async () => {
        const f = file.files[0]; if (!f) { toast('Fayl tanlang', 'bad'); return false; }
        try {
          const j = JSON.parse(await f.text());
          if (!Array.isArray(j.products) || !Array.isArray(j.sales)) throw new Error('format');
          Object.keys(ctx.data).forEach((k) => { if (Array.isArray(ctx.data[k])) ctx.data[k].splice(0, ctx.data[k].length, ...(j[k] || [])); }); if (j.settings) Object.assign(ctx.data.settings, j.settings); ctx.save(); toast('Tiklandi'); setTimeout(() => location.reload(), 700);
        } catch { toast('Fayl noto’g’ri formatda', 'bad'); return false; }
      } }] });
  }
  async function wipe() {
    if (!(await confirmBox('Barcha ma’lumotni tozalash', 'Mahsulotlar, cheklar va kirimlar o’chadi. Avval zaxira nusxa oling. Bu amalni qaytarib bo’lmaydi.', 'Tozalash', 'danger'))) return;
    const keep = ctx.data.settings; Object.keys(ctx.data).forEach((k) => { if (Array.isArray(ctx.data[k])) ctx.data[k].splice(0); }); ctx.data.settings = keep; ctx.save(); toast('Baza tozalandi'); setTimeout(() => location.reload(), 700);
  }

  const el = h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Sozlamalar'), h('p', {}, ctx.store.name))),
    h('div', { class: 'settings' }, h('section', { class: 'panel' },
      block('Do’kon ma’lumoti', 'Chekda ko’rinadi.',
        field('Nomi', name), h('div', { class: 'form-grid' }, field('Telefon', phone), field('Manzil', address)), field('Chek pastidagi yozuv', footer), ctx.store.type === 'restoran' ? field('Xizmat haqi (%)', fee, 'Hisobga qo’shiladi. Yo’q bo’lsa 0 yozing.') : null,
        h('div', {}, h('button', { class: 'btn btn-primary', onclick: saveInfo }, icon('check'), 'Saqlash'))),
      block('Xodimlar', ctx.store.type === 'restoran' ? 'Admin, kassir va ofitsiantlarni boshqaring.' : 'Kim kassada, kim ombor va hisobotda ishlashini belgilang.', staff,
        h('div', {}, h('button', { class: 'btn', onclick: addStaff }, icon('plus'), 'Xodim qo’shish'))),
      printersBlock,
      block('Click va Payme', 'Merchant shartnomasi tuzilgach kalitlarni kiriting. Avtomatik to’lov keyingi bosqichda ulanadi, hozircha kassir to’lovni qo’lda belgilaydi.',
        h('div', { class: 'notice' }, icon('info'), h('div', {}, 'Kalitlar bu demo versiyada faqat brauzerda saqlanadi. Haqiqiy tizimda ular serverda shifrlanadi.')),
        h('div', { class: 'form-grid' }, field('Click: Merchant ID', clickId), field('Click: Secret key', clickKey), field('Payme: Merchant ID', paymeId), field('Payme: Key', paymeKey)),
        h('div', {}, h('button', { class: 'btn btn-primary', onclick: saveMerchant }, icon('check'), 'Kalitlarni saqlash'))),
      isRemote() ? block('Telegram xabarnoma', 'Smena yopilganda va mahsulot kam qolganda egaga Telegramdan xabar keladi. Botni @BotFather orqali yarating, Chat ID ni @userinfobot dan oling.',
        h('div', { class: 'form-grid' }, field('Bot token', tgToken), field('Chat ID', tgChat)), tgState, h('div', {}, h('button', { class: 'btn btn-primary', onclick: tgSave }, icon('check'), 'Ulash va sinash'))) : null,
      block('Zaxira nusxa', 'Do’kon bazasini faylga saqlang yoki shu fayldan qayta tiklang.',
        h('div', { class: 'page-actions' }, h('button', { class: 'btn', onclick: backup }, icon('down'), 'Zaxira olish'), h('button', { class: 'btn', onclick: restore }, icon('up'), 'Tiklash'), h('button', { class: 'btn btn-danger', onclick: wipe }, icon('trash'), 'Bazani tozalash'))))));
  renderStaff();
  return { el };
}
