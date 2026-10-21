import { h, icon, toast, modal, field, confirmBox, uid, dayLabel, emptyState } from './ui.js';
import * as db from './db.js';


export default async function stores(ctx) {
  let all = [];
  const myType = location.pathname.includes('/choyxona') ? 'restoran' : 'dokon';
  const mine = () => all.filter((s) => s.type === myType);
  const list = h('section', { class: 'panel' });

  const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
  async function load() { try { all = await ctx.admin.stores(); } catch (e) { toast(e.message, 'bad'); } render(); }

  function render() {
    list.replaceChildren(
      h('div', { class: 'panel-head' }, h('h2', {}, 'Do’konlar'), h('span', { class: 'pill' }, `${mine().length} ta`)),
      ...(mine().length ? mine().map((s) => {
        const owner = s.owner;
        const blocked = s.status === 'blocked';
        return h('div', { class: 'store-row' },
          h('div', { class: 'sname-col' }, h('div', { class: 'sname' }, s.name), h('div', { class: 't-sub' }, `${db.STORE_TYPES[s.type] || s.type}${s.address ? ' · ' + s.address : ''}`)),
          h('div', { class: 'kv' }, h('small', {}, s.type === 'restoran' ? 'Admin' : 'Ega'), h('b', {}, owner ? owner.name : '—'), h('div', { class: 't-sub' }, owner ? `login: ${owner.login}` : '')),
          h('div', { class: 'kv' }, h('small', {}, 'Baza fayli'), h('span', { class: 'file-tag' }, `${s.id.replace('st_', '')}.db`), h('div', { class: 't-sub' }, kb(s.bytes))),
          h('div', { class: 'kv' }, h('small', {}, 'Holat'), h('span', { class: `pill ${blocked ? 'pill-bad' : 'pill-ok'}` }, h('span', { class: 'dot' }), blocked ? 'bloklangan' : 'faol'), h('div', { class: 't-sub' }, `qo’shilgan ${dayLabel(new Date(s.createdAt || s.created * 1000))}`)),
          h('div', {}, h('button', { class: `btn btn-sm${blocked ? '' : ' btn-danger'}`, onclick: () => toggle(s) }, blocked ? 'Faollashtirish' : 'Bloklash')));
      }) : [emptyState('store', 'Do’kon yo’q', 'Birinchi do’konni qo’shing.')]));
  }

  async function toggle(s) {
    const blocked = s.status === 'blocked';
    if (!blocked && !(await confirmBox('Do’konni bloklash', `«${s.name}» xodimlari tizimga kira olmaydi. Ma’lumotlar o’chmaydi.`, 'Bloklash', 'danger'))) return;
    try { await ctx.admin.setStatus(s.id, blocked ? 'active' : 'blocked'); } catch (e) { toast(e.message, 'bad'); return; } await load(); toast(blocked ? 'Do’kon faollashtirildi' : 'Do’kon bloklandi');
  }

  function add() {
    const name = h('input', { class: 'input', placeholder: 'Masalan: Navro’z Market', required: true });
    
    const address = h('input', { class: 'input', placeholder: 'Manzil (ixtiyoriy)' });
    const ownerName = h('input', { class: 'input', placeholder: 'Ega ismi' });
    const login = h('input', { class: 'input', autocapitalize: 'none', placeholder: 'Kirish logini' });
    const pass = h('input', { class: 'input', type: 'text', placeholder: 'Kamida 6 belgi', autocomplete: 'off' });
    const err = h('div', { class: 'error-text', role: 'alert' });
    modal({
      title: 'Do’kon qo’shish', wide: true,
      body: [h('p', { class: 'muted' }, 'Yangi do’kon yoki choyxona uchun alohida baza yaratiladi. Boshqa do’konlar ma’lumoti bilan aralashmaydi.'),
        h('div', { class: 'form-grid' }, field('Nomi', name), h('div', { class: 'span-2' }, field('Manzil', address)),
          field('Ega ismi', ownerName), field('Login', login), h('div', { class: 'span-2' }, field('Boshlang’ich parol', pass, 'Egaga yetkazing, u keyin o’zgartiradi.'))), err],
      actions: [{ label: 'Bekor qilish' }, { label: 'Do’kon yaratish', kind: 'primary', icon: 'plus', onClick: async () => {
        const lg = login.value.trim().toLowerCase();
        if (!name.value.trim() || !ownerName.value.trim() || !lg) { err.textContent = 'Do’kon nomi, ega ismi va loginni to’ldiring.'; return false; }
        if (pass.value.length < 6) { err.textContent = 'Parol kamida 6 belgidan iborat bo’lsin.'; return false; }
                try { await ctx.admin.addStore({ name: name.value.trim(), type: myType, address: address.value.trim(), owner_name: ownerName.value.trim(), login: lg, password: pass.value }); } catch (e) { err.textContent = e.message; return false; }
        await load(); toast('Yaratildi');
      } }],
    });
  }

  const el = h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Do’konlar'), h('p', {}, 'Har do’kon alohida bazada ishlaydi.')),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus'), 'Do’kon qo’shish'))),
    h('div', { class: 'notice', style: 'margin-bottom:20px' }, icon('lock'), h('div', {}, 'Super-admin do’konlarni qo’shadi va bloklaydi, lekin ularning savdo va mahsulot ma’lumotini ko’ra olmaydi.')),
    list);
  load();
  return { el };
}
