import fs from 'fs';
import os from 'os';
import path from 'path';
import { readEnvFile } from './settings.js';

const KV_PUSH_KEY = 'maganghub:push:subscriptions';
const KV_LAST_SENT_KEY = 'maganghub:push:last-sent';

const PRIMARY_SUBS_PATH = path.join(process.cwd(), 'push-subscriptions.json');
const FALLBACK_SUBS_PATH = path.join(os.tmpdir(), 'absen-maganghub-push-subs.json');
const PRIMARY_LAST_SENT_PATH = path.join(process.cwd(), 'push-last-sent.json');
const FALLBACK_LAST_SENT_PATH = path.join(os.tmpdir(), 'absen-maganghub-push-last-sent.json');

function isReadOnlyError(error) {
    const code = error && error.code ? String(error.code) : '';
    const msg = String((error && error.message) || '');
    return code === 'EROFS' || code === 'EACCES' || code === 'EPERM' || msg.includes('read-only') || msg.includes('EROFS');
}

function hasKvConfig() {
    return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand(command) {
    if (!hasKvConfig()) return null;
    const res = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`KV error ${res.status}: ${await res.text()}`);
    return res.json();
}

function getEnv() {
    return { ...readEnvFile(), ...process.env };
}

function getVapidKeys() {
    const env = getEnv();
    const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
    const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
    const subject = String(env.VAPID_SUBJECT || 'mailto:admin@maganghub.local').trim();
    return { publicKey, privateKey, subject };
}

function isPushConfigured() {
    const { publicKey, privateKey } = getVapidKeys();
    return Boolean(publicKey && privateKey);
}

let webpushInstance = null;
async function getWebPush() {
    if (!isPushConfigured()) return null;
    if (webpushInstance) return webpushInstance;
    const mod = await import('web-push');
    const webpush = mod.default || mod;
    const { publicKey, privateKey, subject } = getVapidKeys();
    webpush.setVapidDetails(subject, publicKey, privateKey);
    webpushInstance = webpush;
    return webpushInstance;
}

function isValidSubscription(sub) {
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return false;
    if (typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) return false;
    const keys = sub.keys;
    if (!keys || typeof keys !== 'object') return false;
    if (typeof keys.p256dh !== 'string' || !keys.p256dh) return false;
    if (typeof keys.auth !== 'string' || !keys.auth) return false;
    return true;
}

function readSubsFileLocal() {
    const ordered = process.env.VERCEL
        ? [FALLBACK_SUBS_PATH, PRIMARY_SUBS_PATH]
        : [PRIMARY_SUBS_PATH, FALLBACK_SUBS_PATH];
    for (const p of ordered) {
        if (!fs.existsSync(p)) continue;
        try {
            const raw = fs.readFileSync(p, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(isValidSubscription);
            if (parsed && Array.isArray(parsed.subscriptions)) return parsed.subscriptions.filter(isValidSubscription);
        } catch {
            // coba kandidat berikutnya
        }
    }
    return [];
}

async function readSubscriptionsFromKv() {
    if (!hasKvConfig()) return null;
    const data = await kvCommand(['GET', KV_PUSH_KEY]);
    const raw = data && data.result;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(isValidSubscription);
    try {
        const parsed = JSON.parse(String(raw));
        if (Array.isArray(parsed)) return parsed.filter(isValidSubscription);
        return [];
    } catch {
        return [];
    }
}

async function writeSubscriptionsToKv(subs) {
    if (!hasKvConfig()) return false;
    await kvCommand(['SET', KV_PUSH_KEY, JSON.stringify(subs)]);
    return true;
}

function writeSubsFileLocal(subs) {
    const data = JSON.stringify(subs, null, 2) + '\n';
    const tryPaths = [PRIMARY_SUBS_PATH, FALLBACK_SUBS_PATH];
    let wrote = false;
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            wrote = true;
        } catch (e) {
            if (isReadOnlyError(e)) continue;
            throw e;
        }
    }
    return wrote;
}

async function listSubscriptions() {
    const fromKv = await readSubscriptionsFromKv();
    if (fromKv !== null) return fromKv;
    return readSubsFileLocal();
}

async function saveSubscription(subscription) {
    if (!isValidSubscription(subscription)) {
        throw new Error('Subscription tidak valid (endpoint + keys.p256dh + keys.auth wajib).');
    }
    const current = await listSubscriptions();
    const filtered = current.filter((s) => s.endpoint !== subscription.endpoint);
    filtered.push({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        createdAt: new Date().toISOString(),
    });
    await writeSubscriptionsToKv(filtered);
    try {
        writeSubsFileLocal(filtered);
    } catch (e) {
        if (!isReadOnlyError(e)) throw e;
        if (!hasKvConfig() && process.env.VERCEL) {
            throw new Error('Gagal menyimpan subscription: filesystem read-only dan KV belum dikonfigurasi.');
        }
    }
    return filtered;
}

