import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    appendEntry,
    deleteEntry,
    generateCombinedWithGemini,
    generateWithGemini,
    generateManualWithGemini,
    getCache,
    getTodayGitLogs,
    readEntries,
    saveCache,
    updateEntry,
} from './lib/logbook.js';
import { getSettingsForDisplay, saveSettings } from './lib/settings.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4174;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function todayStrings() {
    const todayDate = new Date().toISOString().split('T')[0];
    const displayDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { todayDate, displayDate };
}

// --- Status: git log preview + whether today's logs are already generated ---
app.get('/api/status', (req, res) => {
    try {
        const settings = getSettingsForDisplay();
        const gitLogs = getTodayGitLogs(settings.repoPath);
        const cache = getCache();
        const { todayDate } = todayStrings();
        const alreadyGenerated = cache.lastDate === todayDate && cache.lastLogs === gitLogs;
        res.json({ gitLogs, hasCommitsToday: Boolean(gitLogs), alreadyGenerated, cache });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Generate a draft with Gemini (does NOT save to Excel yet) ---
app.post('/api/generate', async (req, res) => {
    try {
        const settings = getSettingsForDisplay();
        const gitLogs = getTodayGitLogs(settings.repoPath);
        if (!gitLogs) {
            return res.status(400).json({ error: 'Belum ada commit Git hari ini.' });
        }
        const draft = await generateWithGemini(gitLogs);
        res.json({ draft, gitLogs });
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

// --- Generate a draft by COMBINING commit logs + manual notes (new!) ---
app.post('/api/generate-combined', async (req, res) => {
    try {
        const manualNotes = String(req.body.manualNotes || req.body.description || '').trim();
        const gitLogsOverride = typeof req.body.gitLogs === 'string' ? req.body.gitLogs.trim() : null;

        if (!manualNotes) {
            return res.status(400).json({ error: 'Catatan manual wajib diisi untuk mode gabungan.' });
        }

        const settings = getSettingsForDisplay();
        // Prefer gitLogs sent from client (already displayed), fallback to fresh fetch
        let gitLogs = gitLogsOverride;
        if (gitLogs === null || gitLogs === undefined) {
            gitLogs = getTodayGitLogs(settings.repoPath);
        }

        // Allow combined even if no commits — manual notes still useful
        // but inform AI that commits empty
        const draft = await generateCombinedWithGemini(gitLogs || '', manualNotes);
        res.json({ draft, gitLogs: gitLogs || '' });
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
