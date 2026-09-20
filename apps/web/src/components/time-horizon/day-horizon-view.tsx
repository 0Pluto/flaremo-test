// ============================================================================
// 4. Day Horizon View (Magnified 24h Stack + Exquisite Desk Calendar Card)
// ============================================================================
import { useMemo, useState } from "react";
import { heatmapColor } from "@/lib/activity";
import { todayKey } from "@/lib/calendar-date";
import { getLunarDateInfo } from "@/lib/lunar";
import { buildHourCountMap, parseDayKey } from "@/lib/time-horizon";
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

  // Calendar calculations for the Desk Calendar Card
  const dateObj = useMemo(() => parseDayKey(selectedDay), [selectedDay]);
  const lunar = useMemo(() => getLunarDateInfo(dateObj), [dateObj]);
  const isToday = useMemo(() => selectedDay === todayKey(), [selectedDay]);
  const dayNum = dateObj.getDate();
  const monthNum = dateObj.getMonth() + 1;
  const yearNum = dateObj.getFullYear();

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
            "flex w-10 sm:w-11 flex-col justify-between gap-[2px]",
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

      {/* ── Right Side: Exquisite Physical-Feel Desk Calendar Card (典雅单页台历) ── */}
      <button
        key={selectedDay}
        className="group relative flex flex-1 flex-col justify-between rounded-xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/20 p-0 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md cursor-pointer select-none overflow-hidden animate-calendar-page-turn text-left"
        type="button"
        onClick={() => onJumpToTimeline(selectedDay)}
        title="点击在时间线查看该日记录"
      >
        {/* Top Binding Spine / Hanger Bar (台历顶部装订条) */}
        <div className="relative flex items-center justify-between border-b border-border/50 bg-muted/60 px-3 py-1.5 dark:bg-muted/40">
          <div className="flex items-center gap-1.5">
            {/* Dual Binder Hole Punches (双环装订孔) */}
            <div className="flex items-center gap-1 opacity-60">
              <span className="size-1.5 rounded-full bg-foreground/30 shadow-inner" />
              <span className="size-1.5 rounded-full bg-foreground/30 shadow-inner" />
            </div>
            <span className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">
              {monthNum}月 · {yearNum}
            </span>
          </div>

          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold",
              isToday
                ? "bg-brand-500/15 text-brand-600 dark:text-brand-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isToday ? `今日 · ${lunar.weekday}` : lunar.weekday}
          </span>
        </div>

        {/* Perforated Tear-off Line (撕历微虚线) */}
        <div className="border-t border-dashed border-border/40 w-full" />

        {/* Main Calendar Body (台历核心内容) */}
        <div className="flex flex-1 flex-col items-center justify-center px-3 py-1 text-center">
          {/* Huge Hero Date Numeral */}
          <span className="text-5xl font-mono font-black tracking-tighter text-foreground leading-none drop-shadow-2xs select-none">
            {dayNum}
          </span>

          {/* Heritage Sub-line (农历 / 节气 / 干支) */}
          <div className="mt-2 flex items-center justify-center gap-1 text-[11px] font-serif text-muted-foreground/80 tracking-widest leading-none">
            <span>
              {lunar.festival ??
                lunar.solarTerm ??
                `${lunar.lunarMonth}${lunar.lunarDay}`}
            </span>
            {(lunar.festival || lunar.solarTerm) && (
              <>
                <span className="text-[9px] font-mono text-muted-foreground/40">
                  ·
                </span>
                <span>
                  {lunar.lunarMonth}
                  {lunar.lunarDay}
                </span>
              </>
            )}
            {!lunar.festival && !lunar.solarTerm && (
              <>
                <span className="text-[9px] font-mono text-muted-foreground/40">
                  ·
                </span>
                <span className="text-[10px]">{lunar.cyclicalYear}</span>
              </>
            )}
          </div>
        </div>

        {/* Bottom Reaction Footer (底部火漆印章/时段透镜) */}
        <div className="border-t border-border/30 bg-muted/20 px-3 py-1.5 dark:bg-muted/10 flex items-center justify-between min-h-[30px]">
          {hoveredHour === null ? (
            <>
              {totalDayNotes > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[9px] font-mono font-medium text-brand-600 dark:text-brand-400">
                  <span className="size-1 rounded-full bg-brand-500 animate-pulse" />
                  {totalDayNotes} 条手记
                </span>
              ) : (
                <span className="text-[10px] font-serif text-muted-foreground/50 italic">
                  静候落笔
                </span>
              )}

              <span className="text-[9px] text-muted-foreground/50 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all flex items-center gap-0.5">
                翻看时间线 →
              </span>
            </>
          ) : (
            <div className="flex w-full items-center justify-between animate-scale-in">
              <span className="rounded bg-brand-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand-600 dark:text-brand-400">
                {String(hoveredHour).padStart(2, "0")}:00 ·{" "}
                {activeHourCount > 0 ? `${activeHourCount} 条` : "无记录"}
              </span>

              {displayedMemos.length > 0 && displayedMemos[0]?.content ? (
                <span className="max-w-[90px] truncate text-[9px] font-sans text-foreground/75 italic">
                  “{displayedMemos[0].content.replace(/[#*`~>-]/g, "").trim()}”
                </span>
              ) : (
                <span className="text-[9px] text-muted-foreground/50">
                  {activeHourCount > 0 ? "点击查看" : "此刻空闲"}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
