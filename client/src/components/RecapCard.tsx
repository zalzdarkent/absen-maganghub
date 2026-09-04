import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, CalendarDays, FileText, Copy, Download, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import type { LogbookEntry } from "../types";

interface Recap {
  ringkasan: string;
  highlights: string[];
  kendalaTeratasi: string;
  saran: string;
  totalHari: number;
  rentang: string;
}

interface RecapResponse {
  recap: Recap;
  entries: LogbookEntry[];
  period: string;
  count: number;
}

interface Props {
  entries: LogbookEntry[] | null;
}

export function RecapCard({ entries }: Props) {
  const { showToast } = useToast();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [meta, setMeta] = useState<{ period: string; count: number; rentang: string } | null>(null);
  const [loading, setLoading] = useState<null | "weekly" | "monthly">(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const hasEntries = entries !== null && entries.length > 0;
  const weeklyCount = entries ? Math.min(7, entries.length) : 0;
  const monthlyCount = entries ? Math.min(30, entries.length) : 0;

  function startTimer(period: "weekly" | "monthly") {
    setLoading(period);
    setElapsed(0);
    startRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 200);
  }
  function stopTimer() {
    setLoading(null);
    if (timerRef.current) clearInterval(timerRef.current);
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleGenerate(period: "weekly" | "monthly") {
    if (!hasEntries) {
      showToast("Belum ada entri untuk direkap. Isi logbook dulu minimal 1 hari.", "warning");
      return;
    }
    startTimer(period);
    try {
      const data = await api<RecapResponse>("/api/generate-recap", {
        method: "POST",
        body: JSON.stringify({ period }),
      });
      setRecap(data.recap);
      setMeta({ period: data.period, count: data.count, rentang: data.recap.rentang || data.entries[0]?.tanggal + " — " + data.entries[data.entries.length - 1]?.tanggal });
      const secs = ((Date.now() - startRef.current) / 1000).toFixed(1);
      showToast(`Rekap ${period === "weekly" ? "mingguan" : "bulanan"} selesai dalam ${secs}s`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal generate rekap", "error");
    } finally {
      stopTimer();
    }
  }

  function handleCopy() {
    if (!recap || !meta) return;
    const text = `REKAP ${meta.period.toUpperCase()} (${meta.rentang}) — ${meta.count} hari\n\nRINGKASAN:\n${recap.ringkasan}\n\nHIGHLIGHTS:\n${recap.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nKENDALA TERATASI:\n${recap.kendalaTeratasi}\n\nSARAN:\n${recap.saran}`;
    navigator.clipboard.writeText(text).then(() => showToast("Disalin", "success")).catch(() => showToast("Gagal menyalin", "error"));
  }

  function handleDownload() {
    if (!recap || !meta) return;
    const text = `REKAP ${meta.period.toUpperCase()} — ${meta.rentang} (${meta.count} hari)\nTanggal generate: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}\n\nRINGKASAN:\n${recap.ringkasan}\n\nHIGHLIGHTS:\n${recap.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nKENDALA TERATASI:\n${recap.kendalaTeratasi}\n\nSARAN UNTUK PERIODE DEPAN:\n${recap.saran}\n`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rekap-${meta.period}-${meta.rentang.replace(/\s/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="overflow-hidden border shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <CardTitle className="text-[15px]">Rekap</CardTitle>
              <CardDescription className="mt-1 max-w-[60ch] text-xs leading-relaxed">
                Ringkas logbook jadi laporan mingguan atau bulanan.
              </CardDescription>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 font-mono text-[11px] text-muted-foreground">
            {hasEntries ? `${entries!.length} entri` : "Belum ada entri"}
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-5">
        {/* Action row */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => handleGenerate("weekly")}
            disabled={!!loading || !hasEntries}
            className="rounded-full shadow-sm"
            size="sm"
          >
            {loading === "weekly" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
            {loading === "weekly" ? `Merangkum ${elapsed.toFixed(1)}s…` : `Rekap Mingguan`}
            <Badge variant="secondary" className="ml-1 rounded-full bg-white/20 px-1.5 py-0 text-[10px] text-white border-white/20">
              {weeklyCount} hari
            </Badge>
          </Button>
          <Button
            onClick={() => handleGenerate("monthly")}
            disabled={!!loading || !hasEntries}
            variant="outline"
            className="rounded-full"
            size="sm"
          >
            {loading === "monthly" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {loading === "monthly" ? `Merangkum ${elapsed.toFixed(1)}s…` : `Rekap Bulanan`}
            <Badge variant="secondary" className="ml-1 rounded-full text-[10px]">
              {monthlyCount} hari
            </Badge>
          </Button>
          {loading && <Badge variant="secondary" className="rounded-full font-mono text-xs tabular-nums">{elapsed.toFixed(1)}s</Badge>}
          {!hasEntries && <span className="font-mono text-[11px] text-muted-foreground">Isi minimal 1 entri dulu</span>}
        </div>

        {hasEntries && !recap && !loading && (
          <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-center">
            <p className="text-sm font-medium">Belum ada rekap</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
              Pilih rekap mingguan atau bulanan untuk mulai.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background border shadow-sm">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-none">Menyusun rekap...</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">Mohon tunggu</p>
            </div>
            <Badge variant="secondary" className="rounded-full font-mono text-xs tabular-nums">{elapsed.toFixed(1)}s</Badge>
          </div>
        )}

        {recap && meta && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={meta.period === "monthly" ? "default" : "success"} className="rounded-full font-mono text-xs capitalize">
                  {meta.period === "monthly" ? "Bulanan" : "Mingguan"} • {meta.count} hari
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{meta.rentang}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5" /> Download .txt
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Ringkasan
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed">{recap.ringkasan}</p>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Highlights
              </p>
              <ul className="mt-2 space-y-1.5">
                {recap.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5" /> Kendala Teratasi
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recap.kendalaTeratasi}</p>
              </div>
              <div className="rounded-xl border bg-amber-500/10 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Saran
                </p>
                <p className="mt-2 text-sm leading-relaxed">{recap.saran}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="font-mono text-[11px] text-muted-foreground">Rentang: {recap.rentang} • {recap.totalHari} hari terhitung</p>
              <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => handleGenerate(meta.period as "weekly" | "monthly")}>
                <RefreshCw className="h-3.5 w-3.5" /> Ulangi
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
