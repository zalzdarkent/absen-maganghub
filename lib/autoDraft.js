import fs from 'fs';
import os from 'os';
import path from 'path';

const KV_AUTO_DRAFT_KEY = 'maganghub:auto-draft';
const PRIMARY_AUTO_DRAFT_PATH = path.join(process.cwd(), 'auto-draft.json');
const FALLBACK_AUTO_DRAFT_PATH = path.join(os.tmpdir(), 'absen-maganghub-auto-draft.json');

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

async function readAutoDraftFromKv() {
    if (!hasKvConfig()) return null;
    try {
        const data = await kvCommand(['GET', KV_AUTO_DRAFT_KEY]);
        const raw = data && data.result;
        if (!raw) return null;
        if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
        console.warn('[autoDraft] KV read gagal:', String(e.message).slice(0, 120));
        return null;
    }
}

async function writeAutoDraftToKv(payload) {
    if (!hasKvConfig()) return false;
    await kvCommand(['SET', KV_AUTO_DRAFT_KEY, JSON.stringify(payload)]);
    return true;
}

async function deleteAutoDraftFromKv() {
    if (!hasKvConfig()) return false;
    await kvCommand(['DEL', KV_AUTO_DRAFT_KEY]);
    return true;
}

function readAutoDraftFileLocal() {
    const ordered = process.env.VERCEL
        ? [FALLBACK_AUTO_DRAFT_PATH, PRIMARY_AUTO_DRAFT_PATH]
        : [PRIMARY_AUTO_DRAFT_PATH, FALLBACK_AUTO_DRAFT_PATH];
    for (const p of ordered) {
        if (!fs.existsSync(p)) continue;
        try {
            const raw = fs.readFileSync(p, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch {}
    }
    return null;
}

function writeAutoDraftFileLocal(payload) {
    const data = JSON.stringify(payload, null, 2) + '\n';
    const tryPaths = [PRIMARY_AUTO_DRAFT_PATH, FALLBACK_AUTO_DRAFT_PATH];
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            return true;
        } catch (e) {
            if (isReadOnlyError(e)) continue;
            throw e;
        }
    }
    return false;
}

function deleteAutoDraftFileLocal() {
    for (const p of [PRIMARY_AUTO_DRAFT_PATH, FALLBACK_AUTO_DRAFT_PATH]) {
        try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
    }
}

async function getAutoDraft() {
    const fromKv = await readAutoDraftFromKv();
    if (fromKv !== null) return fromKv;
    return readAutoDraftFileLocal();
}

async function saveAutoDraft(payload) {
    // payload: { dayKey, draft, gitLogs, detailed, commits, generatedAt }
    let wroteKv = false;
    if (hasKvConfig()) {
        try {
            await writeAutoDraftToKv(payload);
            wroteKv = true;
        } catch (e) {
            console.warn('[autoDraft] KV write gagal:', String(e.message).slice(0, 120));
        }
    }
    try {
        writeAutoDraftFileLocal(payload);
    } catch (e) {
        if (isReadOnlyError(e) && wroteKv) return payload;
        throw e;
    }
    return payload;
}

async function clearAutoDraft() {
    let clearedKv = false;
    if (hasKvConfig()) {
        try {
            await deleteAutoDraftFromKv();
            clearedKv = true;
        } catch (e) {
            console.warn('[autoDraft] KV delete gagal:', String(e.message).slice(0, 120));
        }
    }
    try {
        deleteAutoDraftFileLocal();
    } catch (e) {
        if (isReadOnlyError(e) && clearedKv) return true;
        throw e;
    }
    return true;
}

export {
    KV_AUTO_DRAFT_KEY,
    PRIMARY_AUTO_DRAFT_PATH,
    FALLBACK_AUTO_DRAFT_PATH,
    getAutoDraft,
    saveAutoDraft,
    clearAutoDraft,
};
