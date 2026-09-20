import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listTasks, type Task, updateTask } from "@/api";
import { FlareMoCalendar } from "@/components/flaremo-calendar";
import { QueryErrorState } from "@/components/query-error-state";
import { SubpageHeader } from "@/components/subpage-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import {
  addMonths,
  formatMonthTitle,
  monthOf,
  nextDay,
  prevDay,
  todayKey,
  type WeekStart,
} from "@/lib/calendar-date";
import { errorMessage } from "@/lib/error";
import { cn, stripResourceName } from "@/lib/utils";
import { AgendaView } from "./calendar/agenda-view";
import { DayInspector } from "./calendar/day-inspector";
import { useCalendarDays } from "./calendar/use-calendar-days";

export function CalendarPage({ initialDate }: { initialDate?: string }) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKey(), []);
  const [cursor, setCursor] = useState(() => initialDate ?? today);
  const [selected, setSelected] = useState(() => initialDate ?? today);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");

  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";
  const monthKey = monthOf(cursor);

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["tasks"],
      queryFn: () => listTasks(),
    });
  }, [queryClient]);

  const { calendarQuery, data, monthStats } = useCalendarDays({
    monthKey,
    weekStart,
  });

  const selectedCell = data.get(selected);
  const selectedTasks = selectedCell?.tasks ?? [];

  function invalidateCalendar() {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <div className="min-h-svh bg-background px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <SubpageHeader
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Month navigation stepper */}
              <div className="flex items-center rounded-lg border border-border/60 bg-card p-0.5 shadow-2xs">
                <Button
                  aria-label={t("calendar.prevMonth")}
                  className="size-7"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = addMonths(-1, `${monthKey}-01`);
                    setCursor(next);
                  }}
                >
                  <ChevronLeftIcon className="size-3.5 rtl:-rotate-180" />
                </Button>
                <span className="px-2 text-xs font-semibold text-foreground">
                  {formatMonthTitle(monthKey, locale)}
                </span>
                <Button
                  aria-label={t("calendar.nextMonth")}
                  className="size-7"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = addMonths(1, `${monthKey}-01`);
                    setCursor(next);
                  }}
                >
                  <ChevronRightIcon className="size-3.5 rtl:-rotate-180" />
                </Button>
              </div>

              {/* Back to Today */}
              <Button
                className="h-8 text-xs font-medium"
                size="sm"
                variant={selected === today ? "secondary" : "outline"}
                type="button"
                onClick={() => {
                  setCursor(today);
                  setSelected(today);
                }}
              >
                {t("calendar.today")}
              </Button>

              {/* View Switcher */}
              <div
                aria-label={t("calendar.viewLabel")}
                className="flex rounded-lg border border-border/60 bg-card p-0.5 shadow-2xs"
                role="tablist"
              >
                {(
                  [
                    ["month", t("calendar.viewMonth")],
                    ["agenda", t("calendar.viewAgenda")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    aria-selected={viewMode === value}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium motion-safe:transition-all motion-safe:duration-150",
                      viewMode === value
                        ? "bg-accent text-accent-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    key={value}
                    role="tab"
                    type="button"
                    onClick={() => setViewMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          }
          subtitle={
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {t("calendar.monthStats", {
                notes: monthStats.notes,
                tasks: monthStats.tasks,
              })}
            </span>
          }
          title={t("calendar.title")}
        />

        {viewMode === "agenda" ? (
          <AgendaView
            calendarNotes={calendarQuery.data?.notes ?? []}
            today={today}
            onDaySelect={(dayKey) => {
              setSelected(dayKey);
              setCursor(dayKey);
              setViewMode("month");
            }}
          />
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Left: Main Month Calendar Card */}
            <div className="min-w-0 flex-1">
              <Card className="overflow-hidden border-border/60 bg-card shadow-xs">
                <CardContent className="p-4 sm:p-5">
                  {calendarQuery.isLoading ? (
                    <Skeleton className="h-[460px] w-full rounded-xl" />
                  ) : calendarQuery.isError && !calendarQuery.data ? (
                    <QueryErrorState
                      isRetrying={calendarQuery.isRefetching}
                      onRetry={() => void calendarQuery.refetch()}
                    />
                  ) : (
                    <FlareMoCalendar
                      data={data}
                      hideHeader
                      monthKey={monthKey}
                      selected={selected}
                      showTaskTitles
                      today={today}
                      onDayClick={(dayKey) => {
                        setSelected(dayKey);
                        setCursor(dayKey);
                      }}
                      onMonthChange={(direction) => {
                        const next = addMonths(direction, `${monthKey}-01`);
                        setCursor(next);
                      }}
                      onTaskDrop={(dayKey) => {
                        const task = dragTask;
                        setDragTask(null);
                        if (!task || task.due_at === dayKey) return;
                        void updateTask(stripResourceName(task.id, "tasks"), {
                          due_at: dayKey,
                        })
                          .then(() => {
                            invalidateCalendar();
                            if (dayKey < today) {
                              toast.warning(
                                t("calendar.toastRescheduledPast", {
                                  date: dayKey,
                                }),
                              );
                            } else {
                              toast.success(t("calendar.toastRescheduled"));
                            }
                          })
                          .catch((error) =>
                            toast.error(
                              errorMessage(error, t("calendar.actionFailed")),
                            ),
                          );
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Day Inspector Panel */}
            <div className="w-full shrink-0 lg:w-[410px] xl:w-[440px]">
              <div className="lg:sticky lg:top-6">
                <DayInspector
                  key={selected}
                  day={selected}
                  noteTasks={selectedCell?.note_tasks ?? 0}
                  notesCount={selectedCell?.notes ?? 0}
                  tasks={selectedTasks}
                  today={today}
                  onNextDay={() => {
                    const next = nextDay(selected);
                    setSelected(next);
                    if (monthOf(next) !== monthKey) setCursor(next);
                  }}
                  onPrevDay={() => {
                    const prev = prevDay(selected);
                    setSelected(prev);
                    if (monthOf(prev) !== monthKey) setCursor(prev);
                  }}
                  onTaskDragStart={setDragTask}
                  onTaskSaved={invalidateCalendar}
                  onToday={() => {
                    setSelected(today);
                    setCursor(today);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
