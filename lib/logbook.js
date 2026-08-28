import { GoogleGenAI } from '@google/genai';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import ExcelJS from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readEnvFile } from './settings.js';

const PRIMARY_LOGBOOK_PATH = path.join(process.cwd(), 'logbook.json');
const PRIMARY_CACHE_PATH = path.join(process.cwd(), 'logbook-cache.json');
const PRIMARY_REPO_CACHE_DIR = path.join(process.cwd(), 'repo-cache');
const FALLBACK_LOGBOOK_PATH = path.join(os.tmpdir(), 'absen-maganghub-logbook.json');
const FALLBACK_CACHE_PATH = path.join(os.tmpdir(), 'absen-maganghub-logbook-cache.json');
const FALLBACK_REPO_CACHE_DIR = path.join(os.tmpdir(), 'absen-maganghub-repo-cache');
// Keep old names as alias for primary (backwards compat)
const LOGBOOK_FILE_PATH = PRIMARY_LOGBOOK_PATH;
const CACHE_FILE_PATH = PRIMARY_CACHE_PATH;
const REPO_CACHE_DIR = PRIMARY_REPO_CACHE_DIR;

function isReadOnlyError(error) {
    const code = error && error.code ? String(error.code) : '';
    const msg = String(error && error.message || '');
    return code === 'EROFS' || code === 'EACCES' || code === 'EPERM' || msg.includes('read-only') || msg.includes('EROFS');
}

function getLogbookReadPath() {
    const candidates = [FALLBACK_LOGBOOK_PATH, PRIMARY_LOGBOOK_PATH].filter(p => fs.existsSync(p));
    if (candidates.length === 0) return PRIMARY_LOGBOOK_PATH;
    if (candidates.length === 1) return candidates[0];
    try {
        const t0 = fs.statSync(candidates[0]).mtimeMs;
        const t1 = fs.statSync(candidates[1]).mtimeMs;
        return t0 > t1 ? candidates[0] : candidates[1];
    } catch { return candidates[0]; }
}

function getCacheReadPath() {
    const candidates = [FALLBACK_CACHE_PATH, PRIMARY_CACHE_PATH].filter(p => fs.existsSync(p));
    if (candidates.length === 0) return PRIMARY_CACHE_PATH;
    if (candidates.length === 1) return candidates[0];
    try {
        const t0 = fs.statSync(candidates[0]).mtimeMs;
        const t1 = fs.statSync(candidates[1]).mtimeMs;
        return t0 > t1 ? candidates[0] : candidates[1];
    } catch { return candidates[0]; }
}

function getRepoCacheBaseDir() {
    try {
        fs.mkdirSync(PRIMARY_REPO_CACHE_DIR, { recursive: true });
        const probe = path.join(PRIMARY_REPO_CACHE_DIR, '.probe');
        try { fs.writeFileSync(probe, 'ok', 'utf-8'); fs.unlinkSync(probe); return PRIMARY_REPO_CACHE_DIR; } catch (e) { if (isReadOnlyError(e)) return FALLBACK_REPO_CACHE_DIR; throw e; }
    } catch (e) {
        if (isReadOnlyError(e)) {
            try { fs.mkdirSync(FALLBACK_REPO_CACHE_DIR, { recursive: true }); } catch {}
            return FALLBACK_REPO_CACHE_DIR;
        }
        try { fs.mkdirSync(FALLBACK_REPO_CACHE_DIR, { recursive: true }); } catch {}
        return FALLBACK_REPO_CACHE_DIR;
    }
}

function isRemoteUrl(value) {
    return /^(https?:\/\/|git@)/i.test(value) || value.endsWith('.git');
}

