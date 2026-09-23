import type { FlareMoDb } from "@flaremo/db";
import { memoryItems } from "@flaremo/db";
import { and, eq, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { insertEmbeddingTask } from "../embedding-outbox";
import { appendMemoryEvent } from "./shared";

/**
 * Daily memory-ledger upkeep, driven by the shared maintenance cron.
 *
 * Three rules from the design need a clock rather than a request:
 *   1. An unanswered conjecture is noise, not knowledge — it expires (§IV.5.2).
 *   2. A memory whose validity window has ended must leave the vector index, or
 *      recall keeps paying to rank rows it will always filter out (§VI.5).
 *   3. The same is true once `expires_at` passes.
 *
 * Everything here is idempotent: it re-derives state from timestamps, so a
 * missed or repeated run converges on the same result.
 */

/** Conjectures the user has not acted on within this window are retired. */
export const INFERRED_PROPOSAL_TTL_DAYS = 14;
/** Cap per run so a backlog drains over days instead of in one cron spike. */
const MAINTENANCE_BATCH = 200;

export async function expireStaleInferredProposals(
  db: FlareMoDb,
  now = new Date(),
  limit = MAINTENANCE_BATCH,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - INFERRED_PROPOSAL_TTL_DAYS * 86_400_000,
  ).toISOString();

  const stale = await db
    .select({ id: memoryItems.id, userId: memoryItems.userId })
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.verification, "inferred"),
        eq(memoryItems.status, "active"),
        eq(memoryItems.needsReview, true),
        lt(memoryItems.createdAt, cutoff),
      ),
    )
    .limit(limit);

  if (stale.length === 0) return 0;
  const nowIso = now.toISOString();

  for (const row of stale) {
    await db
      .update(memoryItems)
      .set({
        status: "archived",
        needsReview: false,
        reviewReason: "expired",
        updatedAt: nowIso,
      })
      .where(
        and(eq(memoryItems.id, row.id), eq(memoryItems.userId, row.userId)),
      );

    await appendMemoryEvent(
      db,
      row.userId,
      row.id,
      "archived",
      "agent",
      "maintenance",
      { reason: "inferred_expired", ttl_days: INFERRED_PROPOSAL_TTL_DAYS },
    );
  }
  return stale.length;
}

/**
 * Queue vector cleanup for memories that have left the answerable set but still
 * have an index entry: superseded, archived, expired, or past their window.
 * Deletion is queued (not executed inline) so the outbox owns index mutations,
 * matching every other embedding write in the codebase.
 */
export async function reclaimStaleMemoryVectors(
  db: FlareMoDb,
  now = new Date(),
  limit = MAINTENANCE_BATCH,
): Promise<number> {
  const nowIso = now.toISOString();

  const stale = await db
    .select({ id: memoryItems.id, userId: memoryItems.userId })
    .from(memoryItems)
    .where(
      and(
        // Only rows that were indexed at some point need reclaiming.
        or(
          eq(memoryItems.embeddingStatus, "indexed"),
          eq(memoryItems.embeddingStatus, "pending"),
          eq(memoryItems.embeddingStatus, "error"),
        ),
        or(
          sql`${memoryItems.status} != 'active'`,
          // An active row can still be out of the answerable set: its window has
          // closed, or it carries an expiry that has passed.
          and(isNotNull(memoryItems.validTo), lte(memoryItems.validTo, nowIso)),
          and(
            isNotNull(memoryItems.expiresAt),
            lte(memoryItems.expiresAt, nowIso),
          ),
        ),
      ),
    )
    .limit(limit);

  let queued = 0;
  for (const row of stale) {
    await insertEmbeddingTask(db, {
      userId: row.userId,
      resourceType: "memory",
      resourceId: row.id,
      operation: "delete",
      createdAt: nowIso,
    });
    await db
      .update(memoryItems)
      .set({ embeddingStatus: "not_indexed", updatedAt: nowIso })
      .where(
        and(eq(memoryItems.id, row.id), eq(memoryItems.userId, row.userId)),
      );
    queued += 1;
  }
  return queued;
}

/** Convenience wrapper used by the worker's daily maintenance run. */
export async function runMemoryLedgerMaintenance(
  db: FlareMoDb,
  now = new Date(),
): Promise<{ expiredProposals: number; reclaimedVectors: number }> {
  const expiredProposals = await expireStaleInferredProposals(db, now);
  const reclaimedVectors = await reclaimStaleMemoryVectors(db, now);
  return { expiredProposals, reclaimedVectors };
}
