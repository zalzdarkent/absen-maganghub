import { cn } from "@/lib/utils";
import { getHeatmapWeeks, toKey, isWeekend, isFuture } from "@/lib/calendar";
import type { LogbookEntry } from "../types";
import { useMemo, useState } from "react";

interface Props {
  entries: LogbookEntry[];
  year?: number;
}

function HeatCell({ date, hasEntry, isWeekendDay, isFutureDay, isThisYear }: { date: Date; hasEntry: boolean; isWeekendDay: boolean; isFutureDay: boolean; isThisYear: boolean }) {
  const [hover, setHover] = useState(false);
  const key = toKey(date);
  // level: 0 none, 1 weekend, 2 future, 3 filled
  let bg = "bg-muted";
  let title = `${key}`;
  if (hasEntry) {
    bg = "bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]";
    title = `${key} • ada entri`;
  } else if (isFutureDay) {
    bg = "bg-muted/30";
    title = `${key} • mendatang`;
  } else if (isWeekendDay) {
    bg = "bg-muted/60";
    title = `${key} • weekend`;
  } else if (!isThisYear) {
    bg = "bg-transparent border border-dashed border-muted";
    title = `${key} • di luar tahun`;
  } else {
    bg = "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/20";
    title = `${key} • bolong`;
  }

  return (
    <div className="relative">
      <div
        className={cn("h-[11px] w-[11px] rounded-[2px] transition-colors sm:h-[12px] sm:w-[12px]", bg)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={title}
        title={title}
      />
      {hover && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 font-mono text-[11px] shadow-md ring-1 ring-border">
          {title}
        </div>
      )}
    </div>
  );
}

export function Heatmap({ entries, year }: Props) {
  const targetYear = year ?? new Date().getFullYear();
  const { weeks, map } = useMemo(() => getHeatmapWeeks(entries, targetYear), [entries, targetYear]);

  const monthLabels = useMemo(() => {
    // find first week where month changes to show label
    const labels: { month: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, col) => {
      // use middle day (Wednesday) to determine month
      const sample = week[3] || week[0];
      if (!sample) return;
      const m = sample.getMonth();
      if (m !== lastMonth) {
        // only show if not first col duplicate and within target year
        if (sample.getFullYear() === targetYear) {
          labels.push({ month: sample.toLocaleDateString("id-ID", { month: "short" }), col });
        }
        lastMonth = m;
      }
    });
    return labels;
  }, [weeks, targetYear]);

  const total = entries.length;
  const filledThisYear = useMemo(() => {
    let c = 0;
    for (const [k] of map) {
      if (k.startsWith(String(targetYear))) c++;
    }
    return c;
  }, [map, targetYear]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold leading-none">Heatmap {targetYear}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {filledThisYear} hari terisi di {targetYear} • total {total} entri
          </p>
        </div>
        <div className="hidden items-center gap-1.5 font-mono text-[11px] text-muted-foreground sm:flex">
          <span>Kurang</span>
          <span className="h-3 w-3 rounded-sm bg-muted border" />
          <span className="h-3 w-3 rounded-sm bg-amber-500/20 border border-amber-500/20" />
          <span className="h-3 w-3 rounded-sm bg-emerald-500" />
          <span>Lengkap</span>
        </div>
      </div>

      <div className="overflow-x-auto px-3 pb-3">
        {/* month labels */}
        <div className="relative mb-1 ml-[28px] hidden h-4 sm:block">
          {monthLabels.map(({ month, col }) => (
            <span key={`${month}-${col}`} className="absolute font-mono text-[10px] text-muted-foreground capitalize" style={{ left: `${col * 14}px` }}>
              {month}
            </span>
          ))}
        </div>

        <div className="flex gap-1">
          {/* weekday labels */}
          <div className="flex flex-col gap-1 pr-2 pt-1 font-mono text-[10px] leading-none text-muted-foreground">
            <span className="h-[11px] sm:h-[12px]">Sen</span>
            <span className="h-[11px] sm:h-[12px]">&nbsp;</span>
            <span className="h-[11px] sm:h-[12px]">Rab</span>
            <span className="h-[11px] sm:h-[12px]">&nbsp;</span>
            <span className="h-[11px] sm:h-[12px]">Jum</span>
            <span className="h-[11px] sm:h-[12px]">&nbsp;</span>
            <span className="h-[11px] sm:h-[12px]">&nbsp;</span>
          </div>

          {/* weeks grid */}
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((date) => {
                  const key = toKey(date);
                  const hasEntry = map.has(key);
                  const weekend = isWeekend(date);
                  const future = isFuture(date);
                  const isThisYear = date.getFullYear() === targetYear;
                  return <HeatCell key={key} date={date} hasEntry={hasEntry} isWeekendDay={weekend} isFutureDay={future} isThisYear={isThisYear} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t bg-muted/20 px-3 py-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">Arahkan kursor ke kotak untuk lihat tanggal</span>
        <span className="sm:hidden">Geser horizontal untuk lihat full year</span>
        <span className="hidden sm:inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> {weeks.length} minggu
        </span>
      </div>
    </div>
  );
}
