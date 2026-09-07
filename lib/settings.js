import fs from 'fs';
import os from 'os';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env');
const PRIMARY_SETTINGS_PATH = path.join(process.cwd(), 'settings.json');
const FALLBACK_SETTINGS_PATH = path.join(os.tmpdir(), 'absen-maganghub-settings.json');
const SETTINGS_PATH = PRIMARY_SETTINGS_PATH;
const FALLBACK_ENV_PATH = path.join(os.tmpdir(), 'absen-maganghub.env');

const KNOWN_ENV_KEYS = ['GEMINI_API_KEY', 'GITHUB_TOKEN', 'GEMINI_MODEL'];
const KV_SETTINGS_KEY = 'maganghub:settings';

function isReadOnlyError(error) {
    const code = error && error.code ? String(error.code) : '';
    const msg = String(error && error.message || '');
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

async function readSettingsFromKv() {
    if (!hasKvConfig()) return null;
    const data = await kvCommand(['GET', KV_SETTINGS_KEY]);
    const raw = data && data.result;
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

async function writeSettingsToKv(values) {
    if (!hasKvConfig()) return false;
    await kvCommand(['SET', KV_SETTINGS_KEY, JSON.stringify(values)]);
    return true;
}

function readEnvFile() {
    if (!fs.existsSync(ENV_PATH)) return {};
    try {
        const raw = fs.readFileSync(ENV_PATH, 'utf-8');
        const result = {};
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const idx = trimmed.indexOf('=');
            if (idx === -1) continue;
            const key = trimmed.slice(0, idx).trim();
            let value = trimmed.slice(idx + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            result[key] = value;
        }
        return result;
    } catch {
        return {};
    }
}

function writeEnvFile(values) {
    const merged = { ...readEnvFile(), ...values };
    const lines = KNOWN_ENV_KEYS
        .filter((k) => merged[k] !== undefined && merged[k] !== '')
        .map((k) => `${k}=${merged[k]}`);
    const content = lines.join('\n') + '\n';
    const tryPaths = [ENV_PATH, FALLBACK_ENV_PATH];
    let lastErr = null;
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, content, 'utf-8');
            lastErr = null;
            break;
        } catch (e) {
            if (isReadOnlyError(e)) {
                lastErr = e;
                continue;
            }
            throw e;
        }
    }
    for (const k of KNOWN_ENV_KEYS) {
        if (merged[k] !== undefined) process.env[k] = merged[k];
    }
    if (lastErr && isReadOnlyError(lastErr)) {
        // memory-only fallback
    }
}

function readSettingsFileLocal() {
    const orderedPaths = process.env.VERCEL
        ? [FALLBACK_SETTINGS_PATH, PRIMARY_SETTINGS_PATH]
        : [PRIMARY_SETTINGS_PATH, FALLBACK_SETTINGS_PATH];
    const candidates = orderedPaths.filter(p => fs.existsSync(p));
    if (candidates.length === 0) return {};

    for (const p of candidates) {
        try {
            const raw = fs.readFileSync(p, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            return {};
        } catch {
            // try next candidate
        }
    }
    return {};
}

async function readSettingsFile() {
    const kvSettings = await readSettingsFromKv();
    if (kvSettings && Object.keys(kvSettings).length > 0) return kvSettings;
    return readSettingsFileLocal();
}

function writeSettingsFileLocal(toSave) {
    const data = JSON.stringify(toSave, null, 2) + '\n';
    const tryPaths = [PRIMARY_SETTINGS_PATH, FALLBACK_SETTINGS_PATH];
    let lastErr = null;
    let wrote = false;
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            wrote = true;
        } catch (e) {
            if (isReadOnlyError(e)) {
                lastErr = e;
                continue;
            }
            throw e;
        }
    }
    if (wrote) return true;
    if (lastErr) throw lastErr;
    return false;
}

function sanitizeRepositories(repos) {
    if (!Array.isArray(repos)) return [];
    const seen = new Set();
    const out = [];
    for (const r of repos) {
        if (!r || typeof r !== 'object') continue;
        const url = String(r.url || r.repoPath || '').trim();
        if (!url) continue;
        if (url.includes('***') || url.includes('•')) continue;
        if (seen.has(url)) continue;
        const label = String(r.label || '').trim().slice(0, 30) || deriveLabel(url);
        const id = String(r.id || '').trim() || slugId(label, url);
        seen.add(url);
        out.push({ id, label, url });
        if (out.length >= 5) break;
    }
    return out;
}

