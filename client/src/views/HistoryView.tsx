import { useCallback, useEffect, useMemo, useState } from "react";
import type { EntriesResponse, LogbookEntry } from "../types";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { EditEntryModal } from "../components/EditEntryModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthNavigator } from "@/components/MonthNavigator";
import { CalendarGrid } from "@/components/CalendarGrid";
import { Heatmap } from "@/components/Heatmap";
import { getEntriesByDate, getMonthMatrix, parseTanggal, toKey } from "@/lib/calendar";
import { History, Calendar, FileText, ChevronRight, SearchX, Loader2, BookOpen, LayoutList, Grid3X3, Flame } from "lucide-react";

function truncate(text: string, n: number) {
  if (!text) return "";
  return text.length > n ? text.slice(0, n) + "…" : text;
}

export function HistoryView({ reloadKey }: { reloadKey: number }) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LogbookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LogbookEntry | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<EntriesResponse>("/api/entries");
      setEntries(data.entries);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memuat riwayat";
      showToast(message, "error");
      setError(message);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function handleSave(rowNumber: number, draftFields: { aktivitas: string; pembelajaran: string; kendala: string }) {
    try {
      await api(`/api/entries/${rowNumber}`, { method: "PUT", body: JSON.stringify(draftFields) });
      showToast("Perubahan tersimpan ✔", "success");
      setEditing(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan", "error");
    }
  }

  async function handleDelete(rowNumber: number) {
    if (!confirm("Hapus entri ini dari logbook? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await api(`/api/entries/${rowNumber}`, { method: "DELETE" });
      showToast("Entri dihapus.", "success");
      setEditing(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus", "error");
    }
  }

  const entriesByDate = useMemo(() => {
    if (!entries) return new Map<string, LogbookEntry>();
    return getEntriesByDate(entries);
  }, [entries]);

  const weeks = useMemo(() => {
    return getMonthMatrix(currentMonth.getFullYear(), currentMonth.getMonth());
  }, [currentMonth]);

  const filteredForMonth = useMemo(() => {
    if (!entries) return [];
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    return entries.filter((e) => {
      const d = parseTanggal(e.tanggal);
      if (!d) return false;
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [entries, currentMonth]);

  const handlePrev = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0, 0));
  const handleNext = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0));
  const handleToday = () => setCurrentMonth(new Date());

  const handleSelectEmpty = (date: Date) => {
    const key = toKey(date);
    const display = date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    // check if weekend
    const day = date.getDay();
    if (day === 0 || day === 6) {
      showToast(`${display} adalah weekend — tidak perlu isi logbook.`, "info");
      return;
    }
    showToast(`Belum ada entri untuk ${display} (${key}). Buka tab Generate untuk buat draft tanggal ini.`, "info");
  };

  // calendar mode year for heatmap
  const heatmapYear = currentMonth.getFullYear();

  return (
    <div className="grid gap-6">
      {/* Header card with toggle */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <History className="h-[18px] w-[18px] text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm">Riwayat Logbook</CardTitle>
                <CardDescription className="text-xs mt-1">
                  {entries === null ? "Memuat…" : `${entries.length} entri tersimpan • ${viewMode === "calendar" ? "mode kalender" : "mode list"}`}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              {entries && entries.length > 0 && (
                <Badge variant="secondary" className="hidden sm:inline-flex rounded-full font-mono text-xs">
                  <Calendar className="h-3 w-3 mr-1" />
                  {entries.length} entri
                </Badge>
              )}
              <div className="inline-flex items-center rounded-full bg-muted p-1">
                <button
                  onClick={() => setViewMode("list")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${viewMode === "list" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutList className="h-3.5 w-3.5" /> List
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${viewMode === "calendar" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" /> Kalender
                </button>
              </div>
            </div>
          </div>
        </CardHeader>

        {viewMode === "calendar" && entries !== null && !error && entries.length > 0 && (
          <>
            <Separator />
            <div className="p-4 sm:p-5">
              <MonthNavigator currentMonth={currentMonth} entries={entries} onPrev={handlePrev} onNext={handleNext} onToday={handleToday} />
            </div>
          </>
        )}

        <Separator />

        <CardContent className="p-0">
          {error ? (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
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
          ) : viewMode === "calendar" ? (
            <div className="space-y-6 p-4 sm:p-5">
              <CalendarGrid currentMonth={currentMonth} entries={entries} entriesByDate={entriesByDate} weeks={weeks} onSelectEntry={setEditing} onSelectEmpty={handleSelectEmpty} />

              {/* monthly filtered list */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Entri bulan ini
                    <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                      {filteredForMonth.length} entri
                    </Badge>
                  </h3>
                  <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                    {filteredForMonth.length === 0 ? "Belum ada entri bulan ini" : `${filteredForMonth.length} entri di ${currentMonth.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`}
                  </span>
                </div>

                {filteredForMonth.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-background border">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium">Kosong bulan ini</p>
                    <p className="mt-1 text-xs text-muted-foreground">Coba pindah bulan atau generate entri baru.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border divide-y bg-card">
                    {filteredForMonth.map((entry) => (
                      <button
                        key={entry.rowNumber}
                        onClick={() => setEditing(entry)}
                        className="group w-full text-left flex items-start gap-4 px-5 py-4 hover:bg-muted/40 transition-colors"
                      >
                        <div className="hidden sm:flex flex-col items-center gap-2 pt-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/15" />
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
                          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80">{truncate(entry.aktivitas, 160)}</p>
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="line-clamp-1 flex-1">Pembelajaran: {truncate(entry.pembelajaran, 80)}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Heatmap entries={entries} year={heatmapYear} />
            </div>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => (
                <button
                  key={entry.rowNumber}
                  onClick={() => setEditing(entry)}
                  className="group w-full text-left flex items-start gap-4 px-5 py-4 hover:bg-muted/40 transition-colors"
                >
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
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80">{truncate(entry.aktivitas, 160)}</p>
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

      <EditEntryModal entry={editing} onClose={() => setEditing(null)} onSave={handleSave} onDelete={handleDelete} />
    </div>
  );
}
