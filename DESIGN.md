---
name: MagangHub Logbook
description: Dashboard lokal diff-aware untuk generate, edit, dan kelola logbook harian magang
colors:
  background: "#0d1117"
  foreground: "#e6edf3"
  card: "#131a22"
  panel-alt: "#161f29"
  border: "#24303c"
  muted-foreground: "#8b949e"
  primary: "#3fb950"
  primary-foreground: "#0a1f0e"
  destructive: "#f85149"
  amber: "#d29922"
  blue: "#58a6ff"
  ring: "#58a6ff"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
  mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 32px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: MagangHub Logbook

## Overview

**Creative North Star: "The Developer's Field Journal"**

Sistem visual MagangHub Logbook adalah dark-first, utilitarian, dan evidence-driven — seperti buku catatan lapangan developer yang tinggal di terminal tapi harus lolos audit administratif. Kepribadian: tenang, presisi, tidak berisik; setiap elemen mengutamakan keterbacaan patch/diff dan kecepatan menyelesaikan ritual harian (lihat commit → generate → edit → simpan). Estetika meminjam dari GitHub Dark + Linear: permukaan gelap bertingkat, aksen hijau tunggal yang jarang dipakai, tipografi sans yang bersih untuk UI dan mono yang tegas untuk data. Tidak ada dekorasi kaca, gradient text, atau kartu bertumpuk sebagai struktur halaman.

**Key Characteristics:**
- Dark-first dengan hirarki tonal (bg `#0d1117` → card `#131a22` → panel-alt `#161f29`)
- Satu aksen hijau (`#3fb950`) dipakai hemat untuk status siap & CTA utama
- Tipografi Inter untuk UI, IBM Plex Mono untuk SHA/diff/status
- Kepadatan nyaman (comfortable), bukan minimal atau padat
- Depth dari border & tonal layering, bukan shadow tebal

## Colors

Palet gelap hemat-warna dengan satu aksen konfidensi tinggi.

