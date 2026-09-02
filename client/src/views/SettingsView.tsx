import { useEffect, useState } from 'react';
import type { SettingsResponse } from '../types';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

export function SettingsView({ onSaved }: { onSaved: () => void }) {
  const { showToast } = useToast();
  const [repoPath, setRepoPath] = useState('');
  const [persistentSettings, setPersistentSettings] = useState(true);
  const [isVercel, setIsVercel] = useState(false);
  const [saving, setSaving] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <main className="view grid gap-5">
      <section className="bg-panel border border-border rounded-[10px] p-[18px_20px]">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-mono text-sm lowercase tracking-[0.02em] text-muted font-semibold m-0">Pengaturan</h2>
        </div>
        {isVercel && !persistentSettings && (
          <div className="mb-4 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-[12.5px] text-yellow-200">
            Deploy Vercel butuh storage persisten. Tambahkan Vercel KV/Upstash env{' '}
            <code>KV_REST_API_URL</code> + <code>KV_REST_API_TOKEN</code>, atau set <code>REPO_PATH</code> di
            Environment Variables Vercel.
          </div>
        )}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">repo github</span>
            <input
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="https://github.com/username/repo.git  atau  /path/lokal/repo"
              className="font-sans text-[13.5px] leading-[1.5] bg-bg border border-border rounded-md text-text px-3 py-2.5 focus:outline-2 focus:outline-blue focus:outline-offset-1"
            />
            <span className="text-[11.5px] text-muted">https://github.com/username/repo.git</span>
          </label>
          <div className="flex justify-end gap-2.5 mt-1">
            <button
              type="submit"
              disabled={saving}
              className="font-mono text-xs font-semibold rounded-md border border-green px-3.5 py-2 bg-green text-[#04210a] hover:brightness-110 cursor-pointer disabled:opacity-60"
            >
              simpan pengaturan
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
