import { useCallback, useEffect, useState } from 'react';
import type { Commit, StatusResponse, TabName } from './types';
import { api } from './lib/api';
import { startDailyLogbookReminder } from './lib/notifications';
import { registerServiceWorker } from './lib/pushClient';
import { useToast } from './context/ToastContext';
import { GenerateView } from './views/GenerateView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BookOpen, History, Settings2, Sparkles, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusKind = 'idle' | 'ok' | 'warn' | 'err';

const STATUS_CFG: Record<StatusKind, { label: string; dot: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  idle: { label: 'memeriksa…', dot: 'bg-muted-foreground', variant: 'secondary' },
  ok: { label: 'Siap!', dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]', variant: 'success' },
  warn: { label: 'belum ada commit hari ini', dot: 'bg-amber-500', variant: 'warning' },
  err: { label: 'repo bermasalah', dot: 'bg-red-500', variant: 'destructive' },
};

const TAB_ITEMS: { key: TabName; label: string; desc: string; icon: typeof Sparkles }[] = [
  { key: 'generate', label: 'Generate', desc: 'Draft logbook', icon: Sparkles },
  { key: 'history', label: 'Riwayat', desc: 'Logbook tersimpan', icon: History },
  { key: 'settings', label: 'Pengaturan', desc: 'Repo & notifikasi', icon: Settings2 },
];

function AppHeader({
  tab,
  onTab,
  statusKind,
  statusText,
}: {
  tab: TabName;
  onTab: (t: TabName) => void;
  statusKind: StatusKind;
  statusText: string;
}) {
  const cfg = STATUS_CFG[statusKind];
  // override label if custom text provided
  const label = statusText || cfg.label;

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-[64px] max-w-[1280px] items-center gap-4 px-4 md:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <BookOpen className="h-[18px] w-[18px]" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-baseline gap-1.5">
              <span className="font-sans text-[15px] font-semibold tracking-tight">MagangHub</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-widest text-muted-foreground">
                LOGBOOK
              </span>
            </div>
            <div className="font-mono text-[11px] leading-none text-muted-foreground hidden md:block">
              Dashboard harian • Gemini 2.5 Flash
            </div>
          </div>
          <div className="sm:hidden font-mono text-sm font-semibold flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            logbook<span className="font-normal text-muted-foreground">@maganghub</span>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden h-8 sm:block" />

        {/* Tabs */}
        <nav className="flex flex-1 items-center justify-center gap-1">
          <div className="inline-flex items-center rounded-full bg-muted p-1">
            {TAB_ITEMS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => onTab(t.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'opacity-70')} />
                  <span className="hidden md:inline">{t.label}</span>
                  <span className="md:hidden text-[13px]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Status */}
        <div className="flex items-center gap-2">
          <Badge
            variant={cfg.variant === 'success' ? 'success' : cfg.variant === 'warning' ? 'warning' : cfg.variant === 'destructive' ? 'destructive' : 'secondary'}
            className="hidden md:inline-flex gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide"
          >
            <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
            {label}
          </Badge>
          {/* mobile compact */}
          <div className="flex md:hidden items-center gap-1.5 rounded-full border bg-card px-2 py-1">
            <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
            <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[96px]">{label}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabName>('generate');

  const [gitLogs, setGitLogs] = useState('');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [detailed, setDetailed] = useState('');
  const [statusKind, setStatusKind] = useState<StatusKind>('idle');
  const [statusText, setStatusText] = useState('memeriksa…');
  const [historyReloadKey, setHistoryReloadKey] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api<StatusResponse>('/api/status');
      setGitLogs(data.gitLogs || '');
      setCommits(Array.isArray(data.commits) ? data.commits : []);
      setDetailed(data.detailed || '');
      if (!data.hasCommitsToday) {
        setStatusKind('warn');
        setStatusText('belum ada commit hari ini');
      } else if (data.alreadyGenerated) {
        setStatusKind('ok');
        setStatusText('sudah di-generate hari ini');
      } else {
        setStatusKind('ok');
        setStatusText('Siap!');
      }
    } catch (err) {
      setStatusKind('err');
      setStatusText('repo bermasalah');
      const message = err instanceof Error ? err.message : 'Gagal memuat status';
      showToast(message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => startDailyLogbookReminder(showToast), [showToast]);

  // Daftarkan service worker untuk Web Push (Opsi B). Gagal = fallback ke reminder lokal di atas.
  useEffect(() => {
    registerServiceWorker().catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen bg-background relative">
      {/* subtle background texture */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-[0.03]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent" />

      <AppHeader tab={tab} onTab={setTab} statusKind={statusKind} statusText={statusText} />

      <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
        {/* page heading for current tab */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              {tab === 'generate' && 'Buat Draft Logbook Harian'}
              {tab === 'history' && 'Riwayat Logbook'}
              {tab === 'settings' && 'Pengaturan Workspace'}
            </h1>
            <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
              {tab === 'generate'}
              {tab === 'history' && 'Lihat, edit, dan kelola entri yang sudah tersimpan di Excel. Klik entri untuk mengubah atau menghapus.'}
              {tab === 'settings' && 'Atur sumber repo GitHub dan preferensi notifikasi desktop untuk reminder harian.'}
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground/60">MAGANGHUB • 2026</span>
            <span className="h-3 w-px bg-border" />
            <span className="font-mono text-[11px] text-muted-foreground">Gemini • ExcelJS • Git</span>
          </div>
        </div>

        {tab === 'generate' && (
          <GenerateView
            gitLogs={gitLogs}
            commits={commits}
            detailed={detailed}
            onRefreshCommits={loadStatus}
            onGeneratedGitLogs={(logs, det, newCommits) => {
              setGitLogs(logs);
              setDetailed(det);
              if (newCommits) setCommits(newCommits);
            }}
            onSaved={() => {
              loadStatus();
              setHistoryReloadKey((k) => k + 1);
            }}
          />
        )}
        {tab === 'history' && <HistoryView reloadKey={historyReloadKey} />}
        {tab === 'settings' && (
          <SettingsView
            onSaved={() => {
              loadStatus();
            }}
          />
        )}

        <footer className="mt-10 flex flex-col items-center gap-2 border-t pt-6 text-center md:flex-row md:justify-between md:text-left">
          <p className="font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Alif Fadillah Ummar.
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/70">
            Local-first • Excel otomatis • Notifikasi jam 15.40
          </p>
        </footer>
      </div>
    </div>
  );
}
