import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { readEnvFile } from './settings.js';

const EXCEL_FILE_PATH = path.join(process.cwd(), 'Logbook_MagangHub.xlsx');
const CACHE_FILE_PATH = path.join(process.cwd(), 'logbook-cache.json');
const REPO_CACHE_DIR = path.join(process.cwd(), 'repo-cache');
const SHEET_NAME = 'Logbook Harian';

// Fixed 1-based column indices. We address cells by index rather than by
// ExcelJS "key" because key-based lookup only works on a worksheet whose
// `.columns` was set in the current process — it does NOT survive a
// workbook.xlsx.readFile() round trip, which silently breaks getCell('key')
// the moment the file already exists on disk.
const COL = { no: 1, tanggal: 2, aktivitas: 3, pembelajaran: 4, kendala: 5 };
const COLUMNS = [
    { header: 'No', width: 8 },
    { header: 'Tanggal', width: 15 },
    { header: 'Aktivitas Hari Ini', width: 45 },
    { header: 'Pembelajaran yang Didapat', width: 45 },
    { header: 'Kendala', width: 45 },
];

function isRemoteUrl(value) {
    return /^(https?:\/\/|git@)/i.test(value) || value.endsWith('.git');
}

function slugForUrl(url) {
    let s = url.replace(/^https?:\/\//i, '').replace(/^git@/i, '');
    // Strip embedded credentials (user:token@host/...) before turning this
    // into a folder name — otherwise the token ends up as part of the path,
    // and a long token pushes the whole clone path past Windows' 260-char
    // MAX_PATH limit the moment a nested file (e.g. a Laravel migration) has
    // a long name too.
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

    const localDir = path.join(REPO_CACHE_DIR, slugForUrl(repoPathOrUrl));
    fs.mkdirSync(REPO_CACHE_DIR, { recursive: true });

    const isExistingMirror = fs.existsSync(path.join(localDir, 'HEAD')) && fs.existsSync(path.join(localDir, 'objects'));
    if (isExistingMirror) {
        execSync('git fetch --quiet --prune', { cwd: localDir });
    } else {
        fs.rmSync(localDir, { recursive: true, force: true }); // clear any half-formed leftover
        execSync(`git clone --quiet --mirror "${repoPathOrUrl}" "${localDir}"`);
    }
    return localDir;
}

function getTodayGitLogs(repoPathOrUrl) {
    try {
        if (repoPathOrUrl && !isRemoteUrl(repoPathOrUrl) && !fs.existsSync(repoPathOrUrl)) {
            throw new Error(`Folder repo "${repoPathOrUrl}" tidak ditemukan. Periksa path repo di Pengaturan.`);
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
        if (detail.includes('not recognized') || detail.includes('ENOENT')) {
            throw new Error('Git tidak ditemukan di komputer ini. Install Git lalu jalankan ulang aplikasi.');
        }
        throw new Error(`Repo Git bermasalah: ${detail}`);
    }
}

function getCache() {
    if (fs.existsSync(CACHE_FILE_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8'));
        } catch {
            return { lastDate: '', lastLogs: '' };
        }
    }
    return { lastDate: '', lastLogs: '' };
}

function saveCache(todayDate, gitLogs) {
    fs.writeFileSync(
        CACHE_FILE_PATH,
        JSON.stringify({ lastDate: todayDate, lastLogs: gitLogs, updatedAt: new Date().toISOString() }, null, 2),
        'utf-8'
    );
}

async function openWorkbook() {
    const workbook = new ExcelJS.Workbook();
    let worksheet;
    if (fs.existsSync(EXCEL_FILE_PATH)) {
        await workbook.xlsx.readFile(EXCEL_FILE_PATH);
        worksheet = workbook.getWorksheet(SHEET_NAME);
    }
    if (!worksheet) {
        worksheet = workbook.addWorksheet(SHEET_NAME);
        COLUMNS.forEach((c, i) => {
            worksheet.getColumn(i + 1).width = c.width;
        });
        const headerRow = worksheet.getRow(1);
        COLUMNS.forEach((c, i) => {
            headerRow.getCell(i + 1).value = c.header;
        });
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;
    }
    return { workbook, worksheet };
}

function styleDataRow(row) {
    row.eachCell((cell) => {
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        };
        cell.alignment = { wrapText: true, vertical: 'top' };
    });
}

function renumber(worksheet) {
    let n = 1;
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.getCell(COL.no).value = n;
        n += 1;
    });
}

async function readEntries() {
    const { worksheet } = await openWorkbook();
    const entries = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        entries.push({
            rowNumber,
            no: row.getCell(COL.no).value,
            tanggal: row.getCell(COL.tanggal).value,
            aktivitas: row.getCell(COL.aktivitas).value,
            pembelajaran: row.getCell(COL.pembelajaran).value,
            kendala: row.getCell(COL.kendala).value,
        });
    });
    return entries.reverse(); // newest first for the UI
}

async function appendEntry(entry, tanggalDisplay) {
    const { workbook, worksheet } = await openWorkbook();
    const nextNo = worksheet.rowCount > 1 ? worksheet.rowCount : 1;
    const row = worksheet.addRow([nextNo, tanggalDisplay, entry.aktivitas, entry.pembelajaran, entry.kendala]);
    styleDataRow(row);
    await workbook.xlsx.writeFile(EXCEL_FILE_PATH);
    return row.number;
}

