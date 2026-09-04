import { useState } from 'react';
import type { Commit, CommitDiffResponse } from '../types';
import { api } from '../lib/api';
import { colorizeDiff } from '../lib/colorizeDiff';
import { useToast } from '../context/ToastContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileCode2, User, GitCommit, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function CommitEntryFallback({ line, index }: { line: string; index: number }) {
  const authorStart = line.lastIndexOf(' (');
  const message = line.startsWith('- ') ? line.slice(2, authorStart > 2 ? authorStart : undefined) : line;
  const author = authorStart > 2 && line.endsWith(')') ? line.slice(authorStart + 2, -1) : 'unknown';
  return (
    <article className="group flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-b last:border-0">
      <span className="font-mono text-[11px] font-medium text-primary mt-0.5">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0 flex flex-col gap-1">
        <p className="text-[13px] font-medium leading-snug line-clamp-2">{message}</p>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <User className="h-3 w-3" /> {author}
        </span>
      </div>
    </article>
  );
}

function CommitEntry({ commit, index }: { commit: Commit; index: number }) {
  const { showToast } = useToast();
  const [lazyDiff, setLazyDiff] = useState<{ patch: string; stats?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const sha = commit.sha || commit.shortSha || '';
  const shortSha = commit.shortSha || (sha ? sha.slice(0, 7) : '');
  const message = commit.message || commit.subject || '';
  const author = commit.author || 'unknown';
  const stats =
    lazyDiff?.stats ||
    commit.stats ||
    (commit.files ? commit.files.map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`).join(', ') : '');
  const patch = lazyDiff?.patch || commit.patch || '';
  const hasDiff = Boolean(patch && patch.trim());

  async function loadDiff() {
    if (!sha) return;
    setLoading(true);
    setFailed(false);
    try {
      const data = await api<CommitDiffResponse>(`/api/commits/${encodeURIComponent(sha)}/diff`);
      const patchText = data.patch || data.files?.map((f) => f.patch).join('\n') || '(no diff)';
      const statsText = data.stats || (data.files ? data.files.map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`).join(', ') : undefined);
      setLazyDiff({ patch: patchText, stats: statsText });
      setOpen(true);
    } catch (e) {
      setFailed(true);
      showToast(e instanceof Error ? e.message : 'Gagal memuat diff', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="group border-b last:border-0 hover:bg-muted/30 transition-colors">
      <div className="flex gap-3 px-4 py-3">
        <span className="font-mono text-[11px] font-semibold text-primary mt-1">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0 flex flex-1 flex-col gap-1.5">
          <p className="text-[13px] font-medium leading-snug">{message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <User className="h-3 w-3" /> {author}
            </span>
            {shortSha && (
              <Badge variant="outline" className="rounded-full font-mono text-[10px] px-1.5 py-0">
                <GitCommit className="h-3 w-3 mr-1" /> {shortSha}
              </Badge>
            )}
          </div>
          {stats && (
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground flex items-start gap-1">
              <FileCode2 className="h-3 w-3 mt-[2px] shrink-0" />
              <span className="break-all">{stats}</span>
            </p>
          )}

          {hasDiff ? (
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-full text-xs gap-1"
                onClick={() => setOpen(!open)}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {open ? 'tutup diff' : 'lihat diff'}
                <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{shortSha}</span>
              </Button>
              {open && (
                <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg border bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed text-[#e6edf3] whitespace-pre-wrap">
                  {colorizeDiff(patch.slice(0, 5000))}
                </pre>
              )}
            </div>
          ) : sha ? (
            <div className="pt-1">
              {lazyDiff ? (
                <>
                  {lazyDiff.stats && (
                    <p className="font-mono text-[11px] text-muted-foreground flex gap-1">
                      <FileCode2 className="h-3 w-3 mt-[2px]" /> {lazyDiff.stats}
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="mt-1 h-7 rounded-full text-xs" onClick={() => setOpen(!open)}>
                    {open ? 'tutup diff' : 'lihat diff'}
                    <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                  </Button>
                  {open && (
                    <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg border bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                      {colorizeDiff(lazyDiff.patch.slice(0, 5000))}
                    </pre>
                  )}
                </>
              ) : (
                <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={loadDiff} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="h-3.5 w-3.5" />}
                  {failed ? 'gagal, coba lagi' : loading ? 'memuat…' : 'muat diff'}
                  {!failed && !loading && shortSha && (
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{shortSha}</span>
                  )}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CommitLog({ gitLogs, commits }: { gitLogs: string; commits: Commit[] }) {
  if (commits.length > 0) {
    return (
      <>
        {commits.map((c, i) => (
          <CommitEntry key={c.sha || i} commit={c} index={i} />
        ))}
      </>
    );
  }

  const lines = String(gitLogs || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <GitCommit className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Tidak ada commit hari ini</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80 mx-auto max-w-[28ch]">
          Tidak ada commit. Gunakan tambah catatan.
        </p>
      </div>
    );
  }

  return (
    <>
      {lines.map((line, i) => (
        <CommitEntryFallback key={i} line={line} index={i} />
      ))}
    </>
  );
}
