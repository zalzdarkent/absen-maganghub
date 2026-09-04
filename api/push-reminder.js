// Vercel Cron: GET /api/push-reminder?source=cron setiap 08:40 UTC (=15:40 WIB).
// Bisa juga dipanggil manual POST dengan {force:true} untuk test.
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method tidak didukung.' });
    try {
        const {
            buildDraftReadyPayload,
            buildReminderPayload,
            isPushConfigured,
            markDailyReminderSent,
            sendReminderToAll,
            shouldSendDailyReminder,
            todayKeyWIB,
        } = await import('../lib/push.js');
        const { saveAutoDraft } = await import('../lib/autoDraft.js');
        const { generateWithGemini, getTodayGitLogs, getTodayGitLogsDetailed } = await import('../lib/logbook.js');
        const { getEffectiveRepoPath } = await import('../lib/settings.js');

        const cronSecret = String(process.env.CRON_SECRET || '').trim();
        if (cronSecret) {
            const got = String((req.query && req.query.secret) || req.headers['x-cron-secret'] || '').trim()
                || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
            const isVercelCron = req.headers['x-vercel-cron'] === '1';
            if (got !== cronSecret && !isVercelCron) {
                return res.status(401).json({ error: 'Unauthorized (CRON_SECRET salah).' });
            }
        }

        if (!isPushConfigured()) return res.status(503).json({ error: 'Push belum dikonfigurasi.' });
        const dayKey = todayKeyWIB();
        const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body || '{}'); } catch { return {}; } })() : (req.body || {});
        const force = String((req.query && req.query.force) || '') === '1' || body.force === true;
        if (!force && !(await shouldSendDailyReminder(dayKey))) {
            return res.status(200).json({ ok: true, skipped: true, dayKey });
        }
        // Try auto-draft (16.00 flow)
        let payload = null;
        let autoDraftPayload = null;
        let commitCount = 0;
        try {
            const repoPath = await getEffectiveRepoPath();
            let gitLogs = '';
            let detailed = '';
            let commits = [];
            const FULL_TODAY_DIFF_OPTS = { maxCommits: 10, maxFilesPerCommit: 3, maxCharsPerDiff: 3500, maxTotalChars: 15000 };
            try {
                const r = await getTodayGitLogsDetailed(repoPath, FULL_TODAY_DIFF_OPTS);
                gitLogs = r.logs; detailed = r.detailed; commits = r.commits || [];
            } catch (e) {
                try { gitLogs = await getTodayGitLogs(repoPath); } catch {}
            }
            if (gitLogs && String(gitLogs).trim()) {
                commitCount = commits.length || String(gitLogs).split('\n').filter(Boolean).length;
                try {
                    const draft = await generateWithGemini(gitLogs, detailed);
                    autoDraftPayload = { dayKey, draft, gitLogs, detailed, commits, generatedAt: new Date().toISOString() };
                    await saveAutoDraft(autoDraftPayload);
                    payload = buildDraftReadyPayload(commitCount);
                } catch (e) { console.warn('[push-reminder api] generate gagal', e.message); }
            }
        } catch (e) { console.warn('[push-reminder api] flow error', e.message); }
        if (!payload) payload = buildReminderPayload();
        const result = await sendReminderToAll(payload);
        await markDailyReminderSent(dayKey);
        return res.status(200).json({ ok: true, dayKey, commitCount, autoDraft: Boolean(autoDraftPayload), ...result });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
