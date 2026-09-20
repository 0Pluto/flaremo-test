import type { ListMemosResponse } from "@flaremo/contracts";
import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Memo, MemoState } from "@/api";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";
import {
  memoPatchFromUpdate,
  optimisticallyPatchMemo,
  prependOptimisticMemo,
  removeOptimisticMemo,
  restoreMemoSnapshot,
  viewToMemoState,
} from "./memo-cache";

/**
 * Optimistic ["memos"] cache contract.
 *
 * The query key convention these functions read is
 * `["memos", view, query, tag, untagged]`: prepend/remove consume the whole
 * tail (`queryKey.slice(1)`), the patch path reads position 1 as the view and
 * position 2 as the search string. Both are exercised here per view, per
 * search scope, and per memo state, because a wrong rule silently drops or
 * resurrects rows in the timeline instead of throwing.
 */

function memo(
  id: string,
  state: MemoState = "normal",
  extra: Partial<Memo> = {},
): Memo {
  return {
    name: `memos/${id}`,
    id,
    content: `content-${id}`,
    visibility: "private",
    state,
    pinned: false,
    payload: {},
    create_time: "2026-01-01T00:00:00.000Z",
    update_time: "2026-01-01T00:00:00.000Z",
    display_time: "2026-01-01T00:00:00.000Z",
    creator: "users/owner",
    ...extra,
  };
}

function pages(...lists: Memo[][]): InfiniteData<ListMemosResponse> {
  return {
    pages: lists.map((memos) => ({ memos })),
    pageParams: lists.map(() => undefined),
  };
}

function memosAt(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): Memo[] {
  const data = queryClient.getQueryData<InfiniteData<ListMemosResponse>>(
    queryKey as never,
  );
  return data?.pages.flatMap((page) => page.memos) ?? [];
}

function captureInput(overrides: Partial<MemoCaptureInput> = {}) {
  return {
    content: "fresh note",
    visibility: "private",
    tags: [],
    files: [],
    ...overrides,
  } as MemoCaptureInput;
}

describe("viewToMemoState", () => {
  it("maps each explorer view onto the memo state it lists", () => {
    expect(viewToMemoState("all")).toBe("normal");
    expect(viewToMemoState("archived")).toBe("archived");
    expect(viewToMemoState("trashed")).toBe("trashed");
  });
});

