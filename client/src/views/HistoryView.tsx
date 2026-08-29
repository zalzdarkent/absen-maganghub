import { useCallback, useEffect, useState } from 'react';
import type { EntriesResponse, LogbookEntry } from '../types';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { EditEntryModal } from '../components/EditEntryModal';

function truncate(text: string, n: number) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n) + '…' : text;
}

export function HistoryView({ reloadKey }: { reloadKey: number }) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LogbookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LogbookEntry | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<EntriesResponse>('/api/entries');
      setEntries(data.entries);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat riwayat';
      showToast(message, 'error');
      setError(message);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function handleSave(rowNumber: number, draftFields: { aktivitas: string; pembelajaran: string; kendala: string }) {
    try {
      await api(`/api/entries/${rowNumber}`, { method: 'PUT', body: JSON.stringify(draftFields) });
      showToast('Perubahan tersimpan ✔', 'success');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan', 'error');
    }
  }

  async function handleDelete(rowNumber: number) {
    if (!confirm('Hapus entri ini dari logbook? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await api(`/api/entries/${rowNumber}`, { method: 'DELETE' });
      showToast('Entri dihapus.', 'success');
      setEditing(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus', 'error');
    }
  }

  return (
    <main className="view grid gap-5">
      <section className="bg-panel border border-border rounded-[10px] p-[18px_20px]">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-mono text-sm lowercase tracking-[0.02em] text-muted font-semibold m-0">Riwayat logbook</h2>
          {entries && <span className="text-muted text-[13px]">{entries.length} entri</span>}
        </div>
        <div className="timeline">
          {error ? (
            <p className="muted">{error}</p>
          ) : entries === null ? (
            <p className="muted">Memuat riwayat…</p>
          ) : entries.length === 0 ? (
            <p className="muted">Belum ada entri. Generate satu dari tab "generate".</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.rowNumber} className="entry" onClick={() => setEditing(entry)}>
                <div className="entry-head">
                  <span className="entry-no">#{entry.no}</span>
                  <span className="entry-date">{entry.tanggal}</span>
                </div>
                <div className="entry-preview">{truncate(entry.aktivitas, 140)}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <EditEntryModal entry={editing} onClose={() => setEditing(null)} onSave={handleSave} onDelete={handleDelete} />
    </main>
  );
}
