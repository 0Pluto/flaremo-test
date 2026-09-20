/**
 * FlareMoTimeHorizon — 四维时间视界
 *
 * 4 个时间尺度 Tab（年 / 月 / 周 / 日）× 2 种展现方式（日历 / 热力）。
 * 两种方式共用同一容器，通过右上角图标按钮切换，不做上下堆叠。
 * 下钻交互：年→月→周/日，点击时自动切换 Tab。
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
  PlusIcon,
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
import { getLunarDateInfo, getUpcomingEvents } from "@/lib/lunar";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================
export type TimeHorizonTab = "year" | "month" | "week" | "day";
type DisplayMode = "calendar" | "heatmap";

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
// Utilities
// ============================================================================
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

/** Build 364-day (52 × 7) activity grid anchored on today. */
function buildYearGrid(
  today: string,
  weekStart: WeekStart,
  activity: MemoStatsResponse["activity"],
): Array<{ date: string; count: number }> {
  const countMap = new Map(activity.map((d) => [d.date, d.count]));
  // Start from 363 days ago aligned to the correct weekday
  const todayObj = parseDayKey(today);
  // Go back 363 days, then snap to the column start
  const totalDays = 363;
  const days: Array<{ date: string; count: number }> = [];
  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: key, count: countMap.get(key) ?? 0 });
  }
  // Pad front so first column starts on weekStart
  const firstDay = days[0];
  if (!firstDay) return days;
  const firstDow = parseDayKey(firstDay.date).getDay();
  const pad = weekStart === "monday" ? (firstDow + 6) % 7 : firstDow;
  const front: typeof days = [];
  for (let i = pad; i > 0; i--) {
    const d = new Date(parseDayKey(firstDay.date));
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    front.push({ date: key, count: -1 }); // -1 = out-of-range filler
  }
  return [...front, ...days];
}

/** 12 monthly summaries for the current year. */
function buildYearCalendarMonths(
  year: number,
  activity: MemoStatsResponse["activity"],
) {
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
    return { month: m, monthKey, total, activeDays, daysInMonth };
  });
}