describe("prependOptimisticMemo", () => {
  it("prepends the optimistic card to the first page of the plain timeline", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([memo("a")], [memo("b")]),
    );

    const id = prependOptimisticMemo(queryClient, captureInput());

    const data = queryClient.getQueryData<InfiniteData<ListMemosResponse>>([
      "memos",
      "all",
      "",
      undefined,
      undefined,
    ]);
    expect(data?.pages[0].memos.map((entry) => entry.id)).toEqual([id, "a"]);
    // Only page 0 grows; later pages keep their page tokens meaningful.
    expect(data?.pages[1].memos.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("builds a private normal-state memo carrying the capture input", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([]),
    );

    const id = prependOptimisticMemo(
      queryClient,
      captureInput({ tags: ["ideas"], clientId: "client-1" }),
    );

    const [optimistic] = memosAt(queryClient, [
      "memos",
      "all",
      "",
      undefined,
      undefined,
    ]);
    expect(id.startsWith("optimistic-")).toBe(true);
    expect(optimistic).toMatchObject({
      name: id,
      id,
      content: "fresh note",
      visibility: "private",
      state: "normal",
      pinned: false,
      payload: { tags: ["ideas"], client_id: "client-1" },
      creator: "",
      attachments: [],
      can_manage: true,
    });
    // A brand-new row has no server history yet: the three stamps agree.
    expect(optimistic.create_time).toBe(optimistic.update_time);
    expect(optimistic.update_time).toBe(optimistic.display_time);
    expect(Number.isNaN(Date.parse(optimistic.create_time))).toBe(false);
  });

  it("omits empty tags and a missing client id from the payload", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([]),
    );

    prependOptimisticMemo(queryClient, captureInput({ tags: [] }));

    const [optimistic] = memosAt(queryClient, [
      "memos",
      "all",
      "",
      undefined,
      undefined,
    ]);
    expect(optimistic.payload).toEqual({});
  });

  it("honours an explicit visibility", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([]),
    );

    prependOptimisticMemo(queryClient, captureInput({ visibility: "public" }));

    const [optimistic] = memosAt(queryClient, [
      "memos",
      "all",
      "",
      undefined,
      undefined,
    ]);
    expect(optimistic.visibility).toBe("public");
  });

  it("skips every key that is not the plain timeline", () => {
    const queryClient = new QueryClient();
    const filtered: Array<[string, unknown[]]> = [
      ["archived view", ["memos", "archived", "", undefined, undefined]],
      ["trashed view", ["memos", "trashed", "", undefined, undefined]],
      ["search query", ["memos", "all", "report", undefined, undefined]],
      ["tag filter", ["memos", "all", "", "tag:work", undefined]],
      ["untagged toggle", ["memos", "all", "", undefined, true]],
      ["day list", ["memos", "day", "2026-09-20"]],
    ];
    for (const [, key] of filtered) {
      queryClient.setQueryData(key, pages([memo("a")]));
    }

    const id = prependOptimisticMemo(queryClient, captureInput());

    for (const [label, key] of filtered) {
      expect(
        memosAt(queryClient, key).map((entry) => entry.id),
        label,
      ).toEqual(["a"]);
    }
    expect(id.startsWith("optimistic-")).toBe(true);
  });

  it("skips App.tsx's space-prefixed timeline key (documented gap)", () => {
    // App.tsx registers ["memos", space, view, query, tag, untagged] while
    // this module reads the tail positionally as view/query/tag/untagged. A
    // space of "all" therefore lands in the view slot and the real view ("all")
    // in the query slot: a non-empty query, so the plain-timeline test fails
    // and the prepend is skipped. Pinned as-is because the fix is a behaviour
    // change, not a refactor; a caller-side or rule-side correction must
    // update this expectation deliberately.
    const queryClient = new QueryClient();
    const key = ["memos", "all", "all", "", undefined, undefined];
    queryClient.setQueryData(key, pages([memo("a")]));

    prependOptimisticMemo(queryClient, captureInput());

    expect(memosAt(queryClient, key).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("skips the day list key (three segments, day in the query slot)", () => {
    const queryClient = new QueryClient();
    const key = ["memos", "day", "2026-09-20"];
    queryClient.setQueryData(key, pages([memo("a")]));

    prependOptimisticMemo(queryClient, captureInput());

    expect(memosAt(queryClient, key).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("leaves caches without loaded data alone", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // A list whose first fetch failed has a cache entry with no data.
    await queryClient
      .fetchInfiniteQuery({
        queryKey: ["memos", "all", "", undefined, undefined],
        queryFn: async () => {
          throw new Error("offline");
        },
        initialPageParam: undefined,
      })
      .catch(() => undefined);
    expect(queryClient.getQueriesData({ queryKey: ["memos"] })).toHaveLength(1);

    expect(() =>
      prependOptimisticMemo(queryClient, captureInput()),
    ).not.toThrow();
    expect(
      queryClient.getQueryData(["memos", "all", "", undefined, undefined]),
    ).toBeUndefined();
  });

  it("round-trips with removeOptimisticMemo", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([memo("a")]),
    );

    const id = prependOptimisticMemo(queryClient, captureInput());
    removeOptimisticMemo(queryClient, id);

    expect(
      memosAt(queryClient, ["memos", "all", "", undefined, undefined]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["a"]);
  });
});

describe("removeOptimisticMemo", () => {
  it("filters the id out of every page of every memo cache", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([memo("keep"), memo("drop")], [memo("drop")]),
    );
    queryClient.setQueryData(
      ["memos", "archived", "", undefined, undefined],
      pages([memo("drop", "archived")]),
    );

    removeOptimisticMemo(queryClient, "drop");

    expect(
      memosAt(queryClient, ["memos", "all", "", undefined, undefined]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["keep"]);
    expect(
      memosAt(queryClient, ["memos", "archived", "", undefined, undefined]),
    ).toEqual([]);
  });

  it("tolerates an unknown id and caches without data", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all", "", undefined, undefined],
      pages([memo("a")]),
    );
    queryClient.setQueryData(["memos", "trashed"], undefined);

    removeOptimisticMemo(queryClient, "missing");

    expect(
      memosAt(queryClient, ["memos", "all", "", undefined, undefined]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["a"]);
  });
});

