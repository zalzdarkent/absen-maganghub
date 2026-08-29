import { useEffect, useState } from 'react';
import type { LogbookEntry } from '../types';

interface Props {
  entry: LogbookEntry | null;
  onClose: () => void;
  onSave: (rowNumber: number, draft: { aktivitas: string; pembelajaran: string; kendala: string }) => void;
  onDelete: (rowNumber: number) => void;
}

export function EditEntryModal({ entry, onClose, onSave, onDelete }: Props) {
  const [aktivitas, setAktivitas] = useState('');
  const [pembelajaran, setPembelajaran] = useState('');
  const [kendala, setKendala] = useState('');

  useEffect(() => {
    if (entry) {
      setAktivitas(entry.aktivitas || '');
      setPembelajaran(entry.pembelajaran || '');
      setKendala(entry.kendala || '');
    }
  }, [entry]);

  if (!entry) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-panel border border-border rounded-[10px] p-5 w-full max-w-[620px] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3.5">
          <h3 className="font-mono text-sm font-semibold m-0">
            Edit entri — #{entry.no} · {entry.tanggal}
          </h3>
          <button
            className="font-mono text-[11.5px] font-semibold rounded-md border border-border px-2.5 py-1.5 bg-transparent text-text hover:brightness-110 cursor-pointer"
            onClick={onClose}
          >
            tutup
          </button>
        </div>
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(entry.rowNumber, { aktivitas: aktivitas.trim(), pembelajaran: pembelajaran.trim(), kendala: kendala.trim() });
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">aktivitas</span>
            <textarea
              rows={4}
              value={aktivitas}
              onChange={(e) => setAktivitas(e.target.value)}
              className="font-sans text-[13.5px] leading-[1.5] bg-bg border border-border rounded-md text-text px-3 py-2.5 resize-y focus:outline-2 focus:outline-blue focus:outline-offset-1"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">pembelajaran</span>
            <textarea
              rows={4}
              value={pembelajaran}
              onChange={(e) => setPembelajaran(e.target.value)}
              className="font-sans text-[13.5px] leading-[1.5] bg-bg border border-border rounded-md text-text px-3 py-2.5 resize-y focus:outline-2 focus:outline-blue focus:outline-offset-1"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">kendala</span>
            <textarea
              rows={4}
              value={kendala}
              onChange={(e) => setKendala(e.target.value)}
              className="font-sans text-[13.5px] leading-[1.5] bg-bg border border-border rounded-md text-text px-3 py-2.5 resize-y focus:outline-2 focus:outline-blue focus:outline-offset-1"
            />
          </label>
          <div className="flex justify-between gap-2.5 mt-1 flex-wrap">
            <button
              type="button"
              className="font-mono text-xs font-semibold rounded-md border border-red text-red bg-transparent px-3.5 py-2 hover:brightness-110 cursor-pointer"
              onClick={() => onDelete(entry.rowNumber)}
            >
              hapus entri
            </button>
            <button
              type="submit"
              className="font-mono text-xs font-semibold rounded-md border border-green px-3.5 py-2 bg-green text-[#04210a] hover:brightness-110 cursor-pointer"
            >
              simpan perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
