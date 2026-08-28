# Logbook MagangHub — Dashboard

Dashboard web lokal untuk tool logbook otomatis kamu: generate ringkasan dari
commit Git harian pakai Gemini AI, edit sebelum disimpan, lihat & kelola
riwayat, dan atur API key — semua dari browser, tanpa perlu edit script.

## Menjalankan

```bash
npm install
npm start
```

Lalu buka **http://localhost:4174**.

## Cara pakai

1. **Pengaturan** — isi `GEMINI_API_KEY` kamu, dan `path repo git` (folder
   lokal atau URL GitHub proyek yang commit-nya mau dibaca). Repo GitHub
   dibaca langsung melalui API, tanpa clone atau fetch.
2. **Generate** — tab ini otomatis menampilkan commit Git hari ini. Klik
   **generate dengan AI** untuk membuat draft aktivitas/pembelajaran/kendala.
   Draft bisa diedit langsung sebelum kamu klik **simpan logbook**.
3. **Riwayat** — semua entri yang sudah tersimpan di `logbook.json`
   muncul di sini sebagai timeline. Klik satu entri untuk mengedit atau
   menghapusnya.

File `logbook.json` dan `logbook-cache.json` dibuat otomatis di folder ini.
Saat menyimpan entri, aplikasi juga langsung mengunduh salinan
`Logbook_MagangHub.xlsx` dari data JSON tersebut.

## Struktur proyek

```
server.js          → Express server + REST API
lib/logbook.js      → logika inti: ambil git log, panggil Gemini, baca/tulis JSON
lib/settings.js      → baca/tulis pengaturan (.env)
public/              → frontend (HTML/CSS/JS polos, tanpa build step)
```

## Catatan

- API key yang kamu simpan lewat tab Pengaturan ditulis ke file `.env` di
  folder ini (dan tidak pernah dikirim balik ke browser dalam bentuk asli —
  hanya ditampilkan disamarkan).
- Untuk repo GitHub privat, isi `GITHUB_TOKEN` di `.env` lokal atau Environment
   Variables Vercel. Token cukup diberi izin `Contents: Read`.
- Saat deploy ke Vercel, filesystem function bersifat sementara. File JSON
   dapat dipakai untuk demo, tetapi data tidak dijamin bertahan setelah
   function dibuat ulang. Untuk data produksi, gunakan storage persisten.