function parseGitHubRepo(value) {
    const rawValue = String(value || '').trim();
    const normalized = rawValue
        .replace(/^git@github\.com:/i, 'https://github.com/')
        .replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/');
    const match = normalized.match(/^https?:\/\/(?:[^/@]+(?::[^/@]*)?@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (!match) return null;

    let authToken;
    try {
        const url = new URL(normalized);
        authToken = url.password || url.username || undefined;
    } catch {
        authToken = undefined;
    }
    return { owner: match[1], repo: match[2], authToken };
}

function slugForUrl(url) {
    let s = url.replace(/^https?:\/\//i, '').replace(/^git@/i, '');
    const atIdx = s.indexOf('@');
    if (atIdx !== -1 && s.slice(0, atIdx).includes(':')) {
        s = s.slice(atIdx + 1);
    }
    s = s.replace(/\.git$/i, '');
    return s.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

/**
 * REPO_PATH can be either a local folder or a git remote URL (https/ssh).
 * When it's a URL, we keep a local **mirror clone** under ./repo-cache and
 * fetch the latest refs before reading logs. A mirror clone has no working
 * tree at all — git only stores its internal objects (SHA-named, never the
 * original file paths) — so it never checks out any files onto disk. That
 * sidesteps Windows' 260-char path limit entirely, which a normal clone can
 * hit on repos with long nested filenames (e.g. Laravel migrations), and
 * it's faster since no files get extracted. `git log` reads commit history
 * straight from the mirror, so nothing else about reading logs changes.
 */
function resolveRepoDir(repoPathOrUrl) {
    if (!repoPathOrUrl) return process.cwd();
    if (!isRemoteUrl(repoPathOrUrl)) return repoPathOrUrl;

    const baseDir = getRepoCacheBaseDir();
    const localDir = path.join(baseDir, slugForUrl(repoPathOrUrl));
    try { fs.mkdirSync(baseDir, { recursive: true }); } catch (e) { if (!isReadOnlyError(e)) throw e; }

    const isExistingMirror = fs.existsSync(path.join(localDir, 'HEAD')) && fs.existsSync(path.join(localDir, 'objects'));
    if (isExistingMirror) {
        execSync('git fetch --quiet --prune', { cwd: localDir });
    } else {
        fs.rmSync(localDir, { recursive: true, force: true });
        execSync(`git clone --quiet --mirror "${repoPathOrUrl}" "${localDir}"`);
    }
    return localDir;
}

async function getTodayGitLogs(repoPathOrUrl) {
    try {
        if (repoPathOrUrl && !isRemoteUrl(repoPathOrUrl) && !fs.existsSync(repoPathOrUrl)) {
            throw new Error(`Folder repo "${repoPathOrUrl}" tidak ditemukan. Periksa path repo di Pengaturan.`);
        }
        const githubRepo = parseGitHubRepo(repoPathOrUrl);
        if (githubRepo) {
            const env = { ...readEnvFile(), ...process.env };
            const octokit = new Octokit(env.GITHUB_TOKEN || githubRepo.authToken ? {
                auth: env.GITHUB_TOKEN || githubRepo.authToken,
            } : {});
            const since = new Date();
            since.setUTCHours(0, 0, 0, 0);
            const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
                ...githubRepo,
                since: since.toISOString(),
                until: new Date().toISOString(),
                per_page: 100,
            });
            return commits
                .map((item) => `- ${item.commit.message.split('\n')[0]} (${item.author?.login || item.commit.author?.name || 'unknown'})`)
                .join('\n');
        }
        const repoDir = resolveRepoDir(repoPathOrUrl);
        const gitCommand = 'git log --all --since="00:00:00" --pretty=format:"- %s (%an)"';
        return execSync(gitCommand, { encoding: 'utf-8', cwd: repoDir }).trim();
    } catch (error) {
        const detail = error.message || '';
        if (detail.includes('not a git repository')) {
            throw new Error('Folder repo yang dipilih bukan repository Git. Periksa path repo di Pengaturan.');
        }
        if (detail.includes('Authentication failed') || detail.includes('Repository not found') || detail.includes('Could not read from remote repository')) {
            throw new Error('Repo Git tidak bisa diakses. Periksa URL repo dan akses/authentication-nya di Pengaturan.');
        }
        if (error.status === 401 || error.status === 403 || error.status === 404) {
            throw new Error('Repo GitHub tidak ditemukan atau tidak bisa diakses. Jika repo privat, isi GITHUB_TOKEN dengan izin Contents: Read.');
        }
        if (detail.includes('not recognized') || detail.includes('ENOENT')) {
            throw new Error('Git tidak ditemukan di komputer ini. Install Git lalu jalankan ulang aplikasi.');
        }
        throw new Error(`Repo Git bermasalah: ${detail}`);
    }
}

// ---------------------------------------------------------------------------
// NEW: Detailed commits with diffs (for more accurate Gemini summary)
// ---------------------------------------------------------------------------

function truncate(text, max) {
    const s = String(text || '');
    if (s.length <= max) return s;
    return s.slice(0, max) + '\n... (truncated)';
}

/**
 * Ambil daftar commit hari ini dengan file list + patch diff (GitHub API atau git lokal).
 * Digunakan untuk: 1) Tampilan UI "lihat diff per commit" 2) Prompt Gemini yang lebih akurat.
 * opts: maxCommits (default 8), maxCharsPerDiff (1200), maxTotalChars (9000), maxFilesPerCommit (3)
 */
async function getTodayCommitsWithDiff(repoPathOrUrl, opts = {}) {
    const {
        maxCommits = 8,
        maxCharsPerDiff = 1200,
        maxTotalChars = 9000,
        maxFilesPerCommit = 3,
        timeoutMsPerCommit = 3500,
    } = opts;

    const githubRepo = parseGitHubRepo(repoPathOrUrl);
    if (githubRepo) {
        const env = { ...readEnvFile(), ...process.env };
        const octokit = new Octokit(env.GITHUB_TOKEN || githubRepo.authToken ? { auth: env.GITHUB_TOKEN || githubRepo.authToken } : {});
        const since = new Date(); since.setUTCHours(0, 0, 0, 0);
        const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
            ...githubRepo,
            since: since.toISOString(),
            until: new Date().toISOString(),
            per_page: 100,
        });
        if (commits.length === 0) return [];
        const toFetch = commits.slice(0, maxCommits);
        // Fetch diffs concurrently with timeout
        const results = await Promise.all(toFetch.map(async (c) => {
            const base = {
                sha: c.sha,
                shortSha: c.sha.slice(0, 7),
                message: c.commit.message.split('\n')[0],
                author: c.author?.login || c.commit.author?.name || 'unknown',
                date: c.commit.author?.date || c.commit.committer?.date || new Date().toISOString(),
                url: c.html_url,
                files: [],
                stats: '',
                patch: '',
            };
            try {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), timeoutMsPerCommit);
                const detail = await octokit.rest.repos.getCommit({
                    owner: githubRepo.owner,
                    repo: githubRepo.repo,
                    ref: c.sha,
                    // signal not supported in older octokit, fallback to normal
                });
                clearTimeout(t);
                const files = detail.data.files || [];
                base.files = files.map(f => ({
                    filename: f.filename,
                    status: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                    patch: f.patch ? truncate(f.patch, maxCharsPerDiff) : '',
                }));
                base.stats = files.map(f => `${f.filename} (+${f.additions}/-${f.deletions} ${f.status})`).join(', ');
                // Build combined patch for prompt
                let combined = files.slice(0, maxFilesPerCommit).map(f => {
                    const header = `--- ${f.filename} [${f.status} +${f.additions}/-${f.deletions}]`;
                    const p = f.patch ? truncate(f.patch, maxCharsPerDiff) : '(no patch - binary or large)';
                    return `${header}\n${p}`;
                }).join('\n\n');
                if (files.length > maxFilesPerCommit) combined += `\n... +${files.length - maxFilesPerCommit} file lagi`;
                base.patch = combined.slice(0, maxCharsPerDiff * maxFilesPerCommit);
            } catch (e) {
                base.stats = `(gagal ambil diff: ${String(e.message).slice(0, 80)})`;
                base.patch = '';
            }
            return base;
        }));
        return results;
    } else {
        // Local git
        const repoDir = resolveRepoDir(repoPathOrUrl);
        if (repoPathOrUrl && !isRemoteUrl(repoPathOrUrl) && !fs.existsSync(repoPathOrUrl)) {
            throw new Error(`Folder repo "${repoPathOrUrl}" tidak ditemukan.`);
        }
        try {
            if (!fs.existsSync(path.join(repoDir, '.git')) && !fs.existsSync(path.join(repoDir, 'HEAD'))) {
                // Not a git dir inside mirror? try cwd check
                // exec will throw if not git repo, handled below
            }
        } catch {}
        try {
            // Get commit list: sha, subject, author, date
            const logFormat = '%H%x1f%s%x1f%an%x1f%aI%x1e';
            let logOutput = '';
            try {
                logOutput = execSync(`git log --all --since="00:00:00" --pretty=format:"${logFormat}" --reverse`, { encoding: 'utf-8', cwd: repoDir, maxBuffer: 5 * 1024 * 1024 }).trim();
            } catch (e) {
                // Fallback simple log
                logOutput = execSync('git log --all --since="00:00:00" --pretty=format:"%H%x1f%s%x1f%an%x1f%aI%x1e"', { encoding: 'utf-8', cwd: repoDir }).trim();
            }
            if (!logOutput) return [];
            const raw = logOutput.split('\x1e').filter(Boolean);
            const commits = raw.map(line => {
                const [sha, msg, author, date] = line.split('\x1f');
                return { sha: sha?.trim(), message: (msg || '').trim(), author: (author || 'unknown').trim(), date: (date || '').trim(), url: '', files: [], stats: '', patch: '' };
            }).filter(c => c.sha);
            if (commits.length === 0) return [];
            const toFetch = commits.slice(-maxCommits).reverse(); // newest first, limit
            const detailed = toFetch.map(c => {
                try {
                    // stat
                    let stat = '';
                    try {
                        stat = execSync(`git show --stat --pretty=format:"" ${c.sha}`, { encoding: 'utf-8', cwd: repoDir, maxBuffer: 2 * 1024 * 1024 }).trim().slice(0, 600);
                    } catch {}
                    // numstat for files
                    let files = [];
                    try {
                        const numstat = execSync(`git show --numstat --pretty=format:"" ${c.sha}`, { encoding: 'utf-8', cwd: repoDir }).trim();
                        files = numstat.split('\n').filter(Boolean).slice(0, maxFilesPerCommit).map(l => {
                            const [add, del, file] = l.split('\t');
                            return { filename: file, status: 'modified', additions: Number(add) || 0, deletions: Number(del) || 0, patch: '' };
                        });
                        c.files = files;
                        c.stats = files.map(f => `${f.filename} (+${f.additions}/-${f.deletions})`).join(', ') || stat.split('\n').slice(-1)[0] || '';
                    } catch {}
                    let patch = '';
                    try {
                        patch = execSync(`git show --patch -U1 --pretty=format:"" ${c.sha}`, { encoding: 'utf-8', cwd: repoDir, maxBuffer: 2 * 1024 * 1024 }).trim();
                        patch = truncate(patch, maxCharsPerDiff * maxFilesPerCommit);
                    } catch {}
                    c.patch = patch;
                    c.stats = c.stats || stat.slice(0, 300);
                    return c;
                } catch (e) {
                    c.stats = `(gagal diff)`;
                    return c;
                }
            });
            return detailed;
        } catch (error) {
            const detail = String(error.message || '');
            if (detail.includes('not a git repository')) throw new Error('Folder repo bukan repository Git.');
            throw error;
        }
    }
}

