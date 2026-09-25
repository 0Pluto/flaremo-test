import type { Memory } from "@/api";
import { formatTimestamp } from "@/lib/date-format";

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

/** Formats a project scope key (filesystem path or git URL) into a clean display name. */
export function formatProjectName(scopeKey?: string | null): string {
  if (!scopeKey) return "项目";
  if (scopeKey.startsWith("github:")) {
    const repo = scopeKey.slice(7);
    return repo.split("/").pop() || repo;
  }
  const normalized = scopeKey.replace(/[\\/]+$/, "");
  const last = normalized.split(/[\\/]/).pop();
  return last || scopeKey;
}

export { formatTimestamp };
