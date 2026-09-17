/**
 * Pure parsing cores shared by the Memos compatibility surfaces
 * (routes/memos-current-api.ts, routes/memos-connect-api.ts).
 *
 * These helpers return `null` for invalid input instead of throwing: each
 * surface maps that outcome to its own error type and message (Validation
 * errors on the current JSON surface, ConnectInputError on the Connect
 * surface), so the client-facing error envelope stays exactly as before.
 * The normalization logic itself is verified-identical across surfaces.
 */

const MEMOS_VISIBILITIES = ["private", "protected", "public"] as const;

/**
 * Visibility string to the legacy lowercase triple. Absent input defaults to
 * PRIVATE, matching both surfaces' previous `value ?? "PRIVATE"` behavior.
 */
export function parseMemosVisibility(
  value: unknown,
): (typeof MEMOS_VISIBILITIES)[number] | null {
  const normalized = String(value ?? "PRIVATE").toLowerCase();
  if (MEMOS_VISIBILITIES.includes(normalized as never)) {
    return normalized as (typeof MEMOS_VISIBILITIES)[number];
  }
  return null;
}

/** Relation type to the legacy lowercase pair; absent input defaults to REFERENCE. */
export function parseMemosRelationType(value: unknown) {
  const normalized = String(value ?? "REFERENCE").toLowerCase();
  if (normalized === "reference" || normalized === "comment") {
    return normalized;
  }
  return null;
}

/**
 * Page-size core: accepts anything `Number()` accepts, requires a positive
 * integer, and performs no clamping — each surface applies its own ceiling
 * (current Memos caps at 100, Connect at 1000) and its own default.
 */
export function parseMemosPageSize(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

/**
 * Comma-separated field-mask splitting used by update paths. An empty result
 * means "updateMask is required" to the caller.
 */
export function splitUpdateMaskFields(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}