async function getTodayGitLogsDetailed(repoPathOrUrl, opts = {}) {
    const { maxTotalChars = 9000 } = opts;
    const commits = await getTodayCommitsWithDiff(repoPathOrUrl, opts);
    if (commits.length === 0) return { logs: '', detailed: '', commits: [] };
    const logs = commits.map(c => `- ${c.message} (${c.author})`).join('\n');
    // Build detailed string for prompt
    let detailed = `RINGKASAN COMMIT (${commits.length} commit hari ini):\n${logs}\n\nDETAIL DIFF PER COMMIT:\n`;
    const parts = commits.map((c, idx) => {
        const header = `### ${idx + 1}. ${c.message} (${c.author}) [${c.shortSha || c.sha.slice(0,7)}]`;
        const filesLine = c.stats ? `Files: ${c.stats}` : `Files: ${(c.files||[]).map(f=>f.filename).join(', ') || '-'}`;
        const patchBlock = c.patch ? `Diff:\n${c.patch}` : 'Diff: (tidak tersedia)';
        return `${header}\n${filesLine}\n${patchBlock}`;
    });
    detailed += parts.join('\n\n---\n\n');
    if (detailed.length > maxTotalChars) detailed = detailed.slice(0, maxTotalChars) + '\n... (diff dipotong, total terlalu panjang)';
    return { logs, detailed, commits };
}

