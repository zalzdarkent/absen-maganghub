import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env');
const SETTINGS_PATH = path.join(process.cwd(), 'settings.json');

const KNOWN_ENV_KEYS = ['GEMINI_API_KEY', 'GITHUB_TOKEN', 'GEMINI_MODEL'];

function readEnvFile() {
    if (!fs.existsSync(ENV_PATH)) return {};
    const raw = fs.readFileSync(ENV_PATH, 'utf-8');
    const result = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        // strip surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

function writeEnvFile(values) {
    const merged = { ...readEnvFile(), ...values };
    // REPO_PATH is intentionally excluded — now stored in settings.json
    const lines = KNOWN_ENV_KEYS
        .filter((k) => merged[k] !== undefined && merged[k] !== '')
        .map((k) => `${k}=${merged[k]}`);
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
    // keep the running process in sync without needing a restart
    for (const k of KNOWN_ENV_KEYS) {
        if (merged[k] !== undefined) process.env[k] = merged[k];
    }
    // Ensure REPO_PATH is not lingering in process.env from .env
    // (actual effective repoPath lives in settings.json)
    // We don't delete process.env.REPO_PATH here if it was set via environment variable externally,
    // but we do ensure file-based REPO_PATH is gone — effective repoPath is resolved via settings file.
}

function readSettingsFile() {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    try {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        return {};
    } catch {
        return {};
    }
}

function writeSettingsFile(values) {
    const current = readSettingsFile();
    const merged = { ...current, ...values };
    // Only persist repoPath for now — keep file minimal & explicit
    const toSave = {};
    if (merged.repoPath !== undefined) {
        toSave.repoPath = String(merged.repoPath).trim();
    }
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
    return toSave;
}

function removeRepoPathFromEnvFile() {
    if (!fs.existsSync(ENV_PATH)) return;
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
    // Normalize trailing newline
    const normalized = filtered.endsWith('\n') ? filtered : filtered + '\n';
    if (normalized !== raw) {
        fs.writeFileSync(ENV_PATH, normalized, 'utf-8');
    }
    // Also sync process.env if REPO_PATH came from file; keep external env var if set outside file
    // We can't distinguish, so we only delete from process.env if file had it and no external override is intended.
    // To avoid breaking external env, we check if file originally had REPO_PATH — we just removed it,
    // so we delete from process.env as well to reflect file state. External env can be re-set via shell if needed.
    const envFileAfter = readEnvFile();
    if (envFileAfter.REPO_PATH === undefined && process.env.REPO_PATH !== undefined) {
        // Check if settings.json already has a value — if so, file-based REPO_PATH should not leak into process.env
        const settings = readSettingsFile();
        if (settings.repoPath !== undefined) {
            delete process.env.REPO_PATH;
        }
    }
}

function ensureRepoPathMigrated() {
    const envFile = readEnvFile();
    const settings = readSettingsFile();
    const hasSettingsRepo = settings.repoPath !== undefined && String(settings.repoPath).trim() !== '';
    const hasEnvRepo = envFile.REPO_PATH !== undefined && String(envFile.REPO_PATH).trim() !== '';
    if (!hasSettingsRepo && hasEnvRepo) {
        writeSettingsFile({ repoPath: String(envFile.REPO_PATH).trim() });
        removeRepoPathFromEnvFile();
    } else if (hasSettingsRepo && hasEnvRepo) {
        // settings.json is source of truth — clean lingering REPO_PATH from .env
        removeRepoPathFromEnvFile();
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
    // Effective repoPath: settings.json (if non-empty) > env REPO_PATH (fallback before migration) > cwd
    const hasSettingsRepo = settings.repoPath !== undefined && String(settings.repoPath).trim() !== '';
    const rawRepoPath = hasSettingsRepo ? settings.repoPath : (env.REPO_PATH || '');
    const effectiveRepoPath = rawRepoPath && String(rawRepoPath).trim() !== '' ? String(rawRepoPath).trim() : process.cwd();
    return {
        hasApiKey: Boolean(apiKey),
        apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}${'•'.repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}` : '',
        repoPath: maskRepoPath(effectiveRepoPath),
        geminiModel: model,
        // raw value for internal use (not masked) is available via getEffectiveRepoPath()
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
    return process.cwd();
}

function saveSettings({ apiKey, repoPath, geminiModel, githubToken } = {}) {
    // Handle REPO_PATH via settings.json (primary)
    if (repoPath !== undefined) {
        const trimmed = String(repoPath).trim();
        // Ignore masked values (e.g. https://user:***@github.com/...)
        if (!trimmed.includes('***')) {
            writeSettingsFile({ repoPath: trimmed });
        }
    }

    // Handle remaining env keys (kept for backward compat, but UI no longer exposes them)
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
        // Ensure any lingering REPO_PATH is cleaned even when only repoPath was updated
        const envFile = readEnvFile();
        if (envFile.REPO_PATH !== undefined) removeRepoPathFromEnvFile();
    }

    return getSettingsForDisplay();
}

export { getSettingsForDisplay, saveSettings, readEnvFile, readSettingsFile, writeSettingsFile, getEffectiveRepoPath, SETTINGS_PATH, ENV_PATH };
