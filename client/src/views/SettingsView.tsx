import { useEffect, useState } from 'react';
import type { SettingsResponse } from '../types';
import { api } from '../lib/api';
import {
  canUseDesktopNotifications,
  getDesktopNotificationPermission,
  notifyDesktop,
  requestDesktopNotificationPermission,
} from '../lib/notifications';
import {
  canUsePush,
  fetchPushStatus,
  getExistingPushSubscription,
  sendTestPush,
  subscribePush,
  syncPushSubscription,
  unsubscribePush,
} from '../lib/pushClient';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FolderGit2, AlertTriangle, Loader2, Plus, Trash2, Star, Cpu, Sparkles, Key, Server, CheckCircle2, RefreshCw } from 'lucide-react';
import type { Repository } from '../types';

export function SettingsView({ onSaved }: { onSaved: () => void }) {
  const { showToast } = useToast();
  const [_repoPath, setRepoPath] = useState('');
  void _repoPath;
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [defaultRepoIds, setDefaultRepoIds] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [persistentSettings, setPersistentSettings] = useState(true);
  const [isVercel, setIsVercel] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    getDesktopNotificationPermission()
  );
  const [pushSupported] = useState(() => canUsePush());
  const [pushActive, setPushActive] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushServerOk, setPushServerOk] = useState<boolean | null>(null);
  // true = browser punya subscription tapi server sudah tidak punya (perlu re-subscribe)
  const [pushDesync, setPushDesync] = useState(false);
  const [autoDraftLoading, setAutoDraftLoading] = useState(false);

  // AI & LLM Provider Settings
  const [llmProvider, setLlmProvider] = useState<'local' | 'gemini'>('local');
  const [localLlmUrl, setLocalLlmUrl] = useState('http://192.168.13.155:3000');
  const [localLlmModel, setLocalLlmModel] = useState('gpt-oss-20b');
  const [localLlmApiKey, setLocalLlmApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-3.6-flash');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [savingLlm, setSavingLlm] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function load() {
    try {
      const data = await api<SettingsResponse>('/api/settings');
      setRepoPath(data.repoPath || '');
      setRepositories(Array.isArray(data.repositories) ? data.repositories : []);
      setActiveRepoId(data.activeRepoId || (data.repositories && data.repositories[0]?.id) || null);
      setDefaultRepoIds(Array.isArray(data.defaultRepoIds) ? data.defaultRepoIds : []);
      setPersistentSettings(data.persistentSettings !== false);
      setIsVercel(Boolean(data.isVercel));
      setLlmProvider(data.llmProvider === 'gemini' ? 'gemini' : 'local');
      setLocalLlmUrl(data.localLlmUrl || 'http://192.168.13.155:3000');
      setLocalLlmModel(data.localLlmModel || 'gpt-oss-20b');
      setLocalLlmApiKey(data.localLlmApiKey || '');
      setGeminiModel(data.geminiModel || 'gemini-3.6-flash');
      setHasApiKey(Boolean(data.hasApiKey));
      setApiKeyMasked(data.apiKeyMasked || '');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat pengaturan', 'error');
    }
  }

  async function handleSaveLlmSettings(providerOverride?: 'local' | 'gemini') {
    setSavingLlm(true);
    setTestResult(null);
    const targetProvider = providerOverride || llmProvider;
    try {
      const payload: Record<string, string> = {
        llmProvider: targetProvider,
        localLlmUrl,
        localLlmModel,
        localLlmApiKey,
        geminiModel,
      };
      if (geminiApiKey.trim()) {
        payload.apiKey = geminiApiKey.trim();
      }
      await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
      setLlmProvider(targetProvider);
      setGeminiApiKey('');
      showToast(`Pengaturan model AI disimpan (${targetProvider === 'local' ? 'Local LLM' : 'Google Gemini'})`, 'success');
      load();
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan AI', 'error');
    } finally {
      setSavingLlm(false);
    }
  }

  async function handleTestLlm() {
    setTestingLlm(true);
    setTestResult(null);
    try {
      const payload: Record<string, string> = {
        provider: llmProvider,
        localLlmUrl,
        localLlmModel,
        localLlmApiKey,
        geminiModel,
      };
      if (geminiApiKey.trim()) payload.apiKey = geminiApiKey.trim();
      const res = await api<{ ok: boolean; message: string; latencyMs: number }>('/api/test-llm', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setTestResult({ ok: true, message: res.message || 'Koneksi berhasil!' });
      showToast(res.message || 'Koneksi model AI berhasil!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal terhubung ke model AI';
      setTestResult({ ok: false, message: msg });
      showToast(msg, 'error');
    } finally {
      setTestingLlm(false);
    }
  }

  useEffect(() => {
    load();
    setNotificationPermission(getDesktopNotificationPermission());
    (async () => {
      try {
        const status = await fetchPushStatus();
        setPushServerOk(Boolean(status.configured));
      } catch {
        setPushServerOk(false);
      }
      try {
        const existing = await getExistingPushSubscription();
        const isActive = Boolean(existing);
        setPushActive(isActive);
        // Cek apakah subscription browser masih sinkron dengan server
        if (isActive) {
          const syncResult = await syncPushSubscription();
          if (syncResult === 'resynced') {
            // Sudah otomatis diperbaiki
            showToast('Subscription push diperbaiki otomatis ✔', 'success');
          } else if (syncResult === 'error') {
            // Tidak bisa cek → anggap desync
            setPushDesync(true);
          }
          // Cek lagi status setelah sync
          try {
            const statusAfter = await fetchPushStatus();
            if (statusAfter.subscriptionCount === 0) {
              // Browser punya sub tapi server tetap 0 → perlu re-subscribe manual
              setPushDesync(true);
            } else {
              setPushDesync(false);
            }
          } catch {
            // abaikan
          }
        }
      } catch {
        setPushActive(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnableNotifications() {
    const permission = await requestDesktopNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      notifyDesktop('Notifikasi aktif', {
        body: 'Reminder jam 15.40 akan muncul di desktop.',
        tag: 'notification-test',
      });
      showToast('Notifikasi aktif', 'success');
    } else if (permission === 'unsupported') {
      showToast('Browser belum mendukung notifikasi.', 'warning');
    } else {
      showToast('Izin notifikasi belum diberikan.', 'warning');
    }
  }

  async function handleEnablePush() {
    setPushLoading(true);
    try {
      await subscribePush();
      setPushActive(true);
      setPushDesync(false);
      showToast('Push aktif', 'success');
      try {
        await sendTestPush();
      } catch {
        // subscribe sudah sukses, test push opsional
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengaktifkan push', 'error');
    } finally {
      setPushLoading(false);
    }
  }

  async function handleDisablePush() {
    setPushLoading(true);
    try {
      await unsubscribePush();
      setPushActive(false);
      showToast('Push dimatikan', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mematikan push', 'error');
    } finally {
      setPushLoading(false);
    }
  }

  async function handleTestPush() {
    setPushLoading(true);
    try {
      const result = await sendTestPush();
      if (result.total === 0 || result.warning) {
        showToast(
          result.warning ||
          'Tidak ada subscriber di server. Klik "Perbaiki" atau matikan lalu aktifkan kembali Web Push.',
          'warning'
        );
      } else {
        showToast(`Test terkirim ke ${result.sent}/${result.total} device`, result.sent > 0 ? 'success' : 'warning');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal kirim test push', 'error');
    } finally {
      setPushLoading(false);
    }
  }

  async function handleFixPush() {
    setPushLoading(true);
    try {
      // Unsubscribe dulu, lalu subscribe ulang
      await unsubscribePush();
      await subscribePush();
      setPushActive(true);
      setPushDesync(false);
      showToast('Push diperbaiki & diaktifkan ulang ✔ Coba Test sekarang.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal perbaiki push', 'error');
    } finally {
      setPushLoading(false);
    }
  }

  async function handleTestAutoDraft() {
    setAutoDraftLoading(true);
    try {
      const activeIds = defaultRepoIds.length ? defaultRepoIds : activeRepoId ? [activeRepoId] : [];
      await api('/api/auto-draft/generate', { method: 'POST', body: JSON.stringify({ repoIds: activeIds }) });
      showToast('Draft test siap — buka tab Generate untuk cek', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal generate auto-draft', 'error');
    } finally {
      setAutoDraftLoading(false);
    }
  }

  async function handleAddRepo() {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label || !url) {
      showToast('Label dan URL wajib diisi', 'warning');
      return;
    }
    if (repositories.length >= 5) {
      showToast('Maksimal 5 repo', 'warning');
      return;
    }
    setAddingRepo(true);
    try {
      const next = [...repositories, { id: `tmp-${Date.now()}`, label, url }];
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ repositories: next }) });
      setNewLabel('');
      setNewUrl('');
      showToast('Repo ditambah', 'success');
      load();
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal tambah repo', 'error');
    } finally {
      setAddingRepo(false);
    }
  }

  async function handleDeleteRepo(id: string) {
    if (!confirm('Hapus repo ini?')) return;
    try {
      const next = repositories.filter(r=> r.id !== id);
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ repositories: next }) });
      showToast('Repo dihapus', 'success');
      load();
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal hapus', 'error');
    }
  }

  async function handleSetActive(id: string) {
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ activeRepoId: id }) });
      showToast('Repo aktif diubah', 'success');
      load();
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal set aktif', 'error');
    }
  }

  async function handleToggleDefault(id: string) {
    const next = defaultRepoIds.includes(id) ? defaultRepoIds.filter(x=>x!==id) : [...defaultRepoIds, id].slice(0,3);
    if (next.length===0) {
      showToast('Minimal 1 repo untuk auto-draft', 'warning');
      return;
    }
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ defaultRepoIds: next }) });
      setDefaultRepoIds(next);
      showToast('Default auto-draft diperbarui', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal update', 'error');
    }
  }

  return (
    <div className="grid gap-6 max-w-[1100px]">
      {isVercel && !persistentSettings && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-300">Storage persisten belum dikonfigurasi</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Deploy Vercel butuh storage persisten. Tambahkan env <code className="rounded bg-background border px-1 py-0.5 font-mono text-[11px]">KV_REST_API_URL</code> +{' '}
              <code className="rounded bg-background border px-1 py-0.5 font-mono text-[11px]">KV_REST_API_TOKEN</code>, atau set{' '}
              <code className="rounded bg-background border px-1 py-0.5 font-mono text-[11px]">REPO_PATH</code> di Environment Variables Vercel.
            </p>
          </div>
        </div>
      )}

      {/* Model AI / LLM Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {llmProvider === 'local' ? <Cpu className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Model AI (LLM)
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    llmProvider === 'local' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  }`}>
                    {llmProvider === 'local' ? 'Local LLM' : 'Google Gemini (Cloud)'}
                  </span>
                </CardTitle>
                <CardDescription className="mt-1 text-xs leading-relaxed max-w-[60ch]">
                  Pilih generator draft logbook: gunakan server Local LLM (OpenAI-compatible) atau Google Gemini API.
                </CardDescription>
              </div>
            </div>

            {/* Provider Switcher Toggle */}
            <div className="inline-flex rounded-xl bg-muted p-1 border shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setLlmProvider('local');
                  handleSaveLlmSettings('local');
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  llmProvider === 'local'
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Cpu className="h-3.5 w-3.5 text-emerald-500" />
                <span>Local LLM</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLlmProvider('gemini');
                  handleSaveLlmSettings('gemini');
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  llmProvider === 'gemini'
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Google Gemini</span>
              </button>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6 space-y-4">
          {llmProvider === 'local' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>
                  Menggunakan server OpenAI-compatible lokal. Kamu bisa ganti URL, nama model, atau API key kapan saja.
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Server className="h-3 w-3" /> API Endpoint URL
                  </Label>
                  <Input
                    value={localLlmUrl}
                    onChange={(e) => setLocalLlmUrl(e.target.value)}
                    placeholder="http://192.168.13.155:3000"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">URL server Local LLM kamu</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> Model Name
                  </Label>
                  <Input
                    value={localLlmModel}
                    onChange={(e) => setLocalLlmModel(e.target.value)}
                    placeholder="gpt-oss-20b"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">Nama model aktif pada LLM Local</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Key className="h-3 w-3" /> API Key (Opsional)
                  </Label>
                  <Input
                    type="password"
                    value={localLlmApiKey}
                    onChange={(e) => setLocalLlmApiKey(e.target.value)}
                    placeholder="Kosongkan jika tanpa auth"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">Bearer token jika dibutuhkan</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Key className="h-3 w-3" /> Gemini API Key
                  </Label>
                  <Input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder={hasApiKey ? `${apiKeyMasked} (kosongkan jika tidak diubah)` : 'AIzaSy...'}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {hasApiKey ? '✓ API key sudah tersimpan' : 'Dapatkan gratis di Google AI Studio'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Model Gemini
                  </Label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Free Tier Recommended)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Generasi 2.5)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">Pilih versi model cloud Gemini</p>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className={`rounded-xl border p-3 flex items-center gap-2.5 text-xs ${
              testResult.ok
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testingLlm}
              onClick={handleTestLlm}
              className="rounded-full min-h-[36px]"
            >
              {testingLlm ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Test Koneksi Model
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={savingLlm}
              onClick={() => handleSaveLlmSettings()}
              className="rounded-full min-h-[36px]"
            >
              {savingLlm ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Simpan Konfigurasi AI
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <FolderGit2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Repository</CardTitle>
              <CardDescription className="mt-1 text-xs leading-relaxed max-w-[60ch]">
                URL GitHub atau path lokal untuk sinkron commit.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <div data-impeccable-carbonize="82162621" style={{ display: "contents" }}>
          {/* impeccable-carbonize-start 82162621 */}
          <style data-impeccable-css="82162621">{`
          @scope ([data-impeccable-variant="1"]) {
          :scope > .adapt-v1 { display: flex; flex-direction: column; gap: 20px; }
          :scope .v1-repo-stack { display: flex; flex-direction: column; gap: 12px; }
          :scope .v1-repo-card { border-radius: 16px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
          :scope .v1-repo-main { min-width: 0; }
          :scope .v1-repo-actions { display: flex; gap: 8px; padding-top: 2px; }
          :scope .v1-repo-actions button { min-height: 44px; flex: 1; }
          :scope .v1-add-sheet { border-radius: 16px; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.18); padding: 14px; }
          :scope .v1-add-grid { display: flex; flex-direction: column; gap: 10px; }
          :scope .v1-notif-stack { display: flex; flex-direction: column; gap: 12px; }
          :scope .v1-notif-card { border-radius: 16px; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.18); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
          :scope .v1-thumb-bar { position: sticky; bottom: 0; margin: 0 -24px -24px; padding: 12px 16px max(12px, env(safe-area-inset-bottom)); background: hsl(var(--card) / 0.92); backdrop-filter: blur(12px); border-top: 1px solid hsl(var(--border)); display: flex; gap: 8px; }
          :scope[data-p-density="compact"] .v1-repo-card { padding: 10px; gap: 6px; }
          :scope[data-p-density="compact"] .v1-notif-card { padding: 12px; }
          :scope[data-p-thumb="0"] .v1-thumb-bar { display: none; }
          }
          @scope ([data-impeccable-variant="2"]) {
          :scope > .adapt-v2 { display: flex; flex-direction: column; gap: 18px; }
          :scope .v2-split { display: grid; gap: 16px; }
          @media (min-width: 860px) {
          :scope .v2-split { grid-template-columns: minmax(0, var(--p-panel-ratio, 0.56)) minmax(280px, 1fr); align-items: start; }
          }
          :scope .v2-panel { border-radius: 16px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); overflow: hidden; display: flex; flex-direction: column; }
          :scope .v2-panel-head { padding: 14px 16px; border-bottom: 1px solid hsl(var(--border)); display: flex; align-items: center; justify-content: space-between; gap: 12px; background: hsl(var(--muted) / 0.12); }
          :scope .v2-repo-list { padding: 10px; display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow: auto; scrollbar-width: thin; }
          :scope .v2-repo-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; background: hsl(var(--background)); }
          :scope .v2-repo-row:hover { border-color: hsl(var(--border)); background: hsl(var(--muted) / 0.18); }
          :scope .v2-add-area { padding: 12px; border-top: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.14); }
          :scope .v2-add-grid { display: grid; gap: 8px; }
          @media (min-width: 640px) { :scope .v2-add-grid { grid-template-columns: 1fr 1.6fr auto; align-items: end; } }
          :scope .v2-notif-grid { display: grid; gap: 12px; }
          :scope .v2-notif-card { border-radius: 14px; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.18); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
          :scope[data-p-details="rows"] .v2-repo-row { border-radius: 8px; padding: 8px 10px; }
          :scope[data-p-details="rows"] .v2-repo-list { gap: 6px; }
          }
          @scope ([data-impeccable-variant="3"]) {
          :scope > .adapt-v3 { display: flex; flex-direction: column; gap: 14px; }
          :scope .v3-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
          :scope .v3-stat { border-radius: 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
          :scope .v3-stat-value { font-family: "IBM Plex Mono", monospace; font-size: 1.35rem; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
          :scope .v3-stat-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: hsl(var(--muted-foreground)); font-weight: 500; }
          :scope .v3-table-wrap { border-radius: 14px; border: 1px solid hsl(var(--border)); overflow: hidden; background: hsl(var(--card)); }
          :scope .v3-table-head { display: grid; grid-template-columns: 1.1fr 1.8fr 92px 148px; gap: 12px; padding: 10px 14px; background: hsl(var(--muted) / 0.22); border-bottom: 1px solid hsl(var(--border)); font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; color: hsl(var(--muted-foreground)); font-weight: 600; }
          :scope .v3-table-row { display: grid; grid-template-columns: 1.1fr 1.8fr 92px 148px; gap: 12px; padding: 11px 14px; align-items: center; border-bottom: 1px solid hsl(var(--border) / 0.6); font-size: 13px; }
          :scope .v3-table-row:last-child { border-bottom: none; }
          :scope .v3-table-row:hover { background: hsl(var(--muted) / 0.12); }
          :scope .v3-url { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: hsl(var(--muted-foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          :scope .v3-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
          :scope .v3-add-inline { display: grid; grid-template-columns: 170px 1fr auto; gap: 8px; padding: 12px; background: hsl(var(--muted) / 0.12); border-top: 1px solid hsl(var(--border)); align-items: end; }
          :scope .v3-notif-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
          :scope .v3-notif-card { border-radius: 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.16); padding: 14px; display: flex; flex-direction: column; gap: 8px; }
          :scope .v3-notif-card h4 { font-size: 13px; font-weight: 600; }
          @media (max-width: 860px) {
          :scope .v3-table-head, :scope .v3-table-row { grid-template-columns: 1fr; gap: 6px; }
          :scope .v3-table-head { display: none; }
          :scope .v3-table-row { border: 1px solid hsl(var(--border)); border-radius: 10px; margin: 8px; }
          :scope .v3-add-inline { grid-template-columns: 1fr; }
          :scope .v3-notif-row { grid-template-columns: 1fr; }
          }
          /* Mobile airy override — kurangi compact di HP */
          @media (max-width: 640px) {
          :scope > .adapt-v3 { gap: 22px; }
          :scope .v3-stats { grid-template-columns: 1fr; gap: 14px; }
          :scope .v3-stat { padding: 18px 16px; gap: 6px; border-radius: 16px; }
          :scope .v3-stat-value { font-size: 1.5rem; line-height: 1.1; }
          :scope .v3-stat-label { font-size: 11px; }
          :scope .v3-table-wrap { border-radius: 16px; }
          :scope .v3-table-row { padding: 16px; gap: 10px; margin: 10px; display: flex; flex-direction: column; align-items: stretch; }
          :scope .v3-url { white-space: normal; word-break: break-all; overflow: visible; text-overflow: clip; line-height: 1.5; font-size: 12px; }
          :scope .v3-actions { justify-content: flex-start; gap: 8px; width: 100%; padding-top: 4px; border-top: 1px solid hsl(var(--border) / 0.4); margin-top: 4px; }
          :scope .v3-actions button { min-height: 40px; min-width: 40px; }
          :scope .v3-add-inline { padding: 16px; gap: 14px; }
          :scope .v3-notif-row { gap: 16px; }
          :scope .v3-notif-card { padding: 18px; gap: 12px; border-radius: 16px; }
          :scope .v3-notif-card h4 { font-size: 14px; }
          }
          :scope[data-p-density="compact"] .v3-table-row { padding: 8px 14px; font-size: 12px; }
          :scope[data-p-density="compact"] .v3-stat { padding: 10px 12px; }
          @media (max-width: 640px) {
          :scope[data-p-density="compact"] .v3-table-row { padding: 16px; }
          :scope[data-p-density="compact"] .v3-stat { padding: 18px 16px; }
          }
          :scope .v3-accent { opacity: calc(0.6 + var(--p-accent, 0.5) * 0.8); }
          }
          `}</style>
          {/* impeccable-param-values 82162621: {"density":"compact","accent":0.8} */}
          {/* impeccable-carbonize-end 82162621 */}
          <div data-impeccable-variant="3" style={{ display: 'contents' }}>
            <CardContent className="pt-6 adapt-v3">
              <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Repository ({repositories.length}/5)<span className="hidden sm:inline"> — Desktop</span></Label>
                    {/* <p className="mt-1 text-xs leading-relaxed text-muted-foreground hidden sm:block">Command center: semua terlihat, klik minimal, hover mengungkap aksi. Untuk fokus di layar lebar.</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:hidden">Kelola repo & sinkron commit.</p> */}
                  </div>
                  {/* <span className="hidden sm:inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground">Dense • Hover</span>
                  <span className="sm:hidden inline-flex items-center rounded-full bg-muted border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Airy • Tap</span> */}
                </div>

                {/* <div className="v3-stats">
                  <div className="v3-stat">
                    <span className="v3-stat-label">Total repo</span>
                    <span className="v3-stat-value">{repositories.length}/5</span>
                    <span className="text-xs text-muted-foreground">Kapasitas terpakai</span>
                  </div>
                  <div className="v3-stat">
                    <span className="v3-stat-label">Auto-draft</span>
                    <span className="v3-stat-value">{defaultRepoIds.length} aktif</span>
                    <span className="text-xs text-muted-foreground">Gabung 16.00 WIB</span>
                  </div>
                  <div className="v3-stat v3-accent" style={{ borderColor: 'hsl(var(--primary) / calc(0.18 + var(--p-accent, 0.5) * 0.45))' }}>
                    <span className="v3-stat-label">Status</span>
                    <span className="v3-stat-value flex items-center gap-1.5 text-sm"><span className="h-2 w-2 rounded-full bg-emerald-500" style={{ opacity: 'calc(0.7 + var(--p-accent, 0.5) * 0.6)' }} /> Siap generate</span>
                    <span className="text-xs text-muted-foreground">Sinkron terakhir hari ini</span>
                  </div>
                </div> */}

                <div className="v3-table-wrap">
                  <div className="v3-table-head">
                    <span>Repository</span><span>URL</span><span>Status</span><span className="text-right">Aksi</span>
                  </div>
                  {repositories.map((r) => (
                    <div key={r.id} className="v3-table-row">
                      <span className="font-medium truncate flex items-center gap-1.5">{r.label || '—'} {activeRepoId === r.id && <span className="inline-flex rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Aktif</span>}</span>
                      <span className="v3-url" title={r.url}>{r.url}</span>
                      <span className="flex gap-1 flex-wrap">{defaultRepoIds.includes(r.id) ? <span className="rounded-full bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-600">Auto</span> : <span className="rounded-full bg-muted border px-2 py-0.5 text-[10px] text-muted-foreground">Manual</span>}</span>
                      <span className="v3-actions">
                        {activeRepoId !== r.id && <Button type="button" variant="outline" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={() => handleSetActive(r.id)}>Aktif</Button>}
                        <Button type="button" variant={defaultRepoIds.includes(r.id) ? 'secondary' : 'ghost'} size="sm" className="h-7 w-7 p-0 rounded-full" onClick={() => handleToggleDefault(r.id)}><Star className={`h-3.5 w-3.5 ${defaultRepoIds.includes(r.id) ? 'fill-amber-500 text-amber-500' : 'opacity-40'}`} /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRepo(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </span>
                    </div>
                  ))}
                  {repositories.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Belum ada repo — tambah di bawah</div>}
                  <div className="v3-add-inline">
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">Label</Label>
                      <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="frontend" className="font-mono text-sm h-8" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">URL Git</Label>
                      <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://github.com/username/repo.git" className="font-mono text-sm h-8" />
                    </div>
                    <Button type="button" disabled={addingRepo || repositories.length >= 5} onClick={handleAddRepo} className="rounded-full h-8 self-end" size="sm">{addingRepo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tambah</Button>
                  </div>
                  <p className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/10 border-t">Maks 5 repo • Star = auto-draft 16.00 (gabungan 1-3) • Aktif = default Generate</p>
                </div>

                <div className="v3-notif-row">
                  <div className="v3-notif-card">
                    <h4 className="flex items-center gap-1.5">Notifikasi <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] border">{notificationPermission}</span></h4>
                    <p className="text-xs leading-relaxed text-muted-foreground">Reminder jam 15.40 saat dashboard terbuka.</p>
                    <Button type="button" variant={notificationPermission === 'granted' ? 'secondary' : 'default'} disabled={!canUseDesktopNotifications() || notificationPermission === 'granted'} onClick={handleEnableNotifications} className="rounded-full w-full mt-auto min-h-[36px]" size="sm">{notificationPermission === 'granted' ? 'Aktif' : 'Aktifkan'}</Button>
                  </div>
                  <div className="v3-notif-card">
                    <h4 className="flex items-center gap-1.5">Web Push <span className="ml-auto rounded-full bg-card border px-1.5 py-0.5 font-mono text-[10px]">{pushActive ? 'Aktif' : 'Nonaktif'}</span></h4>
                    <p className="text-xs leading-relaxed text-muted-foreground">Tetap aktif walau tab tertutup (HTTPS).{pushServerOk === false ? ' Server belum dikonfigurasi.' : ''}</p>
                    {pushDesync && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                        ⚠️ Subscription tidak sinkron — browser punya subscription tapi server tidak. Klik <strong>Perbaiki</strong>.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-auto">
                      {pushActive && !pushDesync && <Button type="button" variant="outline" disabled={pushLoading} onClick={handleTestPush} className="rounded-full flex-1 min-h-[36px]" size="sm">Test</Button>}
                      {pushDesync && <Button type="button" variant="default" disabled={pushLoading} onClick={handleFixPush} className="rounded-full flex-1 min-h-[36px] bg-amber-500 hover:bg-amber-600 text-white" size="sm">{pushLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Perbaiki</Button>}
                      <Button type="button" variant={pushActive ? 'secondary' : 'default'} disabled={!pushSupported || pushLoading || pushServerOk === false} onClick={pushActive ? handleDisablePush : handleEnablePush} className="rounded-full flex-1 min-h-[36px]" size="sm">{pushActive ? 'Matikan' : 'Aktifkan'}</Button>
                    </div>
                  </div>
                  <div className="v3-notif-card border-dashed">
                    <h4>Test Auto-Draft 16.00</h4>
                    <p className="text-xs leading-relaxed text-muted-foreground">Generate draft otomatis sekarang tanpa tunggu cron. Hanya di lokal.</p>
                    <Button type="button" variant="outline" disabled={autoDraftLoading} onClick={handleTestAutoDraft} className="rounded-full w-full mt-auto min-h-[36px]" size="sm">{autoDraftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Test Auto-Draft</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </div>
      </Card>

      {/* <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tentang</CardTitle>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-muted-foreground">
          <p>
            Data disimpan lokal di <code className="rounded bg-muted px-1 py-0.5 font-mono">Logbook_MagangHub.xlsx</code>.
          </p>
        </CardContent>
      </Card> */}
    </div>
  );
}
