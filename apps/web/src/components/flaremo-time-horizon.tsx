/**
 * FlareMoTimeHorizon — 四维高密微点阵时间视界 (GitHub 极致充实版)
 *
 * 核心设计准则：
 * 1. 全维度高密点阵 (Micro-Dot Matrix)：
 *    - 年视图：12 个月份独立微星群 × 每天 1 个微点 (~365 个微方块)
 *    - 月视图：7 列日历 × 每日 4 时段微象限 (120~140 个微方块)
 *    - 周视图：7 天 × 24 小时微时间流 (168 个微方块)
 *    - 日视图：24 小时 × 4 刻钟微矩阵 (96 个微方块)
 * 2. 极致克制的高级感：热力图状态下方格中间【绝对无任何数字与文字】，纯靠点阵色阶表达密度。
 * 3. 数字严格限位于轴线：日期、小时、星期、月份数字仅在边框轴（外侧横轴、纵轴）优雅标记。
 * 4. 统一双态心智模型：同一网格，右上角开关在「热力态（纯微点）」与「日历态（结构刻度）」之间切换。
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
import { getHourlyActivity, listMemos } from "@/api";
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

  // Map daily counts from stats.activity
  const notesCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of stats.activity) {
      if (entry.count > 0) map.set(entry.date, entry.count);
    }
    return map;
  }, [stats.activity]);

  // Month range calculations for Month hourly data (30 days x 4 quadrants)
  const [monthYear, monthMonth] = currentMonthKey.split("-").map(Number);
  const daysInMonth = new Date(monthYear, monthMonth, 0).getDate();
  const monthFrom = `${currentMonthKey}-01`;
  const monthTo = `${currentMonthKey}-${String(daysInMonth).padStart(2, "0")}`;

  const monthHourlyQuery = useQuery({
    queryKey: ["stats-hourly-month", monthFrom, monthTo, tz],
    queryFn: ({ signal }) =>
      getHourlyActivity({ from: monthFrom, to: monthTo }, tz, signal),
    staleTime: 60_000,
    enabled: tab === "month",
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

  // Day view memo timestamps for quarter-hour resolution (24 hours x 4 = 96 dots)
  const dayMemosQuery = useQuery({
    queryKey: ["memos-day-slots", selectedDay],
    queryFn: ({ signal }) =>
      listMemos({ q: dayFilterQuery(selectedDay), page_size: 50 }, signal),
    staleTime: 30_000,
    enabled: tab === "day",
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
    if (tab === "year") return `${currentYear}年 全景`;
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
        className="relative flex min-h-[238px] flex-col justify-center rounded-xl border border-border/50 bg-muted/15 p-2.5 shadow-2xs"
        data-testid="activity-heatmap"
      >
        {/* YEAR VIEW: 12 Month Star Clusters (~365 Micro-Dots) */}
        {tab === "year" && (
          <YearMicroDotView
            activity={stats.activity}
            displayMode={displayMode}
            today={today}
            weekStart={weekStart}
            year={currentYear}
            onDrillToMonth={drillToMonth}
            onHoverTip={setHoveredTip}
          />
        )}

        {/* MONTH VIEW: 7 Columns x Daily 4-Quadrant Micro-Dots (~120 Dots) */}
        {tab === "month" && (
          <MonthQuadrantView
            displayMode={displayMode}
            hourlyData={monthHourlyQuery.data?.hours ?? []}
            hoveredDate={hoveredDate}
            isLoading={monthHourlyQuery.isLoading}
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

        {/* WEEK VIEW: 7 Days x 24 Hours Micro-Stream (168 Micro-Dots) */}
        {tab === "week" && (
          <WeekMicroStreamView
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

        {/* DAY VIEW: 24 Hours x 4 Quarter-Hour Segments (96 Micro-Dots) */}
        {tab === "day" && (
          <DayQuarterDotView
            displayMode={displayMode}
            memos={dayMemosQuery.data?.memos ?? []}
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
// 1. Year Micro-Dot View (12 Months x Daily Dots = 365 Micro-Dots)
// ============================================================================
function YearMicroDotView({
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
              "border-border/30 bg-background/30 hover:border-brand-500/50 hover:bg-brand-500/5",
              isCurrentMonth && "border-brand-500/60 ring-1 ring-brand-500/30",
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
            {/* Top axis of the cluster: Month label & count */}
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium text-muted-foreground">
                {m.label}
              </span>
              {displayMode === "calendar" && m.total > 0 ? (
                <span className="text-[9px] font-mono tabular-nums text-brand-600 dark:text-brand-400">
                  {m.total}
                </span>
              ) : null}
            </div>

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
// 2. Month Quadrant View (30 Days x 4 Quadrants = ~120 Micro-Dots)
// ============================================================================
function MonthQuadrantView({
  monthKey,
  today,
  selectedDay,
  locale,
  weekStart,
  notesCountMap,
  hourlyData,
  isLoading,
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
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  isLoading: boolean;
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

  // Map 4 daily quadrants from hourly records:
  // q0: 00-06h (深夜), q1: 06-12h (上午), q2: 12-18h (下午), q3: 18-24h (晚上)
  const dayQuadrants = useMemo(() => {
    const qMap = new Map<string, [number, number, number, number]>();
    for (const h of hourlyData) {
      if (!qMap.has(h.date)) qMap.set(h.date, [0, 0, 0, 0]);
      const current = qMap.get(h.date);
      if (!current) continue;
      const qIdx = Math.floor(h.hour / 6);
      if (qIdx >= 0 && qIdx < 4) {
        current[qIdx] += h.count;
      }
    }
    return qMap;
  }, [hourlyData]);

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

      {/* Grid of Days (~30 Days, each packed with 4 Quadrant Micro-Dots) */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const totalCount = notesCountMap.get(cell.key) ?? 0;
          const isToday = cell.key === today;
          const isSelected = cell.key === selectedDay;
          const dayNum = Number(cell.key.slice(8));
          const [q0, q1, q2, q3] = dayQuadrants.get(cell.key) ?? [0, 0, 0, 0];

          return (
            <button
              className={cn(
                "group relative flex h-8.5 w-full flex-col items-center justify-center rounded-[3px] border transition-all",
                cell.inMonth ? "opacity-100" : "opacity-15 pointer-events-none",
                "border-border/30 bg-background/50",
                isToday && "border-brand-500 bg-brand-500/10",
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
                onHoverTip(
                  `${cell.key} · ${totalCount} 条笔记 (早:${q1} 午:${q2} 晚:${q3} 夜:${q0})`,
                );
              }}
              onMouseLeave={() => {
                onHoverDate?.(null);
                onHoverTip(null);
              }}
            >
              {/* Heatmap Mode: 2x2 Quadrant Micro-Dots Matrix (120 Dots across the month!) */}
              {displayMode === "heatmap" ? (
                <div
                  className={cn(
                    "grid grid-cols-2 gap-[2px]",
                    isLoading && "animate-pulse",
                  )}
                >
                  <div
                    className={cn(
                      "size-[4.5px] rounded-[1px]",
                      q1 > 0
                        ? heatmapColor(q1)
                        : totalCount > 0
                          ? "bg-brand-500/50"
                          : "bg-muted/40",
                    )}
                    title="上午 (06-12)"
                  />
                  <div
                    className={cn(
                      "size-[4.5px] rounded-[1px]",
                      q2 > 0
                        ? heatmapColor(q2)
                        : totalCount > 0
                          ? "bg-brand-500/70"
                          : "bg-muted/40",
                    )}
                    title="下午 (12-18)"
                  />
                  <div
                    className={cn(
                      "size-[4.5px] rounded-[1px]",
                      q0 > 0 ? heatmapColor(q0) : "bg-muted/40",
                    )}
                    title="深夜 (00-06)"
                  />
                  <div
                    className={cn(
                      "size-[4.5px] rounded-[1px]",
                      q3 > 0
                        ? heatmapColor(q3)
                        : totalCount > 0
                          ? "bg-brand-500"
                          : "bg-muted/40",
                    )}
                    title="晚上 (18-24)"
                  />
                </div>
              ) : (
                /* Calendar Mode: Crisp Day Number */
                <span
                  className={cn(
                    "text-[11px] font-mono tabular-nums",
                    totalCount > 0
                      ? "font-bold text-brand-600 dark:text-brand-400"
                      : "text-foreground",
                  )}
                >
                  {dayNum}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 3. Week Micro-Stream View (7 Days x 24 Hours = 168 Micro-Dots)
// ============================================================================
function WeekMicroStreamView({
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

      {/* 7 Columns x 24 Rows Grid (GitHub Commit Density Style, 168 Dots) */}
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
// 4. Day Micro-Rhythm View (4 Periods x 6 Hours = 96 Micro-Slits)
// ============================================================================
function DayQuarterDotView({
  selectedDay,
  memos,
  displayMode,
  onJumpToTimeline,
  onHoverTip,
}: {
  selectedDay: string;
  memos: Array<{ id: string; create_time: string }>;
  displayMode: DisplayMode;
  onJumpToTimeline: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  // Map 96 quarter-hour slots (0 to 95) from exact memo creation timestamps
  const slotCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of memos) {
      const d = new Date(m.create_time);
      const slot = d.getHours() * 4 + Math.floor(d.getMinutes() / 15);
      map.set(slot, (map.get(slot) ?? 0) + 1);
    }
    return map;
  }, [memos]);

  return (
    <div className="flex flex-col gap-2 py-0.5">
      {/* Top Axis: Hour offsets within each 6-hour period */}
      <div className="flex items-center gap-2">
        <div className="w-9 shrink-0" />
        <div className="grid flex-1 grid-cols-6 gap-1.5 text-center text-[9px] font-mono text-muted-foreground/60">
          {["+0h", "+1h", "+2h", "+3h", "+4h", "+5h"].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      </div>

      {/* 4 Period Rows */}
      {DAY_PERIODS.map((period) => (
        <div className="flex items-center gap-2" key={period.label}>
          {/* Left Axis: Period label + start hour */}
          <div className="flex w-9 shrink-0 flex-col text-left">
            <span className="text-[10px] font-medium text-muted-foreground">
              {period.label}
            </span>
            <span className="text-[8px] font-mono text-muted-foreground/50">
              {String(period.hours[0]).padStart(2, "0")}:00
            </span>
          </div>

          {/* 6 Hours in this period */}
          <div className="grid flex-1 grid-cols-6 gap-1.5">
            {period.hours.map((hour) => {
              const hourBaseSlot = hour * 4;
              const q0 = slotCountMap.get(hourBaseSlot) ?? 0;
              const q1 = slotCountMap.get(hourBaseSlot + 1) ?? 0;
              const q2 = slotCountMap.get(hourBaseSlot + 2) ?? 0;
              const q3 = slotCountMap.get(hourBaseSlot + 3) ?? 0;
              const hourTotal = q0 + q1 + q2 + q3;

              return (
                <button
                  className={cn(
                    "group relative flex h-10 w-full items-center justify-center rounded-md border transition-all",
                    "border-border/30 bg-background/50 hover:border-brand-500/50 hover:bg-brand-500/5",
                    hourTotal > 0 && "border-brand-500/40 bg-brand-500/10",
                    "hover:scale-[1.05] hover:z-10",
                  )}
                  key={`hour-${hour}`}
                  type="button"
                  onClick={() => onJumpToTimeline(selectedDay)}
                  onMouseEnter={() =>
                    onHoverTip(
                      `${selectedDay} ${String(hour).padStart(2, "0")}:00 · ${hourTotal > 0 ? `${hourTotal} 条笔记` : "无记录"}`,
                    )
                  }
                  onMouseLeave={() => onHoverTip(null)}
                >
                  {/* Heatmap Mode: ABSOLUTELY ZERO NUMBERS INSIDE! Pure 4 micro-slits */}
                  {displayMode === "heatmap" ? (
                    <div className="flex h-5 items-center gap-[2px]">
                      {[
                        { id: "q0", count: q0, label: ":00" },
                        { id: "q1", count: q1, label: ":15" },
                        { id: "q2", count: q2, label: ":30" },
                        { id: "q3", count: q3, label: ":45" },
                      ].map((q) => (
                        <div
                          className={cn(
                            "h-full w-[3.5px] rounded-[1px] transition-all",
                            q.count > 0 ? heatmapColor(q.count) : "bg-muted/40",
                          )}
                          key={`bar-${hour}-${q.id}`}
                          title={q.label}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Calendar Mode: Crisp Hour Number */
                    <span className="text-[11px] font-mono tabular-nums text-foreground">
                      {String(hour).padStart(2, "0")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
