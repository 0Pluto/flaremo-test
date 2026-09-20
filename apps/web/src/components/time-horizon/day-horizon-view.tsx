// ============================================================================
// 4. Day Horizon View (12 + 12 AM/PM Cohesive Time Strip Flow)
// ============================================================================
import { useMemo } from "react";
import { heatmapColor } from "@/lib/activity";
import { buildHourCountMap } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import type { DisplayMode } from "./shared";

const AM_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const PM_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const;

export function DayHorizonPureView({
  selectedDay,
  hourlyData,
  memos: _memos,
  isLoading,
  displayMode,
  onJumpToTimeline,
  onHoverTip,
}: {
  selectedDay: string;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  memos?: Array<{ id: string; create_time: string }>;
  isLoading: boolean;
  displayMode: DisplayMode;
  onJumpToTimeline: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const hourCountMap = useMemo(
    () => buildHourCountMap(hourlyData),
    [hourlyData],
  );

  const amTotal = useMemo(
    () =>
      AM_HOURS.reduce<number>((sum, h) => sum + (hourCountMap.get(h) ?? 0), 0),
    [hourCountMap],
  );

  const pmTotal = useMemo(
    () =>
      PM_HOURS.reduce<number>((sum, h) => sum + (hourCountMap.get(h) ?? 0), 0),
    [hourCountMap],
  );

  const renderHourColumn = (
    hours: readonly number[],
    title: string,
    timeRange: string,
    periodTotal: number,
  ) => (
    <div className="flex flex-1 flex-col gap-1">
      {/* Column Header */}
      <div className="flex items-center justify-between px-1 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="font-medium text-muted-foreground">{title}</span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            {timeRange}
          </span>
        </div>
        {displayMode === "calendar" && periodTotal > 0 ? (
          <span className="font-mono font-bold text-brand-600 dark:text-brand-400 tabular-nums text-[9px]">
            {periodTotal} 条
          </span>
        ) : periodTotal > 0 ? (
          <span className="size-1.5 rounded-full bg-brand-500" />
        ) : null}
      </div>

      {/* 12 Horizontal Hour Strips */}
      <div className="flex flex-col gap-[2px]">
        {hours.map((h) => {
          const count = hourCountMap.get(h) ?? 0;
          const hourLabel = `${String(h).padStart(2, "0")}:00`;

          return (
            <button
              className={cn(
                "group relative flex h-[13px] w-full items-center justify-between rounded-[3px] border px-1.5 transition-all text-left select-none",
                displayMode === "heatmap"
                  ? count > 0
                    ? cn(
                        heatmapColor(count),
                        "border-primary/25 hover:brightness-105 shadow-2xs",
                      )
                    : "border-border/30 bg-muted-foreground/10 hover:border-border/50 hover:bg-muted-foreground/20 dark:border-border/20 dark:bg-muted/20 dark:hover:bg-muted/30"
                  : cn(
                      "border-border/40 bg-background/50 hover:border-brand-500/50 hover:bg-background dark:border-border/25 dark:bg-background/40",
                      count > 0 &&
                        "border-brand-500/40 bg-brand-500/10 font-bold text-brand-600 dark:text-brand-400",
                    ),
                isLoading && "animate-pulse",
                "hover:scale-[1.02] hover:z-10",
              )}
              key={`day-hour-${h}`}
              type="button"
              onClick={() => onJumpToTimeline(selectedDay)}
              onMouseEnter={() =>
                onHoverTip(
                  `${selectedDay} ${hourLabel} · ${count > 0 ? `${count} 条笔记` : "无记录"}`,
                )
              }
              onMouseLeave={() => onHoverTip(null)}
            >
              {/* In calendar mode, show hour timestamp and note count */}
              {displayMode === "calendar" ? (
                <>
                  <span
                    className={cn(
                      "text-[9px] font-mono tabular-nums leading-none",
                      count > 0
                        ? "font-bold text-brand-600 dark:text-brand-400"
                        : "text-muted-foreground/75",
                    )}
                  >
                    {hourLabel}
                  </span>
                  {count > 0 && (
                    <span className="text-[8px] font-mono font-bold text-brand-600 dark:text-brand-400 tabular-nums leading-none">
                      {count}
                    </span>
                  )}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex gap-2.5 px-0.5 py-0.5">
      {renderHourColumn(AM_HOURS, "上午", "00 - 12", amTotal)}
      {renderHourColumn(PM_HOURS, "下午", "12 - 24", pmTotal)}
    </div>
  );
}
