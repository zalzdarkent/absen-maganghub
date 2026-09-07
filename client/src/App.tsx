import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { Commit, Repository, SettingsResponse, StatusResponse } from './types';
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

const TAB_ITEMS = [
  { key: 'generate' as const, label: 'Generate', desc: 'Draft logbook', icon: Sparkles, path: '/' },
  { key: 'history' as const, label: 'Riwayat', desc: 'Logbook tersimpan', icon: History, path: '/riwayat' },
  { key: 'settings' as const, label: 'Pengaturan', desc: 'Repo & notifikasi', icon: Settings2, path: '/pengaturan' },
];

function AppHeader({
  statusKind,
  statusText,
}: {
  statusKind: StatusKind;
  statusText: string;
}) {
  const cfg = STATUS_CFG[statusKind];
  const label = statusText || cfg.label;

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex flex-wrap md:flex-nowrap max-w-[1280px] items-center gap-x-2 gap-y-2 md:gap-4 px-3 md:px-6 py-2 md:py-0 md:min-h-[64px]">
        {/* Brand — baris 1 kiri */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0 order-1">
          <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20 shrink-0" aria-hidden="true">
            <BookOpen className="h-[16px] w-[16px] md:h-[18px] md:w-[18px]" aria-hidden="true" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-baseline gap-1.5">
              <span className="font-sans text-[15px] font-semibold tracking-tight">MagangHub</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-widest text-muted-foreground">
                LOGBOOK
              </span>
            </div>
          </div>
          <div className="sm:hidden font-mono text-[13px] font-semibold flex items-center gap-1 shrink-0" aria-hidden="true">
            <Terminal className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">logbook<span className="font-normal text-muted-foreground">@maganghub</span></span>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden md:block h-6 md:h-8 shrink-0 order-2" />

        {/* Status — baris 1 kanan (ml-auto biar nempel kanan) */}
        <div className="flex items-center gap-2 shrink-0 order-2 md:order-3 ml-auto md:ml-0">
          <Badge
            variant={cfg.variant === 'success' ? 'success' : cfg.variant === 'warning' ? 'warning' : cfg.variant === 'destructive' ? 'destructive' : 'secondary'}
            className="hidden lg:inline-flex gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide shrink-0"
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
            {label}
          </Badge>
          {/* mobile + tablet compact — truncated tapi tetap di baris 1 */}
          <div className="flex lg:hidden items-center gap-1.5 rounded-full border bg-card px-2 py-1 shrink-0 max-w-[112px] sm:max-w-[160px] md:max-w-none">
            <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
            <span className="font-mono text-[10px] md:text-[11px] text-muted-foreground truncate">{label}</span>
          </div>
        </div>

        {/* Tabs — di mobile jadi baris 2 full-width, di desktop jadi tengah row 1 */}
        <nav
          aria-label="Navigasi utama"
          className="flex w-full md:flex-1 md:w-auto items-center justify-center md:justify-center gap-1 min-w-0 order-3 md:order-2 border-t md:border-0 pt-2 md:pt-0 mt-1 md:mt-0 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
        >
          <div className="inline-flex items-center rounded-full bg-muted p-1 shrink-0 mx-auto">
            {TAB_ITEMS.map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.key}
                  to={t.path}
                  aria-label={`${t.label}: ${t.desc}`}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center justify-center gap-1 md:gap-1.5 rounded-full px-2.5 md:px-3.5 py-1.5 text-xs md:text-sm font-medium transition-all min-h-[32px] md:min-h-[36px] whitespace-nowrap shrink-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      isActive
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'opacity-70')} />
                      <span>{t.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}

function getPageMeta(pathname: string) {
  if (pathname.startsWith('/riwayat')) return { title: 'Riwayat Logbook', desc: 'Kelola riwayat logbook tersimpan.' };
  if (pathname.startsWith('/pengaturan')) return { title: 'Pengaturan', desc: 'Atur repo dan notifikasi.' };
  return { title: 'Buat Draft Logbook Harian', desc: 'Susun logbook harian dari commit Git.' };
}

