import { useCallback, useEffect, useState } from 'react';
import type { Commit, StatusResponse, TabName } from './types';
import { api } from './lib/api';
import { startDailyLogbookReminder } from './lib/notifications';
import { useToast } from './context/ToastContext';
import { Tabs } from './components/Tabs';
import { StatusPill, type StatusKind } from './components/StatusPill';
import { GenerateView } from './views/GenerateView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';

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
        setStatusText('siap di-generate • diff siap');
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

  return (
    <div className="max-w-[1320px] w-[min(1320px,calc(100%-2.5rem))] xl:w-[min(1360px,calc(100%-3.5rem))] max-[600px]:!w-[calc(100%-1.5rem)] mx-auto px-7 py-6 pb-16 max-[600px]:px-3.5 max-[600px]:py-3.5 flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-5 pb-4 border-b border-border">
        <div className="flex items-baseline gap-2 font-mono font-semibold text-[17px]">
          <span className="text-green">$</span>
          <span>
            logbook<span className="text-muted font-normal">@maganghub</span>
          </span>
        </div>
        <Tabs active={tab} onChange={setTab} />
        <StatusPill kind={statusKind} text={statusText} />
      </header>

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
    </div>
  );
}