function deriveLabel(url) {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return `${parts[parts.length-2]}/${parts[parts.length-1]}`.replace(/\.git$/, '').slice(0,30);
    } catch {}
    const segs = String(url).split('/').filter(Boolean);
    return (segs[segs.length-1] || url).replace(/\.git$/, '').slice(0,30) || 'repo';
}

function slugId(label, url) {
    const base = String(label || url).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,20) || 'repo';
    const suffix = Math.random().toString(36).slice(2,6);
    return `${base}-${suffix}`;
}

async function writeSettingsFile(values) {
    const current = await readSettingsFile();
    const merged = { ...current, ...values };
    const toSave = {};

    if (merged.repoPath !== undefined) {
        toSave.repoPath = String(merged.repoPath).trim();
    }
    if (merged.repositories !== undefined) {
        toSave.repositories = sanitizeRepositories(merged.repositories);
    } else if (current.repositories) {
        toSave.repositories = sanitizeRepositories(current.repositories);
    }
    if (merged.activeRepoId !== undefined) {
        const v = String(merged.activeRepoId || '').trim();
        if (v) toSave.activeRepoId = v;
    } else if (current.activeRepoId) {
        toSave.activeRepoId = String(current.activeRepoId).trim();
    }
    if (merged.defaultRepoIds !== undefined) {
        const arr = Array.isArray(merged.defaultRepoIds) ? merged.defaultRepoIds : [];
        toSave.defaultRepoIds = arr.map(s=>String(s).trim()).filter(Boolean).slice(0,5);
    } else if (current.defaultRepoIds) {
        toSave.defaultRepoIds = current.defaultRepoIds;
    }

    // ensure activeRepoId is valid
    if (toSave.repositories && toSave.repositories.length > 0) {
        const ids = new Set(toSave.repositories.map(r=>r.id));
        if (toSave.activeRepoId && !ids.has(toSave.activeRepoId)) {
            toSave.activeRepoId = toSave.repositories[0].id;
        }
        if (!toSave.activeRepoId) toSave.activeRepoId = toSave.repositories[0].id;
        if (toSave.defaultRepoIds) {
            toSave.defaultRepoIds = toSave.defaultRepoIds.filter(id=>ids.has(id));
            if (toSave.defaultRepoIds.length===0) toSave.defaultRepoIds = [toSave.activeRepoId];
        }
    }

    if (process.env.VERCEL && !hasKvConfig()) {
        throw new Error('Pengaturan tidak bisa disimpan permanen di Vercel tanpa storage. Tambahkan Vercel KV/Upstash lalu set env KV_REST_API_URL dan KV_REST_API_TOKEN, atau set REPO_PATH langsung di Environment Variables Vercel.');
    }

    const wroteKv = await writeSettingsToKv(toSave);
    try {
        writeSettingsFileLocal(toSave);
    } catch (e) {
        if (!isReadOnlyError(e)) throw e;
        if (!wroteKv) {
            throw new Error(`Gagal menyimpan pengaturan: filesystem read-only dan KV belum dikonfigurasi. Tambahkan Vercel KV/Upstash env KV_REST_API_URL + KV_REST_API_TOKEN. Detail: ${e.message}`);
        }
    }

    if (toSave.repoPath !== undefined) process.env.REPO_PATH = toSave.repoPath;
    return toSave;
}

