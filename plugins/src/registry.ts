/**
 * Bundled plugin discovery. Folders under `plugins/official/` and
 * `plugins/community/` are picked up at build time — adding a plugin is
 * adding a folder, never touching this file. Invalid manifests fail the
 * build (and the test suite) loudly instead of shipping silently.
 */

import { SHARE_CARD_SPEC_VERSION, type ShareCardDocument } from "./document";
import {
  type BundledPlugin,
  type BundledShareCard,
  DEFAULT_SHARE_CARD_SIZE,
  type LocalizedText,
  PLUGIN_ID_PATTERN,
  PLUGIN_SPEC_VERSION,
  type PluginManifest,
  type PluginTier,
  type ShareCardContribution,
  SHARE_CARD_SIZE_LIMITS,
  type ShareCardOptionSpec,
} from "./spec";

const manifestModules = import.meta.glob("../{official,community}/*/plugin.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const documentModules = import.meta.glob(
  "../{official,community}/*/cards/**/*.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

const sandboxModules = import.meta.glob(
  "../{official,community}/*/cards/**/*.html",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(([key, text]) => key.length > 0 && typeof text === "string")
  );
}

function validateOptions(
  options: unknown,
  source: string,
  problems: string[],
): ShareCardOptionSpec[] | undefined {
  if (options === undefined) return undefined;
  if (!Array.isArray(options)) {
    problems.push(`${source}: options must be an array`);
    return undefined;
  }
  const seen = new Set<string>();
  const specs: ShareCardOptionSpec[] = [];
  for (const raw of options) {
    if (!isPlainObject(raw) || typeof raw.key !== "string" || !isLocalizedText(raw.label)) {
      problems.push(`${source}: each option needs a string key and a localized label`);
      continue;
    }
    if (seen.has(raw.key)) {
      problems.push(`${source}: duplicate option key "${raw.key}"`);
      continue;
    }
    seen.add(raw.key);
    const type = raw.type;
    if (type === "enum") {
      if (
        !Array.isArray(raw.choices) ||
        raw.choices.length === 0 ||
        raw.choices.some(
          (choice) =>
            !isPlainObject(choice) ||
            typeof choice.value !== "string" ||
            !isLocalizedText(choice.label),
        )
      ) {
        problems.push(`${source}: option "${raw.key}" needs non-empty choices`);
        continue;
      }
    } else if (
      type !== "boolean" &&
      type !== "text" &&
      type !== "color" &&
      type !== "number"
    ) {
      problems.push(`${source}: option "${raw.key}" has unknown type "${String(type)}"`);
      continue;
    }
    specs.push(raw as ShareCardOptionSpec);
  }
  return specs;
}

function validateContribution(
  raw: unknown,
  source: string,
): { contribution: ShareCardContribution; problems: string[] } {
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    return { contribution: {} as ShareCardContribution, problems: [`${source}: contribution must be an object`] };
  }
  if (typeof raw.id !== "string" || !PLUGIN_ID_PATTERN.test(raw.id)) {
    problems.push(`contribution id "${String(raw.id)}" must be kebab-case`);
  }
  if (raw.kind !== "document" && raw.kind !== "sandbox") {
    problems.push(`contribution "${String(raw.id)}" kind must be document or sandbox`);
  }
  if (!isLocalizedText(raw.name)) {
    problems.push(`contribution "${String(raw.id)}" needs a localized name`);
  }
  if (raw.size !== undefined) {
    const size = raw.size;
    if (
      !isPlainObject(size) ||
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      size.width < SHARE_CARD_SIZE_LIMITS.min ||
      size.width > SHARE_CARD_SIZE_LIMITS.max ||
      size.height < SHARE_CARD_SIZE_LIMITS.min ||
      size.height > SHARE_CARD_SIZE_LIMITS.max
    ) {
      problems.push(`contribution "${String(raw.id)}" size must be within ${SHARE_CARD_SIZE_LIMITS.min}–${SHARE_CARD_SIZE_LIMITS.max}px`);
    }
  }
  const options = validateOptions(raw.options, `contribution "${String(raw.id)}"`, problems);
  const contribution: ShareCardContribution = {
    id: typeof raw.id === "string" ? raw.id : "",
    kind: raw.kind === "sandbox" ? "sandbox" : "document",
    name: isLocalizedText(raw.name) ? raw.name : {},
    size: isPlainObject(raw.size) && typeof raw.size.width === "number" && typeof raw.size.height === "number"
      ? { width: raw.size.width, height: raw.size.height }
      : DEFAULT_SHARE_CARD_SIZE,
  };
  if (isLocalizedText(raw.description)) contribution.description = raw.description;
  if (typeof raw.preview === "string") contribution.preview = raw.preview;
  if (options) contribution.options = options;
  if (typeof raw.document === "string") contribution.document = raw.document;
  if (typeof raw.entry === "string") contribution.entry = raw.entry;
  return { contribution, problems };
}

