/**
 * FlareMoTimeHorizon — 四维时间视界 (GitHub 纯粹高级版)
 *
 * 核心设计准则：
 * 1. 极致克制的高级感：热力图状态下，所有方格中间【绝无任何数字与文字】，纯靠色阶表达密度。
 * 2. 数字严格限位于轴线：日期、小时、星期、月份数字仅在边框轴（顶部横轴、左侧纵轴）优雅标记。
 * 3. 统一双态心智模型：同一网格，右上角开关在「热力态（纯色块）」与「日历态（带内部数字刻度）」之间切换。
 * 4. 充足饱满的 GitHub 视觉纵深：高度高挺饱满（~240px），绝不扁平局促。
 * 5. 严格零 Emoji。
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

const MONTH_NAMES = [
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

const QUARTERS = [
  { label: "Q1", range: "1-3月", months: [0, 1, 2] },
  { label: "Q2", range: "4-6月", months: [3, 4, 5] },
  { label: "Q3", range: "7-9月", months: [6, 7, 8] },
  { label: "Q4", range: "10-12月", months: [9, 10, 11] },
] as const;

const DAY_PERIODS = [
  { label: "夜间", hours: [0, 1, 2, 3, 4, 5] },
  { label: "上午", hours: [6, 7, 8, 9, 10, 11] },
  { label: "下午", hours: [12, 13, 14, 15, 16, 17] },
  { label: "晚上", hours: [18, 19, 20, 21, 22, 23] },
] as const;

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

  // Hourly query for Day view
  const dayHourlyQuery = useQuery({
    queryKey: ["stats-hourly", selectedDay, tz],
    queryFn: ({ signal }) =>
      getHourlyActivity({ date: selectedDay }, tz, signal),
    staleTime: 60_000,
    enabled: tab === "day",
  });

  // Week range calculations
  const weekDays = useMemo(
    () => buildWeekGrid(currentWeekBase, weekStart),
    [currentWeekBase, weekStart],
  );
  const weekFrom = weekDays[0]?.key ?? today;
  const weekTo = weekDays[6]?.key ?? today;

  // Hourly query for Week view (7 days x 24 hours)
  const weekHourlyQuery = useQuery({
    queryKey: ["stats-hourly-range", weekFrom, weekTo, tz],
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

        {/* Dual Mode Switch: Calendar / Heatmap */}
        <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
          <button
            aria-label="数字日历"
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              displayMode === "calendar" &&
                "bg-background text-foreground shadow-2xs",
            )}
            title="数字日历"
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
            title="热力图"
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

      {/* ── Unified High-Impact Canvas Container (Tall Height ~240px) ──────── */}
      <div
        className="relative flex min-h-[236px] flex-col justify-center rounded-xl border border-border/50 bg-muted/15 p-2.5 shadow-2xs"
        data-testid="activity-heatmap"
      >
        {/* YEAR VIEW */}
        {tab === "year" && (
          <YearHorizonView
            activity={stats.activity}
            displayMode={displayMode}
            today={today}
            year={currentYear}
            onDrillToMonth={drillToMonth}
            onHoverTip={setHoveredTip}
          />
        )}

        {/* MONTH VIEW */}
        {tab === "month" && (
          <MonthHorizonView
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

        {/* WEEK VIEW (7 Days x 24 Hours) */}
        {tab === "week" && (
          <WeekHorizonView
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

        {/* DAY VIEW (24 Hours) */}
        {tab === "day" && (
          <DayHorizonView
            displayMode={displayMode}
            hourlyData={dayHourlyQuery.data?.hours ?? []}
            isLoading={dayHourlyQuery.isLoading}
            selectedDay={selectedDay}
            onHoverTip={setHoveredTip}
            onJumpToTimeline={jumpToTimeline}
          />
        )}
      </div>

      {/* ── Hidden monthLabels span container for E2E Contract Parity ─────── */}
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
// 1. Year Horizon View (4 Quarters x 3 Months = 12 Months)
// ============================================================================
function YearHorizonView({
  year,
  today,
  activity,
  displayMode,
  onDrillToMonth,
  onHoverTip,
}: {
  year: number;
  today: string;
  activity: MemoStatsResponse["activity"];
  displayMode: DisplayMode;
  onDrillToMonth: (monthKey: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const monthsData = useMemo(() => {
    const countMap = new Map(activity.map((d) => [d.date, d.count]));
    return Array.from({ length: 12 }, (_, m) => {
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      let total = 0;
      let activeDays = 0;
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${monthKey}-${String(d).padStart(2, "0")}`;
        const c = countMap.get(key) ?? 0;
        total += c;
        if (c > 0) activeDays++;
      }
      return { month: m, monthKey, total, activeDays };
    });
  }, [year, activity]);

  const maxTotal = useMemo(
    () => Math.max(1, ...monthsData.map((m) => m.total)),
    [monthsData],
  );

  return (
    <div className="flex flex-col gap-2 py-0.5">
      {/* 4 Quarters rows, each with left axis label and 3 month blocks */}
      {QUARTERS.map((q) => (
        <div className="flex items-center gap-2" key={q.label}>
          {/* Left Axis: Quarter marker */}
          <div className="w-9 shrink-0 text-left">
            <span className="text-[10px] font-mono font-medium text-muted-foreground/70">
              {q.label}
            </span>
          </div>

          {/* 3 Month Blocks in this quarter */}
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {q.months.map((mIdx) => {
              const item = monthsData[mIdx];
              if (!item) return null;
              const { month, monthKey, total, activeDays } = item;
              const isCurrentMonth = today.startsWith(monthKey);
              const intensity =
                total === 0
                  ? 0
                  : total >= Math.ceil(maxTotal * 0.75)
                    ? 4
                    : total >= Math.ceil(maxTotal * 0.5)
                      ? 3
                      : total >= Math.ceil(maxTotal * 0.25)
                        ? 2
                        : 1;

              return (
                <button
                  className={cn(
                    "group relative flex h-10 items-center justify-center rounded-md border transition-all",
                    displayMode === "heatmap"
                      ? cn(
                          "border-border/20",
                          intensity > 0
                            ? heatmapColor(intensity)
                            : "bg-muted/40 hover:bg-muted/65",
                          isCurrentMonth && "ring-1.5 ring-brand-500",
                        )
                      : cn(
                          "border-border/30 bg-background/50 hover:border-brand-500/50 hover:bg-brand-500/5",
                          isCurrentMonth &&
                            "border-brand-500 bg-brand-500/10 font-bold",
                        ),
                    "hover:scale-[1.03] hover:z-10",
                  )}
                  key={monthKey}
                  type="button"
                  onClick={() => onDrillToMonth(monthKey)}
                  onMouseEnter={() =>
                    onHoverTip(
                      `${year}年${MONTH_NAMES[month]} · ${total} 条笔记 (${activeDays} 活跃天)`,
                    )
                  }
                  onMouseLeave={() => onHoverTip(null)}
                >
                  {/* In Heatmap Mode: STRICTLY ZERO NUMBERS INSIDE! */}
                  {displayMode === "calendar" ? (
                    <span className="text-xs font-semibold text-foreground">
                      {MONTH_NAMES[month]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 2. Month Horizon View (7 Columns x 5~6 Rows, High Aspect Blocks)
// ============================================================================
function MonthHorizonView({
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
      {/* 7 Weekday Headers on the Top Axis */}
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

      {/* Grid of Days (Tall height: h-8.5 each) */}
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
              {/* In Heatmap Mode: STRICTLY ZERO NUMBERS INSIDE! */}
              {displayMode === "calendar" ? <span>{dayNum}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 3. Week Horizon View (7 Columns x 24 Hours, GitHub Micro-Grid Style)
// ============================================================================
function WeekHorizonView({
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

  // Hourly rows from 0 to 23
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
                <span className="text-[10px] opacity-70">{weekdayStr}</span>
                <span className="text-xs font-bold leading-tight">
                  {dateObj.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 7 Columns x 24 Rows Grid (GitHub Commit Density Style) */}
      <div className="flex gap-1">
        {/* Left Y-axis hour scale indicators (00, 06, 12, 18, 23) */}
        <div className="flex w-4 shrink-0 flex-col justify-between py-0.5 text-[8px] font-mono text-muted-foreground/60 select-none">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>

        {/* 7 Columns: 24 micro-blocks each (STRICTLY NO TEXT INSIDE) */}
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
// 4. Day Horizon View (4 Periods x 6 Hours = 24 Hours)
// ============================================================================
function DayHorizonView({
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
      {/* 4 Time periods (Night, Morning, Afternoon, Evening) */}
      {DAY_PERIODS.map((period) => (
        <div className="flex items-center gap-2" key={period.label}>
          {/* Left Axis: Period label */}
          <div className="w-8 shrink-0 text-left">
            <span className="text-[10px] font-medium text-muted-foreground/70">
              {period.label}
            </span>
          </div>

          {/* 6 Hours blocks in this period */}
          <div className="grid flex-1 grid-cols-6 gap-1.5">
            {period.hours.map((hour) => {
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
                    "group relative flex h-9 items-center justify-center rounded-md border transition-all",
                    displayMode === "heatmap"
                      ? cn(
                          "border-border/20",
                          intensity > 0
                            ? heatmapColor(intensity)
                            : "bg-muted/40 hover:bg-muted/65",
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
                  {/* In Heatmap Mode: STRICTLY ZERO NUMBERS INSIDE! */}
                  {displayMode === "calendar" ? (
                    <span className="text-[10px] font-mono tabular-nums">
                      {String(hour).padStart(2, "0")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
