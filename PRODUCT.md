# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — Mahasiswa magang IT (single intern, local).** Uses the dashboard solo on a personal laptop at `http://localhost:4174` (dev: frontend `5173` proxied to `4174`; prod: Vercel). Job-to-be-done each workday during the MagangHub Kemnaker internship: turn today's raw work evidence (Git commits + manual notes about meetings/learning/blockers) into a compliant daily logbook entry (`aktivitas` / `pembelajaran` / `kendala`) that reads like the intern typed it themselves, then store it and export it in the required Excel format. Situation is time-pressured, daily repetition — value is speed, specificity, and human-like Indonesian voice without inventing work that didn't happen.

No multi-intern or mentor-review workflow is in scope per user confirmation. The tool is personal, not a shared team or admin console. Future collaboration or approval flows are explicitly out-of-scope unless re-confirmed.

## Product Purpose

Dashboard lokal untuk **generate, edit, dan kelola Logbook MagangHub Kemnaker** dari commit Git harian memakai Gemini AI — otomatis, dapat diedit sebelum disimpan, dengan riwayat dan pengaturan repo terpusat di browser tanpa edit script.

Why it exists: interns otherwise rewrite the same daily report manually from memory or commit messages alone, which is slow and generic. This product closes the gap between code evidence and the required administrative artifact.

Success means: an intern opens the Generate tab, sees today's commits with expandable diffs, clicks Generate and receives a draft in under ~10s that mentions actual files/features from the diff, edits it inline (with 100–5000 char guardrails), saves it to `logbook.json` and immediately downloads `Logbook_MagangHub.xlsx` in the exact schema MagangHub expects, and can later review/edit/delete via the history timeline or generate a weekly/monthly recap. Daily reminder at 16:00 WIB ensures no day is missed.

## Positioning

**Diff-aware commit + patch → human-like logbook, not commit-message summarization.** Unlike generic AI writing tools or manual templates, this product feeds Gemini the actual code diffs (per-commit file patches, up to 10 commits × 3 files × 3500 chars, 15k total) plus optional manual notes, then merges them into a single coherent narrative. Mechanism neighbors could not truthfully copy:

- Evidence-first prompting: `buildPrompt` / `buildCombinedPrompt` weight the patch block as most accurate source and require specific file/feature mentions.
- Combined mode that fuses objective Git evidence with subjective daily notes (standup, learning, blockers invisible to Git).
- Multi-repo aggregation (up to 5 repos) via `getCombinedDetailed` with per-repo budget splitting.
- Exact MagangHub Excel compliance (columns No/Tanggal/Aktivitas/Pembelajaran/Kendala, navy header `#1F4E78`, wrapText) and dual JSON→Excel pipeline.

## Operating Context

**Workflows & rituals:** Configure `GEMINI_API_KEY` + repo Git (local folder path or GitHub URL, up to 5 labeled repos, private via `GITHUB_TOKEN`) in Pengaturan once → daily: check status pill (`Siap!` / `sudah di-generate` / `belum ada commit` / `repo bermasalah`), review today's commit list with lazy-loaded diff per SHA (`/api/commits/:sha/diff`), generate via three modes (Generate dari Commit, Generate Manual dari deskripsi bebas, Merge & Generate gabungan), edit draft with live char counters, save (`POST /api/entries` + auto `settings cache` + Excel export), manage history timeline with edit/delete modal, generate weekly/monthly/custom recap (`/api/generate-recap`), receive daily 16:00 WIB push (`/api/push-reminder` cron `0 9 * * * UTC`) or local `startDailyLogbookReminder` fallback.

**Environments & tools:** Local Express server (`server.js`, `lib/logbook.js`, `lib/settings.js`, `lib/push.js`, `lib/autoDraft.js`) + React + Vite + TypeScript client (`client/src`) built into `../public` and served via `express.static`. Runs with `npm start` (nodemon watch) locally; deployed serverless on Vercel (rewrites `/api/:path*`, `maxDuration: 60`). Storage is dual-write: `logbook.json` / `logbook-cache.json` / `settings.json` / `repo-cache` (mirror clones) on filesystem, with Upstash Redis KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, keys `maganghub:logbook` etc.) for persistence in Vercel read-only FS; file↔KV auto-migration. Mirror clone (`git clone --mirror`) avoids Windows 260-char path limits and skips working-tree checkout.

**Documents & materials:** `logbook.json` array of `{rowNumber, no, tanggal dd/MM/yyyy, aktivitas, pembelajaran, kendala}`, `Logbook_MagangHub.xlsx`, `settings.json`, `.env` (masked display), `logbook-cache.json`, `push-subscriptions.json`.

## Capabilities and Constraints

