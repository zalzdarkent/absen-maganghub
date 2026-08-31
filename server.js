import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    appendEntry,
    createExcelExport,
    deleteEntry,
    generateCombinedWithGemini,
    generateWithGemini,
    generateManualWithGemini,
    getCache,
    getTodayGitLogs,
    getTodayCommitsWithDiff,
    getTodayGitLogsDetailed,
    getCommitDiff,
    readEntries,
    saveCache,
    updateEntry,
} from './lib/logbook.js';
import { getEffectiveRepoPath, getSettingsForDisplay, saveSettings } from './lib/settings.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4174;

// Tampilkan semua commit hari ini. Diff dicoba selengkap mungkin, tapi tetap ada batas
// karakter agar response/API tidak terlalu berat kalau commit sangat besar.
const FULL_TODAY_DIFF_OPTS = {
    maxCommits: 0, // 0 = tidak dibatasi jumlah commit
    maxFilesPerCommit: 0, // 0 = tidak dibatasi jumlah file per commit
    maxCharsPerDiff: 50000,
    maxTotalChars: 200000,
};

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function todayStrings() {
    const todayDate = new Date().toISOString().split('T')[0];
    const displayDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { todayDate, displayDate };
}

// --- Status: git log preview + whether today's logs are already generated ---
// Sekarang juga kirim `commits` dengan diff per commit untuk UI (expandable) & akurasi Gemini
app.get('/api/status', async (req, res) => {
    try {
        const repoPath = getEffectiveRepoPath();
        const wantDiff = req.query.diff !== '0'; // default include diff, ?diff=0 untuk mode cepat
        let gitLogs = '';
        let commits = [];
        let detailed = '';
        try {
            if (wantDiff) {
                const result = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
                gitLogs = result.logs;
                detailed = result.detailed;
                commits = result.commits;
            } else {
                gitLogs = await getTodayGitLogs(repoPath);
            }
        } catch (e) {
            // fallback ke log sederhana jika diff gagal (rate limit / token)
            gitLogs = await getTodayGitLogs(repoPath);
        }
        const cache = getCache();
        const { todayDate } = todayStrings();
        const alreadyGenerated = cache.lastDate === todayDate && cache.lastLogs === gitLogs;
        res.json({ gitLogs, commits, detailed, hasCommitsToday: Boolean(gitLogs), alreadyGenerated, cache });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Get diff untuk 1 commit (untuk expand per commit di UI) ---
app.get('/api/commits/:sha/diff', async (req, res) => {
    try {
        const sha = String(req.params.sha || '').trim();
        if (!sha || !/^[0-9a-f]{5,40}$/i.test(sha)) return res.status(400).json({ error: 'SHA tidak valid' });
        const repoPath = getEffectiveRepoPath();
        const diff = await getCommitDiff(repoPath, sha, { maxChars: 50000 });
        res.json(diff);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Generate a draft with Gemini (does NOT save to Excel yet) ---
app.post('/api/generate', async (req, res) => {
    try {
        const repoPath = getEffectiveRepoPath();
        let gitLogs = '';
        let diffSection = '';
        try {
            const detailed = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
            gitLogs = detailed.logs;
            diffSection = detailed.detailed;
        } catch {
            gitLogs = await getTodayGitLogs(repoPath);
        }
        if (!gitLogs) {
            return res.status(400).json({ error: 'Belum ada commit Git hari ini.' });
        }
        const draft = await generateWithGemini(gitLogs, diffSection);
        res.json({ draft, gitLogs, diffSection, commits: (await getTodayCommitsWithDiff(repoPath, FULL_TODAY_DIFF_OPTS).catch(()=>[])) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Generate a draft from a free-form manual activity description ---
app.post('/api/generate-manual', async (req, res) => {
    try {
        const description = String(req.body.description || '').trim();
        if (!description) {
            return res.status(400).json({ error: 'Deskripsi kegiatan wajib diisi.' });
        }
        const draft = await generateManualWithGemini(description);
        res.json({ draft });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Generate a draft by COMBINING commit logs + manual notes (now diff-aware) ---
app.post('/api/generate-combined', async (req, res) => {
    try {
        const manualNotes = String(req.body.manualNotes || req.body.description || '').trim();
        const gitLogsOverride = typeof req.body.gitLogs === 'string' ? req.body.gitLogs.trim() : null;
        const diffOverride = typeof req.body.diffSection === 'string' ? req.body.diffSection : null;

        if (!manualNotes) {
            return res.status(400).json({ error: 'Catatan manual wajib diisi untuk mode gabungan.' });
        }

        const repoPath = getEffectiveRepoPath();
        let gitLogs = gitLogsOverride;
        let diffSection = diffOverride;
        if (gitLogs === null || gitLogs === undefined) {
            try {
                const detailed = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
                gitLogs = detailed.logs;
                diffSection = diffSection || detailed.detailed;
            } catch {
                gitLogs = await getTodayGitLogs(repoPath);
            }
        } else if (!diffSection) {
            // Client mengirim gitLogs tapi belum ada diff -> coba ambil diff terbaru
            try {
                const detailed = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
                diffSection = detailed.detailed;
                // jika gitLogs client masih sama, pakai detailed logs yang lebih lengkap
                if (gitLogs === detailed.logs) diffSection = detailed.detailed;
            } catch {
                diffSection = '';
            }
        }

        const draft = await generateCombinedWithGemini(gitLogs || '', manualNotes, diffSection || '');
        res.json({ draft, gitLogs: gitLogs || '', diffSection: diffSection || '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Save a (possibly edited) draft as a new logbook entry ---
app.post('/api/entries', async (req, res) => {
    try {
        const { aktivitas, pembelajaran, kendala, gitLogs } = req.body;
        if (!aktivitas || !pembelajaran || !kendala) {
            return res.status(400).json({ error: 'Aktivitas, pembelajaran, dan kendala wajib diisi.' });
        }
        const { todayDate, displayDate } = todayStrings();
        await appendEntry({ aktivitas, pembelajaran, kendala }, displayDate);
        if (gitLogs !== undefined) saveCache(todayDate, gitLogs);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Read all entries (history table) ---
app.get('/api/entries', async (req, res) => {
    try {
        const entries = await readEntries();
        res.json({ entries });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/entries/export', async (req, res) => {
    try {
        const buffer = await createExcelExport();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Logbook_MagangHub.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Edit an existing entry ---
app.put('/api/entries/:rowNumber', async (req, res) => {
    try {
        const rowNumber = Number(req.params.rowNumber);
        await updateEntry(rowNumber, req.body);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Delete an entry ---
app.delete('/api/entries/:rowNumber', async (req, res) => {
    try {
        const rowNumber = Number(req.params.rowNumber);
        await deleteEntry(rowNumber);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Settings: read (masked) and save ---
app.get('/api/settings', (req, res) => {
    res.json(getSettingsForDisplay());
});

app.post('/api/settings', (req, res) => {
    try {
        const updated = saveSettings(req.body);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n📒 MagangHub Logbook Dashboard jalan di http://localhost:${PORT}\n`);
});
