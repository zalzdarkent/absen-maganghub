import { useEffect, useState } from 'react';
import type { SettingsResponse } from '../types';
import { api } from '../lib/api';
import {
  canUseDesktopNotifications,
  getDesktopNotificationPermission,
  notifyDesktop,
  requestDesktopNotificationPermission,
} from '../lib/notifications';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings2, FolderGit2, Bell, CheckCircle2, AlertTriangle, Shield, ExternalLink, Loader2 } from 'lucide-react';

export function SettingsView({ onSaved }: { onSaved: () => void }) {
  const { showToast } = useToast();
  const [repoPath, setRepoPath] = useState('');
  const [persistentSettings, setPersistentSettings] = useState(true);
  const [isVercel, setIsVercel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    getDesktopNotificationPermission()
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnableNotifications() {
    const permission = await requestDesktopNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      notifyDesktop('Notifikasi MagangHub aktif', {
        body: 'Nanti draft selesai dan reminder jam 15.40 bisa muncul di desktop.',
        tag: 'notification-test',
      });
      showToast('Notifikasi desktop aktif ✔', 'success');
    } else if (permission === 'unsupported') {
      showToast('Browser ini belum mendukung desktop notification.', 'warning');
    } else {
      showToast('Izin notifikasi belum diberikan. Kamu masih tetap dapat toaster di aplikasi.', 'warning');
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ repoPath: repoPath.trim() }) });
      showToast('Repo GitHub tersimpan ✔', 'success');
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
              <CardTitle className="text-base flex items-center gap-2">
                Sumber Repository
                <Badge variant="secondary" className="rounded-full font-mono text-[10px]">Git</Badge>
              </CardTitle>
              <CardDescription className="mt-1 text-xs leading-relaxed max-w-[60ch]">
                Tentukan repo GitHub atau path lokal untuk sinkron commit & diff. Bisa berupa URL <span className="font-mono">https://github.com/...</span> atau path lokal seperti <span className="font-mono">/Users/nama/repo</span>.
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
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3" /> Contoh: <code className="rounded bg-muted px-1 py-0.5 font-mono">https://github.com/username/repo.git</code>
              </p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Bell className="h-4 w-4 text-primary" /> Notifikasi Desktop & Reminder Harian
                  </p>
                  <p className="max-w-[50ch] text-xs leading-relaxed text-muted-foreground">
                    Reminder otomatis aktif jam <span className="font-medium text-foreground">15:40</span> selama dashboard terbuka. Notifikasi juga muncul saat draft selesai diracik Gemini.
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 font-mono text-xs">
                    Status izin:
                    <Badge
                      variant={notificationPermission === 'granted' ? 'success' : notificationPermission === 'denied' ? 'destructive' : 'secondary'}
                      className="rounded-full font-mono text-[11px]"
                    >
                      {notificationPermission}
                    </Badge>
                    {notificationPermission === 'granted' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={notificationPermission === 'granted' ? 'secondary' : 'default'}
                  disabled={!canUseDesktopNotifications() || notificationPermission === 'granted'}
                  onClick={handleEnableNotifications}
                  className="rounded-full"
                >
                  <Bell className="h-4 w-4" />
                  {notificationPermission === 'granted' ? 'Notifikasi aktif' : 'Aktifkan notifikasi'}
                </Button>
              </div>
            </div>

            <Separator />
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" /> Pengaturan disimpan lokal & aman. Tidak dikirim kemana pun.
              </p>
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Auto-sync Excel
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" /> Tentang Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            Dashboard ini berjalan <span className="font-medium text-foreground">local-first</span> — data logbook disimpan di file Excel{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">Logbook_MagangHub.xlsx</code> dan cache git di folder <code className="rounded bg-muted px-1 py-0.5 font-mono">repo-cache/</code>. Tidak ada data yang keluar tanpa izinmu.
          </p>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full font-mono">Express + ExcelJS</Badge>
            <Badge variant="outline" className="rounded-full font-mono">React 19 + shadcn/ui</Badge>
            <Badge variant="outline" className="rounded-full font-mono">Tailwind CSS</Badge>
            <Badge variant="outline" className="rounded-full font-mono">Gemini 2.5 Flash</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