async function removeRepoPathFromEnvFile() {
    if (!fs.existsSync(ENV_PATH)) return;
    try {
        const raw = fs.readFileSync(ENV_PATH, 'utf-8');
        const filtered = raw
            .split('\n')
            .filter((line) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return true;
                const idx = trimmed.indexOf('=');
                if (idx === -1) return true;
                const key = trimmed.slice(0, idx).trim();
                return key !== 'REPO_PATH';
            })
            .join('\n');
        const normalized = filtered.endsWith('\n') ? filtered : filtered + '\n';
        if (normalized !== raw) {
            try {
                fs.writeFileSync(ENV_PATH, normalized, 'utf-8');
            } catch (e) {
                if (isReadOnlyError(e)) return;
                throw e;
            }
        }
    } catch (e) {
        if (isReadOnlyError(e)) return;
        throw e;
    }
    const envFileAfter = readEnvFile();
    if (envFileAfter.REPO_PATH === undefined && process.env.REPO_PATH !== undefined) {
        const settings = await readSettingsFile();
        if (settings.repoPath !== undefined && String(settings.repoPath).trim() !== '') {
            delete process.env.REPO_PATH;
        }
    }
}

async function ensureRepoPathMigrated() {
    try {
        const envFile = readEnvFile();
        const settings = await readSettingsFile();
        const hasSettingsRepo = settings.repoPath !== undefined && String(settings.repoPath).trim() !== '';
        const hasEnvRepo = envFile.REPO_PATH !== undefined && String(envFile.REPO_PATH).trim() !== '';
        const hasRepos = Array.isArray(settings.repositories) && settings.repositories.length > 0;
        if (!hasSettingsRepo && !hasRepos && hasEnvRepo) {
            await writeSettingsFile({ repoPath: String(envFile.REPO_PATH).trim() });
            await removeRepoPathFromEnvFile();
        } else if ((hasSettingsRepo || hasRepos) && hasEnvRepo) {
            await removeRepoPathFromEnvFile();
        }
        // migrate single repoPath to repositories array if needed
        if (hasSettingsRepo && !hasRepos) {
            const url = String(settings.repoPath).trim();
            if (url) {
                const repos = sanitizeRepositories([{ label: deriveLabel(url), url, id: slugId(deriveLabel(url), url) }]);
                if (repos.length) await writeSettingsFile({ repositories: repos, activeRepoId: repos[0].id, defaultRepoIds: [repos[0].id] });
            }
        }
    } catch (e) {
        if (isReadOnlyError(e)) return;
        throw e;
    }
}

function maskRepoPath(value) {
    const repoPath = String(value || '');
    try {
        const url = new URL(repoPath);
        if (!url.username && !url.password) return repoPath;
        const credentials = url.username ? `${url.username}:***@` : '***@';
        return `${url.protocol}//${credentials}${url.host}${url.pathname}${url.search}`;
    } catch {
        return repoPath;
    }
}

