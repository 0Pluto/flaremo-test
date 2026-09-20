// ============================================================================
// 4. Day Horizon View (Single Magnified Column + Live Companion Details Panel)
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
  displayMode: _displayMode,
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

  // Hovered or selected hour (null means showing whole day summary)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Group memos by their local hour
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

  // Selected or active memos to display in the companion panel
  const displayedMemos = useMemo(() => {
    if (hoveredHour !== null) {
      return memosByHour.get(hoveredHour) ?? [];
    }
    return memos;
  }, [hoveredHour, memosByHour, memos]);

  const totalDayNotes = memos.length;
  const activeHourCount =
    hoveredHour !== null ? (hourCountMap.get(hoveredHour) ?? 0) : totalDayNotes;

  return (
    <div className="flex h-full min-h-[196px] items-stretch gap-3 px-1 py-0.5 select-none">
      {/* ── Left Side: The Single Magnified Column of 24 Stacked Bars (周视图单列放大版) ── */}
      <div className="flex items-stretch gap-1.5 shrink-0">
        {/* Left Y-axis hour scale indicators (00, 06, 12, 18, 23) */}
        <div className="flex w-3.5 shrink-0 flex-col justify-between py-0.5 text-[8px] font-mono text-muted-foreground/70 select-none">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>

        {/* The 24 Stacked Horizontal Bars in a Single Column */}
        <div
          className={cn(
            "flex w-10 sm:w-12 flex-col justify-between gap-[2px]",
            isLoading && "animate-pulse",
          )}
        >
          {DAY_HOURS.map((h) => {
            const count = hourCountMap.get(h) ?? 0;
            const hourLabel = `${String(h).padStart(2, "0")}:00`;
            const isHovered = hoveredHour === h;

            return (
              <button
                className={cn(
                  "h-[6px] w-full rounded-[1.5px] transition-all",
                  count > 0
                    ? cn(heatmapColor(count), "hover:brightness-110")
                    : "bg-muted-foreground/15 dark:bg-muted/30 hover:bg-muted-foreground/35",
                  isHovered &&
                    "ring-1.5 ring-brand-500 scale-110 z-10 brightness-110 shadow-xs",
                  "hover:scale-110 hover:z-10",
                )}
                key={`day-bar-${h}`}
                type="button"
                onClick={() => onJumpToTimeline(selectedDay)}
                onMouseEnter={() => {
                  setHoveredHour(h);
                  onHoverTip(
                    `${selectedDay} ${hourLabel} · ${count > 0 ? `${count} 条笔记` : "无记录"}`,
                  );
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

      {/* ── Right Side: Live Companion Details Panel (边上直观的信息卡片) ── */}
      <div className="flex flex-1 flex-col justify-between rounded-lg border border-border/50 bg-background/50 p-2.5 shadow-2xs">
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              {hoveredHour !== null
                ? `${String(hoveredHour).padStart(2, "0")}:00 – ${String(hoveredHour).padStart(2, "0")}:59`
                : `${selectedDay} 全天`}
            </span>
          </div>
          <span className="text-[10px] font-mono font-medium text-brand-600 dark:text-brand-400 tabular-nums">
            {activeHourCount > 0 ? `${activeHourCount} 条记录` : "无记录"}
          </span>
        </div>

        {/* Panel Content: Memos Stream or Empty Guidance */}
        <div className="flex flex-1 flex-col justify-center gap-1.5 py-1.5 overflow-hidden">
          {displayedMemos.length > 0 ? (
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[110px] pr-0.5">
              {displayedMemos.slice(0, 3).map((m) => {
                const timeStr = new Date(m.create_time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                const cleanSnippet = m.content
                  ? m.content
                      .replace(/[#*`~>-]/g, "")
                      .trim()
                      .slice(0, 50)
                  : "无文本内容";

                return (
                  <button
                    key={m.id}
                    className="flex flex-col gap-0.5 rounded bg-muted/35 p-1.5 border border-border/30 text-left transition-colors hover:bg-muted/60"
                    type="button"
                    onClick={() => onJumpToTimeline(selectedDay)}
                  >
                    <span className="text-[9px] font-mono font-bold text-brand-600 dark:text-brand-400">
                      {timeStr}
                    </span>
                    <p className="text-[11px] text-foreground/85 line-clamp-2 leading-tight">
                      {cleanSnippet}
                    </p>
                  </button>
                );
              })}
              {displayedMemos.length > 3 && (
                <span className="text-[9px] font-mono text-muted-foreground/60 text-center">
                  还有 {displayedMemos.length - 3} 条记录…
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2 text-center">
              <span className="text-[11px] text-muted-foreground/70">
                {hoveredHour !== null
                  ? "此时间段内无笔记"
                  : "今日尚未记录任何笔记"}
              </span>
              <span className="text-[9px] text-muted-foreground/50 mt-0.5 font-mono">
                {hoveredHour !== null
                  ? "移动光标可查看其他小时"
                  : "悬停左侧色块查看各时段"}
              </span>
            </div>
          )}
        </div>

        {/* Panel Footer: Jump to Timeline CTA */}
        <button
          className="flex items-center justify-between rounded-md bg-brand-500/10 px-2 py-1 text-[10px] font-medium text-brand-600 dark:text-brand-400 transition-colors hover:bg-brand-500/20"
          type="button"
          onClick={() => onJumpToTimeline(selectedDay)}
        >
          <span>在时间线查看记录</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
