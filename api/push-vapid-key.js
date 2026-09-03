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
        const { getVapidKeys } = await import('../lib/push.js');
        const { publicKey } = getVapidKeys();
        if (!publicKey) return res.status(503).json({ error: 'Push belum dikonfigurasi. Isi VAPID_PUBLIC_KEY di Vercel Env.' });
        return res.status(200).json({ publicKey });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
