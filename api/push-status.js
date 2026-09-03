function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak didukung.' });
    try {
        const { isPushConfigured, listSubscriptions, todayKeyWIB } = await import('../lib/push.js');
        const subs = await listSubscriptions().catch(() => []);
        return res.status(200).json({ configured: isPushConfigured(), subscriptionCount: subs.length, lastSentDay: todayKeyWIB() });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
