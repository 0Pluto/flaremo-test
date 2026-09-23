import type { UpdateMemoryInput } from "@flaremo/contracts";
import type { FlareMoDb, MemoryItemRow, UserRow } from "@flaremo/db";
import { memoryItems, memoryRelations } from "@flaremo/db";
import { and, eq, sql } from "drizzle-orm";
import { insertEmbeddingTask } from "../embedding-outbox";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { createResourceId } from "../ids";
import { assertMemoryCountQuota, type QuotaScope } from "../quotas";
import { memoryToDto } from "./dto";
import {
  appendMemoryEvent,
  appendRevision,
  assertAgentCanMutate,
  assertMemoryContentLength,
  assertNoSecrets,
  computeFingerprint,
  insertMemoryEvidence,
  type MemoryActor,
  type MemoryWriteInput,
  normalizeMemoryContent,
  requireMemory,
  resolveConfidenceForActor,
  resolveVerificationForActor,
} from "./shared";

export async function createMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  input: MemoryWriteInput,
  scope?: QuotaScope,
) {
  await assertMemoryCountQuota(db, scope?.userLimits, user.id);
  const content = normalizeMemoryContent(input.content);
  if (!content) throw new ValidationError("Memory content cannot be empty.");
  assertMemoryContentLength(content);
  assertNoSecrets(content);

  // A retried write must return the first result, not create a twin. This check
  // is a fast path only; the partial unique index on (user_id, idempotency_key)
  // is the real boundary and is handled after the insert below.
  if (input.idempotencyKey) {
    const prior = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.idempotencyKey, input.idempotencyKey),
        ),
      )
      .get();
    if (prior) {
      return { duplicate: true as const, memory: memoryToDto(prior) };
    }
  }

  const fingerprint = await computeFingerprint(
    user,
    content,
    input.type,
    input.kind,
    input.scopeType,
    input.scopeKey,
  );

  const existing = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.userId, user.id),
        eq(memoryItems.fingerprint, fingerprint),
        sql`${memoryItems.status} != 'deleted'`,
      ),
    )
    .get();
  if (existing) {
    return { duplicate: true as const, memory: memoryToDto(existing) };
  }

  const now = new Date().toISOString();
  const validFrom = input.validFrom ?? now;
  const newId = createResourceId("memories");

  let targetVerification = resolveVerificationForActor(actor, input);
  let reviewReason: string | null = null;
  let supersededExistingId: string | null = null;

  // Fact key & Supersession Matrix (Design §VI.4)
  if (input.factKey) {
    const existingFact = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.factKey, input.factKey),
          eq(memoryItems.status, "active"),
        ),
      )
      .get();

    if (existingFact) {
      const isHumanAsset =
        existingFact.verification === "confirmed" ||
        existingFact.verification === "locked";

      if (isHumanAsset && actor.type === "agent") {
        // AI CANNOT auto-supersede human assets (📌/✅).
        // Must degrade into an inferred proposal in review inbox.
        targetVerification = "inferred";
        reviewReason = "supersede_proposal";
      } else {
        // Auto-supersede: Either AI-to-AI or human edit.
        supersededExistingId = existingFact.id;
      }
    }
  }

  const needsReview =
    targetVerification === "inferred" || reviewReason !== null;

  // Retirement of the previous version and insertion of its successor are one
  // unit of work: the partial unique index on (user_id, fact_key) only tolerates
  // one active row, so a crash between the two steps would leave the fact with
  // no live version at all. `db.batch` runs them in a single D1 transaction.
  let oldRowToSupersede: MemoryItemRow | null = null;
  if (supersededExistingId) {
    oldRowToSupersede =
      (await db
        .select()
        .from(memoryItems)
        .where(eq(memoryItems.id, supersededExistingId))
        .get()) ?? null;

    if (oldRowToSupersede) {
      await appendRevision(
        db,
        user,
        oldRowToSupersede,
        actor.type === "user" ? "user" : "agent",
        actor.type === "agent" ? actor.name : null,
      );
    }
  }

  const insertStatement = db.insert(memoryItems).values({
    id: newId,
    userId: user.id,
    content,
    type: input.type,
    kind: input.kind,
    scopeType: input.scopeType,
    scopeKey: input.scopeKey,
    factKey: input.factKey ?? null,
    tags: input.tags ?? [],
    tier: input.tier,
    verification: targetVerification,
    status: "active",
    importance: input.importance,
    confidence: resolveConfidenceForActor(actor, input),
    needsReview,
    reviewReason: reviewReason ?? (needsReview ? "inferred" : null),
    createdByType: actor.type === "user" ? "user" : "agent",
    sourceAgent: actor.type === "agent" ? actor.name : input.sourceAgent,
    sourceSession: input.sourceSession,
    sourceRef: input.sourceRef,
    validFrom,
    validTo: input.validTo ?? null,
    observedAt: input.observedAt ?? now,
    expiresAt: input.expiresAt ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    fingerprint,
    createdAt: now,
    updatedAt: now,
  });

  // Bi-temporal rule: the old version's valid_to is the new version's
  // valid_from (never "now"), so a backdated successor cannot produce
  // overlapping validity windows (§VI.5).
  const retireStatement = oldRowToSupersede
    ? db
        .update(memoryItems)
        .set({
          status: "superseded" as const,
          supersededById: newId,
          supersededAt: now,
          validTo: validFrom,
          updatedAt: now,
        })
        .where(eq(memoryItems.id, oldRowToSupersede.id))
    : null;

  // `db.batch` gives the transaction; D1 returns per-statement results rather
  // than rows, so the written row is read back by its id afterwards. That second
  // read is what makes the insert statement's own RETURNING unnecessary here.
  try {
    if (retireStatement) {
      await db.batch([retireStatement, insertStatement]);
    } else {
      await db.batch([insertStatement]);
    }
  } catch (error) {
    // Two writers raced on the same fact_key or idempotency key. The indexes are
    // the boundary; translate the storage error into a caller-usable answer
    // instead of leaking a raw SQLite constraint message.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("memory_items_user_idempotency_idx")) {
      // A retry that raced its own first attempt should still see that first
      // result rather than an error, so honour the idempotency contract here too.
      if (input.idempotencyKey) {
        const winner = await db
          .select()
          .from(memoryItems)
          .where(
            and(
              eq(memoryItems.userId, user.id),
              eq(memoryItems.idempotencyKey, input.idempotencyKey),
            ),
          )
          .get();
        if (winner) {
          return { duplicate: true as const, memory: memoryToDto(winner) };
        }
      }
      throw new ConflictError(
        "This write was already applied under the same idempotency key.",
      );
    }
    if (message.includes("memory_items_user_fact_key_active_idx")) {
      throw new ConflictError(
        "Another active memory already exists with this fact key.",
      );
    }
    throw error;
  }

  const row = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.id, newId), eq(memoryItems.userId, user.id)))
    .get();
  if (!row) {
    throw new NotFoundError(`Memory was not persisted: ${newId}`);
  }

  // If superseded existing fact, log events, relations, and cleanup vector
  if (oldRowToSupersede && supersededExistingId) {
    await appendMemoryEvent(
      db,
      user.id,
      supersededExistingId,
      "superseded",
      actor.type,
      actor.type === "agent" ? actor.name : null,
      { superseded_by_id: newId },
    );

    // Link supersedes relation
    await db.insert(memoryRelations).values({
      id: createResourceId("memories"),
      userId: user.id,
      memoryId: newId,
      relatedMemoryId: supersededExistingId,
      type: "supersedes",
      createdAt: now,
    });

    // Drop the retired version's vector only once its validity has actually
    // ended. A successor dated in the future leaves the current version
    // legitimately effective until that date, so its vector must stay
    // searchable; recall's bi-temporal filter is what keeps it out of results
    // after expiry, and the daily maintenance sweep drops it then (§VI.5).
    if (validFrom <= now) {
      await insertEmbeddingTask(db, {
        userId: user.id,
        resourceType: "memory",
        resourceId: supersededExistingId,
        operation: "delete",
        createdAt: now,
      });
    }
  } else if (reviewReason === "supersede_proposal" && input.factKey) {
    // When proposal is created against human asset, link relation as contradicts/proposed
    const existingFact = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.factKey, input.factKey),
          eq(memoryItems.status, "active"),
        ),
      )
      .get();

    if (existingFact) {
      await db.insert(memoryRelations).values({
        id: createResourceId("memories"),
        userId: user.id,
        memoryId: newId,
        relatedMemoryId: existingFact.id,
        type: "contradicts",
        createdAt: now,
      });

      await appendMemoryEvent(
        db,
        user.id,
        existingFact.id,
        "challenged",
        "agent",
        actor.type === "agent" ? actor.name : null,
        { proposal_id: newId },
      );
    }
  }

  // Insert evidence items if provided
  if (input.evidence && input.evidence.length > 0) {
    for (const ev of input.evidence) {
      await insertMemoryEvidence(db, user.id, row.id, ev);
    }
  }

  // Log creation event
  await appendMemoryEvent(
    db,
    user.id,
    row.id,
    targetVerification === "locked"
      ? "locked"
      : targetVerification === "confirmed"
        ? "confirmed"
        : "created",
    actor.type,
    actor.type === "agent" ? actor.name : null,
    { fact_key: input.factKey },
  );

  // Inferred proposals do not enter vector index until confirmed (§VI.8)
  if (targetVerification !== "inferred") {
    await insertEmbeddingTask(db, {
      userId: user.id,
      resourceType: "memory",
      resourceId: row.id,
      operation: "index",
      createdAt: now,
    });
  }

  return { duplicate: false as const, memory: memoryToDto(row) };
}