export default function App() {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [gitLogs, setGitLogs] = useState('');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [detailed, setDetailed] = useState('');
  const [statusKind, setStatusKind] = useState<StatusKind>('idle');
  const [statusText, setStatusText] = useState('memeriksa…');
  const [statusLoading, setStatusLoading] = useState(true);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [autoDraftSignal, setAutoDraftSignal] = useState(0);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('maganghub:selectedRepoIds');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string');
      }
    } catch {}
    return [];
  });

  // Deep-link dari push: ?draft=ready → buka tab Generate (/)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('draft') === 'ready') {
        setAutoDraftSignal((k) => k + 1);
        params.delete('draft');
        const qs = params.toString();
        // paksa ke root (Beranda/Generate) sesuai spec: root untuk halaman Beranda
        navigate({ pathname: '/', search: qs ? `?${qs}` : '' }, { replace: true });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    try {
      localStorage.setItem('maganghub:selectedRepoIds', JSON.stringify(selectedRepoIds));
    } catch {}
  }, [selectedRepoIds]);

  useEffect(() => {
    api<SettingsResponse>('/api/settings')
      .then((data) => {
        const repos = Array.isArray(data.repositories) ? data.repositories : [];
        setRepositories(repos);
        if (repos.length === 0) {
          if (selectedRepoIds.length !== 0) setSelectedRepoIds([]);
          return;
        }
        const valid = new Set(repos.map((r) => r.id));
        const filtered = selectedRepoIds.filter((id) => valid.has(id));
        if (filtered.length !== selectedRepoIds.length) {
          setSelectedRepoIds(filtered);
          return;
        }
        if (filtered.length === 0) {
          const def = Array.isArray(data.defaultRepoIds) ? data.defaultRepoIds.filter((id) => valid.has(id)) : [];
          if (def.length) setSelectedRepoIds(def.slice(0, 3));
          else if (data.activeRepoId && valid.has(data.activeRepoId)) setSelectedRepoIds([data.activeRepoId]);
          else if (repos[0]) setSelectedRepoIds([repos[0].id]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const q = selectedRepoIds.length ? `?repoIds=${encodeURIComponent(selectedRepoIds.join(','))}` : '';
      const data = await api<StatusResponse>(`/api/status${q}`);
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
    } finally {
      setStatusLoading(false);
    }
  }, [showToast, selectedRepoIds]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => startDailyLogbookReminder(showToast), [showToast]);

  // Daftarkan service worker untuk Web Push (Opsi B). Gagal = fallback ke reminder lokal di atas.
  useEffect(() => {
    registerServiceWorker().catch(() => undefined);
  }, []);

  const pageMeta = getPageMeta(location.pathname);

  return (
    <div className="min-h-screen bg-background relative">
      {/* subtle background texture */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-[0.03]" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent" aria-hidden="true" />

      <AppHeader statusKind={statusKind} statusText={statusText} />

      <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
        {/* page heading for current route */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageMeta.title}</h1>
            <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{pageMeta.desc}</p>
          </div>
        </div>

        <Routes>
          <Route
            path="/"
            element={
              <GenerateView
                gitLogs={gitLogs}
                commits={commits}
                detailed={detailed}
                isLoadingCommits={statusLoading}
                autoDraftSignal={autoDraftSignal}
                repositories={repositories}
                selectedRepoIds={selectedRepoIds}
                onSelectedRepoIdsChange={setSelectedRepoIds}
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
            }
          />
          <Route path="/riwayat" element={<HistoryView reloadKey={historyReloadKey} />} />
          <Route
            path="/pengaturan"
            element={
              <SettingsView
                onSaved={async () => {
                  loadStatus();
                  try {
                    const data = await api<SettingsResponse>('/api/settings');
                    const repos = Array.isArray(data.repositories) ? data.repositories : [];
                    setRepositories(repos);
                    const valid = new Set(repos.map((r) => r.id));
                    setSelectedRepoIds((prev) => {
                      const filtered = prev.filter((id) => valid.has(id));
                      if (filtered.length) return filtered;
                      if (repos.length && data.activeRepoId && valid.has(data.activeRepoId)) return [data.activeRepoId];
                      if (repos[0]) return [repos[0].id];
                      return [];
                    });
                  } catch {}
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <footer className="mt-10 flex justify-center border-t pt-6 text-center md:justify-start">
          <p className="font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Alif Fadillah Ummar.
          </p>
        </footer>
      </main>
    </div>
  );
}