describe("optimisticallyPatchMemo", () => {
  it("applies the patch and renews update_time, matching on id or name", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all"],
      pages([memo("a"), memo("b", "normal", { name: "memos/legacy" })]),
    );

    await optimisticallyPatchMemo(queryClient, "a", { pinned: true });
    await optimisticallyPatchMemo(queryClient, "memos/legacy", {
      content: "renamed",
    });

    const [first, second] = memosAt(queryClient, ["memos", "all"]);
    expect(first.pinned).toBe(true);
    expect(second.content).toBe("renamed");
    // Untouched rows keep their original stamps.
    expect(first.create_time).toBe("2026-01-01T00:00:00.000Z");
    expect(first.update_time).not.toBe("2026-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(first.update_time))).toBe(false);
  });

  it("drops the row entirely for a null patch (hard delete)", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["memos", "all"], pages([memo("a"), memo("b")]));

    await optimisticallyPatchMemo(queryClient, "a", null);

    expect(
      memosAt(queryClient, ["memos", "all"]).map((entry) => entry.id),
    ).toEqual(["b"]);
  });

  it("filters the patched row by view, passing other rows through", async () => {
    const queryClient = new QueryClient();
    for (const view of ["all", "archived", "trashed"] as const) {
      queryClient.setQueryData(
        ["memos", view],
        pages([memo("a"), memo("b", "archived"), memo("c", "trashed")]),
      );
    }

    // The patch does not change the target's state, so the target survives
    // only in the view that lists "normal" rows. Every other row is passed
    // through untouched: the view filter decides the fate of the patched memo
    // alone, never the membership of the list.
    await optimisticallyPatchMemo(queryClient, "a", { pinned: true });
    expect(
      memosAt(queryClient, ["memos", "all"]).map((entry) => entry.id),
    ).toEqual(["a", "b", "c"]);
    expect(
      memosAt(queryClient, ["memos", "archived"]).map((entry) => entry.id),
    ).toEqual(["b", "c"]);
    expect(
      memosAt(queryClient, ["memos", "trashed"]).map((entry) => entry.id),
    ).toEqual(["b", "c"]);
  });

  it("drops the patched row when it no longer matches the view", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["memos", "all"], pages([memo("a"), memo("b")]));

    // Trashing the memo while the "all" view is the one on screen.
    await optimisticallyPatchMemo(queryClient, "a", { state: "trashed" });

    expect(
      memosAt(queryClient, ["memos", "all"]).map((entry) => entry.id),
    ).toEqual(["b"]);
  });

  it("skips the view filter for a key with no view segment", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["memos"], pages([memo("a", "archived")]));

    await optimisticallyPatchMemo(queryClient, "a", { pinned: true });

    expect(memosAt(queryClient, ["memos"])).toHaveLength(1);
  });

  it("narrows a search result by the query's explicit scope", async () => {
    const cases: Array<[string, MemoState, boolean]> = [
      // No scope: search shows normal and archived, never trashed.
      ["report", "normal", true],
      ["report", "archived", true],
      ["report", "trashed", false],
      // in:timeline is the plain timeline: normal only.
      ["report in:timeline", "normal", true],
      ["report in:timeline", "archived", false],
      ["report in:timeline", "trashed", false],
      // in:archive narrows to archived.
      ["report in:archive", "normal", false],
      ["report in:archive", "archived", true],
      // in:trash narrows to trashed.
      ["report in:trash", "trashed", true],
      ["report in:trash", "normal", false],
      // A day filter is a search too: it must not apply the view filter.
      ["after:2026-01-01 before:2026-01-02", "archived", true],
      ["after:2026-01-01 before:2026-01-02", "trashed", false],
    ];

    for (const [search, state, survives] of cases) {
      const queryClient = new QueryClient();
      const key = ["memos", "all", search];
      queryClient.setQueryData(key, pages([memo("a", state)]));

      await optimisticallyPatchMemo(queryClient, "a", { pinned: true });

      const label = `${state} under "${search}"`;
      expect(memosAt(queryClient, key), label).toHaveLength(survives ? 1 : 0);
    }
  });

  it("trims the search segment before deciding the scope", async () => {
    const queryClient = new QueryClient();
    const key = ["memos", "all", "  in:archive  "];
    queryClient.setQueryData(key, pages([memo("a", "archived")]));

    await optimisticallyPatchMemo(queryClient, "a", { pinned: true });

    expect(memosAt(queryClient, key)).toHaveLength(1);
  });

  it("ignores non-string search segments (untagged toggle in that slot)", async () => {
    const queryClient = new QueryClient();
    // A boolean in the search position reads as "no search", so the plain
    // view filter applies instead of a search scope.
    const key = ["memos", "all", true];
    queryClient.setQueryData(key, pages([memo("a"), memo("a", "trashed")]));

    await optimisticallyPatchMemo(queryClient, "a", { pinned: true });

    // Both rows carry the target id; the first (normal) survives, the trashed
    // one is filtered out by the "all" view.
    const survivors = memosAt(queryClient, key);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].pinned).toBe(true);
  });

  it("patches across pages and leaves other memo caches untouched", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["memos", "all"],
      pages([memo("a")], [memo("a"), memo("b")]),
    );
    queryClient.setQueryData(["memo-context", "a"], { memo: memo("a") });

    await optimisticallyPatchMemo(queryClient, "a", { pinned: true });

    const data = queryClient.getQueryData<InfiniteData<ListMemosResponse>>([
      "memos",
      "all",
    ]);
    expect(data?.pages[0].memos[0].pinned).toBe(true);
    expect(data?.pages[1].memos[0].pinned).toBe(true);
    expect(data?.pages[1].memos[1].pinned).toBe(false);
    // Detail-page caches are refreshed by invalidation, never patched here.
    expect(queryClient.getQueryData(["memo-context", "a"])).toEqual({
      memo: memo("a"),
    });
  });

  it("returns a snapshot that restores the pre-patch cache", async () => {
    const queryClient = new QueryClient();
    const before = pages([memo("a"), memo("b")]);
    queryClient.setQueryData(["memos", "all"], before);

    const snapshot = await optimisticallyPatchMemo(queryClient, "a", {
      state: "trashed",
    });
    expect(
      memosAt(queryClient, ["memos", "all"]).map((entry) => entry.id),
    ).toEqual(["b"]);

    restoreMemoSnapshot(queryClient, snapshot);

    expect(queryClient.getQueryData(["memos", "all"])).toEqual(before);
  });

  it("does not resurrect a cache that had no data", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await queryClient
      .fetchInfiniteQuery({
        queryKey: ["memos", "all"],
        queryFn: async () => {
          throw new Error("offline");
        },
        initialPageParam: undefined,
      })
      .catch(() => undefined);

    const snapshot = await optimisticallyPatchMemo(queryClient, "a", {
      state: "trashed",
    });

    // The entry is snapshotted (so a rollback walks the same key set) but its
    // missing data is written back as missing, never as an empty list.
    expect(snapshot).toHaveLength(1);
    restoreMemoSnapshot(queryClient, snapshot);
    expect(queryClient.getQueryData(["memos", "all"])).toBeUndefined();
  });
});

describe("restoreMemoSnapshot", () => {
  it("is a no-op without a snapshot", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["memos", "all"], pages([memo("a")]));

    expect(() => restoreMemoSnapshot(queryClient, undefined)).not.toThrow();
    expect(
      memosAt(queryClient, ["memos", "all"]).map((entry) => entry.id),
    ).toEqual(["a"]);
  });
});

describe("memoPatchFromUpdate", () => {
  it("maps every update field onto its memo field", () => {
    expect(
      memoPatchFromUpdate({
        content: "edited",
        visibility: "public",
        status: "archived",
        pinned: true,
        payload: { tags: ["x"] },
      }),
    ).toEqual({
      content: "edited",
      visibility: "public",
      state: "archived",
      pinned: true,
      payload: { tags: ["x"] },
    });
  });

  it("omits absent fields so the patch never clears them", () => {
    expect(memoPatchFromUpdate({})).toEqual({});
    expect(memoPatchFromUpdate({ content: undefined })).toEqual({});
    expect(memoPatchFromUpdate({ pinned: false })).toEqual({ pinned: false });
    expect(memoPatchFromUpdate({ status: "trashed" })).toEqual({
      state: "trashed",
    });
  });
});
