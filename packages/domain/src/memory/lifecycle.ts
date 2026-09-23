import type {
  MemoryForgetReason,
  ResolveProposalInput,
} from "@flaremo/contracts";
import type { FlareMoDb, MemoryItemRow, UserRow } from "@flaremo/db";
import {
  memoryEvents,
  memoryEvidence,
  memoryItems,
  memoryRejections,
  memoryRelations,
  memoryResourceLinks,
  memoryRevisions,
} from "@flaremo/db";
import { and, eq, or, sql } from "drizzle-orm";
import { insertEmbeddingTask } from "../embedding-outbox";
import { ConflictError, ForbiddenError } from "../errors";
import { createResourceId } from "../ids";
import { memoryToDto } from "./dto";
import {
  appendMemoryEvent,
  appendRevision,
  assertAgentCanMutate,
  computeFingerprint,
  type MemoryActor,
  normalizeMemoryContent,
  requireMemory,
} from "./shared";

export type ForgetMemoryInput = {
  reason: MemoryForgetReason;
};

async function setVerification(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
  verification: MemoryItemRow["verification"],
  reason?: string,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError(
      "Only the user may change a memory's verification.",
    );
  }
  const existing = await requireMemory(db, user, id);
  await appendRevision(db, user, existing, "user");
  const now = new Date().toISOString();
  await db
    .update(memoryItems)
    .set({
      verification,
      needsReview: false,
      reviewReason: reason ?? null,
      updatedAt: now,
    })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  await appendMemoryEvent(
    db,
    user.id,
    id,
    verification === "locked" ? "locked" : "confirmed",
    "user",
    null,
  );

  return memoryToDto(await requireMemory(db, user, id));
}

export function confirmMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  return setVerification(db, user, actor, id, "confirmed");
}

export function lockMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  return setVerification(db, user, actor, id, "locked");
}

export function pinMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  return lockMemory(db, user, actor, id);
}

export async function unlockMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError("Only the user may unpin a memory.");
  }
  const existing = await requireMemory(db, user, id);
  await appendRevision(db, user, existing, "user");
  const now = new Date().toISOString();
  await db
    .update(memoryItems)
    .set({
      verification: "confirmed",
      updatedAt: now,
    })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  await appendMemoryEvent(db, user.id, id, "unlocked", "user", null);
  return memoryToDto(await requireMemory(db, user, id));
}

export function unpinMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  return unlockMemory(db, user, actor, id);
}

export async function archiveMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError("Only the user may archive a memory.");
  }
  const existing = await requireMemory(db, user, id);
  await appendRevision(db, user, existing, "user");
  const now = new Date().toISOString();
  // Archival does NOT mutate valid_from or valid_to (§VI.5)
  await db
    .update(memoryItems)
    .set({
      status: "archived",
      needsReview: false,
      reviewReason: null,
      updatedAt: now,
    })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  await appendMemoryEvent(db, user.id, id, "archived", "user", null);

  await insertEmbeddingTask(db, {
    userId: user.id,
    resourceType: "memory",
    resourceId: id,
    operation: "delete",
    createdAt: now,
  });

  return memoryToDto(await requireMemory(db, user, id));
}

export async function restoreMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError("Only the user may restore a memory.");
  }
  const existing = await requireMemory(db, user, id);
  if (existing.status !== "archived") {
    return memoryToDto(existing);
  }

  // Double-active check (§IV.3): If item has fact_key, ensure no active conflict exists
  if (existing.factKey) {
    const activeConflict = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.factKey, existing.factKey),
          eq(memoryItems.status, "active"),
          sql`${memoryItems.id} != ${id}`,
        ),
      )
      .get();
    if (activeConflict) {
      throw new ConflictError(
        "Cannot restore: another memory with the same fact key is currently active.",
      );
    }
  }

  const now = new Date().toISOString();
  await appendRevision(db, user, existing, "user");
  await db
    .update(memoryItems)
    .set({
      status: "active",
      updatedAt: now,
    })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  await appendMemoryEvent(db, user.id, id, "restored", "user", null);

  await insertEmbeddingTask(db, {
    userId: user.id,
    resourceType: "memory",
    resourceId: id,
    operation: "index",
    createdAt: now,
  });

  return memoryToDto(await requireMemory(db, user, id));
}

