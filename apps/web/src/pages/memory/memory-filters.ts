import type { Memory } from "@/api";

/** Bucket a filtered memory list into the five tab views. */
export function groupMemories(filtered: Memory[]) {
  const core = filtered.filter(
    (m) => m.tier === "core" && m.status === "active",
  );
  const projects = filtered.filter((m) => m.scope_type === "project");
  const recent = [...filtered].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  const archive = filtered.filter((m) =>
    ["superseded", "archived", "deleted"].includes(m.status),
  );
  return { core, projects, recent, archive };
}

export function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}
