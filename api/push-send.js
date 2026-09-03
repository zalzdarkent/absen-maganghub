function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak didukung.' });
    try {
        const { isPushConfigured, sendReminderToAll } = await import('../lib/push.js');
        if (!isPushConfigured()) return res.status(503).json({ error: 'Push belum dikonfigurasi (VAPID kosong).' });
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const title = String(body.title || 'Test push MagangHub').slice(0, 100);
        const pushBody = String(body.body || 'Notifikasi push aktif ✔').slice(0, 300);
        // tag default unik: tag yang sama membuat browser me-replace notif lama tanpa popup baru
        const tag = String(body.tag || `push-test-${Date.now()}`).slice(0, 100);
        const result = await sendReminderToAll({ title, body: pushBody, tag, url: '/' });
        return res.status(200).json({ ok: true, ...result });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
