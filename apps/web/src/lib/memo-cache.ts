/**
 * Optimistic ["memos"] cache patching shared by every memo mutation. Kept out
 * of the hook so the patching rules — which query key shapes may show a
 * brand-new memo, how a search scope narrows a patch, how a rollback snapshot
 * is restored — are testable without React.
 *
 * The query key convention these functions rely on is the one App.tsx
 * registers: ["memos", space, view, query, tag, untagged]. Only the tail
 * (view/query/tag/untagged) is read here, so a space-prefixed entry is treated
 * exactly like its unprefixed twin.
 */
import type { ListMemosResponse } from "@flaremo/contracts";
import { parseMemoSearchQuery } from "@flaremo/contracts/search-query";
import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";
import type { Memo, MemoState, UpdateMemoRequest } from "@/api";
import type { ExplorerView as ViewMode } from "@/components/flaremo-explorer";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";

export type MemoSnapshot = Array<
  [QueryKey, InfiniteData<ListMemosResponse> | undefined]
>;

const OPTIMISTIC_PREFIX = "optimistic-";

const optimisticMemoId = () =>
  `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Prepend the composer submission into every unfiltered timeline cache so the
// new card appears before the server answers. Returns the optimistic id so
// onError can roll it back; the settle invalidation replaces it with the
// persisted record.
export function prependOptimisticMemo(
  queryClient: QueryClient,
  input: MemoCaptureInput,
): string {
  const id = optimisticMemoId();
  const now = new Date().toISOString();
  const optimisticMemo: Memo = {
    name: id,
    id,
    content: input.content,
    visibility: input.visibility ?? "private",
    state: "normal",
    pinned: false,
    payload: {
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(input.clientId ? { client_id: input.clientId } : {}),
    },
    create_time: now,
    update_time: now,
    display_time: now,
    creator: "",
    attachments: [],
    can_manage: true,
  };

  for (const [queryKey, data] of queryClient.getQueriesData<
    InfiniteData<ListMemosResponse>
  >({ queryKey: ["memos"] })) {
    // Only plain timelines (no view/search/tag filter, and not the "untagged"
    // toggle) can safely show a brand-new private memo.
    const [
      view = "all",
      query = undefined,
      tag = undefined,
      untagged = undefined,
    ] = queryKey.slice(1) as [
      ViewMode | undefined,
      string | undefined,
      string | undefined,
      boolean | undefined,
    ];
    if (view !== "all" || query || tag || untagged || !data) continue;
    queryClient.setQueryData<InfiniteData<ListMemosResponse>>(queryKey, {
      ...data,
      pages: data.pages.map((page, index) =>
        index === 0
          ? { ...page, memos: [optimisticMemo, ...page.memos] }
          : page,
      ),
    });
  }

  return id;
}

export function removeOptimisticMemo(queryClient: QueryClient, id: string) {
  for (const [queryKey, data] of queryClient.getQueriesData<
    InfiniteData<ListMemosResponse>
  >({ queryKey: ["memos"] })) {
    if (!data) continue;
    queryClient.setQueryData<InfiniteData<ListMemosResponse>>(queryKey, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        memos: page.memos.filter((memo) => memo.id !== id),
      })),
    });
  }
}

export async function optimisticallyPatchMemo(
  queryClient: QueryClient,
  id: string,
  patch: Partial<Memo> | null,
): Promise<MemoSnapshot> {
  await queryClient.cancelQueries({ queryKey: ["memos"] });
  const snapshots = queryClient.getQueriesData<InfiniteData<ListMemosResponse>>(
    {
      queryKey: ["memos"],
    },
  );

  for (const [queryKey, data] of snapshots) {
    if (!data) continue;
    const view = queryKey[1] as ViewMode | undefined;
    const search = typeof queryKey[2] === "string" ? queryKey[2].trim() : "";
    const scope = parseMemoSearchQuery(search).scope;
    queryClient.setQueryData<InfiniteData<ListMemosResponse>>(queryKey, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        memos: page.memos.flatMap((memo) => {
          if (memo.id !== id && memo.name !== id) return [memo];
          if (!patch) return [];
          const next = {
            ...memo,
            ...patch,
            update_time: new Date().toISOString(),
          };
          // Search includes archived notes unless an explicit scope narrows
          // it. Editing a result must not apply the plain timeline filter.
          const matchesState = search
            ? scope === "trash"
              ? next.state === "trashed"
              : scope === "archive"
                ? next.state === "archived"
                : scope === "timeline"
                  ? next.state === "normal"
                  : next.state === "normal" || next.state === "archived"
            : !view || next.state === viewToMemoState(view);
          return matchesState ? [next] : [];
        }),
      })),
    });
  }

  return snapshots;
}

export function restoreMemoSnapshot(
  queryClient: QueryClient,
  snapshot: MemoSnapshot | undefined,
) {
  for (const [queryKey, data] of snapshot ?? []) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function memoPatchFromUpdate(input: UpdateMemoRequest): Partial<Memo> {
  return {
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.status !== undefined ? { state: input.status } : {}),
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
  };
}

export function viewToMemoState(view: ViewMode): MemoState {
  if (view === "archived") return "archived";
  if (view === "trashed") return "trashed";
  return "normal";
}
