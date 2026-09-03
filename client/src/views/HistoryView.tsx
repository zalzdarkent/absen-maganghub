import { useCallback, useEffect, useState } from 'react';
import type { EntriesResponse, LogbookEntry } from '../types';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { EditEntryModal } from '../components/EditEntryModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { History, Calendar, FileText, ChevronRight, SearchX, Loader2, BookOpen } from 'lucide-react';

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
    <div className="grid gap-6">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <History className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm">Riwayat Logbook</CardTitle>
                <CardDescription className="text-xs mt-1">
                  {entries === null ? 'Memuat…' : `${entries.length} entri tersimpan • klik untuk edit`}
                </CardDescription>
              </div>
            </div>
            {entries && entries.length > 0 && (
              <Badge variant="secondary" className="rounded-full font-mono text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {entries.length} entri
              </Badge>
            )}
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {error ? (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : entries === null ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
              <p className="text-center font-mono text-xs text-muted-foreground flex items-center justify-center gap-1.5 pt-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat riwayat…
              </p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <SearchX className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Belum ada entri</p>
              <p className="mt-1 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">Belum ada entri. Generate satu dari tab Generate — draft akan muncul di sini setelah disimpan.</p>
              <Button variant="outline" size="sm" className="mt-4 rounded-full">
                <BookOpen className="h-3.5 w-3.5" /> Mulai generate
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => (
                <button
                  key={entry.rowNumber}
                  onClick={() => setEditing(entry)}
                  className="group w-full text-left flex items-start gap-4 px-5 py-4 hover:bg-muted/40 transition-colors"
                >
                  {/* timeline dot */}
                  <div className="hidden sm:flex flex-col items-center gap-2 pt-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/15" />
                    <span className="h-full w-px bg-border group-last:hidden" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full font-mono text-xs">
                        #{entry.no}
                      </Badge>
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {entry.tanggal}
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        <FileText className="h-3 w-3" /> {entry.aktivitas.length} karakter
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80">
                      {truncate(entry.aktivitas, 160)}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="line-clamp-1 flex-1">Pembelajaran: {truncate(entry.pembelajaran, 80)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background border shrink-0 mt-0.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Tips manajemen riwayat</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Klik entri untuk edit atau hapus. Perubahan akan langsung sinkron ke file Excel <code className="rounded bg-background border px-1 py-0.5 font-mono text-[11px]">Logbook_MagangHub.xlsx</code>. Kamu juga bisa download ulang dari tombol Simpan di Generate.</p>
          </div>
        </CardContent>
      </Card>

      <EditEntryModal entry={editing} onClose={() => setEditing(null)} onSave={handleSave} onDelete={handleDelete} />
    </div>
  );
}
