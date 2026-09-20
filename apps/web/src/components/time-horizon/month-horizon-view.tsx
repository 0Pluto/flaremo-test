// ============================================================================
// 2. Month Horizon View (Seamless Full-Tile Calendar Heatmap Carpet)
// ============================================================================
import { useMemo } from "react";
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
  isLoading: _isLoading,
  displayMode,
  hoveredDate,
  onDrillToWeek,
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
  hourlyData?: Array<{ date: string; hour: number; count: number }>;
  isLoading?: boolean;
  displayMode: DisplayMode;
  hoveredDate?: string | null;
  onDrillToWeek?: (day: string) => void;
  onDrillToDay?: (day: string) => void;
  onHoverDate?: (day: string | null) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart, true),
    [monthKey, weekStart],
  );
  const headers = weekdayHeaders(weekStart, locale, "narrow");

  // Map daily quadrants (night, morning, afternoon, evening) for the hover stacked-stripes preview
  const dayQuadrants = useMemo(
    () => buildDayQuadrants(hourlyData ?? []),
    [hourlyData],
  );

  return (
    <div className="flex flex-col gap-1.5">
      {/* 7 Weekday Headers: Clear orientation for the 7 columns */}
      <div className="grid grid-cols-7 gap-1">
        {["col-0", "col-1", "col-2", "col-3", "col-4", "col-5", "col-6"].map(
          (colId, i) => (
            <div
              className={cn(
                "text-center text-[10px] font-medium font-mono transition-opacity",
                displayMode === "calendar"
                  ? "text-foreground/75 dark:text-foreground/70 font-semibold"
                  : "text-foreground/60 dark:text-foreground/50",
              )}
              key={colId}
            >
              {headers[i]}
            </div>
          ),
        )}
      </div>

      {/* Grid of Days: 7 Columns x 5~6 Rows of Solid, Cohesive Tiles */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          if (!cell.inMonth) {
            return (
              <div
                aria-hidden="true"
                className="h-8.5 w-full rounded-[5px] border border-dashed border-border/20 bg-muted/10 opacity-30 pointer-events-none"
                key={cell.key}
              />
            );
          }

          const totalCount = notesCountMap.get(cell.key) ?? 0;
          const isToday = cell.key === today;
          const isSelected = cell.key === selectedDay;
          const dayNum = Number(cell.key.slice(8));
          const [q0, q1, q2, q3] = dayQuadrants.get(cell.key) ?? [0, 0, 0, 0];

          // ── GitHub-style Activity Heat Depth Ramp (颜色深浅展示多寡) ──
          const activityStyle =
            totalCount <= 0
              ? "border-border/60 bg-card/60 dark:border-border/30 dark:bg-card/25 text-foreground/75 dark:text-foreground/70 hover:border-border hover:bg-card/90 dark:hover:bg-card/45"
              : totalCount === 1
                ? "border-brand-500/35 bg-brand-500/20 text-brand-800 dark:border-brand-400/35 dark:bg-brand-500/25 dark:text-brand-200 font-semibold shadow-2xs hover:bg-brand-500/30 dark:hover:bg-brand-500/35"
                : totalCount === 2
                  ? "border-brand-500/55 bg-brand-500/45 text-brand-950 dark:border-brand-400/55 dark:bg-brand-500/50 dark:text-white font-bold shadow-2xs hover:bg-brand-500/55 dark:hover:bg-brand-500/60"
                  : totalCount <= 4
                    ? "border-brand-600/70 bg-brand-500/75 text-white dark:border-brand-400/70 dark:bg-brand-500/80 dark:text-white font-bold shadow-xs hover:bg-brand-500/85 dark:hover:bg-brand-500/90"
                    : "border-brand-600 bg-brand-500 text-white dark:border-brand-400 dark:bg-brand-500 dark:text-white font-bold shadow-sm hover:brightness-110";

          return (
            <button
              className={cn(
                "group relative flex h-8.5 w-full items-center justify-center rounded-[5px] border transition-all select-none cursor-pointer active:scale-95",
                activityStyle,
                // ── 彻底解耦：中性高对比双层选中环，绝不与橙色主题色重叠 ──
                isSelected &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-background dark:ring-white dark:ring-offset-background z-20 scale-[1.04] shadow-sm",
                // ── 今日未选中时的精致边框 ──
                !isSelected &&
                  isToday &&
                  "border-foreground/50 dark:border-foreground/60 shadow-2xs font-bold",
                hoveredDate === cell.key && !isSelected && "scale-105 z-10",
                !isSelected && "hover:scale-105 hover:z-10",
              )}
              key={cell.key}
              type="button"
              onClick={() => (onDrillToWeek ?? onDrillToDay)?.(cell.key)}
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
              {/* Calendar Mode: 日期数字始终 100% 绝对水平垂直居中，不放任何跳动数字 */}
              {displayMode === "calendar" ? (
                <span
                  className={cn(
                    "text-[12px] font-mono tabular-nums leading-none transition-opacity group-hover:opacity-0",
                    totalCount >= 3
                      ? "text-white font-bold drop-shadow-2xs"
                      : totalCount === 2
                        ? "text-brand-950 dark:text-white font-bold"
                        : totalCount === 1
                          ? "text-brand-800 dark:text-brand-200 font-semibold"
                          : "text-foreground/85 font-medium",
                  )}
                >
                  {dayNum}
                </span>
              ) : null}

              {/* 今日专属指示点（Today Indicator Dot） */}
              {isToday && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 h-[2.5px] w-2.5 rounded-full transition-colors",
                    totalCount >= 3
                      ? "bg-white"
                      : isSelected
                        ? "bg-foreground dark:bg-white"
                        : "bg-brand-500 dark:bg-brand-400",
                  )}
                />
              )}

              {/* Hover Stacked Micro-Stripes: Previews the single vertical column of Day view! */}
              <div className="absolute inset-0 flex flex-col justify-center gap-[1.5px] p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 dark:bg-background/95 rounded-[4px] shadow-xs pointer-events-none">
                <div
                  className={cn(
                    "h-[2px] w-full rounded-[0.5px] transition-colors",
                    q0 > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/20 dark:bg-muted/40",
                  )}
                  title="夜间 (00-06)"
                />
                <div
                  className={cn(
                    "h-[2px] w-full rounded-[0.5px] transition-colors",
                    q1 > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/20 dark:bg-muted/40",
                  )}
                  title="早晨 (06-12)"
                />
                <div
                  className={cn(
                    "h-[2px] w-full rounded-[0.5px] transition-colors",
                    q2 > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/20 dark:bg-muted/40",
                  )}
                  title="下午 (12-18)"
                />
                <div
                  className={cn(
                    "h-[2px] w-full rounded-[0.5px] transition-colors",
                    q3 > 0
                      ? "bg-primary"
                      : "bg-muted-foreground/20 dark:bg-muted/40",
                  )}
                  title="晚间 (18-24)"
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
