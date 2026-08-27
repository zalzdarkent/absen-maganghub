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
   proyek yang commit-nya mau dibaca). Kalau dikosongkan, dashboard akan
   membaca commit dari folder dashboard ini sendiri.
2. **Generate** — tab ini otomatis menampilkan commit Git hari ini. Klik
   **generate dengan AI** untuk membuat draft aktivitas/pembelajaran/kendala.
   Draft bisa diedit langsung sebelum kamu klik **simpan ke excel**.
3. **Riwayat** — semua entri yang sudah tersimpan di `Logbook_MagangHub.xlsx`
   muncul di sini sebagai timeline. Klik satu entri untuk mengedit atau
   menghapusnya.

File `Logbook_MagangHub.xlsx` dan `logbook-cache.json` dibuat otomatis di
folder ini, persis seperti script aslinya — jadi kalau kamu sudah punya
kedua file itu dari sebelumnya, tinggal taruh di folder yang sama sebelum
`npm start`.

## Struktur proyek

```
server.js          → Express server + REST API
lib/logbook.js      → logika inti: ambil git log, panggil Gemini, baca/tulis Excel
lib/settings.js      → baca/tulis pengaturan (.env)
public/              → frontend (HTML/CSS/JS polos, tanpa build step)
```

## Catatan

- API key yang kamu simpan lewat tab Pengaturan ditulis ke file `.env` di
  folder ini (dan tidak pernah dikirim balik ke browser dalam bentuk asli —
  hanya ditampilkan disamarkan).
- Tutup dulu `Logbook_MagangHub.xlsx` di Excel/aplikasi lain sebelum
  generate/simpan/edit, kalau tidak penyimpanan akan gagal (file sedang
  dipakai proses lain).
