# BozorPOS Do'kon

Oziq-ovqat do'koni: kassa, shtrix-kod/QR skaner, kirim, ombor, hisobot.

Bu mustaqil paket: boshqa ilova (u alohida paket) bilan hech narsa baham ko'rilmaydi.

## Tarkibi
- `dokon/`: ilova (HTML/JS, qurish shart emas)
- `shared/`: umumiy qobiq va komponentlar
- `server/`: FastAPI serveri (sinxronlash, foydalanuvchilar). Faqat shu turdagi do'konlarni qabul qiladi.

## Demo (serversiz)
Papkani istalgan statik hostingga yuklang (Netlify, GitHub Pages). Ma'lumot brauzerda saqlanadi. Demo kirish: ega / ega123 (demo).

## To'liq tizim (server bilan)
```
docker build -t bozorpos-dokon .
docker run -p 8000:8000 -v bpos-data:/data -e BPOS_ADMIN_PASSWORD=KUCHLI_PAROL bozorpos-dokon
```
Railway: repo'ni ulang, **Volume** ni `/data` ga biriktiring, `BPOS_ADMIN_PASSWORD` o'zgaruvchisini kiriting. Super-admin login: `admin`.
Kamera (skaner) faqat HTTPS orqali ishlaydi.