async function getCommitDiff(repoPathOrUrl, sha, opts = {}) {
    const { maxChars = 4000 } = opts;
    const githubRepo = parseGitHubRepo(repoPathOrUrl);
    if (githubRepo) {
        const env = { ...readEnvFile(), ...process.env };
        const octokit = new Octokit(env.GITHUB_TOKEN || githubRepo.authToken ? { auth: env.GITHUB_TOKEN || githubRepo.authToken } : {});
        const detail = await octokit.rest.repos.getCommit({ owner: githubRepo.owner, repo: githubRepo.repo, ref: sha });
        const files = detail.data.files || [];
        const combined = files.map(f => `--- ${f.filename} [${f.status} +${f.additions}/-${f.deletions}]\n${truncate(f.patch || '', maxChars)}`).join('\n\n');
        return { sha, message: detail.data.commit.message.split('\n')[0], files, patch: combined };
    } else {
        const repoDir = resolveRepoDir(repoPathOrUrl);
        const stat = execSync(`git show --stat --pretty=format:"" ${sha}`, { encoding: 'utf-8', cwd: repoDir }).trim();
        const patch = execSync(`git show --patch -U1 --pretty=format:"" ${sha}`, { encoding: 'utf-8', cwd: repoDir, maxBuffer: 3*1024*1024 }).trim().slice(0, maxChars);
        return { sha, patch: `${stat}\n\n${patch}` };
    }
}

function getCache() {
    const p = getCacheReadPath();
    if (fs.existsSync(p)) {
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch {
            return { lastDate: '', lastLogs: '' };
        }
    }
    const alt = p === PRIMARY_CACHE_PATH ? FALLBACK_CACHE_PATH : PRIMARY_CACHE_PATH;
    if (fs.existsSync(alt)) {
        try { return JSON.parse(fs.readFileSync(alt, 'utf-8')); } catch { return { lastDate: '', lastLogs: '' }; }
    }
    return { lastDate: '', lastLogs: '' };
}

