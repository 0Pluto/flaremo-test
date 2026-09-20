// ============================================================================
// 2. Month Horizon View (30 Days x 4 Quadrants = ~120-140 Micro-Dots)
// ============================================================================
import { useMemo } from "react";
import { heatmapColor } from "@/lib/activity";
import {
  buildMonthGrid,
  type WeekStart,
  weekdayHeaders,
} from "@/lib/calendar-date";
import { buildDayQuadrants } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import type { DisplayMode } from "./shared";

export function MonthHorizonPureView({
  monthKey,
  today,
  selectedDay,
  locale,
  weekStart,
  notesCountMap,
  hourlyData,
  isLoading,
  displayMode,
  hoveredDate,
  onDrillToDay,
  onHoverDate,
  onHoverTip,
}: {
  monthKey: string;
  today: string;
  selectedDay: string;
  locale: string;
  weekStart: WeekStart;
  notesCountMap: Map<string, number>;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  isLoading: boolean;
  displayMode: DisplayMode;
  hoveredDate?: string | null;
  onDrillToDay: (day: string) => void;
  onHoverDate?: (day: string | null) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart),
    [monthKey, weekStart],
  );
  const headers = weekdayHeaders(weekStart, locale, "narrow");

  // Map 4 daily quadrants from hourly records:
  // q0: 00-06h (深夜), q1: 06-12h (上午), q2: 12-18h (下午), q3: 18-24h (晚上)
  const dayQuadrants = useMemo(
    () => buildDayQuadrants(hourlyData),
    [hourlyData],
  );

  return (
    <div className="flex flex-col gap-1.5">
      {/* 7 Weekday Headers: ONLY shown in Calendar mode! In Heatmap mode, pure restraint! */}
      {displayMode === "calendar" ? (
        <div className="grid grid-cols-7 gap-1">
          {["col-0", "col-1", "col-2", "col-3", "col-4", "col-5", "col-6"].map(
            (colId, i) => (
              <div
                className="text-center text-[10px] font-medium text-muted-foreground/60"
                key={colId}
              >
                {headers[i]}
              </div>
            ),
          )}
        </div>
      ) : null}

      {/* Grid of Days (~30 Days, each packed with 4 Quadrant Micro-Dots in Heatmap mode) */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const totalCount = notesCountMap.get(cell.key) ?? 0;
          const isToday = cell.key === today;
          const isSelected = cell.key === selectedDay;
          const dayNum = Number(cell.key.slice(8));
          const [q0, q1, q2, q3] = dayQuadrants.get(cell.key) ?? [0, 0, 0, 0];
          const qTotal = q0 + q1 + q2 + q3;

          const dotColor = (qVal: number) => {
            if (qVal > 0) return heatmapColor(qVal);
            if (isLoading && totalCount > 0) return "bg-brand-500/30";
            if (qTotal === 0 && totalCount > 0) return heatmapColor(totalCount);
            return "bg-muted/40";
          };

          return (
            <button
              className={cn(
                "group relative flex h-8.5 w-full items-center justify-center rounded-[3px] border transition-all",
                cell.inMonth ? "opacity-100" : "opacity-15 pointer-events-none",
                displayMode === "heatmap"
                  ? cn(
                      "border-border/20 bg-background/20 hover:border-brand-500/40 hover:bg-brand-500/5",
                      isToday && "border-brand-500/60 ring-1 ring-brand-500/30",
                    )
                  : cn(
                      "border-border/30 bg-background/50 text-foreground",
                      isToday && "border-brand-500 bg-brand-500/10 font-bold",
                      totalCount > 0 &&
                        "font-semibold text-brand-600 dark:text-brand-400",
                    ),
                isSelected && "ring-2 ring-brand-500 z-10 scale-105 shadow-sm",
                hoveredDate === cell.key &&
                  "ring-1 ring-brand-500/70 scale-105",
                "hover:scale-105 hover:z-10",
              )}
              key={cell.key}
              type="button"
              onClick={() => onDrillToDay(cell.key)}
              onMouseEnter={() => {
                onHoverDate?.(cell.key);
                if (totalCount > 0) {
                  onHoverTip(
                    `${cell.key} · ${totalCount} 条笔记 (早:${q1} 午:${q2} 晚:${q3} 夜:${q0})`,
                  );
                } else {
                  onHoverTip(`${cell.key} · 无记录`);
                }
              }}
              onMouseLeave={() => {
                onHoverDate?.(null);
                onHoverTip(null);
              }}
            >
              {/* Heatmap Mode: 2x2 Quadrant Micro-Dots Matrix (~140 Dots across the month!) */}
              {displayMode === "heatmap" ? (
                <div
                  className={cn(
                    "grid grid-cols-2 gap-[2.5px]",
                    isLoading && "animate-pulse",
                  )}
                >
                  <div
                    className={cn(
                      "size-[5px] rounded-[1px] transition-colors",
                      dotColor(q1),
                    )}
                    title="上午 (06-12)"
                  />
                  <div
                    className={cn(
                      "size-[5px] rounded-[1px] transition-colors",
                      dotColor(q2),
                    )}
                    title="下午 (12-18)"
                  />
                  <div
                    className={cn(
                      "size-[5px] rounded-[1px] transition-colors",
                      dotColor(q0),
                    )}
                    title="深夜 (00-06)"
                  />
                  <div
                    className={cn(
                      "size-[5px] rounded-[1px] transition-colors",
                      dotColor(q3),
                    )}
                    title="晚上 (18-24)"
                  />
                </div>
              ) : (
                /* Calendar Mode: Crisp Day Number */
                <span
                  className={cn(
                    "text-[11px] font-mono tabular-nums",
                    totalCount > 0
                      ? "font-bold text-brand-600 dark:text-brand-400"
                      : "text-foreground",
                  )}
                >
                  {dayNum}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
