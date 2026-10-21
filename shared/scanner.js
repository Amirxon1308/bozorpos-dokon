// Skaner: telefon kamerasi (BarcodeDetector yoki html5-qrcode) va USB skaner (klaviatura rejimi).
import { h, modal, icon } from './ui.js';

let audioCtx;
export function beep(ok = true) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.frequency.value = ok ? 1040 : 220; o.type = ok ? 'sine' : 'square';
    g.gain.value = 0.07; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (ok ? 0.09 : 0.25));
  } catch { /* ovoz ishlamasa ham davom etamiz */ }
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

function loadLib() {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) return resolve();
    const s = document.createElement('script');
    s.src = new URL('./vendor/html5-qrcode.min.js', import.meta.url).href; // mahalliy nusxa: internet va CDN kerak emas
    s.onload = resolve; s.onerror = () => reject(new Error('Skaner kutubxonasi yuklanmadi'));
    document.head.append(s);
  });
}

/**
 * Kamera skanerini oyna ichida ochadi.
 * onDetect(code) -> true qaytarsa oyna yopiladi (bitta skan), aks holda davom etadi (ketma-ket skan).
 */
export function openCameraScanner({ title = 'Kamera bilan skanerlash', onDetect, continuous = false }) {
  const msg = h('div', { class: 'scanner-msg' }, 'Kamera ishga tushmoqda…');
  const view = h('div', { class: 'scanner-view' }, h('div', { class: 'frame' }), h('div', { class: 'laser' }), msg);
  const manual = h('input', { class: 'input', placeholder: 'Yoki kodni qo’lda kiriting', inputmode: 'numeric' });
  const manualBtn = h('button', { class: 'btn btn-primary', onclick: () => submit(manual.value.trim()) }, 'Qidirish');
  manual.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(manual.value.trim()); });
  let stream = null, stopped = false, rafId = 0, html5 = null, lastCode = '', lastAt = 0;

  // Jonli kamera ochilmasa ham ishlaydi: telefon kamerasi bilan kodni suratga olish.
  const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none', 'aria-label': 'Kodni suratga olish' });
  photo.addEventListener('change', async () => {
    const f = photo.files && photo.files[0];
    if (!f) return;
    msg.textContent = 'Rasm o’qilmoqda…';
    const code = await decodeFile(f);
    photo.value = '';
    if (code) submit(code);
    else { beep(false); msg.textContent = 'Kod topilmadi. Kodga yaqinroq va yorug’roq joyda qayta suratga oling.'; }
  });
  const photoBtn = h('button', { class: 'btn btn-zira btn-lg', type: 'button', onclick: () => photo.click() }, icon('camera'), 'Kodni suratga olish');

  const m = modal({
    title,
    body: [
      view,
      photoBtn, photo,
      h('p', { class: 'hint' }, 'Jonli kamera ochilmasa, “Kodni suratga olish” tugmasi telefon kamerasini ochadi. Kod rasmda aniq va to’liq ko’rinsin.'),
      h('div', { class: 'input-group' }, manual, manualBtn),
    ],
    onClose: () => cleanup(),
  });

  function submit(code) {
    if (!code) return;
    const now = Date.now();
    if (code === lastCode && now - lastAt < 1800) return;
    lastCode = code; lastAt = now;
    const done = onDetect(code);
    if (done || !continuous) m.close();
  }

  async function startNative() {
    const supported = await BarcodeDetector.getSupportedFormats().catch(() => FORMATS);
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) throw new Error('native-yoq');
    const detector = new BarcodeDetector({ formats });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const video = h('video', { playsinline: '', muted: '', autoplay: '' });
    video.srcObject = stream; view.prepend(video); await video.play();
    msg.textContent = 'Kodni ramkaga keltiring';
    const tick = async () => {
      if (stopped) return;
      try {
        const found = await detector.detect(video);
        if (found.length) submit(found[0].rawValue);
      } catch { /* kadr tayyor emas */ }
      rafId = requestAnimationFrame(() => setTimeout(tick, 120));
    };
    tick();
  }

  async function startFallback() {
    await loadLib();
    const id = 'scan-' + Math.random().toString(36).slice(2, 7);
    const box = h('div', { id, style: 'width:100%;height:100%' });
    view.prepend(box);
    html5 = new window.Html5Qrcode(id);
    await html5.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 180 } }, (t) => submit(t), () => {});
    msg.textContent = 'Kodni ramkaga keltiring';
  }

  function cleanupStream() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } view.querySelector('video')?.remove(); }

  function cleanup() {
    stopped = true; cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (html5) { try { const r = html5.stop(); if (r && r.catch) r.catch(() => {}); } catch { /* ishlamayotgan edi */ } }
  }

  (async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Brauzer kamerani bermadi. Sayt HTTPS orqali ochilganini tekshiring.');
      let ok = false;
      if ('BarcodeDetector' in window) { try { await startNative(); ok = true; } catch (e) { if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) throw e; cleanupStream(); } }
      if (!ok) await startFallback();
    } catch (e) {
      view.classList.add('failed');
      const denied = e && e.name === 'NotAllowedError';
      msg.textContent = denied ? 'Kameraga ruxsat berilmadi. Brauzer sozlamalarida (manzil satridagi qulf belgisi) kameraga ruxsat bering yoki pastdagi sariq tugma bilan kodni suratga oling.' : 'Jonli kamera bu yerda ochilmadi. Pastdagi sariq tugma bilan kodni suratga oling yoki kodni kiriting.';
      console.warn('Skaner:', e);
    }
  })();
  return m;
}

async function decodeFile(file) {
  try {
    if ('BarcodeDetector' in window) {
      const bmp = await createImageBitmap(file);
      const sup = await BarcodeDetector.getSupportedFormats().catch(() => FORMATS);
      const found = await new BarcodeDetector({ formats: FORMATS.filter((f) => sup.includes(f)) }).detect(bmp);
      if (found.length) return found[0].rawValue;
    }
  } catch { /* zaxira usulga o'tamiz */ }
  try {
    await loadLib();
    const holder = document.createElement('div');
    holder.id = 'scan-file-' + Math.random().toString(36).slice(2, 7);
    holder.style.display = 'none';
    document.body.append(holder);
    try { return (await new window.Html5Qrcode(holder.id).scanFile(file, false)) || null; } finally { holder.remove(); }
  } catch { return null; }
}

/**
 * USB skaner: klaviatura kabi juda tez yozadi va Enter bosadi.
 * Fokus matn maydonida bo'lmaganda ham kodni ushlab oladi.
 */
export function listenHardwareScanner(onCode) {
  let buf = '', last = 0;
  const handler = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    const now = Date.now();
    if (now - last > 80) buf = '';
    last = now;
    if (e.key === 'Enter') { if (buf.length >= 4) { onCode(buf); e.preventDefault(); } buf = ''; return; }
    if (e.key.length === 1) buf += e.key;
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

export const scanButton = (label, onclick) => h('button', { class: 'btn', onclick, type: 'button' }, icon('camera'), label);