export async function hardDeleteMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError("Only the user may hard-delete a memory.");
  }
  await requireMemory(db, user, id);

  // Cascade deletions (§VI.9): evidence, revisions, events, relations, links
  await db.delete(memoryEvidence).where(eq(memoryEvidence.memoryId, id));
  await db.delete(memoryEvents).where(eq(memoryEvents.memoryId, id));
  await db.delete(memoryRevisions).where(eq(memoryRevisions.memoryId, id));
  await db
    .delete(memoryResourceLinks)
    .where(eq(memoryResourceLinks.memoryId, id));
  await db
    .delete(memoryRelations)
    .where(
      or(
        eq(memoryRelations.memoryId, id),
        eq(memoryRelations.relatedMemoryId, id),
      ),
    );

  await db
    .delete(memoryItems)
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  await insertEmbeddingTask(db, {
    userId: user.id,
    resourceType: "memory",
    resourceId: id,
    operation: "delete",
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
}

export async function forgetMemory(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
  input: ForgetMemoryInput,
) {
  const existing = await requireMemory(db, user, id);
  assertAgentCanMutate(actor, existing);
  const now = new Date().toISOString();
  await appendRevision(
    db,
    user,
    existing,
    actor.type === "user" ? "user" : "agent",
    actor.type === "agent" ? actor.name : null,
  );
  const status: MemoryItemRow["status"] =
    input.reason === "superseded" ? "superseded" : "archived";
  await db
    .update(memoryItems)
    .set({ status, updatedAt: now })
    .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, user.id)));

  await appendMemoryEvent(
    db,
    user.id,
    id,
    status === "superseded" ? "superseded" : "archived",
    actor.type,
    actor.type === "agent" ? actor.name : null,
  );

  await insertEmbeddingTask(db, {
    userId: user.id,
    resourceType: "memory",
    resourceId: existing.id,
    operation: "delete",
    createdAt: now,
  });
  return memoryToDto(await requireMemory(db, user, id));
}

