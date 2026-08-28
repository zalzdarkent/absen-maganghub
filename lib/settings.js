import fs from 'fs';
import os from 'os';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env');
const PRIMARY_SETTINGS_PATH = path.join(process.cwd(), 'settings.json');
const FALLBACK_SETTINGS_PATH = path.join(os.tmpdir(), 'absen-maganghub-settings.json');
// Vercel's writable dir is /tmp ; os.tmpdir() returns /tmp on Vercel, and e.g. C:\...\Temp on Windows
const SETTINGS_PATH = PRIMARY_SETTINGS_PATH; // kept for backwards compat export
const FALLBACK_ENV_PATH = path.join(os.tmpdir(), 'absen-maganghub.env');

const KNOWN_ENV_KEYS = ['GEMINI_API_KEY', 'GITHUB_TOKEN', 'GEMINI_MODEL'];

function isReadOnlyError(error) {
    const code = error && error.code ? String(error.code) : '';
    const msg = String(error && error.message || '');
    return code === 'EROFS' || code === 'EACCES' || code === 'EPERM' || msg.includes('read-only') || msg.includes('EROFS');
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
    // On Vercel, /var/task is read-only. env vars should be set via Vercel dashboard / process.env.
    // If we can't write, just keep process.env in sync and don't crash.
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
    // keep the running process in sync without needing a restart
    for (const k of KNOWN_ENV_KEYS) {
        if (merged[k] !== undefined) process.env[k] = merged[k];
    }
    // If both paths failed due to read-only, we still updated process.env (in-memory) for current request.
    // Don't throw, just warn invisibly — caller can still proceed.
    if (lastErr && isReadOnlyError(lastErr)) {
        // Silently fallback to memory-only; Vercel uses env vars anyway.
    }
}

function readSettingsFile() {
    // On Vercel: /tmp/settings.json is writable, /var/task/settings.json is read-only bundle.
    // If both exist, pick the newest (fallback is written after deploy, so it's more recent).
    const candidates = [FALLBACK_SETTINGS_PATH, PRIMARY_SETTINGS_PATH].filter(p => fs.existsSync(p));
    if (candidates.length === 0) return {};
    // Sort by mtime descending (newest first) so fallback written later wins, but primary wins locally if it's newer
    candidates.sort((a, b) => {
        try {
            const ta = fs.statSync(a).mtimeMs;
            const tb = fs.statSync(b).mtimeMs;
            return tb - ta;
        } catch { return 0; }
    });
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

function writeSettingsFile(values) {
    const current = readSettingsFile();
    const merged = { ...current, ...values };
    const toSave = {};
    if (merged.repoPath !== undefined) {
        toSave.repoPath = String(merged.repoPath).trim();
    }
    const data = JSON.stringify(toSave, null, 2) + '\n';

    // Try primary first (local dev), fallback to /tmp on Vercel read-only
    const tryPaths = [PRIMARY_SETTINGS_PATH, FALLBACK_SETTINGS_PATH];
    let lastErr = null;
    for (const p of tryPaths) {
        try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, data, 'utf-8');
            return toSave;
        } catch (e) {
            if (isReadOnlyError(e)) {
                lastErr = e;
                continue;
            }
            throw e;
        }
    }
    // If we reach here, both failed
    if (lastErr) {
        // As last resort, keep in memory via process.env for current instance (ephemeral on Vercel)
        if (toSave.repoPath !== undefined) process.env.REPO_PATH = toSave.repoPath;
        // Throw with friendly message so UI can show toaster instead of raw EROFS
        throw new Error(`Gagal menyimpan pengaturan: filesystem read-only (Vercel). Repo disimpan sementara di memory — akan hilang saat function restart. Solusi: set env var REPO_PATH di Vercel Dashboard, atau gunakan storage persisten. Detail: ${lastErr.message}`);
    }
    return toSave;
}

function removeRepoPathFromEnvFile() {
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
                if (isReadOnlyError(e)) {
                    // On Vercel, .env is read-only — ignore, migration already handled via settings.json
                    return;
                }
                throw e;
            }
        }
    } catch (e) {
        if (isReadOnlyError(e)) return;
        throw e;
    }
    const envFileAfter = readEnvFile();
    if (envFileAfter.REPO_PATH === undefined && process.env.REPO_PATH !== undefined) {
        const settings = readSettingsFile();
        if (settings.repoPath !== undefined && String(settings.repoPath).trim() !== '') {
            delete process.env.REPO_PATH;
        }
    }
}

function ensureRepoPathMigrated() {
    try {
        const envFile = readEnvFile();
        const settings = readSettingsFile();
        const hasSettingsRepo = settings.repoPath !== undefined && String(settings.repoPath).trim() !== '';
        const hasEnvRepo = envFile.REPO_PATH !== undefined && String(envFile.REPO_PATH).trim() !== '';
        if (!hasSettingsRepo && hasEnvRepo) {
            writeSettingsFile({ repoPath: String(envFile.REPO_PATH).trim() });
            removeRepoPathFromEnvFile();
        } else if (hasSettingsRepo && hasEnvRepo) {
            removeRepoPathFromEnvFile();
        }
    } catch (e) {
        if (isReadOnlyError(e)) return;
        // rethrow other errors
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

/**
 * Returns settings for display in the UI. The API key is masked
 * so the raw value never gets sent back to the browser.
 * repoPath is now sourced from settings.json (migrated from .env if needed).
 */
function getSettingsForDisplay() {
    ensureRepoPathMigrated();
    const env = { ...readEnvFile(), ...process.env };
    const settings = readSettingsFile();
    const apiKey = env.GEMINI_API_KEY || '';
    const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
    const hasSettingsRepo = settings.repoPath !== undefined && String(settings.repoPath).trim() !== '';
    const rawRepoPath = hasSettingsRepo ? settings.repoPath : (env.REPO_PATH || '');
    const effectiveRepoPath = rawRepoPath && String(rawRepoPath).trim() !== '' ? String(rawRepoPath).trim() : process.cwd();
    return {
        hasApiKey: Boolean(apiKey),
        apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}${'•'.repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}` : '',
        repoPath: maskRepoPath(effectiveRepoPath),
        geminiModel: model,
    };
}

function getEffectiveRepoPath() {
    ensureRepoPathMigrated();
    const settings = readSettingsFile();
    if (settings.repoPath !== undefined && String(settings.repoPath).trim() !== '') {
        return String(settings.repoPath).trim();
    }
    const env = { ...readEnvFile(), ...process.env };
    if (env.REPO_PATH && String(env.REPO_PATH).trim() !== '') return String(env.REPO_PATH).trim();
    // Fallback: Vercel may set REPO_PATH as env var; process.env already checked above via env spread
    if (process.env.REPO_PATH && String(process.env.REPO_PATH).trim() !== '') return String(process.env.REPO_PATH).trim();
    return process.cwd();
}

function saveSettings({ apiKey, repoPath, geminiModel, githubToken } = {}) {
    if (repoPath !== undefined) {
        const trimmed = String(repoPath).trim();
        if (!trimmed.includes('***')) {
            writeSettingsFile({ repoPath: trimmed });
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
        if (envFile.REPO_PATH !== undefined) removeRepoPathFromEnvFile();
    }
    return getSettingsForDisplay();
}

export { getSettingsForDisplay, saveSettings, readEnvFile, readSettingsFile, writeSettingsFile, getEffectiveRepoPath, SETTINGS_PATH, ENV_PATH, PRIMARY_SETTINGS_PATH, FALLBACK_SETTINGS_PATH };