**Confirmed capabilities:**
- Git ingestion: local `git log --since="00:00:00"` + `git show` for diffs, or GitHub API via `@octokit/rest` paginated `listCommits` since 00:00 UTC, including file patches, stats, and `getCommitDiff` per SHA.
- Gemini generation: `gemini-1.5-flash` default (allow `gemini-2.0/2.5-flash` variants; `gemini-3.6-flash` auto-fallbacks), 35s API timeout + model fallback, `responseMimeType: application/json`, prompts capped `<9k` chars, validated fields `aktivitas`/`pembelajaran`/`kendala` (manual/combined/recap variants).
- CRUD: `GET/POST /api/entries`, `PUT/DELETE /api/entries/:rowNumber`, `GET /api/entries/export` (ExcelJS buffer), `GET /api/status`, `POST /api/generate`/`generate-manual`/`generate-combined`/`generate-recap`, `GET /api/settings` (masked) + `POST /api/settings`, auto-draft `/api/auto-draft*`, push `/api/push/*`.
- UI: 3 tabs (Generate/Riwayat/Pengaturan) in `client/src/App.tsx` + `views/GenerateView|HistoryView|SettingsView`, status pill, commit expand, Toaster (`sonner`), Radix Dialog/Tabs, Tailwind via PostCSS.
- Notifications: Web Push via `web-push` + VAPID keys + `sw.js`, Vercel cron + `CRON_SECRET`, plus local daily reminder.

**Technical constraints:**
- `GEMINI_API_KEY` required; `GITHUB_TOKEN` with `Contents: Read` for private repos (token may be in URL or env).
- Diff budget 15k chars total; GitHub per-commit fetch timeout 3500ms.
- `express.json({limit:'2mb'})`, Vercel filesystem is ephemeral/tmp-only; KV required for durable prod persistence.
- Excel export and JSON dual-write must remain in sync; `rowNumber` is stable key, `no` is display order.

**Terminology (preserve):** `aktivitas` (150–600 chars ideal), `pembelajaran` (150–600), `kendala` (120–500), `tanggal` (`dd/MM/yyyy`), `repoPath`/`repositories`/`activeRepoId`/`defaultRepoIds`, `GEMINI_MODEL`, `VAPID_*`, `CRON_SECRET`, `REPO_CACHE_DIR`. UI copy is Indonesian.

**Explicitly undecided / out-of-scope:** multi-user auth/roles, mentor approval, pricing/licensing, native mobile wrapper, offline PWA install beyond push SW, formal WCAG conformance target.

## Brand Commitments

Name: **MagangHub** with `LOGBOOK` badge; header brand lockup uses `BookOpen` icon in `bg-primary` rounded-lg + `Inter` sans for UI and `IBM Plex Mono` for code/mono pill (`StatusPill`, commit SHAs, diff). Loaded via Google Fonts in `client/index.html`. `logo-absen.png` / `favicon.svg` assets in `public/`. Voice is locked: **Bahasa Indonesia santai, mengalir, humanis seperti anak magang ngetik sendiri — sopan & profesional, hindari bahasa skripsi kaku** (`Bahwasanya`, `Adapun`, `Telah dilaksanakan`) and avoid repeating the same opener across the three fields. No official Kemnaker/MagangHub color palette or logo system was provided as binding — current `primary`/`muted` Tailwind tokens are implementation detail, not brand law. Preserve name spelling and Indonesian copy; do not invent English rebrand or fake testimonials.

## Evidence on Hand

- **Code & docs:** `README.md`, `README-REACT-MIGRATION.md` (migration spec), `server.js` (666 lines, all `/api/*` contracts), `lib/logbook.js` (prompts + diff logic), `lib/settings.js` (KV + masked display), `client/src/App.tsx` (296 lines) + `views/` + `components/`, `vercel.json` (cron + rewrites), `vite.config.ts` (proxy + `outDir: ../public`), `.env.example` (key list + VAPID generation note).
- **Data & assets:** `logbook.json` + `logbook-cache.json` (runtime), `Logbook_MagangHub.xlsx` sample generated, `repo-cache/` mirror clones, `push-subscriptions.json`, `settings.json`, `public/logo-absen.png` + `favicon.*` + `sw.js`.
- **Configured dependencies:** `express`, `@google/genai` (`@google/genai ^0.3.0`), `@octokit/rest`, `exceljs`, `web-push`, `react ^19`, `tailwindcss ^3`, `radix-ui/*`, `lucide-react`, `vite ^8`.
- **Absences future work must not fabricate:** no real user testimonials, case studies, press, pricing, or official MagangHub design system beyond the app itself; no analytics or auth to co-opt.

## Product Principles

1. **Bukti dulu, cerita kemudian** — diff patch adalah sumber kebenaran; jangan mengarang framework/file yang tidak ada di evidence.
2. **Suara manusia, bukan template** — setiap entri harus terasa diketik intern sendiri: natural, spesifik, bervariasi, dalam batas 100–5000 karakter per field.
3. **Simpan setelah edit, bukan sebelum** — draft selalu dapat diedit sebelum `appendEntry`; jangan auto-save yang mengunci kesalahan AI.
4. **Lokal dulu, cloud sebagai fallback** — filesystem adalah sumber utama lokal; KV hanya menjamin persistensi di Vercel read-only, bukan menggantikan alur lokal.
5. **Satu tugas sehari selesai tuntas** — kurangi langkah harian menjadi: lihat commit → generate → edit → simpan → Excel terunduh, dengan pengingat jam 16:00 WIB sebagai penjaga.

## Accessibility & Inclusion

No product-specific accessibility standard was established during init. As a web dashboard used intermittently on laptop browsers, the product should meet baseline web accessibility (keyboard operability for tabs/modals, sufficient contrast for status pills, Indonesian language `lang="id"`), but no WCAG 2.1 AA audit, screen-reader specialization, or `a11y` remediation is mandated at this stage. Record requirement when a user or regulation defines it.