export async function resolveProposal(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  proposalId: string,
  input: ResolveProposalInput,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError("Only the user can resolve proposals.");
  }
  const proposal = await requireMemory(db, user, proposalId);
  const now = new Date().toISOString();

  // The user adjudicates AI assets: anything still awaiting review, plus
  // AI-tier items the user wants to dismiss outright ("this observation is
  // wrong, stop repeating it" — which is also what feeds the negative-feedback
  // guard). A human-owned item is not adjudicable, and a row that was already
  // resolved cannot be resolved again — that is what stops a dismissed card
  // from being resurrected by a second click.
  const adjudicableTier =
    proposal.verification === "observed" ||
    proposal.verification === "inferred";
  const isPending =
    proposal.status === "active" &&
    !proposal.rejectedAt &&
    (proposal.needsReview || adjudicableTier);
  if (!isPending) {
    throw new ConflictError(
      "This proposal has already been resolved and cannot be adjudicated again.",
    );
  }

  if (input.action === "reject") {
    await appendRevision(db, user, proposal, "user");
    await db
      .update(memoryItems)
      .set({
        status: "archived",
        needsReview: false,
        reviewReason: "rejected",
        rejectedAt: now,
        updatedAt: now,
      })
      .where(eq(memoryItems.id, proposalId));

    // 2. Insert into memory_rejections for negative feedback guard (§IV.5, §VI.8)
    await db.insert(memoryRejections).values({
      id: createResourceId("memories"),
      userId: user.id,
      scopeType: proposal.scopeType,
      scopeKey: proposal.scopeKey,
      factKey: proposal.factKey,
      rejectedContent: proposal.content,
      fingerprint: proposal.fingerprint,
      reason: input.rejection_reason ?? null,
      createdAt: now,
    });

    await appendMemoryEvent(db, user.id, proposalId, "archived", "user", null, {
      rejection_reason: input.rejection_reason,
    });

    return {
      resolved: true,
      action: "rejected" as const,
      memory: memoryToDto(await requireMemory(db, user, proposalId)),
    };
  }

  // Action is accept or modify
  let content = proposal.content;
  let fingerprint = proposal.fingerprint;
  if (input.action === "modify" && input.modified_content) {
    content = normalizeMemoryContent(input.modified_content);
    fingerprint = await computeFingerprint(
      user,
      content,
      proposal.type,
      proposal.kind,
      proposal.scopeType,
      proposal.scopeKey,
    );
  }

  // Supersede previous active fact if proposal has fact_key (§VI.4 matrix)
  if (proposal.factKey) {
    const existingActive = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.factKey, proposal.factKey),
          eq(memoryItems.status, "active"),
          sql`${memoryItems.id} != ${proposalId}`,
        ),
      )
      .get();

    if (existingActive) {
      await appendRevision(db, user, existingActive, "user");
      // valid_to = proposal.valid_from
      const newValidFrom = proposal.validFrom ?? now;
      await db
        .update(memoryItems)
        .set({
          status: "superseded",
          supersededById: proposalId,
          supersededAt: now,
          validTo: newValidFrom,
          updatedAt: now,
        })
        .where(eq(memoryItems.id, existingActive.id));

      await appendMemoryEvent(
        db,
        user.id,
        existingActive.id,
        "superseded",
        "user",
        null,
        { superseded_by_id: proposalId },
      );

      // Link supersedes relation
      await db.insert(memoryRelations).values({
        id: createResourceId("memories"),
        userId: user.id,
        memoryId: proposalId,
        relatedMemoryId: existingActive.id,
        type: "supersedes",
        createdAt: now,
      });

      // Cleanup vector of superseded memory
      await insertEmbeddingTask(db, {
        userId: user.id,
        resourceType: "memory",
        resourceId: existingActive.id,
        operation: "delete",
        createdAt: now,
      });
    }
  }

  // Upgrade proposal to confirmed
  await appendRevision(db, user, proposal, "user");
  await db
    .update(memoryItems)
    .set({
      content,
      fingerprint,
      verification: "confirmed",
      needsReview: false,
      reviewReason: null,
      updatedAt: now,
    })
    .where(eq(memoryItems.id, proposalId));

  await appendMemoryEvent(db, user.id, proposalId, "confirmed", "user", null);

  // Now index vector since it's confirmed
  await insertEmbeddingTask(db, {
    userId: user.id,
    resourceType: "memory",
    resourceId: proposalId,
    operation: "index",
    createdAt: now,
  });

  return {
    resolved: true,
    action:
      input.action === "modify" ? ("modified" as const) : ("accepted" as const),
    memory: memoryToDto(await requireMemory(db, user, proposalId)),
  };
}

export async function splitMemoryKey(
  db: FlareMoDb,
  user: UserRow,
  actor: MemoryActor,
  id: string,
  newFactKey: string | null,
) {
  if (actor.type !== "user") {
    throw new ForbiddenError("Only the user can split fact keys.");
  }
  const memory = await requireMemory(db, user, id);
  if (newFactKey) {
    const clash = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, user.id),
          eq(memoryItems.factKey, newFactKey),
          eq(memoryItems.status, "active"),
          sql`${memoryItems.id} != ${id}`,
        ),
      )
      .get();
    if (clash) {
      throw new ConflictError(
        "Another memory is already active with that fact key.",
      );
    }
  }

  const now = new Date().toISOString();
  await appendRevision(db, user, memory, "user");
  await db
    .update(memoryItems)
    .set({
      factKey: newFactKey,
      updatedAt: now,
    })
    .where(eq(memoryItems.id, id));

  return memoryToDto(await requireMemory(db, user, id));
}