### Primary
- **Terminal Green** (#3fb950): Aksen utama untuk status "Siap!", primary button, dot ok, dan indikator sukses. Dipakai ≤10% layar agar tetap bermakna.

### Neutral
- **Abyss** (#0d1117): Background global, area diff code, dan header backdrop — warna terdalam untuk fokus.
- **Panel** (#131a22): Card, timeline entry hover, dan permukaan konten utama.
- **Panel Alt** (#161f29): Popover, toast, dan hover state yang sedikit lebih terang dari Panel.
- **Graphite Border** (#24303c): Garis pemisah halus untuk stack, timeline, dan card border — low-contrast tapi terdefinisi.
- **Paper** (#e6edf3): Teks utama/heading — kontras tinggi di atas Abyss.
- **Stone** (#8b949e): Teks sekunder, label meta, dan placeholder — kontras 4.6:1 di atas background.

### Secondary
- **Signal Red** (#f85149): Destructive, error, dan border-left toast error.
- **Caution Amber** (#d29922): Warning — dot warn dan toast warning.
- **Link Blue** (#58a6ff): Aksen interaktif sekunder — toggle diff, link, dan focus ring (`hsl 212 100% 68%`).

### Named Rules
**The One Green Rule.** Hijau primer hanya untuk keberhasilan yang dapat ditindaklanjuti (CTA, status siap, sukses toast). Jangan dipakai untuk dekorasi atau background luas.
**The Tonal Depth Rule.** Depth datang dari perubahan tone + border 1px `#24303c`, bukan shadow berat. Shadow hanya untuk hover yang terangkat.

## Typography

**Display Font:** Inter (with system-ui fallback)
**Body Font:** Inter (with system-ui fallback)
**Label/Mono Font:** IBM Plex Mono (with monospace fallback)

**Character:** Inter memberi suara netral-profesional yang mudah dipindai untuk tugas harian; IBM Plex Mono memberi kredibilitas teknis untuk SHA, diff, counter karakter, dan status pill — pairing utilitarian, bukan editorial.

### Hierarchy
- **Display** (600, 20px–24px, 1.2, tracking -0.02em): Judul halaman "Logbook Hari Ini" dan heading tab — satu per viewport.
- **Title** (600, 15px, 1.3, tracking -0.01em): Brand "MagangHub" + label seksi CardTitle.
- **Body** (400, 13px–14px, 1.6, measure 62–65ch): Deskripsi tugas, preview entri, dan isi draft — nyaman dibaca berulang harian.
- **Label** (500, 11px, 1.4, tracking 0.08em, uppercase atau mono): Badge LOGBOOK, counter karakter, dan meta commit.
- **Mono** (400, 11px–13px, 1.5): SHA, diff code, toast mono, status pill, dan tanggal `dd/MM/yyyy`.

### Named Rules
**The Mono-For-Data Rule.** Mono hanya untuk data/teknis (kode, SHA, tanggal, metrik). Jangan pakai mono sebagai kostum untuk heading.

## Layout

Grid berpusat max `1280px` dengan padding `16px` (mobile) → `24px` (desktop). Header sticky `64px` dengan backdrop-blur, tab pill centered, dan konten utama single-column. Ritme vertikal: group rapat (8–12px) dan antar-seksi lega (24–32px); heading punya lebih banyak ruang di atas daripada di bawah. Timeline riwayat pakai garis vertikal `2px` `#24303c` + dot `10px` dengan border hijau — progressive disclosure via expand, bukan modal. Responsive: tabs jadi icon+label di mobile, grid commit `30px | 1fr`, toast full-width `calc(100% - 32px)`.

## Elevation & Depth

Sistem flat-by-default dengan layered tonality. Tidak ada shadow ambien berat; depth dibuat dari perbedaan lightness antar surface (Abyss → Panel → Panel Alt) + border `1px` Graphite. Shadow hanya sebagai respons state.

### Shadow Vocabulary
- **Card Rest** (`0 1px 2px rgba(0,0,0,0.2)`): Default halus untuk card dan button primary — dari `shadow-sm`.
- **Toast Lift** (`0 8px 24px rgba(0,0,0,0.45)`): Toast yang mengambang di atas konten.
- **Focus Ring** (`0 0 0 2px hsl(var(--ring))`): Cincin fokus keyboard — bukan shadow dekoratif.

### Named Rules
**The Flat-By-Default Rule.** Permukaan datar saat idle; shadow muncul hanya saat hover/elevasi/focus, bukan sebagai hiasan permanen.

## Shapes

Bahasa bentuk lembut-modern, bukan neubrutalist atau organik berlebihan. Radius `12px` (`lg`/`--radius 0.75rem`) untuk card/Dialog — ramah tapi tetap profesional. Button `8px` (`md`), input `8px`, badge/pill `9999px`. Border `1px` `#24303c` konsisten di semua kontainer. Tidak ada mask geometris atau clipping foto; grid halus radial (`bg-grid`) hanya sebagai tekstur header `opacity 0.03`.

## Components

### Buttons
- **Shape:** rounded-md (8px) default; sm 6px, lg 8px, pill penuh untuk ikon
- **Primary:** `bg-primary` (#3fb950) teks `primary-foreground` gelap, `shadow-sm`, `hover:bg-primary/90`, focus ring 2px `ring`
- **Hover / Focus:** transisi warna 150ms, focus `ring-offset-2 ring-offset-background`
- **Secondary / Outline / Ghost:** Secondary `bg-secondary` (#131a22 tone), Outline `border-input bg-background hover:bg-accent`, Ghost `hover:bg-accent`, Link `text-primary underline-offset-4`
- **Sizes:** default `h-9 px-4`, sm `h-8 px-3`, lg `h-10 px-8`, icon `h-9 w-9`

### Cards / Containers
- **Corner Style:** rounded-xl (12–16px)
- **Background:** `bg-card` (#131a22) teks `card-foreground` (#e6edf3)
- **Shadow Strategy:** `shadow-sm` flat, naik ke `shadow-md` saat hover jika diperlukan
- **Border:** `1px solid #24303c`
- **Internal Padding:** `p-6` header/content, `p-6 pt-0` content, `p-4` compact

### Inputs / Fields
- **Style:** `bg-background` border `input` (#24303c) `rounded-md`, teks `foreground`, placeholder `muted-foreground` 4.5:1
- **Focus:** `ring-2 ring-ring ring-offset-2` biru Link, tanpa glow menyebar
- **Error / Disabled:** destructive `text-destructive` + border merah, disabled `opacity-50 pointer-events-none`

### Navigation
- **Header:** sticky `top-0 z-30 border-b bg-background/70 backdrop-blur-xl`, height 64px, brand `BookOpen` 36px `bg-primary rounded-lg ring-1 ring-primary/20`
- **Tabs:** pill `inline-flex bg-muted p-1 rounded-full`, item `rounded-full px-3.5 py-1.5 text-sm font-medium`, active `bg-background text-foreground shadow-sm ring-1 ring-border`, inactive `text-muted-foreground hover:text-foreground`
- **Mobile:** tab jadi icon 14px + label 13px, header mono kecil `logbook@maganghub`

### Chips
- **Style:** Badge `rounded-full border bg-card`, varian success/warning/destructive/secondary via `StatusPill`, dot `h-2 w-2 rounded-full` dengan shadow hijau untuk ok

### Toasts
- **Style:** `bg-panel-alt` (#161f29) `border #24303c` `rounded 10px` `border-left 4px` warna status, mono 13px
- **State:** success amber/blue destructive sesuai `border-left-color`, anim `toastIn` cubic-bezier(0.16,1,0.3,1) 0.32s

## Do's and Don'ts

### Do:
- **Do** pakai hijau primer hanya untuk aksi/keberhasilan utama — hemat adalah poinnya.
- **Do** jaga kontras teks sekunder Stone (#8b949e) pada Abyss — jangan abu-abu netral yang turun dari hue.
- **Do** pakai IBM Plex Mono untuk SHA, diff, dan tanggal — data butuh mono.
- **Do** beri lebih banyak ruang di atas heading daripada di bawahnya; kelompok rapat, antar-seksi lega.
- **Do** pertahankan backdrop-blur header dan grid halus sebagai tekstur, bukan dekorasi dominan.

### Don't:
- **Don't** pakai gradient text, kaca/blur dekoratif, atau border-left tebal >1px pada card.
- **Don't** pakai kartu ukuran sama berisi icon+heading+teks sebagai struktur halaman — kartu adalah kontainer malas.
- **Don't** tambahkan kicker/eyebrow di atas heading — heading membawa bobotnya sendiri.
- **Don't** pakai bayangan offset keras 4px atau monospace sebagai kostum teknis untuk heading non-data.
- **Don't** ganti voice Indonesia humanis ("santai mengalir seperti anak magang ngetik") dengan bahasa skripsi kaku.
