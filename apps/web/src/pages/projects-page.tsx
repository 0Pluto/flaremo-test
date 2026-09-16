import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDotIcon,
  CircleIcon,
  FlagIcon,
  GripVerticalIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  NotebookTextIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  archiveProject,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  listProjects,
  listTasks,
  type Project,
  reorderTasks,
  restoreProject,
  restoreTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
  updateProject,
  updateTask,
} from "@/api";
import { QueryErrorState } from "@/components/query-error-state";
import { SubpageHeader } from "@/components/subpage-header";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/key";
import { errorMessage } from "@/lib/error";
import { cn, stripResourceName } from "@/lib/utils";

const ALL_TASKS = "all";

const STATUS_COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

const PRIORITY_BADGE: Record<
  TaskPriority,
  "destructive" | "brand" | "secondary"
> = {
  high: "destructive",
  medium: "brand",
  low: "secondary",
  none: "secondary",
};

/** Clicking the status icon advances the task; the label states the action. */
const ADVANCE_TARGET: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

const ADVANCE_KEY: Record<TaskStatus, TranslationKey> = {
  todo: "projects.advance.start",
  in_progress: "projects.advance.complete",
  done: "projects.advance.reopen",
};

// Touch screens never hover: controls that fade in behind group-hover stay
// permanently visible on coarse pointers (7.2).
const COARSE_VISIBLE = "[@media(pointer:coarse)]:opacity-100";
const MORE_BUTTON_CLASS = `opacity-0 group-hover:opacity-100 focus:opacity-100 ${COARSE_VISIBLE}`;

export function ProjectsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>(ALL_TASKS);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
  });

  const tasksQuery = useQuery({
    // Same key as the mini calendar's all-tasks query so the board reuses
    // that cache instead of re-fetching the same payload under ["tasks","all"].
    queryKey: selected === ALL_TASKS ? ["tasks"] : ["tasks", selected],
    queryFn: () =>
      listTasks(selected === ALL_TASKS ? {} : { project_id: selected }),
  });

  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data],
  );
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    // The calendar aggregates dues/overdue from the same task rows; without
    // this prefix it keeps serving a stale board for the refetch interval.
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  const selectedProject =
    selected === ALL_TASKS ? null : (projectById.get(selected) ?? null);
  const openCount = projects.reduce(
    (sum, project) => sum + project.task_count_open,
    0,
  );

  // A deleted (or otherwise vanished) project must never leave the board
  // pointed at a filter that matches nothing: fall back to "全部任务".
  useEffect(() => {
    if (!projectsQuery.data) return;
    if (selected !== ALL_TASKS && !projectById.has(selected)) {
      setSelected(ALL_TASKS);
    }
  }, [selected, projectById, projectsQuery.data]);

  return (
    <div className="min-h-svh bg-background px-4 py-5 sm:py-8">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <SubpageHeader
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreatingTask(true)}
              >
                <PlusIcon data-icon="inline-start" />
                {t("projects.newTask")}
              </Button>
              <Button size="sm" onClick={() => setCreatingProject(true)}>
                <PlusIcon data-icon="inline-start" />
                {t("projects.newProject")}
              </Button>
            </>
          }
          title={t("projects.title")}
        />

        <div className="flex flex-col gap-4 lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-1 lg:w-64">
            <button
              className={
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm " +
                (selected === ALL_TASKS
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground")
              }
              type="button"
              onClick={() => setSelected(ALL_TASKS)}
            >
              <ListTodoIcon className="size-4" />
              <span className="min-w-0 flex-1 truncate text-left">
                {t("projects.allTasks")}
              </span>
              <Badge variant="secondary">{openCount}</Badge>
            </button>

            {projectsQuery.isLoading && (
              <div className="flex flex-col gap-2 px-3 py-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}

            {projectsQuery.isError && !projectsQuery.data && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1">
                  {t("list.errorDescription")}
                </span>
                <Button
                  className="h-6 px-2 text-xs"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void projectsQuery.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}

            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                selected={selected === project.id}
                onMutated={invalidate}
                onSelect={setSelected}
                onDeleted={(id) => {
                  if (selected === id) setSelected(ALL_TASKS);
                }}
              />
            ))}

            <TrashSection onMutated={invalidate} />
          </aside>

          <section className="min-w-0 flex-1">
            <div className="mb-3 px-1">
              <h2 className="truncate text-sm font-medium text-muted-foreground">
                {selectedProject
                  ? selectedProject.name
                  : t("projects.allTasks")}
              </h2>
            </div>

            <Board
              hasError={tasksQuery.isError && !tasksQuery.data}
              hasProjects={projects.length > 0}
              isRetrying={tasksQuery.isRefetching}
              loading={tasksQuery.isLoading}
              projectById={projectById}
              selectedProject={selectedProject}
              tasks={tasks}
              onRetry={() => void tasksQuery.refetch()}
              onMutated={invalidate}
              onCreateProject={() => setCreatingProject(true)}
              onCreateTask={() => setCreatingTask(true)}
            />
          </section>
        </div>

        <ProjectFormDialog
          open={creatingProject}
          onOpenChange={setCreatingProject}
          onSaved={invalidate}
        />
        <TaskFormDialog
          defaultProjectId={selectedProject?.id}
          open={creatingTask}
          onOpenChange={setCreatingTask}
          onSaved={invalidate}
        />
      </main>
    </div>
  );
}