// ============================================================================
// Root component
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>("calendar");
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(
    monthOf(today),
  );
  const [currentWeekBase, setCurrentWeekBase] = useState<string>(today);
  const [currentYear, setCurrentYear] = useState<number>(yearOf(today));

  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";

  const notesCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of stats.activity) {
      if (e.count > 0) map.set(e.date, e.count);
    }
    return map;
  }, [stats.activity]);

  const handleSelectDay = (day: string) => {
    setSelectedDay(day);
    onDaySelect?.(day);
  };

  /** Drill-down: from year view click a month → switch to month tab */
  const drillToMonth = (monthKey: string) => {
    setCurrentMonthKey(monthKey);
    setTab("month");
  };

  /** Drill-down: from month/week view click a day → switch to day tab */
  const drillToDay = (day: string) => {
    handleSelectDay(day);
    setTab("day");
  };

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

  // ── Tab label helpers ──────────────────────────────────────────────────────
  const dayTabLabel = useMemo(() => {
    const d = parseDayKey(selectedDay);
    return String(d.getDate());
  }, [selectedDay]);

  const tabTitle = useMemo(() => {
    if (tab === "year") return String(currentYear);
    if (tab === "month") {
      return formatMonthTitle(currentMonthKey, locale);
    }
    if (tab === "week") {
      const grid = buildWeekGrid(currentWeekBase, weekStart);
      const first = grid[0];
      const last = grid[6];
      if (!first || !last) return "";
      const fmt = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      });
      return `${fmt.format(parseDayKey(first.key))} – ${fmt.format(parseDayKey(last.key))}`;
    }
    // day
    const d = parseDayKey(selectedDay);
    const fmt = new Intl.DateTimeFormat(locale, {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    return fmt.format(d);
  }, [
    tab,
    currentYear,
    currentMonthKey,
    currentWeekBase,
    selectedDay,
    locale,
    weekStart,
  ]);

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

  // ============================================================================
  return (
    <div className={cn("flex flex-col gap-0", className)}>
      {/* ── Top bar: 4 Tabs + display-mode toggle ─────────────────────── */}
      <div className="mb-1 flex items-center justify-between px-0.5">
        {/* Tabs */}
        <div
          aria-label={t("explorer.timeViewLabel")}
          className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/30 p-0.5"
          role="tablist"
        >
          {(
            [
              ["year", String(currentYear)],
              ["month", "月"],
              ["week", "周"],
              ["day", dayTabLabel],
            ] as const
          ).map(([id, label]) => (
            <button
              aria-selected={tab === id}
              className={cn(
                "min-w-[28px] rounded px-1.5 py-0.5 text-xs font-medium tabular-nums transition-colors",
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

        {/* Display-mode toggle */}
        <div className="flex items-center gap-0.5">
          <button
            aria-label="日历视图"
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              displayMode === "calendar" && "bg-muted text-foreground",
            )}
            type="button"
            onClick={() => setDisplayMode("calendar")}
          >
            <CalendarDaysIcon className="size-3.5" />
          </button>
          <button
            aria-label="热力图"
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              displayMode === "heatmap" && "bg-muted text-foreground",
            )}
            type="button"
            onClick={() => setDisplayMode("heatmap")}
          >
            <GridIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Navigation bar ─────────────────────────────────────────────── */}
      <div className="mb-1 flex items-center justify-between px-0.5">
        <button
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          onClick={handlePrev}
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <span className="text-[11px] font-medium text-muted-foreground">
          {tabTitle}
        </span>
        <button
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          onClick={handleNext}
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </div>

      {/* ── View body ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-muted/10">
        {tab === "year" && displayMode === "heatmap" && (
          <YearHeatmapView
            activity={stats.activity}
            hoveredDate={hoveredDate}
            monthLabels={monthLabels}
            today={today}
            weekStart={weekStart}
            onDrillToMonth={drillToMonth}
            onHoverDate={onHoverDate}
          />
        )}
        {tab === "year" && displayMode === "calendar" && (
          <YearCalendarView
            activity={stats.activity}
            locale={locale}
            selectedDay={selectedDay}
            today={today}
            year={currentYear}
            weekStart={weekStart}
            onDrillToMonth={drillToMonth}
          />
        )}
        {tab === "month" && displayMode === "heatmap" && (
          <MonthHeatmapView
            hoveredDate={hoveredDate}
            locale={locale}
            monthKey={currentMonthKey}
            notesCountMap={notesCountMap}
            selectedDay={selectedDay}
            today={today}
            onDrillToDay={drillToDay}
            onHoverDate={onHoverDate}
            onSelectDay={handleSelectDay}
          />
        )}
        {tab === "month" && displayMode === "calendar" && (
          <MonthCalendarView
            hoveredDate={hoveredDate}
            locale={locale}
            monthKey={currentMonthKey}
            notesCountMap={notesCountMap}
            selectedDay={selectedDay}
            today={today}
            weekStart={weekStart}
            onDrillToDay={drillToDay}
            onHoverDate={onHoverDate}
            onJumpToTimeline={jumpToTimeline}
            onSelectDay={handleSelectDay}
          />
        )}
        {tab === "week" && displayMode === "heatmap" && (
          <WeekHeatmapView
            locale={locale}
            notesCountMap={notesCountMap}
            selectedDay={selectedDay}
            today={today}
            weekBase={currentWeekBase}
            weekStart={weekStart}
            onDrillToDay={drillToDay}
            onSelectDay={handleSelectDay}
          />
        )}
        {tab === "week" && displayMode === "calendar" && (
          <WeekCalendarView
            locale={locale}
            notesCountMap={notesCountMap}
            selectedDay={selectedDay}
            today={today}
            weekBase={currentWeekBase}
            weekStart={weekStart}
            onDrillToDay={drillToDay}
            onJumpToTimeline={jumpToTimeline}
            onSelectDay={handleSelectDay}
          />
        )}
        {tab === "day" && (
          <DayView
            locale={locale}
            selectedDay={selectedDay}
            stats={stats}
            streak={streak}
            today={today}
            onJumpToTimeline={jumpToTimeline}
            onSelectDay={handleSelectDay}
          />
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Year Heatmap — 52 × 7 GitHub-style grid
// ============================================================================
function YearHeatmapView({
  activity,
  today,
  weekStart,
  hoveredDate,
  monthLabels,
  onHoverDate,
  onDrillToMonth,
}: {
  activity: MemoStatsResponse["activity"];
  today: string;
  weekStart: WeekStart;
  hoveredDate?: string | null;
  monthLabels: Array<{ date: string; label: string }>;
  onHoverDate?: (d: string | null) => void;
  onDrillToMonth: (monthKey: string) => void;
}) {
  const grid = useMemo(
    () => buildYearGrid(today, weekStart, activity),
    [today, weekStart, activity],
  );
  const cols = Math.ceil(grid.length / 7);

  return (
    <div className="p-2">
      <div
        className="overflow-x-auto"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: "repeat(7, 1fr)",
          gap: "2px",
        }}
        data-testid="activity-heatmap"
      >
        {grid.map((cell) =>
          cell.count === -1 ? (
            <div key={`filler-${cell.date}`} />
          ) : (
            <button
              className={cn(
                "aspect-square w-full rounded-[2px] transition-all hover:opacity-90",
                heatmapColor(cell.count),
                hoveredDate === cell.date &&
                  "ring-1 ring-brand-500 scale-125 z-10 brightness-110",
                cell.date > today && "opacity-30",
              )}
              key={cell.date}
              title={`${cell.date} · ${cell.count} 条`}
              type="button"
              onClick={() => onDrillToMonth(monthOf(cell.date))}
              onMouseEnter={() => onHoverDate?.(cell.date)}
              onMouseLeave={() => onHoverDate?.(null)}
            />
          ),
        )}
      </div>
      {/* Month labels */}
      <div
        aria-hidden="true"
        className="mt-1.5 flex items-center justify-between px-0.5 text-[9px] text-muted-foreground/70"
      >
        {monthLabels
          .filter((m) => Boolean(m.label))
          .map((m) => (
            <span className="whitespace-nowrap" key={m.date}>
              {m.label}
            </span>
          ))}
      </div>
    </div>
  );
}

