import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, InfoIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { listMemories, listMemoryReview } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { MemoryColdStart } from "./memory/memory-cold-start";
import { groupMemories } from "./memory/memory-filters";
import { MemoryFormDialog } from "./memory/memory-form-dialog";
import { MemoryLensDialog } from "./memory/memory-lens-dialog";
import { MemoryList } from "./memory/memory-list";
import { MemoryQuickComposer } from "./memory/memory-quick-composer";
import { MemoryWorkspaceHeader } from "./memory/memory-workspace-header";
import { ProjectGroups } from "./memory/project-groups";

type FilterTab =
  | "all"
  | "core"
  | "observed"
  | "projects"
  | "review"
  | "archive";

export function MemoryPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const listQuery = useQuery({
    queryKey: ["memories", "list"],
    queryFn: () => listMemories(),
  });

  const reviewQuery = useQuery({
    queryKey: ["memories", "review"],
    queryFn: () => listMemoryReview(),
  });

  const memories = useMemo(
    () => listQuery.data?.memories ?? [],
    [listQuery.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((memory) =>
      memory.content.toLowerCase().includes(q),
    );
  }, [memories, query]);

  const groups = useMemo(() => groupMemories(filtered), [filtered]);

  const reviewMemories = useMemo(
    () => reviewQuery.data?.memories ?? [],
    [reviewQuery.data],
  );

  const observedMemories = useMemo(
    () =>
      filtered.filter(
        (m) => m.verification === "observed" && m.status === "active",
      ),
    [filtered],
  );

  const activeMemories = useMemo(
    () => filtered.filter((m) => m.status === "active"),
    [filtered],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["memories"] });
  };

  const reviewCount = reviewMemories.length;

  return (
    <WorkspaceLayout
      header={({
        sidebarCollapsed,
        toggleSidebarCollapsed,
        mobileSheetOpen,
        setMobileSheetOpen,
        explorer,
      }) => (
        <MemoryWorkspaceHeader
          explorer={explorer}
          mobileSheetOpen={mobileSheetOpen}
          setMobileSheetOpen={setMobileSheetOpen}
          sidebarCollapsed={sidebarCollapsed}
          toggleSidebarCollapsed={toggleSidebarCollapsed}
          onOpenLens={() => setLensOpen(true)}
          onNewMemory={() => setCreating(true)}
          isScrolled={isScrolled}
        />
      )}
      onScroll={(event) => {
        setIsScrolled(event.currentTarget.scrollTop > 4);
      }}
    >
      <div className="flex flex-col gap-3.5 pt-2">
        {/* Top Info Banner */}
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground motion-safe:animate-rise">
          <InfoIcon className="size-4 shrink-0 text-brand-500/80" />
          <span className="min-w-0 flex-1 leading-relaxed">
            {t("memory.bannerHint")}
          </span>
        </div>

        {/* Pending Review Alert Banner */}
        {reviewCount > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-600 dark:text-amber-400 motion-safe:animate-rise">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AlertCircleIcon className="size-4 shrink-0 text-amber-500" />
              <span className="truncate font-medium">
                {t("memory.bannerReviewAlert", { count: reviewCount })}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTab("review")}
              className="h-7 border-amber-500/30 bg-card px-2.5 text-xs text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
            >
              {t("memory.filterReview")}
            </Button>
          </div>
        )}

        {/* Quick Add Memory Box */}
        <MemoryQuickComposer onCreated={invalidate} />

        {/* Search & Filter Pills */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              data-icon="inline-start"
            />
            <Input
              className="h-9 pl-9 text-xs"
              placeholder={t("memory.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <FilterPill
              active={tab === "all"}
              label={t("memory.filterAll")}
              count={activeMemories.length}
              onClick={() => setTab("all")}
            />
            <FilterPill
              active={tab === "core"}
              label={t("memory.filterCore")}
              count={groups.core.length}
              onClick={() => setTab("core")}
            />
            <FilterPill
              active={tab === "observed"}
              label={t("memory.filterObserved")}
              count={observedMemories.length}
              onClick={() => setTab("observed")}
            />
            <FilterPill
              active={tab === "projects"}
              label={t("memory.tab.projects")}
              count={groups.projects.length}
              onClick={() => setTab("projects")}
            />
            <FilterPill
              active={tab === "review"}
              label={t("memory.filterReview")}
              count={reviewCount}
              highlight={reviewCount > 0}
              onClick={() => setTab("review")}
            />
            <FilterPill
              active={tab === "archive"}
              label={t("memory.tab.archive")}
              count={groups.archive.length}
              onClick={() => setTab("archive")}
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="pt-1">
          {tab === "all" &&
            (memories.length === 0 && !listQuery.isLoading && !query ? (
              <MemoryColdStart onCreated={invalidate} />
            ) : (
              <MemoryList
                hasError={listQuery.isError && !listQuery.data}
                isRetrying={listQuery.isRefetching}
                loading={listQuery.isLoading}
                memories={activeMemories}
                onMutated={invalidate}
                onRetry={() => void listQuery.refetch()}
                showSource
              />
            ))}

          {tab === "core" && (
            <MemoryList
              hasError={listQuery.isError && !listQuery.data}
              isRetrying={listQuery.isRefetching}
              loading={listQuery.isLoading}
              memories={groups.core}
              onMutated={invalidate}
              onRetry={() => void listQuery.refetch()}
            />
          )}

          {tab === "observed" && (
            <MemoryList
              hasError={listQuery.isError && !listQuery.data}
              isRetrying={listQuery.isRefetching}
              loading={listQuery.isLoading}
              memories={observedMemories}
              onMutated={invalidate}
              onRetry={() => void listQuery.refetch()}
              showSource
            />
          )}

          {tab === "projects" && (
            <ProjectGroups memories={groups.projects} onMutated={invalidate} />
          )}

          {tab === "review" && (
            <MemoryList
              memories={reviewMemories}
              loading={reviewQuery.isLoading}
              hasError={reviewQuery.isError}
              onMutated={invalidate}
              onRetry={() => void reviewQuery.refetch()}
              review
            />
          )}

          {tab === "archive" && (
            <MemoryList
              emptyTitle={t("memory.archiveEmpty")}
              hasError={listQuery.isError && !listQuery.data}
              isRetrying={listQuery.isRefetching}
              loading={listQuery.isLoading}
              memories={groups.archive}
              onMutated={invalidate}
              onRetry={() => void listQuery.refetch()}
            />
          )}
        </div>
      </div>

      <MemoryFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={invalidate}
      />

      <MemoryLensDialog open={lensOpen} onOpenChange={setLensOpen} />
    </WorkspaceLayout>
  );
}

function FilterPill({
  active,
  label,
  count,
  highlight = false,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium motion-safe:transition-all active:scale-[0.98]",
        active
          ? "bg-foreground text-background shadow-2xs"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
        highlight &&
          !active &&
          "border border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10",
      )}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[10px] tabular-nums",
            active ? "text-background/80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
