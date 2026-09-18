import { unzipSync, zipSync, type Zippable } from "fflate";
import type { PluginManifest } from "./spec";
import { validatePluginManifest } from "./validate";

/**
 * Plugin package = the zip distributed by the store and produced by
 * `pnpm plugins:build`. Layout: a single top-level folder named after the
 * plugin id, holding `plugin.json` plus the card files it references.
 *
 * Both directions live here: `zipPluginFiles` (build scripts) and
 * `readPluginPackage` (worker install + tests). The reader enforces the
 * hard limits and path rules, so a hostile or broken archive can never write
 * outside its own folder or blow up storage.
 */

export const PLUGIN_PACKAGE_LIMITS = {
  maxZipBytes: 4 * 1024 * 1024,
  maxFiles: 64,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
} as const;

export type PluginPackage = {
  manifest: PluginManifest;
  /** Paths are relative to the plugin folder (the `<id>/` prefix is stripped). */
  files: Record<string, Uint8Array>;
};

const textDecoder = new TextDecoder();

function assertSafePath(name: string): void {
  if (!name || name.length > 200) {
    throw new Error(`package contains an unsafe path: "${name}"`);
  }
  if (
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    /^[a-zA-Z]:/.test(name)
  ) {
    throw new Error(`package contains an unsafe path: "${name}"`);
  }
  for (const segment of name.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error(`package contains an unsafe path: "${name}"`);
    }
  }
}

/** Unpack + validate a plugin zip. Throws with a user-readable reason. */
export function readPluginPackage(bytes: Uint8Array): PluginPackage {
  if (bytes.byteLength === 0) {
    throw new Error("package is empty");
  }
  if (bytes.byteLength > PLUGIN_PACKAGE_LIMITS.maxZipBytes) {
    throw new Error(
      `package exceeds the ${Math.round(PLUGIN_PACKAGE_LIMITS.maxZipBytes / 1024 / 1024)}MB limit`,
    );
  }
  let raw: Record<string, Uint8Array>;
  let totalBytes = 0;
  let fileCount = 0;
  try {
    raw = unzipSync(bytes, {
      filter: (file) => {
        fileCount += 1;
        if (fileCount > PLUGIN_PACKAGE_LIMITS.maxFiles) {
          throw new Error(
            `package has more than ${PLUGIN_PACKAGE_LIMITS.maxFiles} files`,
          );
        }
        if (file.originalSize > PLUGIN_PACKAGE_LIMITS.maxFileBytes) {
          throw new Error(`"${file.name}" exceeds the per-file size limit`);
        }
        totalBytes += file.originalSize;
        if (totalBytes > PLUGIN_PACKAGE_LIMITS.maxTotalBytes) {
          throw new Error("package exceeds the total uncompressed size limit");
        }
        return true;
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`package is not a readable zip: ${message}`);
  }

  const names = Object.keys(raw);
  if (names.length === 0) {
    throw new Error("package contains no files");
  }
  for (const name of names) {
    assertSafePath(name);
  }
  const rootName = names[0]?.split("/")[0] ?? "";
  if (!rootName) {
    throw new Error("package must contain a top-level plugin folder");
  }
  const prefix = `${rootName}/`;
  for (const name of names) {
    if (!name.startsWith(prefix)) {
      throw new Error(
        `package must keep every file inside "${rootName}/" (found "${name}")`,
      );
    }
  }

  const manifestBytes = raw[`${prefix}plugin.json`];
  if (!manifestBytes) {
    throw new Error("package is missing plugin.json at its root");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(manifestBytes));
  } catch {
    throw new Error("plugin.json is not valid JSON");
  }
  const { manifest, problems } = validatePluginManifest(parsed);
  if (!manifest) {
    throw new Error(`plugin.json is invalid: ${problems.join("; ")}`);
  }
  if (manifest.id !== rootName) {
    throw new Error(
      `plugin.json id "${manifest.id}" must match the package folder "${rootName}"`,
    );
  }

  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(raw)) {
    files[name.slice(prefix.length)] = data;
  }

  // Every referenced payload must actually be in the package.
  for (const [index, card] of (
    manifest.contributes.shareCardTemplates ?? []
  ).entries()) {
    const reference = card.kind === "document" ? card.document : card.entry;
    if (!reference || !files[reference]) {
      throw new Error(
        `plugin.json references a missing file for card #${index + 1} ("${card.id}")`,
      );
    }
    if (card.preview && !files[card.preview]) {
      throw new Error(`plugin.json references a missing preview image`);
    }
  }

  return { manifest, files };
}

/** Zip a plugin folder's files (keys must already carry the `<id>/` prefix). */
/** ZIP's minimum representable date; anything earlier gets clamped anyway. */
const ZIP_EPOCH = new Date("1980-01-01T00:00:00Z");

/**
 * Zip a plugin folder's files (keys must already carry the `<id>/` prefix).
 * Every entry gets a fixed mtime so rebuilding identical content yields a
 * byte-identical archive — the registry's sha256 must not drift per build.
 */
export function zipPluginFiles(files: Record<string, Uint8Array>): Uint8Array {
  const entries: Zippable = {};
  for (const [name, data] of Object.entries(files)) {
    entries[name] = [data, { mtime: ZIP_EPOCH }];
  }
  return zipSync(entries, { level: 6 });
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
