import type { FlareMoDb, UserRow } from "@flaremo/db";
import { memoryRejections } from "@flaremo/db";
import { and, desc, eq, gt, or } from "drizzle-orm";
import {
  computeFingerprint,
  type MemoryActor,
  normalizeMemoryContent,
} from "./shared";
import { createMemory } from "./write";

export async function listRecentRejections(
  db: FlareMoDb,
  userId: string,
  days = 30,
) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return db
    .select()
    .from(memoryRejections)
    .where(
      and(
        eq(memoryRejections.userId, userId),
        gt(memoryRejections.createdAt, cutoff),
      ),
    )
    .orderBy(desc(memoryRejections.createdAt));
}

export async function isRejectedRecently(
  db: FlareMoDb,
  userId: string,
  factKey?: string | null,
  fingerprint?: string | null,
  days = 30,
): Promise<{ blocked: boolean; reason?: string }> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const conditions = [];
  if (factKey) {
    conditions.push(eq(memoryRejections.factKey, factKey));
  }
  if (fingerprint) {
    conditions.push(eq(memoryRejections.fingerprint, fingerprint));
  }
  if (conditions.length === 0) return { blocked: false };

  const rejection = await db
    .select()
    .from(memoryRejections)
    .where(
      and(
        eq(memoryRejections.userId, userId),
        gt(memoryRejections.createdAt, cutoff),
        or(...conditions),
      ),
    )
    .get();

  if (rejection) {
    return {
      blocked: true,
      reason:
        rejection.reason ??
        "This fact or topic was recently rejected by the user.",
    };
  }
  return { blocked: false };
}

export async function extractAndProposeDreamingFact(
  db: FlareMoDb,
  user: UserRow,
  candidate: {
    content: string;
    factKey?: string | null;
    tags?: string[];
    type?: "semantic" | "episodic" | "procedural";
    kind?: "preference" | "fact" | "decision" | "constraint" | "lesson";
    scopeType?: "global" | "workspace" | "project" | "agent";
    scopeKey?: string | null;
    sourceType: string;
    sourceId: string;
    sourceRevision?: string | null;
    excerpt?: string;
  },
) {
  const content = normalizeMemoryContent(candidate.content);
  const type = candidate.type ?? "semantic";
  const kind = candidate.kind ?? "fact";
  const scopeType = candidate.scopeType ?? "global";
  const scopeKey = candidate.scopeKey ?? null;

  const fingerprint = await computeFingerprint(
    user,
    content,
    type,
    kind,
    scopeType,
    scopeKey,
  );

  // Negative feedback guardrail (§IV.5 & §VI.8)
  const guard = await isRejectedRecently(
    db,
    user.id,
    candidate.factKey,
    fingerprint,
    30,
  );
  if (guard.blocked) {
    return { proposed: false as const, reason: guard.reason };
  }

  // Safety net: Auto consolidation always writes inferred proposals (§VI.8)
  const agentActor: MemoryActor = { type: "agent", name: "dreaming" };
  const created = await createMemory(db, user, agentActor, {
    content,
    factKey: candidate.factKey ?? null,
    tags: candidate.tags ?? [],
    type,
    kind,
    scopeType,
    scopeKey,
    tier: "normal",
    importance: 50,
    confidence: 60,
    verification: "inferred",
    sourceAgent: "dreaming",
    evidence: [
      {
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        sourceRevision: candidate.sourceRevision,
        relationType: "derived_from",
        excerpt: candidate.excerpt ?? content.slice(0, 300),
      },
    ],
  });

  return { proposed: true as const, memory: created.memory };
}
