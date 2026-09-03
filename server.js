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
import {
    buildReminderPayload,
    getVapidKeys,
    isPushConfigured,
    listSubscriptions,
    markDailyReminderSent,
    removeSubscription,
    saveSubscription,
    sendReminderToAll,
    shouldSendDailyReminder,
    todayKeyWIB,
} from './lib/push.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4174;

// Diff opts yang seimbang: cukup untuk 10 commit tapi tetap ringan (<15k total)
// Nilai lama 0/0/50000/200000 bikin git fetch + patch blocking >5 detik dan Gemini timeout.
// Sekarang: 10 commit x 3 file x 3500 char = max ~10.5k + overhead = <15k
const FULL_TODAY_DIFF_OPTS = {
    maxCommits: 10,
    maxFilesPerCommit: 3,
    maxCharsPerDiff: 3500,
    maxTotalChars: 15000,
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
        const repoPath = await getEffectiveRepoPath();
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
        const repoPath = await getEffectiveRepoPath();
        const diff = await getCommitDiff(repoPath, sha, { maxChars: 50000 });
        res.json(diff);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Generate a draft with Gemini (does NOT save to Excel yet) ---
app.post('/api/generate', async (req, res) => {
    try {
        const t0 = Date.now();
        const repoPath = await getEffectiveRepoPath();
        let gitLogs = '';
        let diffSection = '';
        let commits = [];
        try {
            const detailed = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
            gitLogs = detailed.logs;
            diffSection = detailed.detailed;
            commits = detailed.commits || [];
        } catch (e) {
            console.warn('[generate] getTodayGitLogsDetailed gagal, fallback:', e.message);
            gitLogs = await getTodayGitLogs(repoPath);
        }
        if (!gitLogs) {
            return res.status(400).json({ error: 'Belum ada commit Git hari ini.' });
        }
        const gitMs = Date.now() - t0;
        console.log(`[generate] git fetch done ${gitMs}ms, commits=${commits.length} diffLen=${String(diffSection).length}`);
        const g0 = Date.now();
        const draft = await generateWithGemini(gitLogs, diffSection);
        console.log(`[generate] gemini done ${Date.now() - g0}ms total ${Date.now()-t0}ms`);
        // Reuse commits yang sudah di-fetch, jangan fetch lagi (hemat 2-4 detik)
        res.json({ draft, gitLogs, diffSection, commits });
    } catch (error) {
        console.error('[generate] error:', error.message);
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
        const t0 = Date.now();
        const manualNotes = String(req.body.manualNotes || req.body.description || '').trim();
        const gitLogsOverride = typeof req.body.gitLogs === 'string' ? req.body.gitLogs.trim() : null;
        const diffOverride = typeof req.body.diffSection === 'string' ? req.body.diffSection : null;

        if (!manualNotes) {
            return res.status(400).json({ error: 'Catatan manual wajib diisi untuk mode gabungan.' });
        }

        const repoPath = await getEffectiveRepoPath();
        let gitLogs = gitLogsOverride;
        let diffSection = diffOverride;
        // Hemat git fetch: jika client sudah kirim gitLogs+diff, jangan fetch lagi
        // Hanya fetch jika keduanya kosong, atau diff kosong (fallback)
        if (gitLogs === null || gitLogs === undefined) {
            try {
                const detailed = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
                gitLogs = detailed.logs;
                diffSection = diffSection || detailed.detailed;
                console.log(`[generate-combined] fetched fresh git ${Date.now()-t0}ms (no override)`);
            } catch (e) {
                console.warn('[generate-combined] detailed fetch gagal:', e.message);
                gitLogs = await getTodayGitLogs(repoPath);
            }
        } else if (!diffSection) {
            // Client mengirim gitLogs tapi diff kosong -> fetch sekali saja, jangan dua kali
            try {
                const detailed = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
                diffSection = detailed.detailed;
                console.log(`[generate-combined] fetched diff only ${Date.now()-t0}ms`);
            } catch {
                diffSection = '';
            }
        } else {
            console.log(`[generate-combined] reuse client gitLogs+diff (no fetch) diffLen=${String(diffSection).length}`);
        }

        const draft = await generateCombinedWithGemini(gitLogs || '', manualNotes, diffSection || '');
        console.log(`[generate-combined] gemini done total ${Date.now()-t0}ms`);
        res.json({ draft, gitLogs: gitLogs || '', diffSection: diffSection || '' });
    } catch (error) {
        console.error('[generate-combined] error:', error.message);
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
app.get('/api/settings', async (req, res) => {
    try {
        res.json(await getSettingsForDisplay());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const updated = await saveSettings(req.body);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Web Push: VAPID public key (public, aman untuk client) ---
app.get('/api/push/vapid-public-key', async (req, res) => {
    try {
        const { publicKey } = getVapidKeys();
        if (!publicKey) return res.status(503).json({ error: 'Push belum dikonfigurasi. Generate: npx web-push generate-vapid-keys lalu isi VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY.' });
        res.json({ publicKey });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/push/status', async (req, res) => {
    try {
        const subs = await listSubscriptions().catch(() => []);
        res.json({ configured: isPushConfigured(), subscriptionCount: subs.length, lastSentDay: todayKeyWIB() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/push/subscribe', async (req, res) => {
    try {
        const subscription = req.body.subscription || req.body;
        const subs = await saveSubscription(subscription);
        res.json({ ok: true, count: subs.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/push/unsubscribe', async (req, res) => {
    try {
        const endpoint = String(req.body.endpoint || req.body.subscription?.endpoint || '').trim();
        if (!endpoint) return res.status(400).json({ error: 'endpoint wajib diisi.' });
        const subs = await removeSubscription(endpoint);
        res.json({ ok: true, count: subs.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test manual dari UI — kirim ke semua subscriber
app.post('/api/push/send', async (req, res) => {
    try {
        if (!isPushConfigured()) return res.status(503).json({ error: 'Push belum dikonfigurasi (VAPID kosong).' });
        const title = String(req.body.title || 'Test push MagangHub').slice(0, 100);
        const body = String(req.body.body || 'Notifikasi push aktif ✔').slice(0, 300);
        // tag default unik: tag yang sama membuat browser me-replace notif lama tanpa popup baru
        const tag = String(req.body.tag || `push-test-${Date.now()}`).slice(0, 100);
        const result = await sendReminderToAll({ title, body, tag, url: '/' });
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dipanggil Vercel Cron tiap hari 08:40 UTC (=15:40 WIB) + bisa dipanggil manual
app.get('/api/push-reminder', handlePushReminder);
app.post('/api/push-reminder', handlePushReminder);

async function handlePushReminder(req, res) {
    try {
        const cronSecret = String(process.env.CRON_SECRET || '').trim();
        if (cronSecret) {
            const got = String(req.query.secret || req.headers['x-cron-secret'] || '').trim()
                || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
            const isVercelCron = req.headers['x-vercel-cron'] === '1';
            if (got !== cronSecret && !isVercelCron) {
                return res.status(401).json({ error: 'Unauthorized (CRON_SECRET salah).' });
            }
        }
        if (!isPushConfigured()) return res.status(503).json({ error: 'Push belum dikonfigurasi.' });
        const dayKey = todayKeyWIB();
        const force = String(req.query.force || '') === '1' || req.body?.force === true;
        if (!force && !(await shouldSendDailyReminder(dayKey))) {
            return res.json({ ok: true, skipped: true, dayKey });
        }
        const payload = buildReminderPayload();
        const result = await sendReminderToAll(payload);
        // Tandai terkirim walau 0 subscriber agar cron tidak spam retry; kirim ulang bisa pakai ?force=1
        await markDailyReminderSent(dayKey);
        res.json({ ok: true, dayKey, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

app.listen(PORT, () => {
    console.log(`\n📒 MagangHub Logbook Dashboard jalan di http://localhost:${PORT}\n`);
});
