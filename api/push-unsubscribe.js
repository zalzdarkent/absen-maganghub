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
        const { removeSubscription } = await import('../lib/push.js');
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const endpoint = String(body.endpoint || body.subscription?.endpoint || '').trim();
        if (!endpoint) return res.status(400).json({ error: 'endpoint wajib diisi.' });
        const subs = await removeSubscription(endpoint);
        return res.status(200).json({ ok: true, count: subs.length });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
