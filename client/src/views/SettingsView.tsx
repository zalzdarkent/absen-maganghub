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
  unsubscribePush,
} from '../lib/pushClient';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FolderGit2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export function SettingsView({ onSaved }: { onSaved: () => void }) {
  const { showToast } = useToast();
  const [repoPath, setRepoPath] = useState('');
  const [persistentSettings, setPersistentSettings] = useState(true);
  const [isVercel, setIsVercel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    getDesktopNotificationPermission()
  );
  const [pushSupported] = useState(() => canUsePush());
  const [pushActive, setPushActive] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushServerOk, setPushServerOk] = useState<boolean | null>(null);
  const [autoDraftLoading, setAutoDraftLoading] = useState(false);

  async function load() {
    try {
      const data = await api<SettingsResponse>('/api/settings');
      setRepoPath(data.repoPath || '');
      setPersistentSettings(data.persistentSettings !== false);
      setIsVercel(Boolean(data.isVercel));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat pengaturan', 'error');
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
        setPushActive(Boolean(existing));
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
      showToast(`Test terkirim ke ${result.sent}/${result.total} device`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal kirim test push', 'error');
    } finally {
      setPushLoading(false);
    }
  }

  async function handleTestAutoDraft() {
    setAutoDraftLoading(true);
    try {
      await api('/api/auto-draft/generate', { method: 'POST' });
      showToast('Draft test siap — buka tab Generate untuk cek', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal generate auto-draft', 'error');
    } finally {
      setAutoDraftLoading(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ repoPath: repoPath.trim() }) });
      showToast('Repo tersimpan', 'success');
      load();
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 max-w-[880px]">
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
        <CardContent className="pt-6">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="repoPath" className="text-xs uppercase tracking-widest text-muted-foreground">
                Repo GitHub / Path Lokal
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FolderGit2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="repoPath"
                    type="text"
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    placeholder="https://github.com/username/repo.git  atau  /path/lokal/repo"
                    className="pl-9 font-mono text-sm"
                  />
                </div>
                <Button type="submit" disabled={saving} className="shrink-0 rounded-full">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Simpan
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Contoh: <code className="rounded bg-muted px-1 py-0.5 font-mono">https://github.com/username/repo.git</code>
              </p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Notifikasi</p>
                  <p className="max-w-[50ch] text-xs leading-relaxed text-muted-foreground">
                    Reminder jam 15.40 saat dashboard terbuka.
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 font-mono text-xs">
                    {notificationPermission}
                    {notificationPermission === 'granted' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={notificationPermission === 'granted' ? 'secondary' : 'default'}
                  disabled={!canUseDesktopNotifications() || notificationPermission === 'granted'}
                  onClick={handleEnableNotifications}
                  className="rounded-full"
                  size="sm"
                >
                  {notificationPermission === 'granted' ? 'Aktif' : 'Aktifkan'}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Web Push</p>
                  <p className="max-w-[50ch] text-xs leading-relaxed text-muted-foreground">
                    Tetap aktif walau tab tertutup (butuh HTTPS).
                    {!pushSupported && ' Browser belum mendukung.'}
                    {pushServerOk === false && ' Server belum dikonfigurasi.'}
                  </p>
                  <p className="font-mono text-xs">
                    {pushActive ? 'Aktif' : 'Nonaktif'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pushActive && (
                    <Button type="button" variant="outline" disabled={pushLoading} onClick={handleTestPush} className="rounded-full" size="sm">
                      {pushLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Test
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={pushActive ? 'secondary' : 'default'}
                    disabled={!pushSupported || pushLoading || pushServerOk === false}
                    onClick={pushActive ? handleDisablePush : handleEnablePush}
                    className="rounded-full"
                    size="sm"
                  >
                    {pushActive ? 'Matikan' : 'Aktifkan'}
                  </Button>
                </div>
              </div>
            </div>

            {!isVercel && (
              <div className="rounded-xl border border-dashed bg-muted/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Test Auto-Draft 16.00</p>
                    <p className="max-w-[50ch] text-xs leading-relaxed text-muted-foreground">
                      Generate draft otomatis sekarang tanpa tunggu cron. Hanya di lokal.
                    </p>
                  </div>
                  <Button type="button" variant="outline" disabled={autoDraftLoading} onClick={handleTestAutoDraft} className="rounded-full" size="sm">
                    {autoDraftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Test Auto-Draft
                  </Button>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tentang</CardTitle>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-muted-foreground">
          <p>
            Data disimpan lokal di <code className="rounded bg-muted px-1 py-0.5 font-mono">Logbook_MagangHub.xlsx</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
