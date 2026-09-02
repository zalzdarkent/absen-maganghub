import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Commit, GenerateCombinedResponse, GenerateManualResponse, GenerateResponse } from '../types';
import type { GenerateMode } from '../types';
import { api, downloadExcel } from '../lib/api';
import { notifyDesktop } from '../lib/notifications';
import { useToast } from '../context/ToastContext';
import { CommitLog } from '../components/CommitLog';
import { ManualMergeModal } from '../components/ManualMergeModal';

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
  return `${len} karakter` + (len < 100 ? ' — minimal 100' : len > 5000 ? ' — kepanjangan!' : ' ✔');
}
function charCountColor(len: number) {
  return len < 100 ? '#d29922' : len > 5000 ? '#f85149' : '#8b949e';
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

  return (
    <main className="view grid gap-5 grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] items-start">
      {/* Commit Panel */}
      <section className="bg-panel border border-border rounded-[10px] p-[18px_20px]">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-mono text-sm lowercase tracking-[0.02em] text-muted font-semibold m-0">commit hari ini</h2>
          <button
            className="font-mono text-[11.5px] font-semibold rounded-md border border-border px-2.5 py-1.5 bg-transparent text-text hover:brightness-110 cursor-pointer"
            onClick={onRefreshCommits}
          >
            refresh
          </button>
        </div>
        <div className="bg-bg border border-border rounded-md py-1 max-h-[420px] overflow-y-auto" aria-live="polite">
          <CommitLog gitLogs={gitLogs} commits={commits} />
        </div>
      </section>

      {/* Draft Panel */}
      <section className="bg-panel border border-border rounded-[10px] p-[18px_20px]">
        <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2.5 max-[560px]:items-start">
          <h2 className="font-mono text-sm lowercase tracking-[0.02em] text-muted font-semibold m-0">draft logbook</h2>
          <div className="flex items-center gap-2 max-[560px]:w-full max-[560px]:justify-end">
            <button
              type="button"
              className="font-mono text-xs font-semibold rounded-md border border-border px-3.5 py-2 bg-transparent text-text hover:brightness-110 cursor-pointer"
              onClick={() => setManualModalOpen(true)}
            >
              Merge &amp; Generate ✨
            </button>
            <button
              type="button"
              disabled={generating}
              className="font-mono text-xs font-semibold rounded-md border border-blue px-3.5 py-2 bg-blue text-[#04121f] hover:brightness-110 cursor-pointer disabled:opacity-60"
              onClick={runGenerate}
            >
              {generating && lastMode !== 'combined' ? 'meracik draft…' : 'Generate dari Commit'}
            </button>
          </div>
        </div>

        {!draft && !generating && (
          <div className="text-muted text-[13.5px] px-3.5 py-[22px] text-center border border-dashed border-border rounded-md flex flex-col gap-2.5 items-center">
            <p className="m-0">Belum ada draft.</p>
            <ul className="text-left m-0 pl-[18px] text-[12.5px] leading-[1.6] text-muted list-disc">
              <li className="my-0.5">
                <strong className="text-text">Commit saja</strong> → klik <em>Generate dari Commit</em>.
              </li>
              <li className="my-0.5">
                <strong className="text-text">Paling akurat ⭐</strong> → klik <em>Merge &amp; Generate ✨</em> lalu isi catatan
                meeting/belajar.
              </li>
            </ul>
            <p className="text-muted text-xs m-0 mt-2.5">
              Tips: model <code className="bg-bg border border-border px-1 py-0.5 rounded text-[11px]">gemini-3.6-flash</code>{' '}
              (terbaru) paling cepat & stabil.
            </p>
          </div>
        )}

        {generating && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 bg-panel-alt border border-border rounded-md font-mono text-[12.5px] text-text -mb-0.5">
            <span className="w-3.5 h-3.5 border-2 border-border border-t-blue rounded-full animate-spin-slow shrink-0" />
            <span>{generateLabel}</span>
            <span className="text-muted text-xs ml-auto font-mono">{elapsed.toFixed(1)}s</span>
          </div>
        )}

        {draft && (
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            {(['aktivitas', 'pembelajaran', 'kendala'] as const).map((field) => (
              <label key={field} className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{field}</span>
                <textarea
                  rows={5}
                  value={draft[field]}
                  onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                  placeholder={
                    manualMode
                      ? field === 'aktivitas'
                        ? 'Contoh: Mengikuti meeting kickoff sprint dan menyepakati pembagian task frontend.'
                        : field === 'pembelajaran'
                        ? 'Apa yang dipahami dari meeting atau aktivitas ini?'
                        : 'Tulis kendala yang muncul, atau tulis "Tidak ada kendala".'
                      : ''
                  }
                  className="font-sans text-[13.5px] leading-[1.5] bg-bg border border-border rounded-md text-text px-3 py-2.5 resize-y focus:outline-2 focus:outline-blue focus:outline-offset-1"
                />
                <span
                  className="font-mono text-[10.5px] text-right -mt-0.5"
                  style={{ color: charCountColor(counts?.[field] ?? 0) }}
                >
                  {charCountLabel(counts?.[field] ?? 0)}
                </span>
              </label>
            ))}
            {autoSavedAt && (
              <p className="m-0 -mt-1 text-right font-mono text-[10.5px] text-muted">
                draft autosaved {new Date(autoSavedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <div className="flex justify-end gap-2.5 mt-1 flex-wrap">
              {manualMode && (
                <button
                  type="button"
                  className="font-mono text-xs font-semibold rounded-md border border-border px-3.5 py-2 bg-transparent text-text hover:brightness-110 cursor-pointer"
                  onClick={resetDraft}
                >
                  batal
                </button>
              )}
              <button
                type="button"
                disabled={regenerating || generating}
                className="font-mono text-xs font-semibold rounded-md border border-border px-3.5 py-2 bg-transparent text-text hover:brightness-110 cursor-pointer disabled:opacity-60"
                onClick={handleRegenerate}
              >
                generate ulang
              </button>
              <button
                type="submit"
                disabled={saving}
                className="font-mono text-xs font-semibold rounded-md border border-green px-3.5 py-2 bg-green text-[#04210a] hover:brightness-110 cursor-pointer disabled:opacity-60"
              >
                simpan &amp; download excel
              </button>
            </div>
          </form>
        )}
      </section>

      <ManualMergeModal
        open={manualModalOpen}
        gitLogs={gitLogs}
        commits={commits}
        onClose={() => setManualModalOpen(false)}
        onSubmit={handleManualSubmit}
        submitting={modalSubmitting}
      />
    </main>
  );
}

// keep EMPTY_DRAFT referenced so the initial-state shape stays documented
void EMPTY_DRAFT;
