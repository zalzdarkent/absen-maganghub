import { useEffect, useRef, useState } from 'react';
import type { Commit } from '../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { GitCommit, Lightbulb, Loader2 } from 'lucide-react';

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
      ? 'Tidak ada commit hari ini. Isi catatan minimal 5 karakter.'
      : `Akan digabung dengan ${count} commit (minimal 5 karakter)`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-base">Tambah catatan</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Tambahkan konteks meeting atau pembelajaran di luar commit.
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(notes.trim());
          }}
        >
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <GitCommit className="h-3.5 w-3.5" /> Commit hari ini
              <span className="normal-case tracking-normal font-mono text-[11px] text-muted-foreground">({count} commit)</span>
            </Label>
            <div className="rounded-lg border bg-muted/30 p-3 max-h-[132px] overflow-y-auto space-y-1">
              {count === 0 ? (
                <span className="text-xs text-muted-foreground">Tidak ada commit hari ini.</span>
              ) : (
                <>
                  {previewLines.map((l, i) => (
                    <div key={i} className="font-mono text-[12px] leading-relaxed border-b border-border/40 last:border-0 py-1">
                      {l}
                    </div>
                  ))}
                  {count > 4 && <div className="text-xs text-muted-foreground pt-1">+{count - 4} lainnya</div>}
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="merge-notes" className="text-xs uppercase tracking-widest text-muted-foreground">
              Catatan tambahan
            </Label>
            <Textarea
              id="merge-notes"
              ref={inputRef}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Mengikuti meeting progress dan validasi data..."
              className="min-h-[96px] resize-y text-sm leading-relaxed"
            />
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              {hint}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5 shadow-sm">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Menyusun...' : 'Buat draft'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