export async function updateMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
  input: UpdateMemoryInput,
) {
  const existing = await requireMemory(db, user, id);
  assertAgentCanMutate(actor, existing);
  if (existing.status === "deleted") {
    throw new NotFoundError(`Memory not found: ${id}`);
  }

  const next = { ...existing };
  if (input.content !== undefined) {
    next.content = normalizeMemoryContent(input.content);
    if (!next.content)
      throw new ValidationError("Memory content cannot be empty.");
    assertMemoryContentLength(next.content);
    assertNoSecrets(next.content);
  }
  if (input.type !== undefined) next.type = input.type;
  if (input.kind !== undefined) next.kind = input.kind;
  if (input.scope_type !== undefined) next.scopeType = input.scope_type;
  if (input.scope_key !== undefined) next.scopeKey = input.scope_key ?? null;
  if (input.tier !== undefined) next.tier = input.tier;
  if (input.importance !== undefined) next.importance = input.importance;

  if (input.fact_key !== undefined) {
    if (input.fact_key !== existing.factKey && input.fact_key !== null) {
      // Check collision
      const clash = await db
        .select()
        .from(memoryItems)
        .where(
          and(
            eq(memoryItems.userId, user.id),
            eq(memoryItems.factKey, input.fact_key),
            eq(memoryItems.status, "active"),
            sql`${memoryItems.id} != ${id}`,
          ),
        )
        .get();
      if (clash) {
        throw new ConflictError(
          "Another active memory already exists with this fact key.",
        );
      }
    }
    next.factKey = input.fact_key ?? null;
  }
  if (input.tags !== undefined) next.tags = input.tags;
  if (input.valid_from !== undefined) next.validFrom = input.valid_from ?? null;
  if (input.valid_to !== undefined) next.validTo = input.valid_to ?? null;
  if (input.expires_at !== undefined) next.expiresAt = input.expires_at ?? null;

  next.fingerprint = await computeFingerprint(
    user,
    next.content,
    next.type,
    next.kind,
    next.scopeType,
    next.scopeKey,
  );

  const duplicate = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.userId, user.id),
        eq(memoryItems.fingerprint, next.fingerprint),
        sql`${memoryItems.id} != ${id}`,
        sql`${memoryItems.status} != 'deleted'`,
      ),
    )
    .get();
  if (duplicate) {
    throw new ConflictError("This memory already exists.");
  }

  const now = new Date().toISOString();
  // A user edit is an affirmation: it upgrades observed/inferred to confirmed,
  // while a locked memory stays locked (§IV.2).
  if (actor.type === "user" && existing.verification !== "locked") {
    next.verification = "confirmed";
    next.needsReview = false;
    next.reviewReason = null;
  }

  await appendRevision(
    db,
    user,
    existing,
    actor.type === "user" ? "user" : "agent",
    actor.type === "agent" ? actor.name : null,
  );

  await db
    .update(memoryItems)
    .set({
      content: next.content,
      type: next.type,
      kind: next.kind,
      scopeType: next.scopeType,
      scopeKey: next.scopeKey,
      factKey: next.factKey,
      tags: next.tags,
      tier: next.tier,
      verification: next.verification,
      importance: next.importance,
      needsReview: next.needsReview,
      reviewReason: next.reviewReason,
      validFrom: next.validFrom,
      validTo: next.validTo,
      expiresAt: next.expiresAt,
      fingerprint: next.fingerprint,
      updatedAt: now,
    })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  if (
    actor.type === "user" &&
    existing.verification !== "confirmed" &&
    existing.verification !== "locked"
  ) {
    await appendMemoryEvent(db, user.id, id, "confirmed", "user", null);
  }

  if (input.content !== undefined) {
    await insertEmbeddingTask(db, {
      userId: user.id,
      resourceType: "memory",
      resourceId: existing.id,
      operation: "reindex",
      createdAt: now,
    });
  }

  const updated = await requireMemory(db, user, id);
  return memoryToDto(updated);
}
