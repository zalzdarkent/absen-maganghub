import { useState } from 'react';
import type { Commit, CommitDiffResponse } from '../types';
import { api } from '../lib/api';
import { colorizeDiff } from '../lib/colorizeDiff';
import { useToast } from '../context/ToastContext';

function CommitEntryFallback({ line, index }: { line: string; index: number }) {
  const authorStart = line.lastIndexOf(' (');
  const message = line.startsWith('- ') ? line.slice(2, authorStart > 2 ? authorStart : undefined) : line;
  const author = authorStart > 2 && line.endsWith(')') ? line.slice(authorStart + 2, -1) : 'unknown';
  return (
    <article className="commit-item">
      <span className="commit-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="commit-content">
        <strong className="commit-message">{message}</strong>
        <span className="commit-author">{author}</span>
      </div>
    </article>
  );
}

function CommitEntry({ commit, index }: { commit: Commit; index: number }) {
  const { showToast } = useToast();
  const [lazyDiff, setLazyDiff] = useState<{ patch: string; stats?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

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
    } catch (e) {
      setFailed(true);
      showToast(e instanceof Error ? e.message : 'Gagal memuat diff', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="commit-item">
      <span className="commit-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="commit-content">
        <strong className="commit-message">{message}</strong>
        <span className="commit-author">
          {author}
          {shortSha ? ` • ${shortSha}` : ''}
        </span>
        {stats && <span className="commit-stats">{stats}</span>}
        {hasDiff ? (
          <details className="commit-diff">
            <summary className="commit-diff-toggle">
              📄 lihat diff <span className="commit-sha">{shortSha}</span>
            </summary>
            <pre className="commit-diff-code">{colorizeDiff(patch.slice(0, 4000))}</pre>
          </details>
        ) : sha ? (
          lazyDiff ? null : (
            <button className="commit-diff-toggle" type="button" onClick={loadDiff} disabled={loading}>
              {failed ? 'gagal' : loading ? 'memuat…' : 'muat diff'} {!failed && !loading && <span className="commit-sha">{shortSha}</span>}
            </button>
          )
        ) : null}
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
    return <p className="muted">(tidak ada commit hari ini — mode gabungan tetap bisa pakai catatan manual saja)</p>;
  }

  return (
    <>
      {lines.map((line, i) => (
        <CommitEntryFallback key={i} line={line} index={i} />
      ))}
    </>
  );
}
