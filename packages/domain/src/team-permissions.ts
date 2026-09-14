import type { MemoRow, UserRow } from "@flaremo/db";
import { memos } from "@flaremo/db";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { ForbiddenError } from "./errors";

export type TeamRole = "owner" | "admin" | "member";

/**
 * The actor for every authorization decision: a domain user plus their role
 * in the deployment's team (the Better Auth organization member row), joined
 * once when the credential is resolved. Team membership is the single source
 * of truth for roles — the `users` table carries no role column — so a
 * viewer built without a membership lookup fails closed to own-memos-only
 * access.
 */
export type TeamViewer = UserRow & {
  teamRole?: TeamRole | null;
  teamOrganizationId?: string | null;
};

export function isActiveTeamMember(user: UserRow | null): user is UserRow {
  return Boolean(user && user.status === "active");
}

/** The viewer's team role, or null for a viewer outside the team. */
export function teamRoleOf(user: TeamViewer | null): TeamRole | null {
  if (!user || user.status !== "active") return null;
  return user.teamRole ?? null;
}

export function isTeamOwner(user: TeamViewer | null): boolean {
  return teamRoleOf(user) === "owner";
}

export function isTeamAdmin(user: TeamViewer | null): boolean {
  const role = teamRoleOf(user);
  return role === "owner" || role === "admin";
}

/**
 * Instance-level gate for deployment settings (registration, branding,
 * embedding rebuilds): only the bootstrap owner account qualifies. Team
 * administration is separate — see the team-permission predicates below.
 */
export function isInstanceOwner(user: UserRow | null): boolean {
  return Boolean(user && user.status === "active" && user.id === "users/owner");
}

/**
 * SQL authorization boundary for memo list and search queries.
 *
 * The viewer always sees their own rows in every state. Other rows are team
 * rows of the viewer's organization or public rows anywhere; personal rows
 * (teamId NULL) are never visible to anyone but the author. Members only
 * receive normal rows; administrators may also load the team's archived or
 * trashed rows so they can manage them.
 */
export function memoReadScope(user: TeamViewer | null): SQL {
  if (!user || user.status !== "active") {
    return user
      ? sql`0 = 1`
      : (and(eq(memos.visibility, "public"), eq(memos.status, "normal")) ??
          sql`0 = 1`);
  }

  const orgId = user.teamOrganizationId ?? null;
  const clauses = [
    eq(memos.userId, user.id),
    and(eq(memos.visibility, "public"), eq(memos.status, "normal")),
  ];

  if (orgId) {
    if (isTeamAdmin(user)) {
      clauses.push(
        and(
          eq(memos.teamId, orgId),
          inArray(memos.visibility, ["protected", "public"]),
        ),
      );
    } else {
      clauses.push(
        and(
          eq(memos.teamId, orgId),
          eq(memos.visibility, "protected"),
          eq(memos.status, "normal"),
        ),
      );
    }
  }

  return or(...clauses) ?? sql`0 = 1`;
}

export function canReadMemo(user: TeamViewer | null, memo: MemoRow): boolean {
  if (!user || user.status !== "active") {
    return !user && memo.visibility === "public" && memo.status === "normal";
  }
  if (memo.userId === user.id) return true;
  // Personal memos (teamId NULL, "private") are author-only without exception.
  if (!memo.teamId || memo.visibility === "private") return false;
  if (memo.teamId === user.teamOrganizationId) {
    // Own team: administrators also load archived/trashed rows to manage them.
    if (isTeamAdmin(user)) return true;
    return memo.status === "normal";
  }
  // Content published outside the viewer's team is only world-readable.
  return memo.visibility === "public" && memo.status === "normal";
}

/**
 * Edit the memo's content, payload, pinned flag, or visibility. Own memos
 * only; another author's team memo requires the team owner. Administrators
 * govern memos (status transitions) but never rewrite them.
 */
export function canEditMemo(user: TeamViewer | null, memo: MemoRow): boolean {
  if (!user || user.status !== "active") return false;
  if (memo.userId === user.id) return true;
  return isTeamOwner(user) && memo.teamId !== null;
}

/**
 * Govern the memo's lifecycle: archive, restore, or move to the recycle bin.
 * Own memos only; another author's team memo requires a team administrator.
 */
export function canGovernMemo(user: TeamViewer | null, memo: MemoRow): boolean {
  if (!user || user.status !== "active") return false;
  if (memo.userId === user.id) return true;
  return isTeamAdmin(user) && memo.teamId !== null;
}

export const canDeleteMemo = canEditMemo;

export function assertCanEditMemo(user: TeamViewer, memo: MemoRow): void {
  if (!canEditMemo(user, memo)) {
    throw new ForbiddenError("You do not have permission to edit this memo.");
  }
}

export function assertCanGovernMemo(user: TeamViewer, memo: MemoRow): void {
  if (!canGovernMemo(user, memo)) {
    throw new ForbiddenError(
      "You do not have permission to change this memo's state.",
    );
  }
}

export function assertCanDeleteMemo(user: TeamViewer, memo: MemoRow): void {
  if (!canDeleteMemo(user, memo)) {
    throw new ForbiddenError("You do not have permission to delete this memo.");
  }
}

/**
 * A viewer who may read the memo. Memo writes need the finer-grained
 * predicates above; read-side helpers (attachments, relations, social) use
 * this to share one error message.
 */
export function assertCanReadMemo(
  user: TeamViewer | null,
  memo: MemoRow,
): void {
  if (!canReadMemo(user, memo)) {
    throw new ForbiddenError("You do not have permission to read this memo.");
  }
}
