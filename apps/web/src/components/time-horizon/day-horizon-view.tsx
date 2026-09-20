// ============================================================================
// 4. Day Horizon View (Option 4: Full-Width 24h Rhythm Stream & Negative Space)
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

  // Hovered hour (null means showing whole day summary)
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

  // Selected or active memos to display
  const displayedMemos = useMemo(() => {
    if (hoveredHour !== null) {
      return memosByHour.get(hoveredHour) ?? [];
    }
    return memos;
  }, [hoveredHour, memosByHour, memos]);

  const totalDayNotes = memos.length;
  const activeHourCount =
    hoveredHour !== null ? (hourCountMap.get(hoveredHour) ?? 0) : totalDayNotes;

  const maxCount = useMemo(() => {
    let max = 1;
    for (const v of hourCountMap.values()) {
      if (v > max) max = v;
    }
    return max;
  }, [hourCountMap]);

  return (
    <div className="flex flex-col justify-between h-full min-h-[196px] px-1 py-1 select-none">
      {/* ── Top Ambient Bar: Generous Breathing Room & Quiet Mood ──────────── */}
      <div className="flex items-center justify-between px-0.5 pt-0.5 pb-1">
        <div className="flex items-center gap-1.5">
          {totalDayNotes > 0 ? (
            <>
              <span className="size-1.5 rounded-full bg-brand-500 animate-pulse" />
              <span className="text-[11px] font-sans font-medium text-foreground/80 tracking-wide">
                今日已有 {totalDayNotes} 则思绪
              </span>
            </>
          ) : (
            <span className="text-[11px] font-serif text-muted-foreground/60 italic tracking-wide">
              静候笔触 · 今日尚无记录
            </span>
          )}
        </div>

        <span className="text-[9px] font-mono text-muted-foreground/45 uppercase tracking-wider">
          24H 昼夜流
        </span>
      </div>

      {/* ── Center: Full-Width 24-Hour Soundwave / Energy Pillars ──────────── */}
      <div className="flex flex-col gap-1 my-auto">
        <div
          className={cn(
            "flex items-end justify-between gap-[3px] sm:gap-1 h-[96px] px-0.5",
            isLoading && "animate-pulse",
          )}
        >
          {DAY_HOURS.map((h) => {
            const count = hourCountMap.get(h) ?? 0;
            const hourLabel = `${String(h).padStart(2, "0")}:00`;
            const isHovered = hoveredHour === h;

            // Height calculation:
            // 0 count => clean resting pill (8px)
            // > 0 count => proportional wave (28px to 86px)
            const heightPx =
              count === 0 ? 8 : Math.round(28 + (count / maxCount) * 58);

            return (
              <button
                key={`pillar-${h}`}
                style={{ height: `${heightPx}px` }}
                className={cn(
                  "flex-1 min-w-[5px] max-w-[9px] rounded-t-[2.5px] rounded-b-[1px] transition-all duration-150 cursor-pointer",
                  count > 0
                    ? cn(heatmapColor(count), "hover:brightness-110 shadow-2xs")
                    : "bg-muted-foreground/15 dark:bg-muted/25 hover:bg-muted-foreground/35",
                  isHovered &&
                    "ring-1.5 ring-brand-500 scale-y-105 scale-x-125 z-10 brightness-110 shadow-xs",
                  "hover:scale-y-105 hover:scale-x-125 hover:z-10",
                )}
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
                title={`${hourLabel} · ${count} 条笔记`}
              />
            );
          })}
        </div>

        {/* Minimal Baseline Rule */}
        <div className="border-b border-border/40 w-full" />

        {/* 5 Anchor Ticks (00:00, 06:00, 12:00, 18:00, 23:00) */}
        <div className="flex justify-between text-[9px] font-mono text-muted-foreground/50 px-0.5 pt-0.5">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* ── Bottom Ambient Footer: Dynamic Lens or Quiet Invitation ───────── */}
      <div className="pt-2 px-0.5 min-h-[32px] flex items-center justify-between border-t border-border/20">
        {hoveredHour === null ? (
          <button
            className="group flex w-full items-center justify-between text-left text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            type="button"
            onClick={() => onJumpToTimeline(selectedDay)}
          >
            <span className="text-[11px] font-sans">
              {totalDayNotes > 0
                ? "点击在时间线查看今日所有手记"
                : "点击在此日开启新记"}
            </span>
            <span className="text-[10px] font-mono text-brand-600 dark:text-brand-400 group-hover:translate-x-0.5 transition-transform">
              浏览 →
            </span>
          </button>
        ) : (
          <div className="flex w-full items-center justify-between animate-scale-in">
            <span className="rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand-600 dark:text-brand-400">
              {String(hoveredHour).padStart(2, "0")}:00 ·{" "}
              {activeHourCount > 0 ? `${activeHourCount} 条记录` : "无记录"}
            </span>

            {displayedMemos.length > 0 && displayedMemos[0]?.content ? (
              <span className="max-w-[140px] truncate text-[10px] font-sans text-foreground/80 italic">
                “{displayedMemos[0].content.replace(/[#*`~>-]/g, "").trim()}”
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/45 italic">
                {activeHourCount > 0 ? "点击查看" : "无笔触"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
