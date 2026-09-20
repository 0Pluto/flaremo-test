// ============================================================================
// 4. Day Horizon View (Single Magnified Stack, Zero Text in Heatmap, Pure Restraint)
// ============================================================================
import { useMemo, useState } from "react";
import { heatmapColor } from "@/lib/activity";
import { buildHourCountMap } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import { DAY_HOURS, type DisplayMode } from "./shared";

type MemoItem = {
  id: string;
  create_time: string;
  content?: string;
};

export function DayHorizonPureView({
  selectedDay,
  hourlyData,
  memos = [],
  isLoading,
  displayMode,
  onJumpToTimeline,
  onHoverTip,
}: {
  selectedDay: string;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  memos?: MemoItem[];
  isLoading: boolean;
  displayMode: DisplayMode;
  onJumpToTimeline: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const hourCountMap = useMemo(
    () => buildHourCountMap(hourlyData),
    [hourlyData],
  );

  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Group memos by their local hour for informative hover tips
  const memosByHour = useMemo(() => {
    const map = new Map<number, MemoItem[]>();
    for (const m of memos) {
      const h = new Date(m.create_time).getHours();
      const list = map.get(h) ?? [];
      list.push(m);
      map.set(h, list);
    }
    return map;
  }, [memos]);

  return (
    <div className="flex h-full min-h-[196px] items-center justify-center px-2 py-1 select-none">
      {/* Container: Centered with generous negative space on both sides */}
      <div className="flex items-stretch justify-center gap-2 w-full max-w-[190px]">
        {/* Y-axis Hour Scale (Calendar Mode Only - Zero Text in Heatmap Mode) */}
        {displayMode === "calendar" ? (
          <div className="flex w-4 shrink-0 flex-col justify-between py-0.5 text-[8px] font-mono text-muted-foreground/70 select-none">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        ) : null}

        {/* The Single Magnified Column of 24 Stacked Bars (周视图单列的纯净放大) */}
        <div
          className={cn(
            "flex flex-1 flex-col justify-between gap-[2px]",
            isLoading && "animate-pulse",
          )}
        >
          {DAY_HOURS.map((h) => {
            const count = hourCountMap.get(h) ?? 0;
            const hourLabel = `${String(h).padStart(2, "0")}:00`;
            const isHovered = hoveredHour === h;
            const hourMemos = memosByHour.get(h) ?? [];
            const firstSnippet = hourMemos[0]?.content
              ? hourMemos[0].content
                  .replace(/[#*`~>-]/g, "")
                  .trim()
                  .slice(0, 30)
              : null;

            return (
              <button
                key={`day-bar-${h}`}
                className={cn(
                  "h-[6px] w-full rounded-[1.5px] transition-all cursor-pointer",
                  displayMode === "heatmap"
                    ? count > 0
                      ? cn(
                          heatmapColor(count),
                          "hover:brightness-110 shadow-2xs",
                        )
                      : "bg-muted-foreground/15 dark:bg-muted/30 hover:bg-muted-foreground/35"
                    : count > 0
                      ? "bg-brand-500/75 ring-1 ring-brand-500 hover:brightness-110"
                      : "bg-muted-foreground/10 dark:bg-muted/20 hover:bg-muted-foreground/30",
                  isHovered &&
                    "ring-1.5 ring-brand-500 scale-x-[1.03] scale-y-110 z-10 brightness-110 shadow-xs",
                  "hover:scale-x-[1.03] hover:scale-y-110 hover:z-10",
                )}
                type="button"
                onClick={() => onJumpToTimeline(selectedDay)}
                onMouseEnter={() => {
                  setHoveredHour(h);
                  if (count > 0) {
                    const snippetSuffix = firstSnippet
                      ? ` · “${firstSnippet}”`
                      : "";
                    onHoverTip(
                      `${selectedDay} ${hourLabel} · ${count} 条笔记${snippetSuffix}`,
                    );
                  } else {
                    onHoverTip(`${selectedDay} ${hourLabel} · 无记录`);
                  }
                }}
                onMouseLeave={() => {
                  setHoveredHour(null);
                  onHoverTip(null);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
