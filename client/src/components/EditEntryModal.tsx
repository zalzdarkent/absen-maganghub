import { useEffect, useState } from 'react';
import type { LogbookEntry } from '../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Trash2, Save } from 'lucide-react';

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

  return (
    <Dialog open={!!entry} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[86vh] overflow-y-auto">
        {entry && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full font-mono text-xs">#{entry.no}</Badge>
                <DialogTitle className="text-base">Edit entri — {entry.tanggal}</DialogTitle>
              </div>
              <DialogDescription className="text-xs">Perbarui aktivitas, pembelajaran, dan kendala. Sinkron otomatis ke Excel.</DialogDescription>
            </DialogHeader>
            <Separator />
            <form
              className="flex flex-col gap-4 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                onSave(entry.rowNumber, { aktivitas: aktivitas.trim(), pembelajaran: pembelajaran.trim(), kendala: kendala.trim() });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="edit-aktivitas" className="text-xs uppercase tracking-widest text-muted-foreground">Aktivitas</Label>
                <Textarea id="edit-aktivitas" rows={4} value={aktivitas} onChange={(e) => setAktivitas(e.target.value)} className="min-h-[96px] text-sm leading-relaxed" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pembelajaran" className="text-xs uppercase tracking-widest text-muted-foreground">Pembelajaran</Label>
                <Textarea id="edit-pembelajaran" rows={4} value={pembelajaran} onChange={(e) => setPembelajaran(e.target.value)} className="min-h-[96px] text-sm leading-relaxed" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-kendala" className="text-xs uppercase tracking-widest text-muted-foreground">Kendala</Label>
                <Textarea id="edit-kendala" rows={4} value={kendala} onChange={(e) => setKendala(e.target.value)} className="min-h-[96px] text-sm leading-relaxed" />
              </div>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="destructive" onClick={() => onDelete(entry.rowNumber)} className="gap-1.5">
                  <Trash2 className="h-4 w-4" /> Hapus entri
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Batal
                  </Button>
                  <Button type="submit" className="gap-1.5">
                    <Save className="h-4 w-4" /> Simpan perubahan
                  </Button>
                </div>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