async function getSettingsForDisplay() {
    await ensureRepoPathMigrated();
    const env = { ...readEnvFile(), ...process.env };
    const settings = await readSettingsFile();
    const apiKey = env.GEMINI_API_KEY || '';
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const hasSettingsRepo = settings.repoPath !== undefined && String(settings.repoPath).trim() !== '';
    const rawRepoPath = hasSettingsRepo ? settings.repoPath : (env.REPO_PATH || '');
    const effectiveRepoPath = rawRepoPath && String(rawRepoPath).trim() !== '' ? String(rawRepoPath).trim() : process.cwd();
    const repositories = sanitizeRepositories(settings.repositories || []);
    // if still empty but has effective path that is not cwd, add it
    let reposForDisplay = repositories;
    if (reposForDisplay.length === 0 && effectiveRepoPath !== process.cwd()) {
        reposForDisplay = sanitizeRepositories([{ label: deriveLabel(effectiveRepoPath), url: effectiveRepoPath, id: 'default' }]);
    }
    return {
        hasApiKey: Boolean(apiKey),
        apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}${'•'.repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}` : '',
        repoPath: maskRepoPath(effectiveRepoPath),
        geminiModel: model,
        persistentSettings: hasKvConfig() || !process.env.VERCEL,
        isVercel: Boolean(process.env.VERCEL),
        repositories: reposForDisplay.map(r => ({ ...r, url: maskRepoPath(r.url) })),
        activeRepoId: settings.activeRepoId || (reposForDisplay[0]?.id || null),
        defaultRepoIds: Array.isArray(settings.defaultRepoIds) ? settings.defaultRepoIds : (reposForDisplay[0] ? [reposForDisplay[0].id] : []),
    };
}

async function getEffectiveRepoPath(repoId) {
    await ensureRepoPathMigrated();
    const settings = await readSettingsFile();
    const repos = sanitizeRepositories(settings.repositories || []);
    if (repoId && repos.length) {
        const found = repos.find(r=>r.id===String(repoId).trim());
        if (found) return String(found.url).trim();
    }
    if (repos.length && settings.activeRepoId) {
        const active = repos.find(r=>r.id===settings.activeRepoId);
        if (active) return String(active.url).trim();
    }
    if (repos.length) return String(repos[0].url).trim();
    if (settings.repoPath !== undefined && String(settings.repoPath).trim() !== '') {
        return String(settings.repoPath).trim();
    }
    const env = { ...readEnvFile(), ...process.env };
    if (env.REPO_PATH && String(env.REPO_PATH).trim() !== '') return String(env.REPO_PATH).trim();
    if (process.env.REPO_PATH && String(process.env.REPO_PATH).trim() !== '') return String(process.env.REPO_PATH).trim();
    return process.cwd();
}

async function getRepositories() {
    await ensureRepoPathMigrated();
    const settings = await readSettingsFile();
    return sanitizeRepositories(settings.repositories || []);
}

async function saveSettings({ apiKey, repoPath, geminiModel, githubToken, repositories, activeRepoId, defaultRepoIds } = {}) {
    if (repositories !== undefined) {
        const sanitized = sanitizeRepositories(repositories);
        await writeSettingsFile({ repositories: sanitized });
        if (activeRepoId !== undefined) {
            const id = String(activeRepoId || '').trim();
            const ids = new Set(sanitized.map(r=>r.id));
            if (!id || !ids.has(id)) {
                if (sanitized.length) await writeSettingsFile({ activeRepoId: sanitized[0].id });
            } else {
                await writeSettingsFile({ activeRepoId: id });
            }
        }
        if (defaultRepoIds !== undefined) {
            const arr = Array.isArray(defaultRepoIds) ? defaultRepoIds.map(s=>String(s).trim()).filter(Boolean) : [];
            const ids = new Set(sanitized.map(r=>r.id));
            const filtered = arr.filter(id=>ids.has(id)).slice(0,5);
            await writeSettingsFile({ defaultRepoIds: filtered.length? filtered : sanitized.slice(0,1).map(r=>r.id) });
        }
    }
    if (repoPath !== undefined) {
        const trimmed = String(repoPath).trim();
        if (!trimmed.includes('***')) {
            await writeSettingsFile({ repoPath: trimmed });
            // also migrate to repositories if none exists
            const current = await readSettingsFile();
            if (!current.repositories || current.repositories.length===0) {
                const repos = sanitizeRepositories([{ label: deriveLabel(trimmed), url: trimmed, id: slugId(deriveLabel(trimmed), trimmed) }]);
                if (repos.length) await writeSettingsFile({ repositories: repos, activeRepoId: repos[0].id, defaultRepoIds: [repos[0].id] });
            }
        }
    }
    const toWriteEnv = {};
    if (apiKey !== undefined && String(apiKey).trim() !== '') {
        const v = String(apiKey).trim();
        if (!v.includes('•') && !v.includes('***')) toWriteEnv.GEMINI_API_KEY = v;
    }
    if (geminiModel !== undefined && String(geminiModel).trim() !== '') {
        toWriteEnv.GEMINI_MODEL = String(geminiModel).trim();
    }
    if (githubToken !== undefined && String(githubToken).trim() !== '') {
        const v = String(githubToken).trim();
        if (!v.includes('•') && !v.includes('***')) toWriteEnv.GITHUB_TOKEN = v;
    }
    if (Object.keys(toWriteEnv).length > 0) {
        writeEnvFile(toWriteEnv);
    } else {
        const envFile = readEnvFile();
        if (envFile.REPO_PATH !== undefined) await removeRepoPathFromEnvFile();
    }
    return getSettingsForDisplay();
}

export { getSettingsForDisplay, saveSettings, readEnvFile, readSettingsFile, writeSettingsFile, getEffectiveRepoPath, getRepositories, SETTINGS_PATH, ENV_PATH, PRIMARY_SETTINGS_PATH, FALLBACK_SETTINGS_PATH };