async function updateEntry(rowNumber, entry) {
    const { workbook, worksheet } = await openWorkbook();
    const row = worksheet.getRow(rowNumber);
    if (!row || rowNumber === 1) throw new Error('Baris tidak ditemukan');
    if (entry.tanggal !== undefined) row.getCell(COL.tanggal).value = entry.tanggal;
    if (entry.aktivitas !== undefined) row.getCell(COL.aktivitas).value = entry.aktivitas;
    if (entry.pembelajaran !== undefined) row.getCell(COL.pembelajaran).value = entry.pembelajaran;
    if (entry.kendala !== undefined) row.getCell(COL.kendala).value = entry.kendala;
    styleDataRow(row);
    await workbook.xlsx.writeFile(EXCEL_FILE_PATH);
}

async function deleteEntry(rowNumber) {
    const { workbook, worksheet } = await openWorkbook();
    if (rowNumber === 1) throw new Error('Tidak bisa menghapus header');
    worksheet.spliceRows(rowNumber, 1);
    renumber(worksheet);
    await workbook.xlsx.writeFile(EXCEL_FILE_PATH);
}

function buildPrompt(gitLogs) {
    return `
Kamu adalah asisten pribadi yang membantu menyusun laporan harian logbook magang IT.
Berikut adalah daftar commit Git dari proyek yang saya kerjakan hari ini:

${gitLogs}

Berdasarkan commit di atas, tolong buatkan ringkasan logbook harian untuk platform MagangHub Kemnaker.
Balas HANYA dengan format JSON valid berikut tanpa teks pendahuluan atau markdown code block:

{
  "aktivitas": "Paragraf deskripsi aktivitas hari ini minimal 100 karakter maksimal 5000 karakter...",
  "pembelajaran": "Paragraf deskripsi pembelajaran yang didapat minimal 100 karakter maksimal 5000 karakter...",
  "kendala": "Paragraf deskripsi kendala dan solusinya minimal 100 karakter maksimal 5000 karakter..."
}

GAYA BAHASA & SYARAT PENTING:
- Gunakan bahasa Indonesia yang santai, mengalir natural, dan humanis (seperti anak magang IT), tapi tetap ramah dan sopan.
- Hindari bahasa yang terlalu kaku atau formal seperti bahasa skripsi/surat resmi (misal: hindari kata "Bahwasanya", "Adapun", atau "Telah dilaksanakan").
- Masing-masing nilai ("aktivitas", "pembelajaran", "kendala") HARUS berupa paragraf utuh dengan panjang MINIMAL 100 karakter dan MAKSIMAL 5000 karakter.
- Pastikan format output murni JSON valid agar bisa di-parse secara otomatis.
`;
}

function buildManualPrompt(description) {
        return `
Kamu adalah asisten pribadi yang membantu menyusun laporan harian logbook magang IT.
Berikut adalah deskripsi bebas kegiatan saya hari ini:

${description}

Berdasarkan deskripsi tersebut, susun ringkasan logbook harian untuk platform MagangHub Kemnaker.
Balas HANYA dengan format JSON valid berikut tanpa teks pendahuluan atau markdown code block:

{
    "aktivitas": "Paragraf deskripsi aktivitas hari ini minimal 100 karakter maksimal 5000 karakter...",
    "pembelajaran": "Paragraf deskripsi pembelajaran yang didapat minimal 100 karakter maksimal 5000 karakter...",
    "kendala": "Paragraf deskripsi kendala dan solusinya minimal 100 karakter maksimal 5000 karakter..."
}

GAYA BAHASA & SYARAT PENTING:
- Gunakan bahasa Indonesia yang santai, mengalir natural, dan humanis, tetapi tetap ramah dan sopan.
- Ambil informasi hanya dari deskripsi yang diberikan. Jangan mengarang detail teknis yang tidak disebutkan.
- Jika kendala tidak disebutkan, tulis bahwa hari ini tidak ada kendala berarti.
- Masing-masing nilai HARUS berupa paragraf utuh dengan panjang MINIMAL 100 karakter dan MAKSIMAL 5000 karakter.
- Pastikan format output murni JSON valid agar bisa di-parse secara otomatis.
`;
}

async function generateWithGemini(gitLogs) {
    return generateFromPrompt(buildPrompt(gitLogs));
}

async function generateManualWithGemini(description) {
    return generateFromPrompt(buildManualPrompt(description));
}

async function generateFromPrompt(prompt) {
    const env = { ...readEnvFile(), ...process.env };
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY belum diatur. Isi dulu di halaman Pengaturan.');

    const ai = new GoogleGenAI({ apiKey });
    const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
    let response;
    try {
        response = await ai.models.generateContent({ model, contents: prompt });
    } catch (error) {
        const detail = error.message || '';
        if (detail.includes('401') || detail.includes('403') || detail.toLowerCase().includes('api key')) {
            throw new Error('Gemini API key tidak valid atau tidak punya akses. Periksa kembali API key di Pengaturan.');
        }
        throw new Error(`Gemini gagal membuat draft: ${detail}`);
    }

    let jsonText = response.text.trim();
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
    }
    try {
        return JSON.parse(jsonText);
    } catch {
        throw new Error('Gemini mengirim format jawaban yang tidak valid. Silakan coba generate ulang.');
    }
}

export {
    EXCEL_FILE_PATH,
    appendEntry,
    deleteEntry,
    generateWithGemini,
    generateManualWithGemini,
    getCache,
    getTodayGitLogs,
    readEntries,
    saveCache,
    updateEntry,
};
