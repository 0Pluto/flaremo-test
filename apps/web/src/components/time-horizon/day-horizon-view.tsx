// ============================================================================
// 4. Day Horizon View (24 Hours x 4 Quarter-Hour Slits = 96 Micro-Slits)
// ============================================================================
import { useMemo } from "react";
import { heatmapColor } from "@/lib/activity";
import { buildHourCountMap, buildMemoSlotCountMap } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import {
  DAY_COLUMN_HOURS,
  DAY_COLUMN_LABELS,
  type DisplayMode,
} from "./shared";

export function DayHorizonPureView({
  selectedDay,
  hourlyData,
  memos,
  isLoading,
  displayMode,
  onJumpToTimeline,
  onHoverTip,
}: {
  selectedDay: string;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  memos: Array<{ id: string; create_time: string }>;
  isLoading: boolean;
  displayMode: DisplayMode;
  onJumpToTimeline: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  // Map 96 quarter-hour slots (0 to 95) from exact memo creation timestamps
  const slotCountMap = useMemo(() => buildMemoSlotCountMap(memos), [memos]);

  const hourCountMap = useMemo(
    () => buildHourCountMap(hourlyData),
    [hourlyData],
  );

  return (
    <div className="flex flex-col gap-1.5 py-0.5">
      {/* Top Axis: ONLY in Calendar mode! In Heatmap mode, strictly NO TEXT! */}
      {displayMode === "calendar" ? (
        <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-medium text-muted-foreground/70">
          {DAY_COLUMN_LABELS.map((lbl) => (
            <span key={lbl}>{lbl}</span>
          ))}
        </div>
      ) : null}

      {/* 4 Columns (Night, Morning, Afternoon, Evening) x 6 Hours each = 24 Pods, 96 Micro-Slits */}
      <div className="grid grid-cols-4 gap-2">
        {DAY_COLUMN_HOURS.map((hoursCol, colIdx) => (
          <div
            className="flex flex-col gap-1.5"
            key={`col-${DAY_COLUMN_LABELS[colIdx]}`}
          >
            {hoursCol.map((hour) => {
              const hourLabel = `${String(hour).padStart(2, "0")}:00`;
              const hourBaseSlot = hour * 4;
              const q0 = slotCountMap.get(hourBaseSlot) ?? 0;
              const q1 = slotCountMap.get(hourBaseSlot + 1) ?? 0;
              const q2 = slotCountMap.get(hourBaseSlot + 2) ?? 0;
              const q3 = slotCountMap.get(hourBaseSlot + 3) ?? 0;
              const memoTotal = q0 + q1 + q2 + q3;
              const hourCount = hourCountMap.get(hour) ?? 0;
              const total = memoTotal > 0 ? memoTotal : hourCount;

              const slitColor = (qVal: number) => {
                if (qVal > 0) return heatmapColor(qVal);
                if (isLoading && hourCount > 0) return "bg-brand-500/35";
                if (memoTotal === 0 && hourCount > 0)
                  return heatmapColor(hourCount);
                return heatmapColor(0);
              };

              return (
                <button
                  className={cn(
                    "group relative flex h-8.5 w-full items-center justify-center rounded-[3px] border transition-all",
                    displayMode === "heatmap"
                      ? cn(
                          "border-border/50 bg-background/50 hover:border-brand-500/40 hover:bg-background/80 dark:border-border/20 dark:bg-background/20 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5",
                          total > 0 && "border-brand-500/40 bg-brand-500/5",
                        )
                      : cn(
                          "border-border/60 bg-background/60 hover:border-brand-500/50 hover:bg-background dark:border-border/30 dark:bg-background/50",
                          total > 0 &&
                            "border-brand-500/60 bg-brand-500/10 font-bold text-brand-600 dark:text-brand-400",
                        ),
                    isLoading && "animate-pulse",
                    "hover:scale-[1.05] hover:z-10",
                  )}
                  key={`hour-${hour}`}
                  type="button"
                  onClick={() => onJumpToTimeline(selectedDay)}
                  onMouseEnter={() =>
                    onHoverTip(
                      `${selectedDay} ${hourLabel} · ${total > 0 ? `${total} 条笔记 (:00:${q0} :15:${q1} :30:${q2} :45:${q3})` : "无记录"}`,
                    )
                  }
                  onMouseLeave={() => onHoverTip(null)}
                >
                  {/* Heatmap Mode: 4 Fine Micro-Slits (:00, :15, :30, :45), ABSOLUTELY ZERO NUMBERS INSIDE! */}
                  {displayMode === "heatmap" ? (
                    <div className="flex h-[18px] items-center gap-[3px]">
                      <div
                        className={cn(
                          "h-full w-[4.5px] rounded-[1px] transition-colors",
                          slitColor(q0),
                        )}
                        title=":00"
                      />
                      <div
                        className={cn(
                          "h-full w-[4.5px] rounded-[1px] transition-colors",
                          slitColor(q1),
                        )}
                        title=":15"
                      />
                      <div
                        className={cn(
                          "h-full w-[4.5px] rounded-[1px] transition-colors",
                          slitColor(q2),
                        )}
                        title=":30"
                      />
                      <div
                        className={cn(
                          "h-full w-[4.5px] rounded-[1px] transition-colors",
                          slitColor(q3),
                        )}
                        title=":45"
                      />
                    </div>
                  ) : (
                    /* Calendar Mode: Crisp Hour Label & Count */
                    <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
                      <span>{hourLabel}</span>
                      {total > 0 && (
                        <span className="text-[9px] font-bold text-brand-600 dark:text-brand-400">
                          {total}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
