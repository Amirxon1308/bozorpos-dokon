// Telegram xabari: server orqali (token serverda saqlanadi). Demo rejimda hech narsa yubormaydi.
import { isRemote } from './backend.js';

export function notify(ctx, text) {
  if (!isRemote()) return;
  fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(`${nsKey()}:token`)}` }, body: JSON.stringify({ text }) }).catch(() => {});
}
import { nsKey } from './db.js';
