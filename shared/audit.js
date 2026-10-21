// Harakatlar jurnali: kim, qachon, nima qildi. Chaqirgandan keyin ctx.save() qiling.
import { uid } from './ui.js';

export function audit(ctx, action, detail = '') {
  ctx.data.audit.push({ id: uid('a'), ts: Date.now(), userId: ctx.user.id, userName: ctx.user.name, role: ctx.user.role, action, detail });
  if (ctx.data.audit.length > 3000) ctx.data.audit.splice(0, ctx.data.audit.length - 3000);
}
