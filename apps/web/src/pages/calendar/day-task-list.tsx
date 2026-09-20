import {
  CheckCircle2Icon,
  CircleIcon,
  GripVerticalIcon,
  ListTodoIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Task } from "@/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { addDays, nextDay } from "@/lib/calendar-date";
import { cn } from "@/lib/utils";

/**
 * The day panel's task rows: completion toggle, HTML5 drag handle (the calendar
 * grid is the drop target), the reschedule menu, and delete. The custom date
 * input below the presets is one shared field for every row, exactly as it was
 * when this lived inside the inspector — it re-seeds whenever the day changes.
 */
export function DayTaskList({
  day,
  today,
  tasks,
  noteTasks,
  onTaskDragStart,
  onTaskToggleDone,
  onTaskReschedule,
  onTaskDelete,
}: {
  day: string;
  today: string;
  tasks: Task[];
  noteTasks: number;
  onTaskDragStart: (task: Task | null) => void;
  onTaskToggleDone: (task: Task) => void;
  onTaskReschedule: (task: Task, newDate: string | null) => void;
  onTaskDelete: (task: Task) => void;
}) {
  const { t } = useI18n();
  const [customDate, setCustomDate] = useState(day);
  useEffect(() => {
    setCustomDate(day);
  }, [day]);

  return (
    <>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ListTodoIcon className="size-3.5 text-primary" />
          {t("calendar.filterTasks")} ({tasks.length})
        </span>
        {noteTasks > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("calendar.dayNoteTasks", { count: noteTasks })}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {t("calendar.dueEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => {
            const done = task.status === "done";
            const overdue =
              !done && task.due_at !== null && task.due_at < today;
            return (
              <li
                className={cn(
                  "group flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/60",
                  overdue && "border-destructive/30 bg-destructive/5",
                )}
                draggable={!done}
                key={task.id}
                onDragEnd={() => onTaskDragStart(null)}
                onDragStart={() => onTaskDragStart(task)}
                title={t("calendar.dragHint")}
              >
                <GripVerticalIcon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground/40",
                    !done && "cursor-grab group-hover:text-muted-foreground",
                  )}
                />
                <button
                  aria-label={
                    done ? t("projects.status.todo") : t("projects.status.done")
                  }
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  type="button"
                  onClick={() => onTaskToggleDone(task)}
                >
                  {done ? (
                    <CheckCircle2Icon className="size-4 text-primary" />
                  ) : (
                    <CircleIcon
                      className={cn("size-4", overdue && "text-destructive")}
                    />
                  )}
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-medium",
                    done && "text-muted-foreground line-through font-normal",
                  )}
                >
                  {task.title}
                </span>
                {overdue && (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                    {t("calendar.overdue")}
                  </span>
                )}

                {/* Reschedule Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    type="button"
                  >
                    {t("calendar.reschedule")}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 text-xs">
                    <DropdownMenuItem
                      onClick={() => onTaskReschedule(task, today)}
                    >
                      {t("calendar.rescheduleToday")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onTaskReschedule(task, nextDay(today))}
                    >
                      {t("calendar.rescheduleTomorrow")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onTaskReschedule(task, addDays(today, 7))}
                    >
                      {t("calendar.rescheduleNextWeek")}
                    </DropdownMenuItem>
                    <div className="border-t border-border/60 p-1.5">
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        {t("calendar.reschedulePickDate")}
                      </span>
                      <div className="flex items-center gap-1">
                        <Input
                          aria-label={t("calendar.reschedulePickDate")}
                          className="h-6 text-[11px] px-1"
                          type="date"
                          value={customDate}
                          onChange={(e) => setCustomDate(e.target.value)}
                        />
                        <Button
                          size="xs"
                          type="button"
                          onClick={() =>
                            onTaskReschedule(task, customDate || null)
                          }
                        >
                          {t("common.save")}
                        </Button>
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Delete Task */}
                <button
                  aria-label={t("calendar.deleteTask")}
                  className="rounded p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  type="button"
                  onClick={() => onTaskDelete(task)}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
