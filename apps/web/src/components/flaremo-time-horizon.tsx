import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  Columns3Icon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { MemoStatsResponse, Task } from "@/api";
import { listMemos, listTasks } from "@/api";
import type { Memo } from "@/api/types";
import { Button } from "@/components/ui/button";
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

export type TimeHorizonMode = "year" | "month" | "week" | "day";

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

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function parseDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

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
  const [mode, setMode] = useState<TimeHorizonMode>("month");
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(
    monthOf(today),
  );
  const [currentWeekBase, setCurrentWeekBase] = useState<string>(today);

  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";

  // Map notes count by day key
  const notesCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of stats.activity) {
      if (entry.count > 0) {
        map.set(entry.date, entry.count);
      }
    }
    return map;
  }, [stats.activity]);

  // Tasks query for due items
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
    staleTime: 30_000,
  });

  const tasksMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasksQuery.data?.tasks ?? []) {
      if (!task.due_at || task.status === "done") continue;
      const list = map.get(task.due_at) ?? [];
      list.push(task);
      map.set(task.due_at, list);
    }
    return map;
  }, [tasksQuery.data]);

  // Query memos for the selected day to show real content cards
  const memosForDayQuery = useQuery({
    queryKey: ["memos-for-day", selectedDay],
    queryFn: () => listMemos({ q: dayFilterQuery(selectedDay), page_size: 4 }),
    enabled: Boolean(selectedDay),
    staleTime: 30_000,
  });

  const selectedDayMemos = memosForDayQuery.data?.memos ?? [];
  const selectedDayTasks = tasksMap.get(selectedDay) ?? [];
  const selectedDateObj = useMemo(
    () => parseDayKey(selectedDay),
    [selectedDay],
  );
  const selectedLunar = useMemo(
    () => getLunarDateInfo(selectedDateObj),
    [selectedDateObj],
  );

  // Upcoming countdown events (e.g. 秋分 3天, 中秋 5天)
  const upcomingEvents = useMemo(
    () => getUpcomingEvents(selectedDateObj, 2),
    [selectedDateObj],
  );

  const handleSelectDay = (day: string) => {
    setSelectedDay(day);
    setCurrentMonthKey(monthOf(day));
    setCurrentWeekBase(day);
    onDaySelect?.(day);
  };

  const jumpToTimeline = (day: string) => {
    handleSelectDay(day);
    if (!onDaySelect) {
      void navigate({ to: `/?q=${encodeURIComponent(dayFilterQuery(day))}` });
    }
    onNavigate?.();
  };

  return (
    <div className={cn("flex flex-col select-none", className)}>
      {/* 4-Horizon Switcher: [ 年 | 月 | 周 | 日 ] */}
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium text-foreground">
          {mode === "year"
            ? `${selectedDateObj.getFullYear()}年 活跃罗盘`
            : mode === "month"
              ? formatMonthTitle(currentMonthKey, locale)
              : mode === "week"
                ? `${selectedDateObj.getMonth() + 1}月 第${getWeekNumber(parseDayKey(currentWeekBase))}周`
                : `${selectedDateObj.getMonth() + 1}月${selectedDateObj.getDate()}日`}
        </span>

        <div
          aria-label={t("explorer.timeViewLabel")}
          className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5"
          role="tablist"
        >
          {(
            [
              ["year", "年", CalendarRangeIcon],
              ["month", "月", CalendarDaysIcon],
              ["week", "周", Columns3Icon],
              ["day", "日", CalendarIcon],
            ] as const
          ).map(([tabMode, label, Icon]) => {
            const isSelected = mode === tabMode;
            const todayNum = new Date().getDate();
            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  "relative flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-all duration-150",
                  isSelected
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={tabMode}
                role="tab"
                type="button"
                onClick={() => setMode(tabMode)}
              >
                {tabMode === "day" ? (
                  <span className="relative flex size-3.5 items-center justify-center font-mono text-[10px] font-bold leading-none">
                    {todayNum}
                  </span>
                ) : (
                  <Icon className="size-3 shrink-0" />
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- Day Horizon (日视图) --- */}
      {mode === "day" && (
        <DayHorizonView
          events={upcomingEvents}
          handleSelectDay={handleSelectDay}
          jumpToTimeline={jumpToTimeline}
          lunar={selectedLunar}
          memos={selectedDayMemos}
          selectedDay={selectedDay}
          streak={streak}
          tasks={selectedDayTasks}
          today={today}
          onDayChange={(step) => {
            const newDay =
              step > 0 ? nextDay(selectedDay) : prevDay(selectedDay);
            handleSelectDay(newDay);
          }}
        />
      )}

      {/* --- Week Horizon (周视图) --- */}
      {mode === "week" && (
        <WeekHorizonView
          baseDay={currentWeekBase}
          events={upcomingEvents}
          handleSelectDay={handleSelectDay}
          jumpToTimeline={jumpToTimeline}
          lunar={selectedLunar}
          memos={selectedDayMemos}
          notesCountMap={notesCountMap}
          selectedDay={selectedDay}
          tasks={selectedDayTasks}
          tasksMap={tasksMap}
          today={today}
          weekStart={weekStart}
          onWeekChange={(step) => {
            const base = parseDayKey(currentWeekBase);
            base.setDate(base.getDate() + step * 7);
            const nextKey = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
            setCurrentWeekBase(nextKey);
            handleSelectDay(nextKey);
          }}
        />
      )}

      {/* --- Month Horizon (月视图) --- */}
      {mode === "month" && (
        <MonthHorizonView
          events={upcomingEvents}
          handleSelectDay={handleSelectDay}
          hoveredDate={hoveredDate}
          jumpToTimeline={jumpToTimeline}
          locale={locale}
          lunar={selectedLunar}
          memos={selectedDayMemos}
          monthKey={currentMonthKey}
          monthLabels={monthLabels}
          notesCountMap={notesCountMap}
          selectedDay={selectedDay}
          stats={stats}
          tasks={selectedDayTasks}
          tasksMap={tasksMap}
          today={today}
          weekStart={weekStart}
          onHoverDate={onHoverDate}
          onMonthChange={(step) => {
            const nextMonth = addMonths(step, `${currentMonthKey}-01`);
            setCurrentMonthKey(monthOf(nextMonth));
          }}
        />
      )}

      {/* --- Year Horizon (年视图) --- */}
      {mode === "year" && (
        <YearHorizonView
          currentMonthKey={currentMonthKey}
          handleSelectDay={(day) => {
            handleSelectDay(day);
            setMode("month");
          }}
          monthLabels={monthLabels}
          notesCountMap={notesCountMap}
          onDrillMonth={(mKey) => {
            setCurrentMonthKey(mKey);
            setMode("month");
          }}
          selectedYear={selectedDateObj.getFullYear()}
          stats={stats}
          streak={streak}
          today={today}
        />
      )}
    </div>
  );
});

// ============================================================================
// 1. Day Horizon (日视图)
// ============================================================================
function DayHorizonView({
  selectedDay,
  today,
  streak,
  lunar,
  memos,
  tasks: _tasks,
  events,
  handleSelectDay: _handleSelectDay,
  jumpToTimeline,
  onDayChange,
}: {
  selectedDay: string;
  today: string;
  streak: number;
  lunar: ReturnType<typeof getLunarDateInfo>;
  memos: Memo[];
  tasks: Task[];
  events: ReturnType<typeof getUpcomingEvents>;
  handleSelectDay: (day: string) => void;
  jumpToTimeline: (day: string) => void;
  onDayChange: (step: number) => void;
}) {
  const isToday = selectedDay === today;
  const dayNum = Number(selectedDay.split("-")[2]);

  return (
    <div className="flex flex-col gap-2.5 motion-safe:animate-fade">
      {/* Hero Day Card (Inspired by Screenshot 1) */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-card/80 to-muted/30 p-3 shadow-2xs">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              {selectedDay.slice(0, 7).replace("-", " / ")}
            </span>
            <div className="font-serif text-5xl font-bold tracking-tight text-foreground">
              {dayNum}
            </div>
          </div>

          <div className="flex flex-col items-end text-right">
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <span>{lunar.weekday}</span>
              <div className="flex items-center gap-0.5">
                <Button
                  aria-label="前一天"
                  className="size-5 p-0"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => onDayChange(-1)}
                >
                  <ChevronLeftIcon className="size-3" />
                </Button>
                <Button
                  aria-label="后一天"
                  className="size-5 p-0"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => onDayChange(1)}
                >
                  <ChevronRightIcon className="size-3" />
                </Button>
              </div>
            </div>
            <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
              {lunar.lunarMonth}
              {lunar.lunarDay}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lunar.cyclicalYear}
            </span>
          </div>
        </div>

        {/* Sentiment & Status Line */}
        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
          <span className="italic text-muted-foreground">
            {isToday ? "街角慢度时光 · 记录此刻所思" : "翻阅时光篇章"}
          </span>
          {isToday && streak > 0 && (
            <span className="flex items-center gap-1 font-medium text-brand-700 dark:text-brand-300">
              <SparklesIcon className="size-3 text-brand-500" />
              连记 {streak} 天
            </span>
          )}
        </div>
      </div>

      {/* Memos on this Day */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
          <span>当日记录 ({memos.length})</span>
          <button
            className="text-brand-600 dark:text-brand-400 hover:underline"
            type="button"
            onClick={() => jumpToTimeline(selectedDay)}
          >
            查看全部
          </button>
        </div>

        {memos.length > 0 ? (
          <div className="flex flex-col gap-1">
            {memos.map((m) => (
              <button
                className="group flex flex-col rounded-lg border border-border/50 bg-card/60 p-2 text-left transition-colors hover:border-brand-500/40 hover:bg-card"
                key={m.id}
                type="button"
                onClick={() => jumpToTimeline(selectedDay)}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ClockIcon className="size-3 shrink-0" />
                  <span>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {m.content.trim() || "无文字内容"}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border/60 p-2 text-xs text-muted-foreground">
            <span>今天暂无笔迹</span>
            <Button
              className="h-6 gap-1 px-2 text-xs"
              size="xs"
              type="button"
              variant="outline"
              onClick={() => jumpToTimeline(selectedDay)}
            >
              <PlusIcon className="size-3" />
              记一笔
            </Button>
          </div>
        )}
      </div>

      {/* Upcoming Festivals & Solar Terms (like Screenshot 1 bottom cards) */}
      {events.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="px-1 text-xs font-medium text-muted-foreground">
            临近节令与日程
          </div>
          <div className="flex flex-col gap-1">
            {events.map((evt) => (
              <div
                className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/30"
                key={evt.name}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {evt.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {evt.formattedDate} · {evt.weekday}
                  </span>
                </div>
                <span className="rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {evt.days}天
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. Week Horizon (周视图)
// ============================================================================
function WeekHorizonView({
  baseDay,
  selectedDay,
  today,
  weekStart,
  notesCountMap,
  tasksMap,
  lunar,
  memos,
  tasks,
  events: _events,
  handleSelectDay,
  jumpToTimeline,
  onWeekChange,
}: {
  baseDay: string;
  selectedDay: string;
  today: string;
  weekStart: WeekStart;
  notesCountMap: Map<string, number>;
  tasksMap: Map<string, Task[]>;
  lunar: ReturnType<typeof getLunarDateInfo>;
  memos: Memo[];
  tasks: Task[];
  events: ReturnType<typeof getUpcomingEvents>;
  handleSelectDay: (day: string) => void;
  jumpToTimeline: (day: string) => void;
  onWeekChange: (step: number) => void;
}) {
  const weekGrid = useMemo(
    () => buildWeekGrid(baseDay, weekStart),
    [baseDay, weekStart],
  );
  const weekdays = useMemo(
    () => ["一", "二", "三", "四", "五", "六", "日"],
    [],
  );

  return (
    <div className="flex flex-col gap-2.5 motion-safe:animate-fade">
      {/* Week Navigator Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <Button
            aria-label="上一周"
            className="size-5 p-0"
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => onWeekChange(-1)}
          >
            <ChevronLeftIcon className="size-3" />
          </Button>
          <span className="text-xs font-semibold text-foreground">
            {weekGrid[0].key.slice(5)} 至 {weekGrid[6].key.slice(5)}
          </span>
          <Button
            aria-label="下一周"
            className="size-5 p-0"
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => onWeekChange(1)}
          >
            <ChevronRightIcon className="size-3" />
          </Button>
        </div>
        <Button
          className="h-5 px-1.5 text-[11px]"
          size="xs"
          type="button"
          variant="ghost"
          onClick={() => handleSelectDay(today)}
        >
          本周
        </Button>
      </div>

      {/* 7-Day Horizontal Compass (Inspired by Screenshot 2) */}
      <div className="grid grid-cols-7 gap-1 rounded-xl border border-border/60 bg-muted/20 p-1.5">
        {weekGrid.map((day, idx) => {
          const isSelected = day.key === selectedDay;
          const isToday = day.key === today;
          const dateObj = parseDayKey(day.key);
          const dayNum = dateObj.getDate();
          const dayLunar = getLunarDateInfo(dateObj);
          const notesCount = notesCountMap.get(day.key) ?? 0;
          const hasTask = (tasksMap.get(day.key)?.length ?? 0) > 0;

          return (
            <button
              className={cn(
                "flex flex-col items-center justify-between rounded-lg py-1.5 transition-all",
                isSelected
                  ? "bg-brand-500 text-white shadow-xs font-semibold"
                  : isToday
                    ? "bg-brand-500/15 text-brand-900 dark:text-brand-200"
                    : "hover:bg-muted/60 text-foreground",
              )}
              key={day.key}
              type="button"
              onClick={() => handleSelectDay(day.key)}
            >
              <span className="text-[11px] opacity-70">{weekdays[idx]}</span>
              <span className="text-sm font-bold leading-tight">{dayNum}</span>
              <span className="text-[10px] opacity-80 scale-90">
                {dayLunar.label.slice(0, 2)}
              </span>

              {/* Status indicator dot */}
              <div className="mt-0.5 flex size-1 items-center justify-center">
                {notesCount > 0 ? (
                  <span
                    className={cn(
                      "size-1 rounded-full",
                      isSelected ? "bg-white" : "bg-brand-500",
                    )}
                  />
                ) : hasTask ? (
                  <span
                    className={cn(
                      "size-1 rounded-full",
                      isSelected ? "bg-white" : "bg-destructive",
                    )}
                  />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Timeline of the Selected Day in Week View */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="font-semibold text-foreground">
            {selectedDay} · {lunar.weekday} · {lunar.label}
          </span>
          <button
            className="text-brand-600 dark:text-brand-400 hover:underline"
            type="button"
            onClick={() => jumpToTimeline(selectedDay)}
          >
            去往时间线
          </button>
        </div>

        {memos.length > 0 || tasks.length > 0 ? (
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {tasks.map((t) => (
              <div
                className="flex items-center gap-2 rounded-lg border border-border/40 bg-card p-2 text-xs"
                key={t.id}
              >
                <CircleIcon className="size-3 text-brand-500" />
                <span className="line-clamp-1 font-medium text-foreground">
                  {t.title}
                </span>
              </div>
            ))}
            {memos.map((m) => (
              <button
                className="group flex flex-col rounded-lg border border-border/50 bg-card/60 p-2 text-left transition-colors hover:border-brand-500/40 hover:bg-card"
                key={m.id}
                type="button"
                onClick={() => jumpToTimeline(selectedDay)}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ClockIcon className="size-3 shrink-0" />
                  <span>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {m.content.trim() || "无文字内容"}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border/60 p-2.5 text-xs text-muted-foreground">
            <span>该日无待办与笔迹</span>
            <Button
              className="h-6 gap-1 px-2 text-xs"
              size="xs"
              type="button"
              variant="outline"
              onClick={() => jumpToTimeline(selectedDay)}
            >
              <PlusIcon className="size-3" />
              记一笔
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 3. Month Horizon (月视图)
// ============================================================================
function MonthHorizonView({
  monthKey,
  monthLabels,
  selectedDay,
  today,
  weekStart,
  notesCountMap,
  tasksMap,
  lunar,
  memos,
  tasks: _tasks,
  events,
  stats,
  hoveredDate,
  locale,
  handleSelectDay,
  jumpToTimeline,
  onMonthChange,
  onHoverDate,
}: {
  monthKey: string;
  monthLabels: Array<{ date: string; label: string }>;
  selectedDay: string;
  today: string;
  weekStart: WeekStart;
  notesCountMap: Map<string, number>;
  tasksMap: Map<string, Task[]>;
  lunar: ReturnType<typeof getLunarDateInfo>;
  memos: Memo[];
  tasks: Task[];
  events: ReturnType<typeof getUpcomingEvents>;
  stats: MemoStatsResponse;
  hoveredDate?: string | null;
  locale: string;
  handleSelectDay: (day: string) => void;
  jumpToTimeline: (day: string) => void;
  onMonthChange: (step: number) => void;
  onHoverDate?: (dayKey: string | null) => void;
}) {
  const monthGrid = useMemo(
    () => buildMonthGrid(monthKey, weekStart, true),
    [monthKey, weekStart],
  );
  const weekdays = useMemo(
    () => weekdayHeaders(weekStart, locale, "narrow"),
    [weekStart, locale],
  );

  return (
    <div className="flex flex-col gap-2 motion-safe:animate-fade">
      {/* Month Navigator Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <Button
            aria-label="上个月"
            className="size-5 p-0"
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => onMonthChange(-1)}
          >
            <ChevronLeftIcon className="size-3" />
          </Button>
          <span className="text-xs font-semibold text-foreground">
            {formatMonthTitle(monthKey, locale)}
          </span>
          <Button
            aria-label="下个月"
            className="size-5 p-0"
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => onMonthChange(1)}
          >
            <ChevronRightIcon className="size-3" />
          </Button>
        </div>
        <Button
          className="h-5 px-1.5 text-[11px]"
          size="xs"
          type="button"
          variant="ghost"
          onClick={() => handleSelectDay(today)}
        >
          今天
        </Button>
      </div>

      {/* Weekday Row */}
      <div className="grid grid-cols-7 text-[11px] font-medium text-muted-foreground/80">
        {weekdays.map((label) => (
          <span className="py-0.5 text-center" key={label}>
            {label}
          </span>
        ))}
      </div>

      {/* Month Grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthGrid.map((day) => {
          const isSelected = day.key === selectedDay;
          const isToday = day.key === today;
          const notesCount = notesCountMap.get(day.key) ?? 0;
          const taskCount = tasksMap.get(day.key)?.length ?? 0;
          const dateObj = parseDayKey(day.key);
          const dayNum = dateObj.getDate();
          const dayLunar = getLunarDateInfo(dateObj);

          let heatStyle = "";
          if (!isSelected && !isToday && notesCount > 0) {
            heatStyle =
              notesCount >= 3
                ? "bg-brand-500/40 text-brand-950 dark:text-brand-50 font-semibold"
                : notesCount === 2
                  ? "bg-brand-500/25 text-brand-900 dark:text-brand-100 font-medium"
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
                hoveredDate === day.key &&
                  "ring-1.5 ring-brand-500 scale-105 z-10",
              )}
              key={day.key}
              type="button"
              onClick={() => handleSelectDay(day.key)}
              onMouseEnter={() => onHoverDate?.(day.key)}
              onMouseLeave={() => onHoverDate?.(null)}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full text-[11px] tabular-nums",
                  heatStyle,
                )}
              >
                {dayNum}
              </span>
              <span
                className={cn(
                  "text-[9px] leading-tight scale-90",
                  isSelected ? "text-white/90" : "text-muted-foreground",
                )}
              >
                {taskCount > 0 && day.key < today
                  ? "!"
                  : dayLunar.label.slice(0, 2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Day Detail Card (Resolving bottom empty space - Inspired by Screenshot 3) */}
      <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground">
              {lunar.label} · {selectedDay.slice(5)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lunar.fullLabel} · {lunar.weekday}
            </span>
          </div>
          <button
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            type="button"
            onClick={() => jumpToTimeline(selectedDay)}
          >
            打开此日
          </button>
        </div>

        {/* Memos snippet on selected day */}
        {memos.length > 0 ? (
          <div className="flex flex-col gap-1">
            {memos.slice(0, 2).map((m) => (
              <div
                className="flex items-center justify-between gap-1.5 text-xs text-foreground/90"
                key={m.id}
              >
                <span className="line-clamp-1 flex-1">{m.content.trim()}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            当日暂无笔记记录
          </span>
        )}

        {/* Events countdown */}
        {events.length > 0 && (
          <div className="mt-0.5 flex items-center justify-between border-t border-border/30 pt-1 text-[11px]">
            <span className="text-muted-foreground">临近节令</span>
            <span className="font-medium text-brand-700 dark:text-brand-300">
              {events[0].name} · {events[0].days}天后
            </span>
          </div>
        )}
      </div>

      {/* 12-Week Heatmap Strip */}
      <div className="mt-1 border-t border-border/40 pt-1.5">
        <div
          className="grid grid-flow-col grid-rows-7 gap-[1.5px]"
          data-testid="activity-heatmap"
        >
          {stats.activity.map((day) => (
            <button
              className={cn(
                "h-1.5 w-full rounded-[1px] transition-all hover:opacity-85",
                heatmapColor(day.count),
                hoveredDate === day.date &&
                  "scale-150 ring-1 ring-brand-500 z-10 brightness-125",
              )}
              key={day.date}
              type="button"
              onClick={() => handleSelectDay(day.date)}
              onMouseEnter={() => onHoverDate?.(day.date)}
              onMouseLeave={() => onHoverDate?.(null)}
            />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-1 flex items-center justify-between text-xs text-muted-foreground/70"
        >
          {monthLabels
            .filter((month) => Boolean(month.label))
            .map((month) => (
              <span className="whitespace-nowrap" key={month.date}>
                {month.label}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. Year Horizon (年视图 - 12 Month Matrix inspired by Screenshot 4)
// ============================================================================
function YearHorizonView({
  selectedYear,
  today,
  streak,
  stats,
  notesCountMap,
  currentMonthKey,
  monthLabels,
  handleSelectDay,
  onDrillMonth,
}: {
  selectedYear: number;
  today: string;
  streak: number;
  stats: MemoStatsResponse;
  notesCountMap: Map<string, number>;
  currentMonthKey: string;
  monthLabels: Array<{ date: string; label: string }>;
  handleSelectDay: (day: string) => void;
  onDrillMonth: (monthKey: string) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const activeDays = useMemo(
    () => stats.activity.filter((d) => d.count > 0).length,
    [stats.activity],
  );

  return (
    <div className="flex flex-col gap-2.5 motion-safe:animate-fade">
      {/* Annual Summary Card */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="font-serif text-xl font-bold tracking-tight text-foreground">
            {selectedYear} 年
          </span>
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
            活跃全景
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 divide-x divide-border/60 text-center text-xs">
          <div>
            <div className="font-bold text-foreground">
              {stats.counts.total}
            </div>
            <div className="text-[11px] text-muted-foreground">总记录</div>
          </div>
          <div>
            <div className="font-bold text-foreground">{activeDays}</div>
            <div className="text-[11px] text-muted-foreground">活跃天</div>
          </div>
          <div>
            <div className="font-bold text-foreground">{streak}</div>
            <div className="text-[11px] text-muted-foreground">连记天</div>
          </div>
        </div>
      </div>

      {/* 12-Month Matrix (3 cols x 4 rows) */}
      <div className="grid grid-cols-3 gap-1.5">
        {months.map((m) => {
          const mStr = String(m).padStart(2, "0");
          const mKey = `${selectedYear}-${mStr}`;
          const isCurrentMonth = mKey === currentMonthKey;
          const monthGrid = buildMonthGrid(mKey, "monday", true);

          return (
            <button
              className={cn(
                "flex flex-col rounded-lg border p-1.5 text-left transition-all hover:border-brand-500/60 hover:bg-card",
                isCurrentMonth
                  ? "border-brand-500/50 bg-card shadow-2xs"
                  : "border-border/40 bg-muted/10",
              )}
              key={mKey}
              type="button"
              onClick={() => onDrillMonth(mKey)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-bold",
                    isCurrentMonth
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-foreground",
                  )}
                >
                  {m}月
                </span>
                {isCurrentMonth && (
                  <span className="size-1.5 rounded-full bg-brand-500" />
                )}
              </div>

              {/* Miniature month dots */}
              <div className="mt-1 grid grid-cols-7 gap-0.5">
                {monthGrid.slice(0, 28).map((d) => {
                  const hasNote = (notesCountMap.get(d.key) ?? 0) > 0;
                  const isDayToday = d.key === today;
                  return (
                    <span
                      className={cn(
                        "size-1 rounded-[0.5px]",
                        !d.inMonth
                          ? "opacity-10 bg-muted-foreground"
                          : isDayToday
                            ? "bg-brand-600 dark:bg-brand-400 ring-1 ring-brand-500"
                            : hasNote
                              ? "bg-brand-500"
                              : "bg-muted-foreground/20",
                      )}
                      key={d.key}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Annual Full Heatmap Ribbon */}
      <div className="rounded-lg border border-border/40 bg-muted/10 p-2">
        <div
          className="grid grid-flow-col grid-rows-7 gap-1"
          data-testid="activity-heatmap"
        >
          {stats.activity.map((day) => (
            <button
              className={cn(
                "aspect-square w-full rounded-[2px] transition-all hover:opacity-90",
                heatmapColor(day.count),
              )}
              key={day.date}
              type="button"
              onClick={() => handleSelectDay(day.date)}
            />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="mt-1.5 flex items-center justify-between px-0.5 text-xs text-muted-foreground/70"
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
    </div>
  );
}
