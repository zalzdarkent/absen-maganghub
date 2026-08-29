# Migrasi Frontend ke React + Vite + TypeScript

Frontend lama (`public/index.html` + `public/app.js` vanilla JS) sudah diganti
dengan aplikasi React + Vite + TypeScript di folder `client/`. Backend Express
(`server.js`, `lib/`) **tidak diubah sama sekali** — semua endpoint `/api/...`
tetap sama persis, jadi kontrak API-nya identik dengan sebelumnya.

## Struktur baru

```
client/                  <- app React + Vite + TS
  src/
    types/                <- tipe TypeScript untuk semua response API
    lib/api.ts             <- fetch wrapper (timeout 35s, error handling)
    context/ToastContext.tsx  <- sistem toast (pengganti showToast())
    components/           <- CommitLog, Tabs, StatusPill, kedua modal
    views/                <- GenerateView, HistoryView, SettingsView
    App.tsx, main.tsx
  vite.config.ts          <- proxy /api -> localhost:4174 saat dev,
                             build output diarahkan ke ../public
server.js, lib/           <- backend Express, tidak berubah
public/                   <- sekarang berisi HASIL BUILD React (jangan edit manual)
```

## Menjalankan saat development

Jalankan backend dan frontend di dua terminal terpisah:

```bash
# terminal 1 — backend (port 4174)
npm install
npm start

# terminal 2 — frontend dev server (port 5173, hot reload)
cd client
npm install
npm run dev
```

Buka `http://localhost:5173`. Semua request ke `/api/*` otomatis di-proxy ke
`http://localhost:4174` (diatur di `client/vite.config.ts`), jadi tidak perlu
CORS setup apa pun.

## Build untuk production

```bash
cd client
npm run build
```

Ini menjalankan `tsc -b && vite build`, dan hasilnya (JS/CSS/HTML) langsung
ditulis ke `../public` (menimpa isi lama). Setelah itu jalankan seperti biasa:

```bash
npm start
```

`server.js` sudah `express.static('public')`, jadi otomatis menyajikan build
React yang baru tanpa perlu perubahan kode backend.

## Yang dipertahankan 1:1 dari versi lama

- 3 tab: generate, riwayat, pengaturan
- Status pill (dot ok/warn/err) berdasarkan `/api/status`
- Panel commit hari ini + expand diff per commit (termasuk lazy-load diff via
  `/api/commits/:sha/diff`)
- Draft form dengan character counter (min 100, maks 5000) per field
- Tombol "Generate dari Commit" dan modal "Merge & Generate ✨" (gabung commit
  + catatan manual)
- Simpan draft → `POST /api/entries` lalu auto-download Excel
- Riwayat sebagai timeline + modal edit/hapus entri
- Form pengaturan repo GitHub
- Sistem toast (success/error/warning/info) dengan progress bar & auto-dismiss
- Tailwind styling (sekarang dikompilasi lewat PostCSS, bukan CDN `@tailwindcss/browser`)

## Catatan

- Font Inter & IBM Plex Mono tetap dimuat dari Google Fonts di `client/index.html`.
- CSS yang sifatnya non-utility (animasi toast, garis timeline, warna diff)
  dipindah ke `client/src/index.css` sebagai custom CSS, karena lebih rapi
  dibanding di-inline sebagai Tailwind arbitrary values.