function saveCache(todayDate, gitLogs) {
    const data = JSON.stringify({ lastDate: todayDate, lastLogs: gitLogs, updatedAt: new Date().toISOString() }, null, 2);
    const tryPaths = [PRIMARY_CACHE_PATH, FALLBACK_CACHE_PATH];
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            return;
        } catch (e) {
            if (isReadOnlyError(e)) continue;
            throw e;
        }
    }
    try { fs.writeFileSync(FALLBACK_CACHE_PATH, data, 'utf-8'); } catch {}
}

function readLogbookFile() {
    const existing = [FALLBACK_LOGBOOK_PATH, PRIMARY_LOGBOOK_PATH].filter(p => fs.existsSync(p));
    if (existing.length === 0) return [];
    existing.sort((a, b) => {
        try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
    });
    for (const p of existing) {
        try {
            const entries = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (!Array.isArray(entries)) throw new Error('format bukan array');
            return entries;
        } catch (e) {
            if (String(e.message).includes('tidak valid')) throw e;
            throw new Error('File logbook.json tidak valid. Perbaiki atau hapus file tersebut lalu coba lagi.');
        }
    }
    return [];
}

function writeLogbookFile(entries) {
    const data = JSON.stringify(entries, null, 2) + '\n';
    const tryPaths = [PRIMARY_LOGBOOK_PATH, FALLBACK_LOGBOOK_PATH];
    let lastErr = null;
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            return;
        } catch (e) {
            if (isReadOnlyError(e)) { lastErr = e; continue; }
            throw e;
        }
    }
    if (lastErr && isReadOnlyError(lastErr)) {
        throw new Error(`Gagal menyimpan logbook.json: filesystem read-only (Vercel). Data hanya tersimpan sementara di /tmp dan akan hilang saat restart. Untuk data persisten gunakan storage permanen. Detail: ${lastErr.message}`);
    }
}

async function readEntries() {
    return readLogbookFile().slice().reverse(); // newest first for the UI
}

async function appendEntry(entry, tanggalDisplay) {
    const entries = readLogbookFile();
    const nextRowNumber = entries.reduce((max, item) => Math.max(max, Number(item.rowNumber) || 0), 0) + 1;
    entries.push({
        rowNumber: nextRowNumber,
        no: entries.length + 1,
        tanggal: tanggalDisplay,
        aktivitas: entry.aktivitas,
        pembelajaran: entry.pembelajaran,
        kendala: entry.kendala,
    });
    writeLogbookFile(entries);
    return nextRowNumber;
}

async function updateEntry(rowNumber, entry) {
    const entries = readLogbookFile();
    const index = entries.findIndex((item) => item.rowNumber === rowNumber);
    if (index === -1) throw new Error('Entri tidak ditemukan');
    entries[index] = { ...entries[index], ...entry, rowNumber };
    writeLogbookFile(entries);
}

async function deleteEntry(rowNumber) {
    const entries = readLogbookFile();
    const filtered = entries.filter((item) => item.rowNumber !== rowNumber);
    if (filtered.length === entries.length) throw new Error('Entri tidak ditemukan');
    filtered.forEach((item, index) => { item.no = index + 1; });
    writeLogbookFile(filtered);
}

async function createExcelExport() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Logbook Harian');
    const columns = [
        { header: 'No', key: 'no', width: 8 },
        { header: 'Tanggal', key: 'tanggal', width: 15 },
        { header: 'Aktivitas Hari Ini', key: 'aktivitas', width: 45 },
        { header: 'Pembelajaran yang Didapat', key: 'pembelajaran', width: 45 },
        { header: 'Kendala', key: 'kendala', width: 45 },
    ];
    worksheet.columns = columns;
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    readLogbookFile().forEach((entry, index) => {
        const row = worksheet.addRow({
            no: index + 1,
            tanggal: entry.tanggal,
            aktivitas: entry.aktivitas,
            pembelajaran: entry.pembelajaran,
            kendala: entry.kendala,
        });
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            };
            cell.alignment = { wrapText: true, vertical: 'top' };
        });
    });
    return workbook.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Prompt engineering — fine-tuned for MagangHub logbook (DIFF-AWARE)
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gemini-3.6-flash';
const VALID_MODELS = new Set([
    'gemini-3.6-flash',
    'gemini-3.6-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
]);

function normalizeModel(raw) {
    const m = String(raw || '').trim();
    if (!m) return DEFAULT_MODEL;
    if (VALID_MODELS.has(m)) return m;
    if (m.startsWith('gemini-')) return m;
    return DEFAULT_MODEL;
}