// ============================================================================
// Year Calendar — 3 × 4 mini month grids
// ============================================================================
function YearCalendarView({
  year,
  today,
  selectedDay,
  locale,
  activity,
  weekStart: _weekStart,
  onDrillToMonth,
}: {
  year: number;
  today: string;
  selectedDay: string;
  locale: string;
  activity: MemoStatsResponse["activity"];
  weekStart: WeekStart;
  onDrillToMonth: (monthKey: string) => void;
}) {
  const months = useMemo(
    () => buildYearCalendarMonths(year, activity),
    [year, activity],
  );
  const fmt = new Intl.DateTimeFormat(locale, { month: "short" });

  return (
    <div className="grid grid-cols-3 gap-1.5 p-2">
      {months.map(({ month, monthKey, total: _total, activeDays }) => {
        const isCurrentMonth = today.startsWith(monthKey);
        const isSelectedMonth = selectedDay.startsWith(monthKey);
        const intensity =
          activeDays === 0
            ? 0
            : activeDays <= 3
              ? 1
              : activeDays <= 10
                ? 2
                : activeDays <= 18
                  ? 3
                  : 4;
        return (
          <button
            className={cn(
              "flex flex-col items-center rounded-lg border border-border/30 px-1.5 py-1.5 transition-all hover:border-brand-500/40 hover:bg-brand-500/5",
              isCurrentMonth && "border-brand-500/60 bg-brand-500/8",
              isSelectedMonth &&
                !isCurrentMonth &&
                "border-border/60 bg-muted/40",
            )}
            key={monthKey}
            type="button"
            onClick={() => onDrillToMonth(monthKey)}
          >
            <span
              className={cn(
                "text-xs font-semibold",
                isCurrentMonth
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-foreground",
              )}
            >
              {fmt.format(new Date(year, month, 1))}
            </span>
            {/* Mini heat bar */}
            <div className="mt-1 flex gap-[1.5px]">
              {[1, 2, 3, 4, 5].map((step) => (
                <div
                  className={cn(
                    "h-1 w-1 rounded-[1px]",
                    step <= intensity ? heatmapColor(step) : "bg-muted",
                  )}
                  key={`${monthKey}-step-${step}`}
                />
              ))}
            </div>
            <span className="mt-0.5 text-[9px] text-muted-foreground">
              {activeDays > 0 ? `${activeDays}d` : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Month Heatmap — daily squares for the selected month
// ============================================================================
function MonthHeatmapView({
  monthKey,
  today,
  selectedDay,
  locale: _locale,
  notesCountMap,
  hoveredDate,
  onHoverDate,
  onSelectDay: _onSelectDay,
  onDrillToDay,
}: {
  monthKey: string;
  today: string;
  selectedDay: string;
  locale: string;
  notesCountMap: Map<string, number>;
  hoveredDate?: string | null;
  onHoverDate?: (d: string | null) => void;
  onSelectDay: (d: string) => void;
  onDrillToDay: (d: string) => void;
}) {
  const [year, month0] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month0, 0).getDate();
  const days = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const key = `${monthKey}-${String(i + 1).padStart(2, "0")}`;
      return { key, count: notesCountMap.get(key) ?? 0 };
    });
  }, [monthKey, daysInMonth, notesCountMap]);

  const maxCount = useMemo(
    () => Math.max(1, ...days.map((d) => d.count)),
    [days],
  );

  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-1">
        {days.map(({ key, count }) => {
          const isToday = key === today;
          const isSelected = key === selectedDay;
          const dayNum = Number(key.slice(8));
          return (
            <button
              className={cn(
                "group relative flex aspect-square w-full flex-col items-center justify-center rounded-md transition-all hover:opacity-90",
                isSelected
                  ? "ring-2 ring-brand-500 ring-offset-1 z-10"
                  : isToday
                    ? "ring-1 ring-brand-500/70"
                    : "",
                count > 0 ? heatmapColor(count) : "bg-muted/50",
                key > today && "opacity-30",
              )}
              key={key}
              title={`${key} · ${count} 条`}
              type="button"
              onClick={() => onDrillToDay(key)}
              onMouseEnter={() => onHoverDate?.(key)}
              onMouseLeave={() => onHoverDate?.(null)}
            >
              <span
                className={cn(
                  "text-[10px] font-medium tabular-nums",
                  count > 0 && count >= Math.ceil(maxCount * 0.7)
                    ? "text-foreground"
                    : "text-muted-foreground",
                  isToday && "font-bold",
                )}
              >
                {dayNum}
              </span>
            </button>
          );
        })}
      </div>
      {/* Hover info */}
      <div className="mt-1.5 min-h-[14px] px-0.5 text-[10px] text-muted-foreground">
        {hoveredDate?.startsWith(monthKey) ? (
          <span>
            {hoveredDate} ·{" "}
            {(notesCountMap.get(hoveredDate) ?? 0) > 0
              ? `${notesCountMap.get(hoveredDate)} 条记录`
              : "无记录"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// Month Calendar — full grid with lunar annotations + selected-day detail card
// ============================================================================
function MonthCalendarView({
  monthKey,
  today,
  selectedDay,
  locale,
  weekStart,
  notesCountMap,
  hoveredDate,
  onHoverDate,
  onSelectDay: _onSelectDay,
  onDrillToDay,
  onJumpToTimeline,
}: {
  monthKey: string;
  today: string;
  selectedDay: string;
  locale: string;
  weekStart: WeekStart;
  notesCountMap: Map<string, number>;
  hoveredDate?: string | null;
  onHoverDate?: (d: string | null) => void;
  onSelectDay: (d: string) => void;
  onDrillToDay: (d: string) => void;
  onJumpToTimeline: (d: string) => void;
}) {
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart),
    [monthKey, weekStart],
  );
  const headers = weekdayHeaders(weekStart, locale, "narrow");
  const lunar = useMemo(
    () => getLunarDateInfo(parseDayKey(selectedDay)),
    [selectedDay],
  );

  // Memos on selected day
  const selectedDayMemosQuery = useQuery({
    queryKey: ["memos-day", selectedDay],
    queryFn: ({ signal }) =>
      listMemos({ q: dayFilterQuery(selectedDay), page_size: 5 }, signal),
    staleTime: 30_000,
  });

  return (
    <div className="p-2">
      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7">
        {headers.map((h) => (
          <div
            className="text-center text-[9px] font-medium text-muted-foreground/70"
            key={h}
          >
            {h}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((day) => {
          const isSelected = day.key === selectedDay;
          const isToday = day.key === today;
          const count = notesCountMap.get(day.key) ?? 0;
          const dayNum = parseDayKey(day.key).getDate();
          const dayLunar = getLunarDateInfo(parseDayKey(day.key));

          let heatStyle = "";
          if (!isSelected && !isToday && count > 0) {
            heatStyle =
              count >= 3
                ? "bg-brand-500/40 text-brand-950 dark:text-brand-50 font-semibold"
                : count === 2
                  ? "bg-brand-500/25 text-brand-900 dark:text-brand-100"
                  : "bg-brand-500/15 text-brand-800 dark:text-brand-200";
          }

          return (
            <button
              className={cn(
                "group relative flex h-8 w-full flex-col items-center justify-center rounded-md transition-all",
                day.inMonth ? "text-foreground" : "opacity-30",
                isSelected
                  ? "bg-brand-500 text-white font-bold shadow-2xs z-10"
                  : isToday
                    ? "ring-1 ring-brand-500 bg-brand-500/10 font-bold"
                    : "hover:bg-muted/70",
                heatStyle,
                hoveredDate === day.key &&
                  "ring-1.5 ring-brand-500 scale-105 z-10",
              )}
              key={day.key}
              type="button"
              onClick={() => onDrillToDay(day.key)}
              onMouseEnter={() => onHoverDate?.(day.key)}
              onMouseLeave={() => onHoverDate?.(null)}
            >
              <span className="flex size-4 items-center justify-center rounded-full text-[11px] tabular-nums">
                {dayNum}
              </span>
              <span
                className={cn(
                  "text-[8px] leading-tight scale-90",
                  isSelected ? "text-white/90" : "text-muted-foreground",
                )}
              >
                {dayLunar.label.slice(0, 2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day detail card */}
      <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 p-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground">
              {lunar.label} · {selectedDay.slice(5)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {lunar.fullLabel} · {lunar.weekday}
            </span>
          </div>
          <button
            className="text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
            type="button"
            onClick={() => onJumpToTimeline(selectedDay)}
          >
            查看全部
          </button>
        </div>
        {selectedDayMemosQuery.data?.memos.slice(0, 3).map((m) => (
          <div
            className="truncate text-[10px] text-muted-foreground"
            key={m.id}
          >
            · {m.content.slice(0, 40).replace(/[#*\n]/g, " ")}
          </div>
        ))}
        {!selectedDayMemosQuery.data?.memos.length && (
          <span className="text-[10px] text-muted-foreground/60">
            这天没有记录
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Week Heatmap — 7 large squares + hourly mini-row below selected day
// ============================================================================
function WeekHeatmapView({
  weekBase,
  today,
  selectedDay,
  locale,
  weekStart,
  notesCountMap,
  onSelectDay: _onSelectDay,
  onDrillToDay,
}: {
  weekBase: string;
  today: string;
  selectedDay: string;
  locale: string;
  weekStart: WeekStart;
  notesCountMap: Map<string, number>;
  onSelectDay: (d: string) => void;
  onDrillToDay: (d: string) => void;
}) {
  const grid = useMemo(
    () => buildWeekGrid(weekBase, weekStart),
    [weekBase, weekStart],
  );
  const headers = weekdayHeaders(weekStart, locale, "narrow");

  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, idx) => {
          const count = notesCountMap.get(day.key) ?? 0;
          const isToday = day.key === today;
          const isSelected = day.key === selectedDay;
          const lunar = getLunarDateInfo(parseDayKey(day.key));
          const dayNum = parseDayKey(day.key).getDate();

          return (
            <button
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg py-2 transition-all",
                isSelected
                  ? "bg-brand-500 text-white shadow-xs"
                  : isToday
                    ? "bg-brand-500/15 text-brand-900 dark:text-brand-200"
                    : count > 0
                      ? cn(heatmapColor(count), "hover:opacity-90")
                      : "hover:bg-muted/60 text-foreground",
                day.key > today && "opacity-40",
              )}
              key={day.key}
              type="button"
              onClick={() => onDrillToDay(day.key)}
            >
              <span className="text-[9px] opacity-70">{headers[idx]}</span>
              <span className="text-sm font-bold tabular-nums leading-tight">
                {dayNum}
              </span>
              <span className="text-[8px] opacity-70">
                {lunar.label.slice(0, 2)}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    "text-[8px] font-semibold",
                    isSelected
                      ? "text-white/90"
                      : "text-brand-600 dark:text-brand-400",
                  )}
                >
                  {count}
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
// Week Calendar — strip with today's memo list
// ============================================================================
function WeekCalendarView({
  weekBase,
  today,
  selectedDay,
  locale,
  weekStart,
  notesCountMap,
  onSelectDay: _onSelectDay,
  onDrillToDay,
  onJumpToTimeline,
}: {
  weekBase: string;
  today: string;
  selectedDay: string;
  locale: string;
  weekStart: WeekStart;
  notesCountMap: Map<string, number>;
  onSelectDay: (d: string) => void;
  onDrillToDay: (d: string) => void;
  onJumpToTimeline: (d: string) => void;
}) {
  const grid = useMemo(
    () => buildWeekGrid(weekBase, weekStart),
    [weekBase, weekStart],
  );
  const headers = weekdayHeaders(weekStart, locale, "narrow");
  const lunar = useMemo(
    () => getLunarDateInfo(parseDayKey(selectedDay)),
    [selectedDay],
  );

  const selectedDayMemosQuery = useQuery({
    queryKey: ["memos-day", selectedDay],
    queryFn: ({ signal }) =>
      listMemos({ q: dayFilterQuery(selectedDay), page_size: 5 }, signal),
    staleTime: 30_000,
  });

  return (
    <div className="p-2">
      {/* 7-day strip */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, idx) => {
          const count = notesCountMap.get(day.key) ?? 0;
          const isToday = day.key === today;
          const isSelected = day.key === selectedDay;
          const dayNum = parseDayKey(day.key).getDate();
          const dayLunar = getLunarDateInfo(parseDayKey(day.key));

          return (
            <button
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-all",
                isSelected
                  ? "bg-brand-500 text-white shadow-xs font-semibold"
                  : isToday
                    ? "bg-brand-500/15 text-brand-900 dark:text-brand-200"
                    : "hover:bg-muted/60 text-foreground",
                day.key > today && "opacity-40",
              )}
              key={day.key}
              type="button"
              onClick={() => onDrillToDay(day.key)}
            >
              <span className="text-[9px] opacity-70">{headers[idx]}</span>
              <span className="text-sm font-bold tabular-nums leading-tight">
                {dayNum}
              </span>
              <span
                className={cn(
                  "text-[8px]",
                  isSelected ? "text-white/80" : "text-muted-foreground",
                )}
              >
                {dayLunar.label.slice(0, 2)}
              </span>
              {/* Note count dot */}
              <div className="flex size-1 items-center justify-center">
                {count > 0 && (
                  <span
                    className={cn(
                      "size-1 rounded-full",
                      isSelected ? "bg-white" : "bg-brand-500",
                    )}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected-day detail */}
      <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-foreground">
            {lunar.label} · {selectedDay.slice(5)} · {lunar.weekday}
          </span>
          <button
            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
            type="button"
            onClick={() => onJumpToTimeline(selectedDay)}
          >
            全部
          </button>
        </div>
        {selectedDayMemosQuery.data?.memos.slice(0, 3).map((m) => (
          <div
            className="truncate text-[10px] text-muted-foreground"
            key={m.id}
          >
            · {m.content.slice(0, 40).replace(/[#*\n]/g, " ")}
          </div>
        ))}
        {!selectedDayMemosQuery.data?.memos.length && (
          <span className="text-[10px] text-muted-foreground/60">
            这天没有记录
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Day View — 24-hour heatmap + memo timeline
// ============================================================================
function DayView({
  selectedDay,
  today,
  locale,
  stats: _stats,
  streak,
  onSelectDay: _onSelectDay,
  onJumpToTimeline,
}: {
  selectedDay: string;
  today: string;
  locale: string;
  stats: MemoStatsResponse;
  streak: number;
  onSelectDay: (d: string) => void;
  onJumpToTimeline: (d: string) => void;
}) {
  const tz = useMemo(() => new Date().getTimezoneOffset(), []);
  const lunar = useMemo(
    () => getLunarDateInfo(parseDayKey(selectedDay)),
    [selectedDay],
  );
  const events = useMemo(
    () => getUpcomingEvents(parseDayKey(selectedDay), 60),
    [selectedDay],
  );

  const hourlyQuery = useQuery({
    queryKey: ["hourly-activity", selectedDay, tz],
    queryFn: ({ signal }) => getHourlyActivity(selectedDay, tz, signal),
    staleTime: 60_000,
  });

  const memosQuery = useQuery({
    queryKey: ["memos-day", selectedDay],
    queryFn: ({ signal }) =>
      listMemos({ q: dayFilterQuery(selectedDay), page_size: 20 }, signal),
    staleTime: 30_000,
  });

  const hours = hourlyQuery.data?.hours ?? [];
  const maxHourCount = Math.max(1, ...hours.map((h) => h.count));

  const dayNum = parseDayKey(selectedDay).getDate();
  const isToday = selectedDay === today;

  return (
    <div className="p-2">
      {/* Date header */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex flex-col">
          <span className="font-serif text-3xl font-bold tabular-nums leading-none text-foreground">
            {String(dayNum).padStart(2, "0")}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground">
            {lunar.weekday} · {lunar.label}
          </span>
          <span className="text-[9px] text-muted-foreground/70">
            {lunar.fullLabel}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {isToday && streak > 0 && (
            <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand-600 dark:text-brand-400">
              {streak} 天连记
            </span>
          )}
          <button
            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
            type="button"
            onClick={() => onJumpToTimeline(selectedDay)}
          >
            <PlusIcon className="inline size-2.5 mb-0.5" /> 记录
          </button>
        </div>
      </div>

      {/* 24-hour heatmap */}
      <div className="mb-2">
        <div className="mb-1 text-[9px] text-muted-foreground">24 小时活动</div>
        <div className="grid grid-cols-12 gap-[2px]">
          {hours.length > 0
            ? hours.map(({ hour, count }) => (
                <div
                  className={cn(
                    "group relative flex flex-col items-center gap-0.5",
                  )}
                  key={hour}
                  title={`${String(hour).padStart(2, "0")}:00 · ${count} 条`}
                >
                  <div
                    className={cn(
                      "w-full rounded-[2px] transition-all",
                      count > 0
                        ? heatmapColor(Math.ceil((count / maxHourCount) * 4))
                        : "bg-muted/50",
                      count > 0 && "hover:opacity-90",
                    )}
                    style={{ height: "14px" }}
                  />
                  {/* Hour label every 4 hours */}
                  {hour % 4 === 0 && (
                    <span className="text-[7px] text-muted-foreground/60">
                      {hour}
                    </span>
                  )}
                  {hour % 4 !== 0 && <span className="text-[7px]"> </span>}
                </div>
              ))
            : // Loading skeleton
              [
                "h0",
                "h2",
                "h4",
                "h6",
                "h8",
                "h10",
                "h12",
                "h14",
                "h16",
                "h18",
                "h20",
                "h22",
              ].map((slot) => (
                <div
                  className="w-full animate-pulse rounded-[2px] bg-muted/50"
                  key={`skeleton-${slot}`}
                  style={{ height: "14px" }}
                />
              ))}
        </div>
      </div>

      {/* Memo timeline */}
      <div className="flex flex-col gap-1">
        {memosQuery.data?.memos.slice(0, 5).map((m) => {
          const createdAt = new Date(m.create_time ?? "");
          const timeStr = createdAt.toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              className="flex items-start gap-1.5 rounded-lg bg-muted/20 p-1.5"
              key={m.id}
            >
              <span className="mt-0.5 min-w-[30px] text-[9px] tabular-nums text-muted-foreground/70">
                {timeStr}
              </span>
              <span className="line-clamp-2 text-[10px] text-foreground">
                {m.content.slice(0, 60).replace(/[#*]/g, "")}
              </span>
            </div>
          );
        })}
        {memosQuery.data?.memos.length === 0 && (
          <div className="py-2 text-center text-[10px] text-muted-foreground/60">
            这天还没有记录
          </div>
        )}
      </div>

      {/* Upcoming events */}
      {events.slice(0, 2).map((ev) => (
        <div
          className="mt-1.5 flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5"
          key={ev.name}
        >
          <span className="text-[10px] font-medium text-foreground">
            {ev.name}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {ev.days === 0 ? "今天" : `${ev.days} 天后`}
          </span>
        </div>
      ))}
    </div>
  );
}
