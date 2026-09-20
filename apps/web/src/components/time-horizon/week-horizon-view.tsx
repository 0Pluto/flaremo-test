// ============================================================================
// 3. Week Horizon View (7 Days x 24 Hours, 168 Pure Squares)
// ============================================================================
import { useMemo } from "react";
import { buildWeekSlotCountMap } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import { type DisplayMode, parseDayKey } from "./shared";

export function WeekHorizonPureView({
  days,
  hourlyData,
  isLoading,
  today,
  selectedDay,
  displayMode,
  onDrillToDay,
  onHoverTip,
}: {
  days: Array<{ key: string }>;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  isLoading: boolean;
  today: string;
  selectedDay: string;
  displayMode: DisplayMode;
  onDrillToDay: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const countMap = useMemo(
    () => buildWeekSlotCountMap(hourlyData),
    [hourlyData],
  );

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <div className="flex flex-col gap-1.5">
      {/* 7 Column Headers on the Top Axis (Weekday + Date) */}
      <div className="flex items-center gap-1">
        {/* Left spacer matching Y axis */}
        <div className="w-4 shrink-0" />

        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => {
            const dateObj = parseDayKey(d.key);
            const isToday = d.key === today;
            const isSelected = d.key === selectedDay;
            const weekdayStr = ["日", "一", "二", "三", "四", "五", "六"][
              dateObj.getDay()
            ];

            return (
              <button
                className={cn(
                  "flex flex-col items-center rounded-md py-0.5 px-0.5 transition-all cursor-pointer border border-transparent",
                  isSelected
                    ? "bg-muted/70 dark:bg-white/[0.08] border-border/80 dark:border-white/15 shadow-2xs"
                    : "hover:bg-muted/40 dark:hover:bg-white/[0.04]",
                )}
                key={d.key}
                type="button"
                onClick={() => onDrillToDay(d.key)}
              >
                {displayMode === "calendar" ? (
                  <>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {weekdayStr}
                    </span>
                    <span
                      className={cn(
                        "text-xs leading-tight transition-colors",
                        isToday
                          ? "font-bold text-brand-600 dark:text-brand-400"
                          : isSelected
                            ? "font-bold text-foreground"
                            : "font-semibold text-foreground/85",
                      )}
                    >
                      {dateObj.getDate()}
                    </span>
                  </>
                ) : (
                  <span
                    className={cn(
                      "text-[10px] font-mono font-medium",
                      isToday
                        ? "text-brand-600 dark:text-brand-400 font-bold"
                        : "text-muted-foreground",
                    )}
                  >
                    {weekdayStr}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 7 Columns x 24 Rows Grid (168 Pure Squares, ZERO TEXT INSIDE) */}
      <div className="flex gap-1">
        {/* Left Y-axis hour scale indicators (00, 06, 12, 18, 23) */}
        <div className="flex w-4 shrink-0 flex-col justify-between py-0.5 text-[8.5px] font-mono font-medium text-foreground/75 dark:text-foreground/70 select-none">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>

        {/* 7 Columns: 24 micro-blocks each */}
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => (
            <div className="flex flex-col gap-[2px]" key={`col-${d.key}`}>
              {hours.map((h) => {
                const count = countMap.get(`${d.key}_${h}`) ?? 0;
                return (
                  <button
                    className={cn(
                      "h-[7px] w-full rounded-[1.5px] transition-all cursor-pointer active:scale-95",
                      count > 0
                        ? count === 1
                          ? "bg-brand-500/35 dark:bg-brand-400/40"
                          : count === 2
                            ? "bg-brand-500/60 dark:bg-brand-400/65"
                            : count === 3
                              ? "bg-brand-500/85 dark:bg-brand-400/85"
                              : "bg-brand-500 dark:bg-brand-400 shadow-xs ring-1 ring-brand-500/80 dark:ring-brand-400/80"
                        : "border border-black/[0.04] bg-muted-foreground/20 hover:bg-muted-foreground/35 dark:border-white/[0.06] dark:bg-white/[0.14] dark:hover:bg-white/[0.24]",
                      isLoading && "animate-pulse",
                      "hover:scale-125 hover:z-10",
                    )}
                    key={`${d.key}_${h}`}
                    type="button"
                    onClick={() => onDrillToDay(d.key)}
                    onMouseEnter={() =>
                      onHoverTip(
                        `${d.key} ${String(h).padStart(2, "0")}:00 · ${count} 条笔记`,
                      )
                    }
                    onMouseLeave={() => onHoverTip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
