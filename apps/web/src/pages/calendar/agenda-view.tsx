import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CircleIcon,
  FileTextIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { listTasks, type Task } from "@/api";
import { QueryErrorState } from "@/components/query-error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { formatDayTitle, formatFullDayHeader } from "@/lib/calendar-date";
import { cn } from "@/lib/utils";

export function AgendaView({
  today,
  calendarNotes,
  onDaySelect,
}: {
  today: string;
  calendarNotes: Array<{ date: string; count: number }>;
  onDaySelect: (dayKey: string) => void;
}) {
  const { locale, t } = useI18n();
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  // Map notes per date
  const notesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of calendarNotes) {
      map.set(item.date, item.count);
    }
    return map;
  }, [calendarNotes]);

  // Aggregate all active dates from tasks and notes
  const groups = useMemo(() => {
    const tasksByDay = new Map<string, Task[]>();
    for (const task of tasksQuery.data?.tasks ?? []) {
      if (!task.due_at || task.status === "done") continue;
      const list = tasksByDay.get(task.due_at) ?? [];
      list.push(task);
      tasksByDay.set(task.due_at, list);
    }

    const allDates = new Set<string>([
      ...tasksByDay.keys(),
      ...notesByDay.keys(),
    ]);

    const keys = [...allDates].sort();
    const overdue = keys.filter((key) => key < today);
    const upcoming = keys.filter((key) => key >= today);

    return [...overdue, ...upcoming].map((key) => ({
      key,
      overdue: key < today,
      tasks: tasksByDay.get(key) ?? [],
      notesCount: notesByDay.get(key) ?? 0,
    }));
  }, [tasksQuery.data, notesByDay, today]);

  const unscheduled = useMemo(
    () =>
      (tasksQuery.data?.tasks ?? []).filter(
        (task) => !task.due_at && task.status !== "done",
      ),
    [tasksQuery.data],
  );

  return (
    <Card className="border-border/60 bg-card shadow-xs">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <h2 className="font-heading text-base font-semibold text-foreground">
            {t("calendar.agendaTitle")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {groups.length} {t("calendar.viewMonth")}
          </span>
        </div>

        {tasksQuery.isError && !tasksQuery.data ? (
          <QueryErrorState
            className="text-muted-foreground py-8"
            isRetrying={tasksQuery.isRefetching}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-border/60">
            {groups.length === 0 &&
              unscheduled.length === 0 &&
              !tasksQuery.isLoading && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t("calendar.agendaEmpty")}
                </div>
              )}

            {/* Unscheduled Tasks Section */}
            {unscheduled.length > 0 && (
              <div className="py-3">
                <button
                  aria-expanded={unscheduledOpen}
                  className="flex w-full items-center gap-2 text-left"
                  type="button"
                  onClick={() => setUnscheduledOpen((value) => !value)}
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150",
                      !unscheduledOpen && "-rotate-90 rtl:rotate-90",
                    )}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("calendar.agendaUnscheduled")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("calendar.dayTasks", { count: unscheduled.length })}
                  </span>
                </button>
                {unscheduledOpen && (
                  <div className="mt-2 flex flex-col gap-1 pl-6">
                    {unscheduled.map((task) => (
                      <div
                        className="flex items-center justify-between rounded-md p-1.5 text-xs text-muted-foreground hover:bg-muted/40"
                        key={task.id}
                      >
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chronological Day Groups */}
            {groups.map((group) => (
              <div className="py-3.5" key={group.key}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="flex items-center gap-2 text-left group"
                    type="button"
                    onClick={() => onDaySelect(group.key)}
                  >
                    <span
                      className={cn(
                        "font-heading text-sm font-semibold transition-colors group-hover:text-brand-500",
                        group.overdue ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {group.key === today
                        ? t("calendar.todayTitle")
                        : formatDayTitle(group.key, locale)}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      ({formatFullDayHeader(group.key, locale)})
                    </span>
                    {group.overdue && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        {t("calendar.overdue")}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    {group.notesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-600 dark:text-brand-400">
                        <FileTextIcon className="size-3" />
                        <span>
                          {t("calendar.notesCount", {
                            count: group.notesCount,
                          })}
                        </span>
                      </span>
                    )}
                    {group.tasks.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <span>
                          {t("calendar.dayTasks", {
                            count: group.tasks.length,
                          })}
                        </span>
                      </span>
                    )}
                    <Button
                      className="size-7"
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      onClick={() => onDaySelect(group.key)}
                    >
                      <ArrowRightIcon className="size-3.5 rtl:-rotate-180" />
                    </Button>
                  </div>
                </div>

                {/* Task list for this day */}
                {group.tasks.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 pl-4">
                    {group.tasks.map((task) => (
                      <div
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                        key={task.id}
                      >
                        <CircleIcon className="size-3 text-muted-foreground/60 shrink-0" />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
