import {
  type FlareMoDb,
  type MemosSseEventRow,
  memosSseEvents,
  type UserRow,
} from "@flaremo/db";
import { and, asc, gt, sql } from "drizzle-orm";
import { isActiveTeamMember, type TeamViewer } from "./team-permissions";

export const MEMOS_SSE_EVENT_TYPES = [
  "memo.created",
  "memo.updated",
  "memo.deleted",
  "memo.comment.created",
  "reaction.upserted",
  "reaction.deleted",
] as const;

export type MemosSseEventType = (typeof MEMOS_SSE_EVENT_TYPES)[number];

export type NewMemosSseEvent = {
  type: MemosSseEventType;
  name: string;
  parent?: string;
  visibility: "private" | "protected" | "public";
  /** Owning organization; required so protected events stay org-scoped. */
  teamId?: string | null;
  creatorId: string;
  createdAt: string;
};

/**
 * Return an insert statement so resource mutations can append their event in
 * the same D1 batch as the mutation itself. Keeping this as a statement
 * factory prevents a successful memo write from becoming an SSE ghost event.
 */
export function insertMemosSseEvent(db: FlareMoDb, event: NewMemosSseEvent) {
  return db.insert(memosSseEvents).values({
    type: event.type,
    name: event.name,
    parent: event.parent ?? null,
    visibility: event.visibility,
    teamId: event.teamId ?? null,
    creatorId: event.creatorId,
    createdAt: event.createdAt,
  });
}

export async function getLatestMemosSseEventId(db: FlareMoDb) {
  const row = await db
    .select({
      id: sql<number>`coalesce(max(${memosSseEvents.id}), 0)`.mapWith(Number),
    })
    .from(memosSseEvents)
    .get();
  return row?.id ?? 0;
}

/**
 * Read a bounded replay page using the same visibility rules as upstream
 * Memos' SSE hub: private events are visible only to their creator;
 * protected/public events are visible to any active team member.
 */
export async function listMemosSseEvents(
  db: FlareMoDb,
  afterId: number,
  limit = 32,
): Promise<MemosSseEventRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 128));
  const filters = [gt(memosSseEvents.id, Math.max(0, Math.trunc(afterId)))];

  return db
    .select()
    .from(memosSseEvents)
    .where(and(...filters))
    .orderBy(asc(memosSseEvents.id))
    .limit(safeLimit);
}

/**
 * Delivery mirrors the memo read boundary: private events go only to their
 * creator, protected events only to members of the event's organization, and
 * public events to any active member. A protected event without a team id is
 * undeliverable (fail-closed for legacy rows written before the column).
 */
export function canReceiveMemosSseEvent(
  event: MemosSseEventRow,
  user: TeamViewer,
) {
  if (!isActiveTeamMember(user)) return false;
  if (event.visibility === "private") return event.creatorId === user.id;
  if (event.visibility === "protected") {
    return Boolean(event.teamId && event.teamId === user.teamOrganizationId);
  }
  return true;
}
