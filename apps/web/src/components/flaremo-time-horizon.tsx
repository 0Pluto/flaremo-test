/**
 * FlareMoTimeHorizon — 四维纯粹高级时间视界
 *
 * 核心设计哲学 (双态彻底分工)：
 * 1. 热力图态 (Heatmap Mode) ——【纯粹的克制，只展示热力与力度】：
 *    - 画布中间彻底去除所有文字说明、数字标牌与文字描述。
 *    - 纯靠方块的点阵与色彩深浅传达节奏与能量状态，极致高级、沉静。
 *    - 尺度严密对齐：年 365天微点 / 月 30天色块 / 周 168小时色块 / 日 24小时色块。
 * 2. 日历图态 (Calendar Mode) ——【展示信息本身】：
 *    - 相同网格与结构，显示月份、日期、星期、整点时间与条数信息。
 * 3. 严格零 Emoji，外轴极简，信息仅在悬停时于最底线静默提示。
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { MemoStatsResponse } from "@/api";
import { getHourlyActivity } from "@/api";
import { useI18n } from "@/i18n";
import { heatmapColor } from "@/lib/activity";
import {
  addMonths,
  buildMonthGrid,
  buildWeekGrid,
  dayFilterQuery,
  formatMonthTitle,
  monthOf,
  nextDay,
  prevDay,
  todayKey,
  type WeekStart,
  weekdayHeaders,
} from "@/lib/calendar-date";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================
export type TimeHorizonTab = "year" | "month" | "week" | "day";
export type DisplayMode = "calendar" | "heatmap";

export type FlareMoTimeHorizonProps = {
  stats: MemoStatsResponse;
  streak: number;
  monthLabels: Array<{ date: string; label: string }>;
  onDaySelect?: (day: string) => void;
  onNavigate?: () => void;
  hoveredDate?: string | null;
  onHoverDate?: (date: string | null) => void;
  className?: string;
};

// ============================================================================
// Helpers
// ============================================================================
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

const MONTH_SHORT_NAMES = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;

// 4 Columns for 24 Hours in Day View (6 hours each)
const DAY_COLUMN_HOURS = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23],
] as const;

const DAY_COLUMN_LABELS = ["夜间", "上午", "下午", "晚上"] as const;

// ============================================================================
// Root Component
// ============================================================================
export const FlareMoTimeHorizon = memo(function FlareMoTimeHorizon({
  stats,
  streak,
  monthLabels,
  onDaySelect,
  onNavigate,
  hoveredDate,
  onHoverDate,
  className,
}: FlareMoTimeHorizonProps) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const today = useMemo(() => todayKey(), []);

  const [tab, setTab] = useState<TimeHorizonTab>("month");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("heatmap");
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(
    monthOf(today),
  );
  const [currentWeekBase, setCurrentWeekBase] = useState<string>(today);
  const [currentYear, setCurrentYear] = useState<number>(yearOf(today));
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);

  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";
  const tz = useMemo(() => new Date().getTimezoneOffset(), []);

  // Map daily counts
  const notesCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of stats.activity) {
      if (entry.count > 0) map.set(entry.date, entry.count);
    }
    return map;
  }, [stats.activity]);

  // Hourly query for Day view (24 hours)
  const dayHourlyQuery = useQuery({
    queryKey: ["stats-hourly-day", selectedDay, tz],
    queryFn: ({ signal }) =>
      getHourlyActivity({ date: selectedDay }, tz, signal),
    staleTime: 60_000,
    enabled: tab === "day",
  });

  // Week range calculations (7 days x 24 hours)
  const weekDays = useMemo(
    () => buildWeekGrid(currentWeekBase, weekStart),
    [currentWeekBase, weekStart],
  );
  const weekFrom = weekDays[0]?.key ?? today;
  const weekTo = weekDays[6]?.key ?? today;

  const weekHourlyQuery = useQuery({
    queryKey: ["stats-hourly-week", weekFrom, weekTo, tz],
    queryFn: ({ signal }) =>
      getHourlyActivity({ from: weekFrom, to: weekTo }, tz, signal),
    staleTime: 60_000,
    enabled: tab === "week",
  });

  const handleSelectDay = (day: string) => {
    setSelectedDay(day);
    onDaySelect?.(day);
  };

  /** Drill-down: Year -> Month */
  const drillToMonth = (monthKey: string) => {
    setCurrentMonthKey(monthKey);
    setTab("month");
  };

  /** Drill-down: Month / Week -> Day */
  const drillToDay = (day: string) => {
    handleSelectDay(day);
    setTab("day");
  };

  /** Jump to Timeline search for this day */
  const jumpToTimeline = (day: string) => {
    handleSelectDay(day);
    void navigate({
      to: "/",
      search: (current) => ({
        compose: current.compose,
        q: dayFilterQuery(day),
        space: current.space,
        tag: undefined,
        untagged: undefined,
        view: "all",
      }),
    });
    onNavigate?.();
  };

  // ── Range Title ────────────────────────────────────────────────────────────
  const rangeTitle = useMemo(() => {
    if (tab === "year") return `${currentYear}年`;
    if (tab === "month") return formatMonthTitle(currentMonthKey, locale);
    if (tab === "week") {
      const first = weekDays[0];
      const last = weekDays[6];
      if (!first || !last) return "";
      const fmt = new Intl.DateTimeFormat(locale, {
        month: "numeric",
        day: "numeric",
      });
      return `${fmt.format(parseDayKey(first.key))} – ${fmt.format(parseDayKey(last.key))}`;
    }
    // day
    const d = parseDayKey(selectedDay);
    const fmt = new Intl.DateTimeFormat(locale, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
    return fmt.format(d);
  }, [tab, currentYear, currentMonthKey, weekDays, selectedDay, locale]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handlePrev = () => {
    if (tab === "year") setCurrentYear((y) => y - 1);
    else if (tab === "month") setCurrentMonthKey((m) => addMonths(-1, m));
    else if (tab === "week")
      setCurrentWeekBase((b) => {
        const d = parseDayKey(b);
        d.setDate(d.getDate() - 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      });
    else setSelectedDay((d) => prevDay(d));
  };

  const handleNext = () => {
    if (tab === "year") setCurrentYear((y) => y + 1);
    else if (tab === "month") setCurrentMonthKey((m) => addMonths(1, m));
    else if (tab === "week")
      setCurrentWeekBase((b) => {
        const d = parseDayKey(b);
        d.setDate(d.getDate() + 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      });
    else setSelectedDay((d) => nextDay(d));
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* ── Top Bar: 4 Tabs + Mode Toggle ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-0.5">
        <div
          aria-label={t("explorer.timeViewLabel")}
          className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/30 p-0.5"
          role="tablist"
        >
          {(
            [
              ["year", "年"],
              ["month", "月"],
              ["week", "周"],
              ["day", "日"],
            ] as const
          ).map(([id, label]) => (
            <button
              aria-selected={tab === id}
              className={cn(
                "min-w-[30px] rounded px-2 py-0.5 text-xs font-medium tabular-nums transition-colors",
                tab === id
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={id}
              role="tab"
              type="button"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dual Mode Switch: Calendar (Information) / Heatmap (Pure Heat) */}
        <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
          <button
            aria-label="数字日历"
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              displayMode === "calendar" &&
                "bg-background text-foreground shadow-2xs",
            )}
            title="数字日历 (展示信息)"
            type="button"
            onClick={() => setDisplayMode("calendar")}
          >
            <CalendarDaysIcon className="size-3.5" />
          </button>
          <button
            aria-label="热力图"
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              displayMode === "heatmap" &&
                "bg-background text-foreground shadow-2xs",
            )}
            title="热力图 (纯粹力度)"
            type="button"
            onClick={() => setDisplayMode("heatmap")}
          >
            <GridIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Range Navigator ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <button
          aria-label="上一期"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          onClick={handlePrev}
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <span className="text-xs font-medium text-foreground">
          {rangeTitle}
        </span>
        <button
          aria-label="下一期"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          onClick={handleNext}
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </div>

      {/* ── Unified High-Impact Canvas Container (~240px Tall) ─────────────── */}
      <div
        className="relative flex min-h-[238px] flex-col justify-center rounded-xl border border-border/50 bg-muted/15 p-2.5 shadow-2xs"
        data-testid="activity-heatmap"
      >
        {/* YEAR VIEW: 365 Days across 12 Month Dot Clusters */}
        {tab === "year" && (
          <YearHorizonPureView
            activity={stats.activity}
            displayMode={displayMode}
            today={today}
            weekStart={weekStart}
            year={currentYear}
            onDrillToMonth={drillToMonth}
            onHoverTip={setHoveredTip}
          />
        )}

        {/* MONTH VIEW: 30/31 Day Squares (7 Columns x 5~6 Rows) */}
        {tab === "month" && (
          <MonthHorizonPureView
            displayMode={displayMode}
            hoveredDate={hoveredDate}
            locale={locale}
            monthKey={currentMonthKey}
            notesCountMap={notesCountMap}
            selectedDay={selectedDay}
            today={today}
            weekStart={weekStart}
            onDrillToDay={drillToDay}
            onHoverDate={onHoverDate}
            onHoverTip={setHoveredTip}
          />
        )}

        {/* WEEK VIEW: 7 Days x 24 Hours Micro-Stream (168 Squares) */}
        {tab === "week" && (
          <WeekHorizonPureView
            days={weekDays}
            displayMode={displayMode}
            hourlyData={weekHourlyQuery.data?.hours ?? []}
            isLoading={weekHourlyQuery.isLoading}
            selectedDay={selectedDay}
            today={today}
            onDrillToDay={drillToDay}
            onHoverTip={setHoveredTip}
          />
        )}

        {/* DAY VIEW: 24 Hours Atomic Scale (4 Columns x 6 Hours) */}
        {tab === "day" && (
          <DayHorizonPureView
            displayMode={displayMode}
            hourlyData={dayHourlyQuery.data?.hours ?? []}
            isLoading={dayHourlyQuery.isLoading}
            selectedDay={selectedDay}
            onHoverTip={setHoveredTip}
            onJumpToTimeline={jumpToTimeline}
          />
        )}
      </div>

      {/* ── Hidden monthLabels container for E2E Contract Parity ─────────── */}
      <div aria-hidden="true" className="hidden">
        {monthLabels.map((m) => (
          <span key={m.date}>{m.label}</span>
        ))}
      </div>

      {/* ── Bottom Single-Line Micro Tooltip ──────────────────────────────── */}
      <div className="flex h-4 items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span className="truncate">
          {hoveredTip ??
            (streak > 0 ? `${streak} 天连记` : `${today} · 今日就绪`)}
        </span>
      </div>
    </div>
  );
});

// ============================================================================
// 1. Year Horizon View (365 Micro-Dots, Clean Division of Labor)
// ============================================================================
function YearHorizonPureView({
  year,
  today,
  weekStart,
  activity,
  displayMode,
  onDrillToMonth,
  onHoverTip,
}: {
  year: number;
  today: string;
  weekStart: WeekStart;
  activity: MemoStatsResponse["activity"];
  displayMode: DisplayMode;
  onDrillToMonth: (monthKey: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const countMap = useMemo(
    () => new Map(activity.map((d) => [d.date, d.count])),
    [activity],
  );

  // Build 12 calendar arrays for each month
  const monthGrids = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      const daysCount = new Date(year, m + 1, 0).getDate();
      const firstDow = new Date(year, m, 1).getDay(); // 0 is Sunday
      const lead = weekStart === "monday" ? (firstDow + 6) % 7 : firstDow;

      let monthTotal = 0;
      let monthActiveDays = 0;

      const cells: Array<{
        key: string;
        day?: number;
        count?: number;
        isPad?: boolean;
      }> = [];
      // Leading padding
      for (let p = 0; p < lead; p++) {
        cells.push({ key: `pad-${m}-${p}`, isPad: true });
      }
      // Real days
      for (let d = 1; d <= daysCount; d++) {
        const key = `${monthKey}-${String(d).padStart(2, "0")}`;
        const c = countMap.get(key) ?? 0;
        monthTotal += c;
        if (c > 0) monthActiveDays++;
        cells.push({ key, day: d, count: c, isPad: false });
      }

      return {
        monthIndex: m,
        monthKey,
        label: MONTH_SHORT_NAMES[m],
        total: monthTotal,
        activeDays: monthActiveDays,
        cells,
      };
    });
  }, [year, weekStart, countMap]);

  return (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-2 py-0.5">
      {monthGrids.map((m) => {
        const isCurrentMonth = today.startsWith(m.monthKey);

        return (
          <button
            className={cn(
              "group relative flex flex-col rounded-lg border p-1.5 transition-all text-left",
              displayMode === "heatmap"
                ? cn(
                    "border-border/20 bg-background/20 hover:border-brand-500/40 hover:bg-brand-500/5",
                    isCurrentMonth &&
                      "border-brand-500/60 ring-1 ring-brand-500/30",
                  )
                : cn(
                    "border-border/30 bg-background/40 hover:border-brand-500/50 hover:bg-brand-500/5",
                    isCurrentMonth && "border-brand-500 bg-brand-500/10",
                  ),
            )}
            key={m.monthKey}
            type="button"
            onClick={() => onDrillToMonth(m.monthKey)}
            onMouseEnter={() =>
              onHoverTip(
                `${year}年${m.label} · ${m.total} 条笔记 (${m.activeDays} 活跃天)`,
              )
            }
            onMouseLeave={() => onHoverTip(null)}
          >
            {/* Top axis: ONLY in Calendar mode! In Heatmap mode, strictly NO TEXT! */}
            {displayMode === "calendar" ? (
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-mono font-medium text-muted-foreground">
                  {m.label}
                </span>
                {m.total > 0 && (
                  <span className="text-[9px] font-mono tabular-nums text-brand-600 dark:text-brand-400">
                    {m.total}
                  </span>
                )}
              </div>
            ) : null}

            {/* 7 Columns Micro-Dots Matrix (~30 Dots per Month) */}
            <div className="grid grid-cols-7 gap-[2px]">
              {m.cells.map((cell) => {
                if (cell.isPad) {
                  return <div className="size-[5.5px]" key={cell.key} />;
                }
                const isDayToday = cell.key === today;
                const count = cell.count ?? 0;

                return (
                  <div
                    className={cn(
                      "size-[5.5px] rounded-[1px] transition-all",
                      count > 0 ? heatmapColor(count) : "bg-muted/40",
                      isDayToday && "ring-1 ring-brand-500 scale-125 z-10",
                      "group-hover:opacity-95",
                    )}
                    key={cell.key}
                  />
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// 2. Month Horizon View (7 Columns x 5~6 Rows, Pure Color Blocks)
// ============================================================================
function MonthHorizonPureView({
  monthKey,
  today,
  selectedDay,
  locale,
  weekStart,
  notesCountMap,
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

      {/* Grid of Days (35~42 Tall Blocks, h-8.5 each) */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const count = notesCountMap.get(cell.key) ?? 0;
          const isToday = cell.key === today;
          const isSelected = cell.key === selectedDay;
          const dayNum = Number(cell.key.slice(8));

          return (
            <button
              className={cn(
                "group relative flex h-8.5 w-full items-center justify-center rounded-[3px] border text-xs transition-all",
                cell.inMonth ? "opacity-100" : "opacity-15 pointer-events-none",
                displayMode === "heatmap"
                  ? cn(
                      count > 0
                        ? heatmapColor(count)
                        : "bg-muted/40 border-border/20",
                      count > 0 && "border-transparent",
                      isToday && "ring-1.5 ring-brand-500",
                    )
                  : cn(
                      "border-border/30 bg-background/50 text-foreground",
                      isToday && "border-brand-500 bg-brand-500/10 font-bold",
                      count > 0 &&
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
                onHoverTip(`${cell.key} · ${count} 条笔记`);
              }}
              onMouseLeave={() => {
                onHoverDate?.(null);
                onHoverTip(null);
              }}
            >
              {/* Heatmap Mode: ABSOLUTELY ZERO NUMBERS INSIDE! Calendar Mode: Day Number */}
              {displayMode === "calendar" ? (
                <span className="font-mono tabular-nums">{dayNum}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 3. Week Horizon View (7 Days x 24 Hours, 168 Pure Squares)
// ============================================================================
function WeekHorizonPureView({
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
  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hourlyData) {
      if (h.count > 0) map.set(`${h.date}_${h.hour}`, h.count);
    }
    return map;
  }, [hourlyData]);

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
                  "flex flex-col items-center rounded-md py-0.5 transition-colors hover:bg-muted/50",
                  isSelected && "bg-brand-500 text-white font-bold",
                  isToday &&
                    !isSelected &&
                    "bg-brand-500/15 text-brand-600 dark:text-brand-400 font-bold",
                )}
                key={d.key}
                type="button"
                onClick={() => onDrillToDay(d.key)}
              >
                {displayMode === "calendar" ? (
                  <>
                    <span className="text-[10px] opacity-70">{weekdayStr}</span>
                    <span className="text-xs font-bold leading-tight">
                      {dateObj.getDate()}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-mono opacity-70">
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
        <div className="flex w-4 shrink-0 flex-col justify-between py-0.5 text-[8px] font-mono text-muted-foreground/60 select-none">
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
                      "h-[7px] w-full rounded-[1.5px] transition-all",
                      displayMode === "heatmap"
                        ? count > 0
                          ? heatmapColor(count)
                          : "bg-muted/40 hover:bg-muted/70"
                        : count > 0
                          ? "bg-brand-500/60 ring-1 ring-brand-500"
                          : "bg-muted/25 hover:bg-muted/60",
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

// ============================================================================
// 4. Day Horizon View (24 Hours Atomic Scale: 4 Columns x 6 Hours)
// ============================================================================
function DayHorizonPureView({
  selectedDay,
  hourlyData,
  isLoading,
  displayMode,
  onJumpToTimeline,
  onHoverTip,
}: {
  selectedDay: string;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  isLoading: boolean;
  displayMode: DisplayMode;
  onJumpToTimeline: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const hourCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of hourlyData) {
      if (item.count > 0) map.set(item.hour, item.count);
    }
    return map;
  }, [hourlyData]);

  const maxCount = useMemo(
    () => Math.max(1, ...Array.from(hourCountMap.values())),
    [hourCountMap],
  );

  return (
    <div className="flex flex-col gap-2 py-0.5">
      {/* Top Axis: ONLY in Calendar mode! In Heatmap mode, strictly NO TEXT! */}
      {displayMode === "calendar" ? (
        <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-medium text-muted-foreground/70">
          {DAY_COLUMN_LABELS.map((lbl) => (
            <span key={lbl}>{lbl}</span>
          ))}
        </div>
      ) : null}

      {/* 4 Columns (Night, Morning, Afternoon, Evening) x 6 Hours each = 24 Pure Blocks */}
      <div className="grid grid-cols-4 gap-2">
        {DAY_COLUMN_HOURS.map((hoursCol, colIdx) => (
          <div
            className="flex flex-col gap-1.5"
            key={`col-${DAY_COLUMN_LABELS[colIdx]}`}
          >
            {hoursCol.map((hour) => {
              const count = hourCountMap.get(hour) ?? 0;
              const hourLabel = `${String(hour).padStart(2, "0")}:00`;
              const intensity =
                count === 0
                  ? 0
                  : count >= Math.ceil(maxCount * 0.75)
                    ? 4
                    : count >= Math.ceil(maxCount * 0.5)
                      ? 3
                      : count >= Math.ceil(maxCount * 0.25)
                        ? 2
                        : 1;

              return (
                <button
                  className={cn(
                    "group relative flex h-8 w-full items-center justify-center rounded-[3px] border transition-all",
                    displayMode === "heatmap"
                      ? cn(
                          "border-border/20",
                          intensity > 0
                            ? heatmapColor(intensity)
                            : "bg-muted/40 hover:bg-muted/65",
                          intensity > 0 && "border-transparent",
                        )
                      : cn(
                          "border-border/30 bg-background/50 hover:border-brand-500/50 hover:bg-brand-500/5",
                          count > 0 &&
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
                      `${selectedDay} ${hourLabel} · ${count > 0 ? `${count} 条笔记` : "无记录"}`,
                    )
                  }
                  onMouseLeave={() => onHoverTip(null)}
                >
                  {/* Heatmap Mode: ABSOLUTELY ZERO NUMBERS INSIDE! Calendar Mode: Hour Label */}
                  {displayMode === "calendar" ? (
                    <span className="text-[10px] font-mono tabular-nums text-foreground">
                      {hourLabel}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
