import { useEffect, useRef, useState } from 'react';
import type { Commit } from '../types';

interface Props {
  open: boolean;
  gitLogs: string;
  commits: Commit[];
  onClose: () => void;
  onSubmit: (notes: string) => void;
  submitting: boolean;
}

export function ManualMergeModal({ open, gitLogs, commits, onClose, onSubmit, submitting }: Props) {
  const [notes, setNotes] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setNotes('');
    }
  }, [open]);

  if (!open) return null;

  const logs = String(gitLogs || '').trim();
  const lines = logs ? logs.split('\n').filter(Boolean) : [];
  const count = commits.length || lines.length;

  let previewLines: string[] = [];
  if (commits.length > 0) {
    previewLines = commits
      .slice(0, 4)
      .map((c) => `${c.message} (${c.author})${c.stats ? ' • ' + c.stats.split(',').slice(0, 2).join(', ') : ''}`);
  } else {
    previewLines = lines.slice(0, 4);
  }

  const hint =
    count === 0
      ? 'Tidak ada commit hari ini, isi catatan minimal 5 karakter untuk generate dari catatan.'
      : `Siap gabungkan ${count} commit + diff + catatan → hasil paling akurat ✨ (minimal 5 karakter)`;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-panel border border-border rounded-[10px] p-5 w-full max-w-[560px] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3.5">
          <h3 className="font-mono text-sm font-semibold m-0 flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] font-bold tracking-[0.05em] uppercase bg-blue text-[#04121f] px-[7px] py-0.5 rounded-full whitespace-nowrap">
              ✨ Rekomendasi
            </span>{' '}
            Gabungkan biar AI lebih akurat
          </h3>
          <button
            className="font-mono text-[11.5px] font-semibold rounded-md border border-border px-2.5 py-1.5 bg-transparent text-text hover:brightness-110 cursor-pointer"
            type="button"
            onClick={onClose}
          >
            tutup
          </button>
        </div>
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(notes.trim());
          }}
        >
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              commit hari ini <span className="text-muted normal-case tracking-normal">({count} commit)</span>
            </span>
            <div className="bg-bg border border-border rounded-md px-2.5 py-2 max-h-[132px] overflow-y-auto flex flex-col gap-1">
              {count === 0 ? (
                <span className="muted text-[12px]">(tidak ada commit hari ini — nanti AI akan pakai catatan manual saja)</span>
              ) : (
                <>
                  {previewLines.map((l, i) => (
                    <div key={i} className="merge-commit-line">
                      {l}
                    </div>
                  ))}
                  {count > 4 && <div className="muted text-[12px]">+{count - 4} commit lainnya…</div>}
                </>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">catatan tambahan</span>
            <textarea
              ref={inputRef}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Selain itu juga mengikuti meeting dengan enduser terkait progress dan juga kevalidan data, dan 1 dashboard sudah bisa digunakan pada tanggal 1, dashboard yang lain tinggal..."
              className="font-sans text-[13.5px] leading-[1.5] bg-bg border border-border rounded-md text-text px-3 py-2.5 resize-y focus:outline-2 focus:outline-blue focus:outline-offset-1"
            />
            <span className="text-[11.5px] text-muted">{hint}</span>
          </label>
          <div className="flex justify-end gap-2.5 mt-1">
            <button
              type="submit"
              disabled={submitting}
              className="font-mono text-xs font-semibold rounded-md border border-blue px-3.5 py-2 bg-blue text-[#04121f] hover:brightness-110 cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'menggabungkan…' : 'Gabungkan & Generate ✨'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
