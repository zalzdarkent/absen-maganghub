import { cn } from "@/lib/utils";
import { isFuture, isWeekend, toKey, todayKeyWIB } from "@/lib/calendar";
import type { LogbookEntry } from "../types";

interface Props {
  currentMonth: Date;
  entries: LogbookEntry[];
  entriesByDate: Map<string, LogbookEntry>;
  weeks: Date[][];
  onSelectEntry: (entry: LogbookEntry) => void;
  onSelectEmpty: (date: Date) => void;
}

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function CalendarGrid({ currentMonth, entriesByDate, weeks, onSelectEntry, onSelectEmpty }: Props) {
  const month = currentMonth.getMonth();
  const year = currentMonth.getFullYear();
  const todayKey = todayKeyWIB();

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* weekday header */}
      <div className="grid grid-cols-7 gap-px border-b bg-border">
        {WEEKDAYS.map((wd, idx) => {
          const isWeekendHeader = idx >= 5;
          return (
            <div
              key={wd}
              className={cn(
                "bg-muted/40 px-2 py-2 text-center font-mono text-[11px] font-semibold uppercase tracking-widest",
                isWeekendHeader ? "text-muted-foreground/60" : "text-muted-foreground"
              )}
            >
              {wd}
            </div>
          );
        })}
      </div>

      {/* weeks */}
      <div className="grid gap-px bg-border">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-px">
            {week.map((date) => {
              const key = toKey(date);
              const entry = entriesByDate.get(key);
              const isCurrentMonth = date.getMonth() === month && date.getFullYear() === year;
              const isToday = key === todayKey;
              const weekend = isWeekend(date);
              const future = isFuture(date);
              const missingWorkday = isCurrentMonth && !weekend && !future && !isToday && !entry;

              // decide cell appearance
              let cellClass = "relative flex min-h-[84px] flex-col bg-card p-2 text-left transition-colors hover:bg-muted/40";
              if (!isCurrentMonth) cellClass = "relative flex min-h-[84px] flex-col bg-muted/20 p-2 text-left opacity-50";
              else if (entry) cellClass = "relative flex min-h-[84px] flex-col bg-emerald-500/[0.06] p-2 text-left hover:bg-emerald-500/10 border-l-2 border-l-emerald-500/50";
              else if (missingWorkday) cellClass = "relative flex min-h-[84px] flex-col bg-amber-500/[0.06] p-2 text-left hover:bg-amber-500/10 border-l-2 border-l-amber-500/60";
              else if (weekend) cellClass = "relative flex min-h-[84px] flex-col bg-muted/20 p-2 text-left";
              else if (future) cellClass = "relative flex min-h-[84px] flex-col bg-card p-2 text-left opacity-60";

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (entry) onSelectEntry(entry);
                    else if (!future) onSelectEmpty(date);
                  }}
                  disabled={future && !entry}
                  className={cn(cellClass, future && !entry && "cursor-not-allowed")}
                  aria-label={`${key} ${entry ? "ada entri" : weekend ? "weekend" : missingWorkday ? "bolong" : "kosong"}`}
                >
                  {/* day number row */}
                  <div className="flex w-full items-start justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-xs font-semibold",
                        !isCurrentMonth && "text-muted-foreground/40",
                        isToday && isCurrentMonth && entry && "bg-emerald-500 text-white shadow-sm",
                        isToday && isCurrentMonth && !entry && "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20",
                        !isToday && isCurrentMonth && entry && "bg-emerald-500 text-white",
                        !isToday && isCurrentMonth && missingWorkday && "bg-amber-500 text-white",
                        !isToday && isCurrentMonth && !entry && !missingWorkday && !weekend && "text-foreground",
                        weekend && isCurrentMonth && "text-muted-foreground"
                      )}
                    >
                      {date.getDate()}
                    </span>
                    {entry && <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" aria-hidden />}
                    {missingWorkday && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />}
                  </div>

                  {/* entry preview */}
                  <div className="mt-1 min-w-0 flex-1">
                    {entry ? (
                      <>
                        <p className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/90">
                          {entry.aktivitas.slice(0, 68)}
                          {entry.aktivitas.length > 68 ? "…" : ""}
                        </p>
                        <p className="mt-1 hidden text-[10px] leading-none text-muted-foreground sm:block">
                          {entry.pembelajaran.slice(0, 48)}
                          {entry.pembelajaran.length > 48 ? "…" : ""}
                        </p>
                      </>
                    ) : (
                      <p className={cn("text-[11px] leading-tight", missingWorkday ? "font-medium text-amber-600 dark:text-amber-400" : weekend ? "text-muted-foreground/50" : future ? "text-muted-foreground/40" : "text-muted-foreground/60")}>
                        {missingWorkday ? "Bolong" : weekend ? "Libur" : future ? "—" : isToday ? "Hari ini" : "Kosong"}
                      </p>
                    )}
                  </div>

                  {isToday && <span className="pointer-events-none absolute inset-0 rounded-[2px] ring-1 ring-primary/20" aria-hidden />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Terisi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Bolong (kerja)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted border" /> Weekend / kosong
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Hari ini
          </span>
        </div>
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">Klik tanggal untuk edit • Klik bolong untuk buat draft</span>
      </div>
    </div>
  );
}