function parseManifest(value: unknown, source: string): PluginManifest {
  const problems: string[] = [];
  if (!isPlainObject(value)) {
    throw new Error(`${source}: manifest must be an object`);
  }
  if (value.specVersion !== PLUGIN_SPEC_VERSION) {
    problems.push(`specVersion must be ${PLUGIN_SPEC_VERSION}`);
  }
  if (typeof value.id !== "string" || !PLUGIN_ID_PATTERN.test(value.id)) {
    problems.push(`id "${String(value.id)}" must be kebab-case`);
  }
  if (typeof value.version !== "string" || value.version.length === 0) {
    problems.push("version is required");
  }
  if (!isLocalizedText(value.name)) {
    problems.push("name needs a localized text table");
  }
  if (!isPlainObject(value.contributes)) {
    problems.push("contributes is required");
  }
  if (problems.length > 0) {
    throw new Error(`${source}: ${problems.join("; ")}`);
  }
  return value as unknown as PluginManifest;
}

let cached: BundledPlugin[] | null = null;

/** All bundled plugins with their card payloads resolved; memoized. */
export function listBundledPlugins(): BundledPlugin[] {
  if (cached) return cached;
  const plugins: BundledPlugin[] = [];
  const cardIds = new Map<string, string>();
  const manifestEntries = Object.entries(manifestModules).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, raw] of manifestEntries) {
    const tier: PluginTier = key.startsWith("../official/")
      ? "official"
      : "community";
    const folder = key.slice(0, -"plugin.json".length);
    const folderName = folder.replace(/\/$/, "").split("/").pop() ?? "";
    const manifest = parseManifest(raw, key);
    if (manifest.id !== folderName) {
      throw new Error(
        `${key}: manifest id "${manifest.id}" must match the folder name "${folderName}"`,
      );
    }
    const cards: BundledShareCard[] = [];
    for (const rawCard of manifest.contributes.shareCardTemplates ?? []) {
      const { contribution, problems } = validateContribution(rawCard, key);
      if (problems.length > 0) throw new Error(problems.join("\n"));
      const duplicate = cardIds.get(contribution.id);
      if (duplicate) {
        throw new Error(
          `${key}: card id "${contribution.id}" is already used by ${duplicate}`,
        );
      }
      cardIds.set(contribution.id, manifest.id);
      const identity = {
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        tier,
      };
      if (contribution.kind === "document") {
        if (!contribution.document) {
          throw new Error(`${key}: card "${contribution.id}" needs a document path`);
        }
        const document = documentModules[folder + contribution.document];
        if (!document) {
          throw new Error(
            `${key}: card "${contribution.id}" document not found: ${contribution.document}`,
          );
        }
        const parsed = document as ShareCardDocument;
        if (parsed.specVersion !== SHARE_CARD_SPEC_VERSION) {
          throw new Error(
            `${key}: card "${contribution.id}" document specVersion must be ${SHARE_CARD_SPEC_VERSION}`,
          );
        }
        cards.push({
          ...contribution,
          ...identity,
          payload: { kind: "document", document: parsed },
        });
      } else {
        if (!contribution.entry) {
          throw new Error(`${key}: card "${contribution.id}" needs an entry path`);
        }
        const html = sandboxModules[folder + contribution.entry];
        if (typeof html !== "string") {
          throw new Error(
            `${key}: card "${contribution.id}" entry not found: ${contribution.entry}`,
          );
        }
        cards.push({
          ...contribution,
          ...identity,
          payload: { kind: "sandbox", html },
        });
      }
    }
    plugins.push({ manifest, tier, cards });
  }
  cached = plugins;
  return plugins;
}

/** Bundled plugins in display order: official first, then by id. */
export function listBundledPluginsSorted(): BundledPlugin[] {
  return [...listBundledPlugins()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "official" ? -1 : 1;
    return a.manifest.id.localeCompare(b.manifest.id);
  });
}