function buildPrompt(gitLogs, diffSection = '') {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const diffBlock = diffSection && String(diffSection).trim()
        ? `\nDETAIL DIFF (file yang diubah + patch ringkas — ini bukti paling akurat, jangan diabaikan):\n${String(diffSection).slice(0, 9000)}\n`
        : '';
    return `Kamu adalah asisten penulisan logbook magang IT harian untuk platform MagangHub Kemnaker.

KONTEKS:
- Hari: ${today}
- Peran penulis: mahasiswa magang IT (fullstack / backend / frontend — sesuaikan dari commit + diff)
- Tujuan: laporan harian yang terlihat dikerjakan manusia, natural, tidak seperti template AI.

DATA COMMIT HARI INI:
${gitLogs}
${diffBlock}
TUGAS:
Berdasarkan commit + diff di atas, buat 3 paragraf untuk logbook. Balas HANYA JSON valid tanpa markdown, tanpa penjelasan tambahan:

{
  "aktivitas": "paragraf 150-600 karakter, ceritakan apa yang dikerjakan hari ini berdasarkan commit & diff. Sebutkan file/fitur/bug yang relevan secara natural (contoh: \"memperbaiki validasi di StockMonitoringController.php\", \"menambah kolom di dashboard TV2\"). Urutkan kronologis.",
  "pembelajaran": "paragraf 150-600 karakter, insight/skill baru dari pengerjaan di atas. Kaitkan dengan konsep teknis yang terlihat di diff (misal: state management, query optimization, git workflow) pakai bahasa ringan.",
  "kendala": "paragraf 120-500 karakter, kendala yang mungkin muncul dari jenis pekerjaan di atas + solusi singkat. Jika commit terlihat lancar, tulis 'Tidak ada kendala berarti hari ini' lalu tambahkan antisipasi."
}

ATURAN GAYA BAHASA (WAJIB):
- Bahasa Indonesia santai, mengalir, humanis seperti anak magang ngetik sendiri. Tetap sopan & profesional.
- HINDARI bahasa skripsi/kaku: "Bahwasanya", "Adapun", "Telah dilaksanakan", "Pada kesempatan kali ini".
- HINDARI pengulangan frasa yang sama di ketiga field. Variasikan kalimat pembuka.
- Jangan mengarang teknologi yang tidak ada di commit/diff. Jika diff hanya "fix typo README" jangan tulis "mengerjakan microservices".
- Jika diff menunjukkan perubahan spesifik (misal: tambah validasi, refactor query, ubah UI), SEBUTKAN secara spesifik — diff adalah bukti paling akurat!
- Tiap field MINIMAL 100 karakter, MAKSIMAL 5000 karakter. Ideal 2-4 kalimat per field.
- Output harus JSON valid yang bisa di-JSON.parse.

CONTOH OUTPUT (jangan copy mentah, jadikan referensi gaya):
{"aktivitas":"Hari ini fokus melanjutkan fitur manajemen stok di modul StockMonitoring. Memperbaiki validasi form tambah barang dan merapikan query laporan agar loading lebih cepat. Sempat sync dengan mentor untuk memastikan alur approval sesuai kebutuhan.","pembelajaran":"Belajar pentingnya validasi di sisi backend dan frontend agar data tetap konsisten. Jadi lebih paham cara pakai Eloquent scope untuk menyederhanakan query yang sebelumnya cukup berantakan.","kendala":"Sempat bingung karena pagination laporan sempat error setelah ubah query, tapi setelah cek log ternyata ada kondisi where yang kelewat. Sudah diperbaiki dan sekarang normal kembali."}
`;
}

function buildManualPrompt(description) {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return `Kamu adalah asisten penulisan logbook magang IT harian untuk MagangHub Kemnaker.

KONTEKS:
- Hari: ${today}
- Penulis: mahasiswa magang IT

DESKRIPSI BEBAS DARI USER (sumber utama, jangan mengarang di luar ini):
"""
${description}
"""

TUGAS:
Susun ringkasan logbook dari deskripsi di atas. Balas HANYA JSON valid tanpa markdown:

{
  "aktivitas": "paragraf 150-600 karakter, rangkum aktivitas dari deskripsi dengan bahasa mengalir. Pertahankan detail penting (meeting, belajar, coding, diskusi).",
  "pembelajaran": "paragraf 150-600 karakter, ekstrak pembelajaran / insight dari deskripsi. Jika tidak eksplisit, inferensi wajar yang masih terkait (misal: belajar komunikasi tim dari meeting).",
  "kendala": "paragraf 120-500 karakter. Jika deskripsi menyebut kendala, jelaskan + solusi. Jika tidak ada kendala, tulis 'Tidak ada kendala berarti hari ini...' lalu tambahkan kalimat positif tentang kelancaran."
}

ATURAN:
- Bahasa Indonesia santai, humanis, seperti anak magang, tetap sopan.
- JANGAN menambahkan detail teknis spesifik (nama framework, file, endpoint) yang tidak ada di deskripsi.
- Tiap field 100-5000 karakter, ideal 2-4 kalimat.
- JSON valid saja.
`;
}