async function removeSubscription(endpoint) {
    const ep = String(endpoint || '').trim();
    if (!ep) return [];
    const current = await listSubscriptions();
    const filtered = current.filter((s) => s.endpoint !== ep);
    await writeSubscriptionsToKv(filtered);
    try {
        writeSubsFileLocal(filtered);
    } catch (e) {
        if (!isReadOnlyError(e)) throw e;
    }
    return filtered;
}

function todayKeyWIB(date = new Date()) {
    // WIB = UTC+7. Hitung tanggal WIB agar dedup harian konsisten walau server di UTC (Vercel).
    const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const y = wib.getUTCFullYear();
    const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
    const d = String(wib.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function getLastSentMap() {
    if (hasKvConfig()) {
        try {
            const data = await kvCommand(['GET', KV_LAST_SENT_KEY]);
            const raw = data && data.result;
            if (!raw) return {};
            if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
            return JSON.parse(String(raw));
        } catch {
            return {};
        }
    }
    for (const p of [PRIMARY_LAST_SENT_PATH, FALLBACK_LAST_SENT_PATH]) {
        if (!fs.existsSync(p)) continue;
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch {
            // abaikan
        }
    }
    return {};
}

async function setLastSentMap(map) {
    if (hasKvConfig()) {
        await kvCommand(['SET', KV_LAST_SENT_KEY, JSON.stringify(map)]);
    }
    const data = JSON.stringify(map, null, 2) + '\n';
    for (const p of [PRIMARY_LAST_SENT_PATH, FALLBACK_LAST_SENT_PATH]) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            break;
        } catch (e) {
            if (isReadOnlyError(e)) continue;
            throw e;
        }
    }
}

async function shouldSendDailyReminder(dayKey = todayKeyWIB()) {
    const map = await getLastSentMap();
    return map[dayKey] === undefined;
}

async function markDailyReminderSent(dayKey = todayKeyWIB()) {
    const map = await getLastSentMap();
    map[dayKey] = new Date().toISOString();
    // simpan 7 hari terakhir saja biar tidak membengkak
    const keys = Object.keys(map).sort().slice(-7);
    const trimmed = {};
    for (const k of keys) trimmed[k] = map[k];
    await setLastSentMap(trimmed);
    return trimmed;
}

function buildReminderPayload() {
    return {
        title: 'Reminder logbook MagangHub',
        body: 'Sudah jam 15.40, jangan lupa generate logbook hari ini ya.',
        tag: `daily-reminder-${todayKeyWIB()}`,
        url: '/',
    };
}

async function sendToSubscription(sub, payload) {
    const webpush = await getWebPush();
    if (!webpush) throw new Error('Push belum dikonfigurasi. Generate VAPID: npx web-push generate-vapid-keys, lalu isi VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY di .env / Vercel Env.');
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (Buffer.byteLength(data, 'utf-8') > 4096) throw new Error('Payload push maksimal ~4KB.');
    return webpush.sendNotification(sub, data);
}

async function sendReminderToAll(payload = buildReminderPayload()) {
    const subs = await listSubscriptions();
    if (subs.length === 0) return { sent: 0, failed: 0, removed: 0, total: 0 };
    let sent = 0;
    let failed = 0;
    const dead = [];
    await Promise.all(subs.map(async (sub) => {
        try {
            await sendToSubscription(sub, payload);
            sent += 1;
        } catch (e) {
            const status = e && (e.statusCode || e.status);
            if (status === 404 || status === 410) {
                dead.push(sub.endpoint);
            } else {
                failed += 1;
            }
        }
    }));
    let removed = 0;
    for (const ep of dead) {
        try {
            await removeSubscription(ep);
            removed += 1;
        } catch {
            // abaikan
        }
    }
    return { sent, failed, removed, total: subs.length };
}

export {
    KV_PUSH_KEY,
    KV_LAST_SENT_KEY,
    PRIMARY_SUBS_PATH,
    FALLBACK_SUBS_PATH,
    getVapidKeys,
    isPushConfigured,
    getWebPush,
    isValidSubscription,
    listSubscriptions,
    saveSubscription,
    removeSubscription,
    todayKeyWIB,
    shouldSendDailyReminder,
    markDailyReminderSent,
    buildReminderPayload,
    sendToSubscription,
    sendReminderToAll,
};
