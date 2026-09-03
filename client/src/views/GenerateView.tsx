import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Commit, GenerateCombinedResponse, GenerateManualResponse, GenerateResponse } from '../types';
import type { GenerateMode } from '../types';
import { api, downloadExcel } from '../lib/api';
import { notifyDesktop } from '../lib/notifications';
import { useToast } from '../context/ToastContext';
import { CommitLog } from '../components/CommitLog';
import { ManualMergeModal } from '../components/ManualMergeModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { GitCommit, Sparkles, RefreshCw, Save, RotateCcw, Clock, FileSpreadsheet, Wand2, AlertCircle } from 'lucide-react';

interface Props {
  gitLogs: string;
  commits: Commit[];
  detailed: string;
  onRefreshCommits: () => void;
  onGeneratedGitLogs: (gitLogs: string, detailed: string, commits?: Commit[]) => void;
  onSaved: () => void;
}

interface DraftFields {
  aktivitas: string;
  pembelajaran: string;
  kendala: string;
}

const EMPTY_DRAFT: DraftFields = { aktivitas: '', pembelajaran: '', kendala: '' };
const DRAFT_AUTOSAVE_KEY = 'maganghub:draft:auto';

function charCountLabel(len: number) {
  if (len < 100) return `${len}/100 — minimal 100`;
  if (len > 5000) return `${len}/5000 — kepanjangan!`;
  return `${len} ✓ cukup`;
}
function charCountColor(len: number) {
  if (len < 100) return 'text-amber-500';
  if (len > 5000) return 'text-red-500';
  return 'text-emerald-500';
}
function ProgressBar({ len }: { len: number }) {
  const pct = Math.min(100, (len / 100) * 100);
  const color = len < 100 ? 'bg-amber-500' : len > 5000 ? 'bg-red-500' : 'bg-emerald-500';
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function GenerateView({ gitLogs, commits, detailed, onRefreshCommits, onGeneratedGitLogs, onSaved }: Props) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [lastMode, setLastMode] = useState<GenerateMode>('commit');
  const [lastCombinedNotes, setLastCombinedNotes] = useState('');
  const [lastManualNotes, setLastManualNotes] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generateLabel, setGenerateLabel] = useState('meracik draft…');
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);

  function startTimer(label: string) {
    setGenerateLabel(label);
    setGenerating(true);
    startRef.current = Date.now();
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const sec = (Date.now() - startRef.current) / 1000;
      setElapsed(sec);
      if (sec > 15) setGenerateLabel('sedikit lagi… diff sedang dianalisis Gemini');
      else if (sec > 8) setGenerateLabel('masih meracik… (Gemini + diff kadang butuh 5-15 detik)');
    }, 200);
  }
  function stopTimer() {
    setGenerating(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_AUTOSAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        draft?: DraftFields;
        manualMode?: boolean;
        lastMode?: GenerateMode;
        lastCombinedNotes?: string;
        lastManualNotes?: string;
        savedAt?: number;
      };
      if (!saved.draft) return;
      setDraft(saved.draft);
      setManualMode(Boolean(saved.manualMode));
      setLastMode(saved.lastMode || 'commit');
      setLastCombinedNotes(saved.lastCombinedNotes || '');
      setLastManualNotes(saved.lastManualNotes || '');
      setAutoSavedAt(saved.savedAt || null);
      showToast('Draft terakhir dipulihkan otomatis.', 'info');
    } catch {
      localStorage.removeItem(DRAFT_AUTOSAVE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draft) {
      localStorage.removeItem(DRAFT_AUTOSAVE_KEY);
      setAutoSavedAt(null);
      return;
    }
    const savedAt = Date.now();
    localStorage.setItem(
      DRAFT_AUTOSAVE_KEY,
      JSON.stringify({ draft, manualMode, lastMode, lastCombinedNotes, lastManualNotes, savedAt })
    );
    setAutoSavedAt(savedAt);
  }, [draft, manualMode, lastMode, lastCombinedNotes, lastManualNotes]);

  async function runGenerate() {
    startTimer('meracik dari commit + diff…');
    try {
      const data = await api<GenerateResponse>('/api/generate', { method: 'POST' });
      onGeneratedGitLogs(data.gitLogs || '', data.diffSection || '', data.commits);
      setLastMode('commit');
      setManualMode(false);
      setDraft(data.draft);
      const secs = ((Date.now() - startRef.current) / 1000).toFixed(1);
      toast.success('Draft laporan selesai dibuat', {
        description: `Draft dari commit jadi dalam ${secs}s ✔ (diff diperhitungkan)`,
      });
      notifyDesktop('Draft laporan selesai dibuat', {
        body: `Draft dari commit jadi dalam ${secs}s. Silakan cek dan simpan ke Excel.`,
        tag: 'draft-ready',
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal generate', 'error');
    } finally {
      stopTimer();
    }
  }

  async function runGenerateCombined(notes: string) {
    const finalNotes = notes || lastCombinedNotes;
    if (!finalNotes) {
      setManualModalOpen(true);
      return;
    }
    startTimer('menggabungkan commit + diff + catatan… ✨');
    try {
      const data = await api<GenerateCombinedResponse>('/api/generate-combined', {
        method: 'POST',
        body: JSON.stringify({ manualNotes: finalNotes, gitLogs, diffSection: detailed }),
      });
      setLastMode('combined');
      if (data.gitLogs !== undefined) {
        onGeneratedGitLogs(data.gitLogs, data.diffSection || detailed);
      }
      setDraft(data.draft);
      setManualMode(false);
      const secs = ((Date.now() - startRef.current) / 1000).toFixed(1);
      toast.success('Draft laporan selesai dibuat', {
        description: `Draft gabungan jadi dalam ${secs}s — paling akurat ✨`,
      });
      notifyDesktop('Draft laporan selesai dibuat', {
        body: `Draft gabungan jadi dalam ${secs}s. Silakan cek dan simpan ke Excel.`,
        tag: 'draft-ready',
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal generate', 'error');
    } finally {
      stopTimer();
    }
  }

  async function handleManualSubmit(notes: string) {
    const hasCommits = Boolean(String(gitLogs || '').trim()) || commits.length > 0;
    const hasNotes = notes.length >= 5;

    if (!hasNotes && !hasCommits) {
      showToast('Isi catatan minimal 5 karakter (tidak ada commit hari ini).', 'error');
      return;
    }
    if (!hasNotes && hasCommits) {
      setManualModalOpen(false);
      await runGenerate();
      return;
    }

    setModalSubmitting(true);
    startTimer(hasCommits ? 'menggabungkan commit + diff + catatan… ✨' : 'menyusun dari catatan…');
    try {
      const data = await api<GenerateCombinedResponse>('/api/generate-combined', {
        method: 'POST',
        body: JSON.stringify({ manualNotes: notes, gitLogs: gitLogs || '', diffSection: detailed || '' }),
      });
      setLastMode('combined');
      setManualMode(false);
      setLastCombinedNotes(notes);
      setLastManualNotes(notes);
      if (data.gitLogs !== undefined) {
        onGeneratedGitLogs(data.gitLogs, data.diffSection || detailed);
      }
      setDraft(data.draft);
      setManualModalOpen(false);
      const secs = ((Date.now() - startRef.current) / 1000).toFixed(1);
      toast.success('Draft laporan selesai dibuat', {
        description: `Draft gabungan jadi dalam ${secs}s — paling akurat ✨ (diff diperhitungkan)`,
      });
      notifyDesktop('Draft laporan selesai dibuat', {
        body: `Draft gabungan jadi dalam ${secs}s. Silakan cek dan simpan ke Excel.`,
        tag: 'draft-ready',
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal generate', 'error');
    } finally {
      setModalSubmitting(false);
      stopTimer();
    }
  }

  async function handleRegenerate() {
    if (lastMode === 'combined' && lastCombinedNotes) {
      await runGenerateCombined(lastCombinedNotes);
      return;
    }
    if (lastMode === 'manual' && lastManualNotes) {
      setRegenerating(true);
      startTimer('menyusun ulang dari catatan manual…');
      try {
        const data = await api<GenerateManualResponse>('/api/generate-manual', {
          method: 'POST',
          body: JSON.stringify({ description: lastManualNotes }),
        });
        setDraft(data.draft);
        toast.success('Draft laporan diperbarui', {
          description: 'Generate ulang selesai dan draft siap dicek.',
        });
        notifyDesktop('Draft laporan diperbarui', {
          body: 'Generate ulang selesai dan draft siap dicek.',
          tag: 'draft-ready',
        });
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal generate ulang', 'error');
      } finally {
        setRegenerating(false);
        stopTimer();
      }
      return;
    }
    await runGenerate();
  }

  function resetDraft() {
    setDraft(null);
    setManualMode(false);
    setLastMode('commit');
  }

  async function handleSave() {
    if (!draft) return;
    const { aktivitas, pembelajaran, kendala } = draft;
    if (aktivitas.trim().length < 100 || pembelajaran.trim().length < 100 || kendala.trim().length < 100) {
      showToast('Tiap field minimal 100 karakter (cek penghitung di bawah textarea).', 'error');
      return;
    }
    setSaving(true);
    try {
      await api('/api/entries', {
        method: 'POST',
        body: JSON.stringify({
          aktivitas: aktivitas.trim(),
          pembelajaran: pembelajaran.trim(),
          kendala: kendala.trim(),
          ...(manualMode ? {} : { gitLogs }),
        }),
      });
      await downloadExcel();
      showToast('Tersimpan dan Excel berhasil di-download ✔', 'success');
      resetDraft();
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => {
    if (!draft) return null;
    return {
      aktivitas: draft.aktivitas.length,
      pembelajaran: draft.pembelajaran.length,
      kendala: draft.kendala.length,
    };
  }, [draft]);

  const commitCount = commits.length || String(gitLogs || '').trim().split('\n').filter(Boolean).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] xl:grid-cols-[410px_1fr] items-start">
      {/* Commit Panel */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <GitCommit className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold leading-none">Commit hari ini</CardTitle>
                <CardDescription className="mt-1 font-mono text-[11px]">{commitCount} commit • sinkron Git</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={onRefreshCommits}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <div className="max-h-[480px] overflow-y-auto" aria-live="polite">
            <CommitLog gitLogs={gitLogs} commits={commits} />
          </div>
          <div className="border-t bg-muted/20 px-4 py-2.5 flex items-center justify-between">
            <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> auto-refresh saat generate
            </span>
            <Badge variant="secondary" className="rounded-full font-mono text-[10px]">diff ready</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Draft Panel */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Wand2 className="h-3.5 w-3.5" />
                </span>
                Draft Logbook
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed max-w-[52ch]">
                AI akan menulis 3 bagian wajib minimal 100 karakter.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setManualModalOpen(true)}>
                <Sparkles className="h-3.5 w-3.5" />
                Merge & Generate
                <Badge variant="success" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">✨ Rekomen</Badge>
              </Button>
              <Button size="sm" className="rounded-full shadow-sm" disabled={generating} onClick={runGenerate}>
                {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {generating && lastMode !== 'combined' ? 'Meracik…' : 'Generate dari Commit'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!draft && !generating && (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-background border shadow-sm">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Belum ada draft</p>
              <p className="mx-auto mt-1 max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
                Mulai dengan commit harianmu, atau gabungkan dengan catatan meeting untuk hasil yang lebih lengkap.
              </p>
              <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold"><GitCommit className="h-3.5 w-3.5 text-primary" /> Commit saja</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Klik <span className="font-medium text-foreground">Generate dari Commit</span> — cepat untuk hari coding fokus.</p>
                </div>
                <div className="rounded-lg border bg-card p-3 ring-1 ring-primary/20">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /> Paling akurat ⭐</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Klik <span className="font-medium text-foreground">Merge & Generate</span> lalu isi meeting/belajar.</p>
                </div>
              </div>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-background border px-3 py-1 font-mono text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Model <code className="rounded bg-muted px-1 py-0.5 text-[11px]">gemini 3.6 flash</code>
              </p>
            </div>
          )}

          {generating && (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow-sm">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">{generateLabel}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Gemini sedang menganalisis diff • mohon tunggu</p>
              </div>
              <Badge variant="secondary" className="rounded-full font-mono text-xs tabular-nums">
                {elapsed.toFixed(1)}s
              </Badge>
            </div>
          )}

          {draft && (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
              {(['aktivitas', 'pembelajaran', 'kendala'] as const).map((field) => {
                const len = counts?.[field] ?? 0;
                const labelMap = {
                  aktivitas: 'Aktivitas Harian',
                  pembelajaran: 'Pembelajaran',
                  kendala: 'Kendala & Solusi',
                } as const;
                const placeholderMap = {
                  aktivitas: manualMode ? 'Contoh: Mengikuti meeting kickoff sprint dan menyepakati pembagian task frontend.' : 'Rincikan pekerjaan yang dilakukan hari ini…',
                  pembelajaran: manualMode ? 'Apa yang dipahami dari meeting atau aktivitas ini?' : 'Jelaskan insight atau skill yang didapat…',
                  kendala: manualMode ? 'Tulis kendala yang muncul, atau "Tidak ada kendala".' : 'Tulis kendala teknis/non-teknis atau "Tidak ada kendala berarti".',
                } as const;
                return (
                  <div key={field} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={field} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {labelMap[field]}
                      </Label>
                      <span className={`font-mono text-[11px] font-medium ${charCountColor(len)}`}>{charCountLabel(len)}</span>
                    </div>
                    <Textarea
                      id={field}
                      rows={5}
                      value={draft[field]}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                      placeholder={placeholderMap[field]}
                      className="min-h-[110px] resize-y bg-background text-[13.5px] leading-relaxed"
                    />
                    <ProgressBar len={len} />
                    {len < 100 && (
                      <p className="flex items-center gap-1 font-mono text-[11px] text-amber-500">
                        <AlertCircle className="h-3 w-3" /> Minimal 100 karakter agar bisa disimpan ke Excel
                      </p>
                    )}
                  </div>
                );
              })}

              {autoSavedAt && (
                <p className="text-right font-mono text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                  <Clock className="h-3 w-3" /> autosaved {new Date(autoSavedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground max-w-[36ch]">
                  Pastikan tiap field sudah <span className="font-medium text-foreground">≥100 karakter</span> sebelum disimpan. File Excel akan ter-download otomatis.
                </p>
                <div className="flex items-center gap-2">
                  {manualMode && (
                    <Button type="button" variant="ghost" onClick={resetDraft}>
                      Batal
                    </Button>
                  )}
                  <Button type="button" variant="outline" disabled={regenerating || generating} onClick={handleRegenerate}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Generate ulang
                  </Button>
                  <Button type="submit" disabled={saving} className="shadow-sm">
                    {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Simpan & Download Excel
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <ManualMergeModal
        open={manualModalOpen}
        gitLogs={gitLogs}
        commits={commits}
        onClose={() => setManualModalOpen(false)}
        onSubmit={handleManualSubmit}
        submitting={modalSubmitting}
      />
    </div>
  );
}

// keep EMPTY_DRAFT referenced so the initial-state shape stays documented
void EMPTY_DRAFT;