function buildCombinedPrompt(gitLogs, manualNotes, diffSection = '') {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const diffBlock = diffSection && String(diffSection).trim()
        ? `\nDETAIL DIFF (bukti teknikal commit — gunakan untuk akurasi, jangan diabaikan):\n${String(diffSection).slice(0, 7000)}\n`
        : '';
    return `Kamu adalah asisten penulisan logbook magang IT harian untuk MagangHub Kemnaker. Tugasmu MENGGABUNGKAN dua sumber agar hasilnya lebih akurat & lengkap.

KONTEKS:
- Hari: ${today}
- Penulis: mahasiswa magang IT
- Mode: GABUNGAN (commit Git + diff + catatan manual user) — ini yang paling akurat, gabungkan ketiganya seimbang.

SUMBER 1 — COMMIT GIT HARI INI (pekerjaan teknikal, bukti objektif):
${gitLogs || '(tidak ada commit hari ini)'}
${diffBlock}
SUMBER 2 — CATATAN MANUAL USER (konteks non-teknikal, meeting, belajar, kendala yang tidak terekam di commit):
"""
${manualNotes}
"""

TUGAS:
Buat 3 paragraf logbook yang MENYATUKAN kedua sumber di atas menjadi satu narasi koheren. Balas HANYA JSON valid tanpa markdown:

{
  "aktivitas": "paragraf 200-700 karakter. Gabungkan: apa yang dikerjakan secara teknikal (dari commit+diff) + aktivitas non-teknikal (dari catatan). Susun kronologis & natural, jangan seperti dua list terpisah. Sebutkan file/fitur/topik meeting spesifik tapi ringkas (contoh: diff menunjukkan ubahan di DashboardTv2.php).",
  "pembelajaran": "paragraf 150-600 karakter. Rangkum pembelajaran dari KEDUA sumber: insight teknikal dari commit/diff + soft skill dari catatan manual. Kaitkan keduanya jika relevan.",
  "kendala": "paragraf 120-500 karakter. Jika ada kendala di salah satu sumber, gabungkan & beri solusi. Jika keduanya lancar, tulis tidak ada kendala berarti + hal yang dijaga agar tetap lancar."
}

ATURAN WAJIB:
- Bahasa Indonesia santai, humanis, mengalir seperti magang ngetik sendiri. Sopan & profesional, hindari bahasa skripsi.
- JANGAN buang salah satu sumber — kedua sumber HARUS tercermin di hasil. Jika commit & catatan terlihat tidak berhubungan, jembatani dengan kalimat transisi (misal: "Di sela pengerjaan fitur X, juga mengikuti...").
- Jika diff tersedia, SEBUTKAN file yang diubah secara spesifik — itu bukti paling akurat!
- Jangan mengarang detail teknis yang tidak ada di commit/diff/catatan.
- Tiap field MINIMAL 100 karakter, MAKSIMAL 5000 karakter.
- Output JSON valid saja.

CONTOH GAYA (gabungan):
User commits: "- fix validasi stok (Budi)  - refactor query laporan (Budi)"
Diff: "src/StockMonitoringController.php: tambah validasi stok, refactor query laporan"
Manual: "pagi ikut daily standup, siang belajar optimasi query bareng mentor"
Expected aktivitas: "Pagi hari mengikuti daily standup untuk sync progress, lalu melanjutkan perbaikan validasi stok di StockMonitoringController.php dan refactor query laporan agar lebih cepat. Sesi belajar bareng mentor membantu memahami cara optimasi query yang sebelumnya jadi bottleneck."
`;
}

function extractJsonObject(rawText) {
    const text = String(rawText || '').replace(/^\uFEFF/, '').trim();
    const candidates = [text];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) candidates.unshift(fenced[1].trim());

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch {
        }

        let start = -1;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = 0; i < candidate.length; i += 1) {
            const character = candidate[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') inString = false;
                continue;
            }
            if (character === '"') {
                inString = true;
            } else if (character === '{') {
                if (depth === 0) start = i;
                depth += 1;
            } else if (character === '}' && depth > 0) {
                depth -= 1;
                if (depth === 0) {
                    const objectText = candidate.slice(start, i + 1);
                    try {
                        return JSON.parse(objectText);
                    } catch {
                        const withoutTrailingCommas = objectText.replace(/,\s*([}\]])/g, '$1');
                        try {
                            return JSON.parse(withoutTrailingCommas);
                        } catch {
                            break;
                        }
                    }
                }
            }
        }
    }
    throw new Error('Gemini mengirim format jawaban yang tidak valid. Silakan coba generate ulang (biasanya berhasil di percobaan kedua).');
}

