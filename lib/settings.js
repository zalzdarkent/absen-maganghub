import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env');

const KNOWN_KEYS = ['GEMINI_API_KEY', 'REPO_PATH', 'GEMINI_MODEL'];

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
    const lines = KNOWN_KEYS
        .filter((k) => merged[k] !== undefined && merged[k] !== '')
        .map((k) => `${k}=${merged[k]}`);
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
    // keep the running process in sync without needing a restart
    for (const k of KNOWN_KEYS) {
        if (merged[k] !== undefined) process.env[k] = merged[k];
    }
}

/**
 * Returns settings for display in the UI. The API key is masked
 * so the raw value never gets sent back to the browser.
 */
function getSettingsForDisplay() {
    const env = { ...readEnvFile(), ...process.env };
    const apiKey = env.GEMINI_API_KEY || '';
    const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
    return {
        hasApiKey: Boolean(apiKey),
        apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}${'•'.repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}` : '',
        repoPath: env.REPO_PATH || process.cwd(),
        geminiModel: model,
    };
}

function saveSettings({ apiKey, repoPath, geminiModel }) {
    const toWrite = {};
    if (apiKey) toWrite.GEMINI_API_KEY = apiKey;
    if (repoPath) toWrite.REPO_PATH = repoPath;
    if (geminiModel) toWrite.GEMINI_MODEL = geminiModel;
    writeEnvFile(toWrite);
    return getSettingsForDisplay();
}

export { getSettingsForDisplay, saveSettings, readEnvFile };
