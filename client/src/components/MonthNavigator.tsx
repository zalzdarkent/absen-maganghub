import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMonthYear, getMonthStats } from "@/lib/calendar";
import type { LogbookEntry } from "../types";

interface Props {
  currentMonth: Date;
  entries: LogbookEntry[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function MonthNavigator({ currentMonth, entries, onPrev, onNext, onToday }: Props) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const stats = getMonthStats(entries, year, month);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold capitalize leading-none">{formatMonthYear(currentMonth)}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {stats.filled}/{stats.totalWorkdays} hari kerja terisi • {stats.rate}% {stats.missing > 0 ? `• ${stats.missing} bolong` : "• lengkap ✔"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Badge variant={stats.missing > 0 ? "warning" : "success"} className="hidden sm:inline-flex rounded-full font-mono text-[11px]">
          {stats.missing > 0 ? `${stats.missing} hari bolong` : "Lengkap"}
        </Badge>
        <div className="inline-flex items-center rounded-full border bg-muted p-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={onPrev} aria-label="Bulan sebelumnya">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 rounded-full px-3 text-xs font-medium" onClick={onToday}>
            Hari ini
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={onNext} aria-label="Bulan berikutnya">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