async function generateWithGemini(gitLogs, diffSection = '') {
    return generateFromPrompt(buildPrompt(gitLogs, diffSection));
}

async function generateManualWithGemini(description) {
    return generateFromPrompt(buildManualPrompt(description));
}

async function generateCombinedWithGemini(gitLogs, manualNotes, diffSection = '') {
    return generateFromPrompt(buildCombinedPrompt(gitLogs, manualNotes, diffSection));
}

async function generateFromPrompt(prompt) {
    const env = { ...readEnvFile(), ...process.env };
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY belum diatur. Isi di .env (GEMINI_API_KEY=...) atau Vercel Env.');

    const model = normalizeModel(env.GEMINI_MODEL);
    const ai = new GoogleGenAI({ apiKey });

    const requestConfig = {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.9,
        responseMimeType: 'application/json',
    };

    const extraConfig = {};
    if (model.includes('2.5')) {
        extraConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    let response;
    const TIMEOUT_MS = 25000;

    const generatePromise = (async () => {
        try {
            return await ai.models.generateContent({
                model,
                contents: prompt,
                config: { ...requestConfig, ...extraConfig },
            });
        } catch (err) {
            const msg = String(err.message || '');
            if (msg.includes('responseMimeType') || msg.includes('thinkingConfig') || msg.includes('unknown field')) {
                return await ai.models.generateContent({ model, contents: prompt });
            }
            throw err;
        }
    })();

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );

    try {
        response = await Promise.race([generatePromise, timeoutPromise]);
    } catch (error) {
        if (error.message === 'TIMEOUT') {
            throw new Error('Gemini lama merespons (>25 detik). Coba lagi — biasanya percobaan kedua lebih cepat. Jika tetap lambat, ganti model ke gemini-1.5-flash di Pengaturan (paling cepat).');
        }
        const detail = error.message || '';
        if (detail.includes('401') || detail.includes('403') || detail.toLowerCase().includes('api key') || detail.includes('API_KEY_INVALID')) {
            throw new Error('Gemini API key tidak valid atau tidak punya akses. Periksa kembali API key di Pengaturan.');
        }
        if (detail.includes('429') || detail.toLowerCase().includes('quota') || detail.toLowerCase().includes('rate')) {
            throw new Error('Kuota Gemini habis / rate limit. Tunggu 1-2 menit lalu coba lagi, atau ganti API key.');
        }
        if (detail.toLowerCase().includes('model') && detail.toLowerCase().includes('not found')) {
            throw new Error(`Model Gemini "${model}" tidak ditemukan / tidak tersedia untuk API ini. Coba ganti ke gemini-3.6-flash (terbaru, direkomendasikan) di Pengaturan.`);
        }
        throw new Error(`Gemini gagal membuat draft: ${detail}`);
    }

    let raw = '';
    try {
        raw = typeof response.text === 'function' ? response.text() : response.text;
        if (typeof raw !== 'string') raw = String(raw || '');
        raw = raw.trim();
    } catch {
        raw = String(response.text || '').trim();
    }

    const parsed = extractJsonObject(raw);

    for (const k of ['aktivitas', 'pembelajaran', 'kendala']) {
        if (typeof parsed[k] !== 'string' || parsed[k].trim().length < 10) {
            throw new Error(`Field "${k}" dari Gemini tidak valid / terlalu pendek. Coba generate ulang.`);
        }
        parsed[k] = parsed[k].trim();
        if (parsed[k].length < 100) {
            parsed[k] = parsed[k] + ' Hari ini berjalan cukup produktif dengan progres yang sesuai perencanaan.';
        }
    }
    return parsed;
}

export {
    LOGBOOK_FILE_PATH,
    PRIMARY_LOGBOOK_PATH,
    FALLBACK_LOGBOOK_PATH,
    appendEntry,
    buildCombinedPrompt,
    buildManualPrompt,
    buildPrompt,
    extractJsonObject,
    deleteEntry,
    generateCombinedWithGemini,
    generateWithGemini,
    generateManualWithGemini,
    getCache,
    getTodayGitLogs,
    getTodayGitLogsDetailed,
    getTodayCommitsWithDiff,
    getCommitDiff,
    createExcelExport,
    normalizeModel,
    readEntries,
    saveCache,
    updateEntry,
};