/**
 * Collapsible recycle bin under the project list: soft-deleted projects and
 * tasks surface here with one-click restore until the retention sweep
 * hard-deletes them.
 */
function TrashSection({ onMutated }: { onMutated: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const projectsQuery = useQuery({
    queryKey: ["projects", "trash"],
    queryFn: () => listProjects({ include_deleted: true }),
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", "trash"],
    queryFn: () => listTasks({ include_deleted: true }),
  });

  const deletedProjects = useMemo(
    () => (projectsQuery.data?.projects ?? []).filter((p) => p.deleted_at),
    [projectsQuery.data],
  );
  const deletedTasks = useMemo(
    () => (tasksQuery.data?.tasks ?? []).filter((task) => task.deleted_at),
    [tasksQuery.data],
  );
  const count = deletedProjects.length + deletedTasks.length;

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
      <button
        aria-expanded={open}
        className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150",
            !open && "-rotate-90 rtl:rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {t("view.trash")}
        </span>
        {count > 0 && (
          <Badge className="tabular-nums" variant="secondary">
            {count}
          </Badge>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-0.5">
          {count === 0 && (
            <p className="px-3 py-1 text-xs text-muted-foreground">
              {t("projects.trashEmpty")}
            </p>
          )}
          {deletedProjects.map((project) => (
            <TrashRow
              icon={<ListTodoIcon className="size-3.5" />}
              key={project.id}
              label={project.name}
              restore={() =>
                restoreProject(stripResourceName(project.id, "projects"))
              }
              onMutated={onMutated}
            />
          ))}
          {deletedTasks.map((task) => (
            <TrashRow
              icon={<CheckCircle2Icon className="size-3.5" />}
              key={task.id}
              label={task.title}
              restore={() => restoreTask(stripResourceName(task.id, "tasks"))}
              onMutated={onMutated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrashRow({
  icon,
  label,
  restore,
  onMutated,
}: {
  icon: ReactNode;
  label: string;
  restore: () => Promise<unknown>;
  onMutated: () => void;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  return (
    <div className="group flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground/80">
      {icon}
      <span className="min-w-0 flex-1 truncate line-through">{label}</span>
      <Button
        className={`h-6 px-2 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 ${COARSE_VISIBLE}`}
        disabled={pending}
        size="sm"
        type="button"
        variant="ghost"
        onClick={async () => {
          setPending(true);
          try {
            await restore();
            toast.success(t("toast.restored"));
            onMutated();
          } catch (error) {
            toast.error(errorMessage(error, t("toast.requestFailed")));
          } finally {
            setPending(false);
          }
        }}
      >
        <ArchiveRestoreIcon data-icon="inline-start" />
        {t("common.restore")}
      </Button>
    </div>
  );
}

function Board({
  hasError,
  hasProjects,
  isRetrying,
  loading,
  onRetry,
  projectById,
  selectedProject,
  tasks,
  onMutated,
  onCreateProject,
  onCreateTask,
}: {
  hasError: boolean;
  hasProjects: boolean;
  isRetrying: boolean;
  loading: boolean;
  onRetry: () => void;
  projectById: Map<string, Project>;
  selectedProject: Project | null;
  tasks: Task[];
  onMutated: () => void;
  onCreateProject: () => void;
  onCreateTask: () => void;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (hasError) {
    return (
      <QueryErrorState
        className="min-h-56"
        isRetrying={isRetrying}
        onRetry={onRetry}
      />
    );
  }

  if (tasks.length === 0 && !hasProjects) {
    return (
      <Empty className="min-h-56 border">
        <EmptyHeader>
          <EmptyTitle>{t("projects.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("projects.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex items-center gap-2">
          <Button size="sm" onClick={onCreateProject}>
            <PlusIcon data-icon="inline-start" />
            {t("projects.newProject")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCreateTask}>
            {t("projects.newTask")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (tasks.length === 0) {
    const inProject = Boolean(selectedProject);
    return (
      <Empty className="min-h-56 border">
        <EmptyHeader>
          <EmptyTitle>
            {inProject
              ? t("projects.tasksEmptyTitle")
              : t("projects.allTasksEmptyTitle")}
          </EmptyTitle>
          <EmptyDescription>
            {inProject
              ? t("projects.tasksEmptyDescription")
              : t("projects.allTasksEmptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onCreateTask}>
            <PlusIcon data-icon="inline-start" />
            {t("projects.newTask")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <TaskBoard
      projectById={projectById}
      selectedProject={selectedProject}
      tasks={tasks}
      onMutated={onMutated}
    />
  );
}

/**
 * The kanban board. Drag-and-drop is project-scoped: sort_order lives per
 * project on the server, so the mixed "全部任务" board stays read-only.
 */
function TaskBoard({
  projectById,
  selectedProject,
  tasks,
  onMutated,
}: {
  projectById: Map<string, Project>;
  selectedProject: Project | null;
  tasks: Task[];
  onMutated: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const interactive = Boolean(selectedProject);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  /** Diff two board snapshots into per-task patches for every task cache. */
  const boardPatches = (nextTasks: Task[]) => {
    const patches = new Map<string, Partial<Task>>();
    for (const task of nextTasks) {
      const previous = tasksById.get(task.id);
      if (
        !previous ||
        (previous.status === task.status &&
          previous.sort_order === task.sort_order)
      ) {
        continue;
      }
      const patch: Partial<Task> = {
        status: task.status,
        sort_order: task.sort_order,
      };
      if (task.status === "done" && previous.status !== "done") {
        patch.completed_at = new Date().toISOString();
      }
      if (task.status !== "done" && previous.status === "done") {
        patch.completed_at = null;
      }
      patches.set(task.id, patch);
    }
    return patches;
  };

  const applyBoardChange = (nextTasks: Task[]) => {
    // Per-id status/order patch reaches every ["tasks…"] cache (agenda, mini
    // calendar, search…); then the project board list is fully replaced so
    // the drop lands exactly where the pointer left it.
    queryClient.setQueriesData({ queryKey: ["tasks"] }, (data: unknown) =>
      patchTasksCacheMulti(data, boardPatches(nextTasks)),
    );
    if (selectedProject) {
      queryClient.setQueryData(["tasks", selectedProject.id], {
        tasks: nextTasks,
      });
    }
  };

  const rollbackBoard = () => {
    queryClient.setQueriesData({ queryKey: ["tasks"] }, (data: unknown) =>
      patchTasksCacheMulti(
        data,
        new Map(
          tasks.map((task) => [
            task.id,
            {
              status: task.status,
              sort_order: task.sort_order,
              completed_at: task.completed_at,
            } satisfies Partial<Task>,
          ]),
        ),
      ),
    );
    if (selectedProject) {
      queryClient.setQueryData(["tasks", selectedProject.id], { tasks });
    }
  };

  const commit = async (
    nextTasks: Task[],
    statusUpdate: { id: string; status: TaskStatus } | null,
  ) => {
    applyBoardChange(nextTasks);
    try {
      if (statusUpdate) {
        await updateTask(stripResourceName(statusUpdate.id, "tasks"), {
          status: statusUpdate.status,
        });
      }
      if (selectedProject) {
        await reorderTasks(
          stripResourceName(selectedProject.id, "projects"),
          nextTasks.map((task) => task.id),
        );
      }
      onMutated();
    } catch (error) {
      rollbackBoard();
      onMutated();
      toast.error(errorMessage(error, t("toast.taskUpdateFailed")));
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeTask = tasksById.get(String(active.id));
    if (!activeTask || !selectedProject) return;
    const overId = String(over.id);
    const overTask = tasksById.get(overId);
    const targetStatus: TaskStatus | null = isStatusColumn(overId)
      ? (overId as TaskStatus)
      : (overTask?.status ?? null);
    if (!targetStatus) return;

    const sourceColumn = tasks.filter(
      (task) => task.status === activeTask.status,
    );
    const targetColumn = tasks.filter((task) => task.status === targetStatus);
    const rest = tasks.filter(
      (task) =>
        task.status !== activeTask.status && task.status !== targetStatus,
    );

    if (targetStatus === activeTask.status) {
      const oldIndex = sourceColumn.findIndex(
        (task) => task.id === activeTask.id,
      );
      const newIndex = sourceColumn.findIndex((task) => task.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      const column = arrayMove(sourceColumn, oldIndex, newIndex);
      void commit([...rest, ...column], null);
      return;
    }

    // Cross column: insert above the hovered card, or at the end when the
    // drop target is the (possibly empty) column itself.
    let nextTarget: Task[];
    if (!overTask) {
      nextTarget = [{ ...activeTask, status: targetStatus }, ...targetColumn];
    } else {
      const overIndex = targetColumn.findIndex((task) => task.id === overId);
      nextTarget = [
        ...targetColumn.slice(0, overIndex),
        { ...activeTask, status: targetStatus },
        ...targetColumn.slice(overIndex),
      ];
    }
    const nextSource = sourceColumn.filter((task) => task.id !== activeTask.id);
    void commit([...rest, ...nextSource, ...nextTarget], {
      id: activeTask.id,
      status: targetStatus,
    });
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STATUS_COLUMNS.map((status) => (
          <TaskColumn
            interactive={interactive}
            key={status}
            projectById={projectById}
            selectedProjectId={selectedProject?.id ?? null}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            onMutated={onMutated}
          />
        ))}
      </div>
    </DndContext>
  );
}

function isStatusColumn(id: string): boolean {
  return STATUS_COLUMNS.some((status) => status === id);
}

function TaskColumn({
  interactive,
  projectById,
  selectedProjectId,
  status,
  tasks,
  onMutated,
}: {
  interactive: boolean;
  projectById: Map<string, Project>;
  selectedProjectId: string | null;
  status: TaskStatus;
  tasks: Task[];
  onMutated: () => void;
}) {
  const { t } = useI18n();
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    disabled: !interactive,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <StatusIcon status={status} />
        <span className="text-sm font-medium">
          {t(`projects.status.${status}`)}
        </span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        className={cn(
          "flex min-h-16 flex-col gap-2 rounded-lg motion-safe:transition-colors motion-safe:duration-150",
          interactive && isOver && "bg-muted/40",
        )}
        ref={setNodeRef}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) =>
            interactive ? (
              <SortableTaskCard
                key={task.id}
                projectName={
                  selectedProjectId
                    ? null
                    : (projectById.get(task.project_id ?? "")?.name ?? null)
                }
                task={task}
                onMutated={onMutated}
              />
            ) : (
              <TaskCard
                key={task.id}
                projectName={
                  selectedProjectId
                    ? null
                    : (projectById.get(task.project_id ?? "")?.name ?? null)
                }
                task={task}
                onMutated={onMutated}
              />
            ),
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTaskCard(props: {
  projectName: string | null;
  task: Task;
  onMutated: () => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: props.task.id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("rounded-xl", isDragging && "relative z-10 opacity-70")}
    >
      <TaskCard {...props} interactive />
    </div>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") {
    return <CheckCircle2Icon className="size-4 text-muted-foreground" />;
  }
  if (status === "in_progress") {
    return <CircleDotIcon className="size-4 text-brand-500" />;
  }
  return <CircleIcon className="size-4 text-muted-foreground" />;
}

function ProjectRow({
  project,
  selected,
  onMutated,
  onSelect,
  onDeleted,
}: {
  project: Project;
  selected: boolean;
  onMutated: () => void;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: () =>
      archiveProject(
        stripResourceName(project.id, "projects"),
        project.status !== "archived",
      ),
    onSuccess: () => {
      toast.success(
        t(
          project.status === "archived"
            ? "toast.projectUnarchived"
            : "toast.projectArchived",
        ),
      );
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.projectArchiveFailed"))),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(stripResourceName(project.id, "projects")),
    onSuccess: () => {
      toast.success(t("toast.projectDeleted"));
      onDeleted(project.id);
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.projectDeleteFailed"))),
  });

  return (
    <>
      <div
        className={
          "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm " +
          (selected
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground")
        }
      >
        <button
          className="min-w-0 flex-1 truncate text-left"
          type="button"
          onClick={() => onSelect(project.id)}
        >
          <span
            className={
              project.status === "archived" ? "text-muted-foreground/70" : ""
            }
          >
            {project.name}
          </span>
        </button>
        {project.task_count_open > 0 && (
          <Badge variant="secondary">{project.task_count_open}</Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className={MORE_BUTTON_CLASS}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontalIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
              {project.status === "archived" ? (
                <ArchiveRestoreIcon data-icon="inline-start" />
              ) : (
                <ArchiveIcon data-icon="inline-start" />
              )}
              {t(
                project.status === "archived"
                  ? "projects.unarchive"
                  : "projects.archive",
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2Icon data-icon="inline-start" />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectFormDialog
        key={[project.id, project.name, project.description ?? ""].join("|")}
        open={editing}
        project={project}
        onOpenChange={setEditing}
        onSaved={onMutated}
      />
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projects.deleteProjectTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("projects.deleteProjectDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              variant="destructive"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProjectFormDialog({
  open,
  project,
  onSaved,
  onOpenChange,
}: {
  open: boolean;
  project?: Project;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      project
        ? updateProject(stripResourceName(project.id, "projects"), {
            name,
            description: description || null,
          })
        : createProject({ name, description: description || undefined }),
    onSuccess: () => {
      toast.success(
        t(project ? "toast.projectUpdated" : "toast.projectCreated"),
      );
      if (!project) {
        setName("");
        setDescription("");
      }
      onOpenChange(false);
      onSaved();
    },
    onError: (error) =>
      toast.error(
        errorMessage(
          error,
          t(
            project ? "toast.projectUpdateFailed" : "toast.projectCreateFailed",
          ),
        ),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {project ? t("projects.editProject") : t("projects.newProject")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label={t("projects.field.name")}>
            <Input
              value={name}
              placeholder={t("projects.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t("projects.field.description")}>
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Apply optimistic task patches to every cached task list under the ["tasks"]
 * prefix, preserving each query's other fields.
 */
function patchTasksCacheMulti(
  data: unknown,
  patches: Map<string, Partial<Task>>,
) {
  if (!data || typeof data !== "object") return data;
  const current = data as { tasks?: Task[] };
  if (!Array.isArray(current.tasks) || patches.size === 0) return data;
  return {
    ...current,
    tasks: current.tasks.map((item) => {
      const patch = patches.get(item.id);
      return patch ? { ...item, ...patch } : item;
    }),
  };
}

/**
 * Apply an optimistic task patch (or removal with patch=null) to every cached
 * task list under the ["tasks"] prefix, preserving each query's other fields.
 */
function patchTasksCache(
  data: unknown,
  taskId: string,
  patch: Partial<Task> | null,
): unknown {
  if (!data || typeof data !== "object") return data;
  const current = data as { tasks?: Task[] };
  if (!Array.isArray(current.tasks)) return data;
  return {
    ...current,
    tasks:
      patch === null
        ? current.tasks.filter((item) => item.id !== taskId)
        : current.tasks.map((item) =>
            item.id === taskId ? { ...item, ...patch } : item,
          ),
  };
}

function TaskCard({
  interactive = false,
  projectName,
  task,
  onMutated,
}: {
  interactive?: boolean;
  projectName: string | null;
  task: Task;
  onMutated: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Optimistic status flips so slow connections still feel instant; the
  // board re-syncs from the server on settle.
  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateTask>[1]) =>
      updateTask(stripResourceName(task.id, "tasks"), input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["tasks"] });
      queryClient.setQueriesData({ queryKey: ["tasks"] }, (data: unknown) =>
        patchTasksCache(data, task.id, input),
      );
      return snapshots;
    },
    onSuccess: () => onMutated(),
    onError: (error, _input, snapshots) => {
      for (const [key, value] of snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
      toast.error(errorMessage(error, t("toast.taskUpdateFailed")));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(stripResourceName(task.id, "tasks")),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["tasks"] });
      queryClient.setQueriesData({ queryKey: ["tasks"] }, (data: unknown) =>
        patchTasksCache(data, task.id, null),
      );
      return snapshots;
    },
    onSuccess: () => {
      toast.success(t("toast.taskDeleted"));
      onMutated();
    },
    onError: (error, _input, snapshots) => {
      for (const [key, value] of snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
      toast.error(errorMessage(error, t("toast.taskDeleteFailed")));
    },
  });

  const advance = () => {
    const next = ADVANCE_TARGET[task.status];
    updateMutation.mutate(
      { status: next },
      {
        onSuccess: () =>
          toast.success(t(ADVANCE_KEY[task.status]), {
            action: {
              label: t("common.undo"),
              onClick: () => updateMutation.mutate({ status: task.status }),
            },
          }),
      },
    );
  };

  const sourceMemoId = task.source_memo_id
    ? stripResourceName(task.source_memo_id, "memos")
    : null;

  return (
    <>
      <Card
        className={cn(
          "group",
          interactive && "cursor-grab active:cursor-grabbing",
        )}
      >
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-1.5">
            {projectName && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {projectName}
              </span>
            )}
            {!projectName && !task.project_id && (
              <Badge className="text-[0.65rem]" variant="outline">
                {t("projects.unassigned")}
              </Badge>
            )}
            {sourceMemoId && (
              <Badge
                className="text-[0.65rem]"
                render={
                  <Link
                    params={{ memoId: sourceMemoId }}
                    title={t("projects.fromMemo")}
                    to="/memo/$memoId"
                  />
                }
                variant="brand"
              >
                <NotebookTextIcon />
                {t("projects.fromMemo")}
              </Badge>
            )}
            {interactive && (
              <GripVerticalIcon
                aria-hidden="true"
                className={cn(
                  "ml-auto size-3.5 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100",
                  COARSE_VISIBLE,
                )}
              />
            )}
          </div>
          <div className="flex items-start gap-2">
            <button
              aria-label={t(ADVANCE_KEY[task.status])}
              className="mt-0.5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
              title={t(ADVANCE_KEY[task.status])}
              type="button"
              onClick={advance}
            >
              <StatusIcon status={task.status} />
            </button>
            <span
              className={
                "min-w-0 flex-1 text-sm " +
                (task.status === "done"
                  ? "text-muted-foreground line-through"
                  : "")
              }
            >
              {task.title}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className={MORE_BUTTON_CLASS}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("projects.setStatus")}</DropdownMenuLabel>
                {STATUS_COLUMNS.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() =>
                      updateMutation.mutate(
                        { status },
                        {
                          onSuccess: () =>
                            toast.success(t("toast.taskUpdated")),
                        },
                      )
                    }
                  >
                    <StatusIcon status={status} />
                    {t(`projects.status.${status}`)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <PencilIcon data-icon="inline-start" />
                  {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {(task.priority !== "none" || task.due_at) && (
            <div className="flex flex-wrap items-center gap-2">
              {task.priority !== "none" && (
                <Badge variant={PRIORITY_BADGE[task.priority]}>
                  <FlagIcon data-icon="inline-start" />
                  {t(`projects.priority.${task.priority}`)}
                </Badge>
              )}
              {task.due_at && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDaysIcon data-icon="inline-start" />
                  {task.due_at}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskFormDialog
        key={task.id}
        open={editing}
        task={task}
        onOpenChange={setEditing}
        onSaved={onMutated}
      />
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projects.deleteTaskTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projects.deleteTaskDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              variant="destructive"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TaskFormDialog({
  task,
  defaultProjectId,
  open,
  onSaved,
  onOpenChange,
}: {
  task?: Task;
  defaultProjectId?: string;
  open: boolean;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(),
  });
  const [projectId, setProjectId] = useState<string>(
    task?.project_id ?? defaultProjectId ?? "",
  );
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "none",
  );
  const [dueAt, setDueAt] = useState(task?.due_at ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");

  // Seed on open instead of on mount: the dialog for a task stays mounted
  // (key = task.id) across refetches, and a refetch must not wipe what the
  // user is typing — but every fresh open starts from the latest task (7.5).
  useEffect(() => {
    if (open) {
      setProjectId(task?.project_id ?? defaultProjectId ?? "");
      setTitle(task?.title ?? "");
      setNotes(task?.notes ?? "");
      setPriority(task?.priority ?? "none");
      setDueAt(task?.due_at ?? "");
      setStatus(task?.status ?? "todo");
    }
  }, [open, task, defaultProjectId]);

  // Active projects to pick from; when editing, a task still pointing at an
  // archived project keeps that option so the value never disappears.
  const projectOptions = useMemo(() => {
    const all = projectsQuery.data?.projects ?? [];
    const live = all.filter(
      (project) => project.status === "active" && !project.deleted_at,
    );
    if (task?.project_id && !live.some((p) => p.id === task.project_id)) {
      const current = all.find((p) => p.id === task.project_id);
      if (current) return [current, ...live];
    }
    return live;
  }, [projectsQuery.data, task]);

  const saveMutation = useMutation({
    mutationFn: () =>
      task
        ? updateTask(stripResourceName(task.id, "tasks"), {
            title,
            notes,
            priority,
            due_at: dueAt || null,
            status,
            project_id: projectId || null,
          })
        : createTask({
            project_id: projectId || undefined,
            title,
            status: "todo",
            notes: notes || undefined,
            priority,
            due_at: dueAt || undefined,
          }),
    onMutate: async () => {
      if (!task) return undefined;
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["tasks"] });
      const patch: Partial<Task> = {
        title: title.trim(),
        notes: notes || null,
        priority,
        due_at: dueAt || null,
        status,
        project_id: projectId || null,
      };
      if (status === "done" && task.status !== "done") {
        patch.completed_at = new Date().toISOString();
      }
      if (status !== "done" && task.status === "done") {
        patch.completed_at = null;
      }
      queryClient.setQueriesData({ queryKey: ["tasks"] }, (data: unknown) =>
        patchTasksCache(data, task.id, patch),
      );
      return snapshots;
    },
    onSuccess: (result) => {
      if (task) {
        // The server payload is authoritative: it lands project changes and
        // completed_at in the right cache rows after the optimistic patch.
        queryClient.setQueriesData({ queryKey: ["tasks"] }, (data: unknown) =>
          patchTasksCache(data, task.id, result.task),
        );
      }
      toast.success(t(task ? "toast.taskUpdated" : "toast.taskCreated"));
      onOpenChange(false);
      onSaved();
    },
    onError: (error, _input, snapshots) => {
      for (const [key, value] of snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
      toast.error(
        errorMessage(
          error,
          t(task ? "toast.taskUpdateFailed" : "toast.taskCreateFailed"),
        ),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {task ? t("projects.editTask") : t("projects.newTask")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label={t("projects.field.project")}>
            <Select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">{t("projects.unassigned")}</option>
              {projectOptions.map((project) => (
                <option
                  key={project.id}
                  value={stripResourceName(project.id, "projects")}
                >
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("projects.field.title")}>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {task && (
              <Field label={t("projects.field.status")}>
                <Select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as TaskStatus)
                  }
                >
                  {STATUS_COLUMNS.map((value) => (
                    <option key={value} value={value}>
                      {t(`projects.status.${value}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t("projects.field.priority")}>
              <Select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
              >
                {(Object.keys(PRIORITY_BADGE) as TaskPriority[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {t(`projects.priority.${value}`)}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label={t("projects.field.dueDate")}>
              <Input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label={t("projects.field.notes")}>
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!title.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
