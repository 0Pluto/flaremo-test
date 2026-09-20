import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createTask,
  deleteTask,
  listMemos,
  type Task,
  updateTask,
} from "@/api";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import {
  dayFilterQuery,
  formatDayTitle,
  formatFullDayHeader,
} from "@/lib/calendar-date";
import { errorMessage } from "@/lib/error";
import { formatMemoTime } from "@/lib/memo";
import { cn, stripResourceName } from "@/lib/utils";
import { DayTaskList } from "./day-task-list";
import { QuickNoteComposer } from "./quick-note-composer";

export function DayInspector({
  day,
  today,
  tasks,
  noteTasks,
  notesCount,
  onTaskDragStart,
  onTaskSaved,
  onPrevDay,
  onNextDay,
  onToday,
}: {
  day: string;
  today: string;
  tasks: Task[];
  noteTasks: number;
  notesCount: number;
  onTaskDragStart: (task: Task | null) => void;
  onTaskSaved: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}) {
  const { locale, t } = useI18n();
  const [filter, setFilter] = useState<"all" | "notes" | "tasks">("all");

  // Fetch actual memos created on this day
  const dayFilter = useMemo(() => dayFilterQuery(day), [day]);
  const dayMemosQuery = useQuery({
    queryKey: ["memos", "day", day],
    queryFn: ({ signal }) => listMemos({ q: dayFilter, page_size: 50 }, signal),
    staleTime: 30_000,
  });

  const memos = dayMemosQuery.data?.memos ?? [];

  // Quick note creation for today
  const [showNoteComposer, setShowNoteComposer] = useState(false);

  // Quick add task
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // Task delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const isToday = day === today;

  const toggleDone = async (task: Task) => {
    try {
      await updateTask(stripResourceName(task.id, "tasks"), {
        status: task.status === "done" ? "todo" : "done",
      });
      onTaskSaved();
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    }
  };

  const rescheduleTask = async (task: Task, newDate: string | null) => {
    try {
      await updateTask(stripResourceName(task.id, "tasks"), {
        due_at: newDate,
      });
      onTaskSaved();
      if (newDate && newDate < today) {
        toast.warning(t("calendar.toastRescheduledPast", { date: newDate }));
      } else {
        toast.success(t("calendar.toastRescheduled"));
      }
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    }
  };

  const removeTask = async (task: Task) => {
    setDeleteTarget(null);
    try {
      await deleteTask(stripResourceName(task.id, "tasks"));
      onTaskSaved();
      toast.success(t("calendar.toastDeleted"));
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    }
  };

  const submitTask = async () => {
    const value = taskTitle.trim();
    if (!value) return;
    setCreatingTask(true);
    try {
      await createTask({
        title: value,
        due_at: day,
      });
      setTaskTitle("");
      onTaskSaved();
      toast.success(t("calendar.toastCreated"));
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card shadow-xs motion-safe:animate-fade">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Day Header */}
        <div className="flex flex-col gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                aria-label={t("calendar.prevDay")}
                className="size-7"
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={onPrevDay}
              >
                <ChevronLeftIcon className="size-3.5 rtl:-rotate-180" />
              </Button>
              <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                {formatDayTitle(day, locale)}
              </h2>
              {isToday ? (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-[color:var(--brand-gradient-foreground)] shadow-2xs">
                  {t("calendar.todayTitle")}
                </span>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
                  type="button"
                  onClick={onToday}
                >
                  {t("calendar.today")}
                </button>
              )}
              <Button
                aria-label={t("calendar.nextDay")}
                className="size-7"
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={onNextDay}
              >
                <ChevronRightIcon className="size-3.5 rtl:-rotate-180" />
              </Button>
            </div>

            {/* Quick Note Trigger */}
            <Button
              className="h-7 gap-1 px-2.5 text-xs font-medium"
              size="xs"
              type="button"
              variant="outline"
              onClick={() => setShowNoteComposer((v) => !v)}
            >
              <PlusIcon className="size-3" />
              {t("calendar.createNote")}
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="text-xs">{formatFullDayHeader(day, locale)}</span>
            <span>
              {t("calendar.notesCount", { count: memos.length || notesCount })}{" "}
              · {t("calendar.dayTasks", { count: tasks.length })}
            </span>
          </div>

          {/* Quick Note Composer (inline) */}
          <QuickNoteComposer
            open={showNoteComposer}
            onClose={() => setShowNoteComposer(false)}
          />
        </div>

        {/* Filter Tabs */}
        <div
          aria-label={t("calendar.filterAll")}
          className="flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs"
          role="tablist"
        >
          {(
            [
              [
                "all",
                t("calendar.filterAll"),
                (memos.length || notesCount) + tasks.length,
              ],
              ["notes", t("calendar.filterNotes"), memos.length || notesCount],
              ["tasks", t("calendar.filterTasks"), tasks.length],
            ] as const
          ).map(([val, label, count]) => (
            <button
              aria-selected={filter === val}
              className={cn(
                "flex-1 rounded-md py-1 text-center text-xs font-medium motion-safe:transition-all motion-safe:duration-150",
                filter === val
                  ? "bg-card font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={val}
              role="tab"
              type="button"
              onClick={() => setFilter(val)}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Content Stream */}
        <div className="flex flex-col gap-4 max-h-[580px] overflow-y-auto pr-1">
          {/* Section: Notes / Records */}
          {(filter === "all" || filter === "notes") && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileTextIcon className="size-3.5 text-brand-500" />
                  {t("calendar.filterNotes")} ({memos.length})
                </span>
                {memos.length > 0 && (
                  <Link
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    search={{
                      q: dayFilter,
                      compose: undefined,
                      space: undefined,
                      tag: undefined,
                      untagged: undefined,
                      view: undefined,
                    }}
                    to="/"
                  >
                    <span>{t("calendar.viewDayNotes")}</span>
                    <ArrowRightIcon className="size-3 rtl:-rotate-180" />
                  </Link>
                )}
              </div>

              {dayMemosQuery.isLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              ) : memos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    {t("calendar.noNotes")}
                  </p>
                  <Button
                    className="mt-2 text-xs"
                    size="xs"
                    type="button"
                    variant="outline"
                    onClick={() => setShowNoteComposer(true)}
                  >
                    <PlusIcon className="size-3" />
                    {t("calendar.createNote")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {memos.map((memo) => {
                    const rawId = stripResourceName(memo.name, "memos");
                    return (
                      <div
                        className="group flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/20 p-3 shadow-2xs hover:bg-muted/40 transition-colors"
                        key={memo.name}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <ClockIcon className="size-3 opacity-60" />
                            {formatMemoTime(memo.create_time, locale)}
                          </span>
                          <Link
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-opacity"
                            params={{ memoId: rawId }}
                            to="/memo/$memoId"
                          >
                            <ExternalLinkIcon className="size-3" />
                          </Link>
                        </div>

                        <div className="text-xs leading-relaxed text-foreground">
                          <LazyMemoContent
                            className="text-xs leading-relaxed line-clamp-6"
                            content={memo.content}
                          />
                        </div>

                        {/* Attachments preview */}
                        {memo.attachments && memo.attachments.length > 0 && (
                          <div className="mt-1">
                            <AttachmentGallery attachments={memo.attachments} />
                          </div>
                        )}

                        {/* Tags */}
                        {memo.payload?.tags && memo.payload.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {memo.payload.tags.map((tag) => (
                              <Badge
                                className="text-[10px] px-1.5 py-0 font-normal"
                                key={tag}
                                variant="secondary"
                              >
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section: Tasks */}
          {(filter === "all" || filter === "tasks") && (
            <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
              <DayTaskList
                day={day}
                noteTasks={noteTasks}
                tasks={tasks}
                today={today}
                onTaskDelete={setDeleteTarget}
                onTaskDragStart={onTaskDragStart}
                onTaskReschedule={(task, newDate) =>
                  void rescheduleTask(task, newDate)
                }
                onTaskToggleDone={(task) => void toggleDone(task)}
              />

              {/* Quick Add Task Input */}
              <form
                className="mt-1 flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitTask();
                }}
              >
                <Input
                  aria-label={t("calendar.quickAdd")}
                  className="h-8 text-xs bg-background"
                  disabled={creatingTask}
                  placeholder={t("calendar.quickAddPlaceholder")}
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
                <Button
                  disabled={creatingTask || !taskTitle.trim()}
                  size="sm"
                  type="submit"
                >
                  <PlusIcon className="size-3.5" />
                  {t("calendar.quickAdd")}
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Delete Task AlertDialog */}
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("calendar.deleteTask")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("calendar.deleteTaskConfirm", {
                  title: deleteTarget?.title ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (deleteTarget) void removeTask(deleteTarget);
                }}
              >
                {t("calendar.deleteTask")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
