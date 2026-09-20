// ============================================================================
// 4. Day Horizon View (24-Hour Panoramic Energy Spectrum · Time Stream)
// ============================================================================
import { useMemo } from "react";
import { heatmapColor } from "@/lib/activity";
import { buildHourCountMap } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import { DAY_HOURS, DAY_PERIODS, type DisplayMode } from "./shared";

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

  // Peak note count in a single hour to scale waveform heights proportionally
  const maxHourCount = useMemo(() => {
    let max = 1;
    for (const h of DAY_HOURS) {
      const c = hourCountMap.get(h) ?? 0;
      if (c > max) max = c;
    }
    return max;
  }, [hourCountMap]);

  return (
    <div className="flex h-full flex-col justify-between gap-2 py-0.5 select-none">
      {/* ── Top Row: 4 Time-of-Day Period Capsules (Night, Morning, Afternoon, Evening) ── */}
      <div className="grid grid-cols-4 gap-1.5">
        {DAY_PERIODS.map((p) => {
          const periodCount = p.hours.reduce<number>(
            (sum, h) => sum + (hourCountMap.get(h) ?? 0),
            0,
          );
          return (
            <div
              className={cn(
                "flex items-center justify-between rounded-md border px-2 py-1 transition-all",
                periodCount > 0
                  ? "border-brand-500/35 bg-brand-500/10 text-brand-600 dark:text-brand-400 font-semibold"
                  : "border-border/40 bg-background/40 text-muted-foreground/70",
              )}
              key={p.label}
            >
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium leading-none">
                  {p.label}
                </span>
                <span className="text-[8px] font-mono text-muted-foreground/60 leading-none">
                  {p.range}
                </span>
              </div>
              {displayMode === "calendar" && periodCount > 0 ? (
                <span className="text-[10px] font-mono font-bold tabular-nums">
                  {periodCount}
                </span>
              ) : periodCount > 0 ? (
                <span className="size-1.5 rounded-full bg-brand-500 animate-pulse" />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── Middle Stage: 24-Hour Continuous Energy Waveform Stream (~130px tall) ── */}
      <div
        className={cn(
          "relative flex flex-1 items-end justify-between gap-[3px] rounded-lg border border-border/40 bg-background/30 p-2 min-h-[130px]",
          isLoading && "animate-pulse",
        )}
      >
        {DAY_HOURS.map((h) => {
          const count = hourCountMap.get(h) ?? 0;
          const hourLabel = `${String(h).padStart(2, "0")}:00`;
          const heightPercent =
            count > 0
              ? Math.min(
                  100,
                  Math.max(28, Math.round((count / maxHourCount) * 100)),
                )
              : 8; // Baseline pill height percentage

          return (
            <button
              className="group relative flex h-full flex-1 flex-col items-center justify-end rounded-[2px] transition-all hover:scale-105 hover:z-10"
              key={`hour-stream-${h}`}
              type="button"
              onClick={() => onJumpToTimeline(selectedDay)}
              onMouseEnter={() =>
                onHoverTip(
                  `${selectedDay} ${hourLabel} · ${count > 0 ? `${count} 条笔记` : "无记录"}`,
                )
              }
              onMouseLeave={() => onHoverTip(null)}
            >
              {/* Optional count pip on top of active bar in calendar mode */}
              {displayMode === "calendar" && count > 0 && (
                <span className="mb-0.5 text-[8px] font-mono font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                  {count}
                </span>
              )}

              {/* Dynamic Energy Bar Column */}
              <div
                className={cn(
                  "w-full rounded-[2.5px] transition-all duration-300",
                  count > 0
                    ? cn(heatmapColor(count), "shadow-xs")
                    : "bg-muted-foreground/15 dark:bg-muted/30 group-hover:bg-muted-foreground/30",
                )}
                style={{ height: `${heightPercent}%` }}
              />
            </button>
          );
        })}
      </div>

      {/* ── Bottom Scale: Clean 24-Hour Time Axis Ticks ── */}
      <div className="flex items-center justify-between px-1 text-[9px] font-mono text-muted-foreground/70 select-none">
        <span>00:00</span>
        <span>04:00</span>
        <span>08:00</span>
        <span>12:00</span>
        <span>16:00</span>
        <span>20:00</span>
        <span>23:59</span>
      </div>
    </div>
  );
}
