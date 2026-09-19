/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

/**
 * Typography contract for the app shell. Every assertion here guards a silent
 * regression rather than a crash: dropping a language scope hands Japanese
 * kanji to a Chinese face, and moving the bundled Arabic font ahead of
 * var(--font-cjk) lets its math/symbol subsets take ① ★ → away from the
 * platform Han faces that shape them.
 */
function declaration(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([\\s\\S]*?);`));
  if (!match) throw new Error(`--${name} is not declared in index.css`);
  return match[1];
}

describe("app font stacks", () => {
  it("leads with the bundled Latin face", () => {
    expect(declaration("font-sans").trimStart()).toMatch(/^"Geist Variable"/);
    expect(declaration("font-heading").trimStart()).toMatch(
      /^"Geist Variable"/,
    );
  });

  it("routes Han text through the language-scoped variable", () => {
    const sans = declaration("font-sans");
    expect(sans).toContain("var(--font-cjk)");
    expect(declaration("font-heading")).toContain("var(--font-cjk)");
    // Naming a Han face directly bypasses :lang() and would reintroduce the
    // Chinese-glyph-for-Japanese bug this stack exists to prevent.
    expect(sans).not.toMatch(/PingFang|Hiragino|YaHei|Noto Sans CJK/);
  });

  it("keeps the bundled Arabic face behind the Han faces", () => {
    const sans = declaration("font-sans");
    expect(sans.indexOf('"Noto Sans Arabic Variable"')).toBeGreaterThan(
      sans.indexOf("var(--font-cjk)"),
    );
  });

  it("scopes the Han list per script", () => {
    const list = (pattern: RegExp) =>
      css.match(pattern)?.[1].replace(/\s+/g, " ").trim() ?? "";

    const zh = list(/:root\s*\{[^}]*--font-cjk:\s*([\s\S]*?);/);
    const ja = list(/:root:lang\(ja\)\s*\{[^}]*--font-cjk:\s*([\s\S]*?);/);
    const ko = list(/:root:lang\(ko\)\s*\{[^}]*--font-cjk:\s*([\s\S]*?);/);

    expect(zh).toMatch(/^"PingFang SC"/);
    expect(ja).toMatch(/Hiragino Sans|Yu Gothic/);
    expect(ko).toMatch(/Apple SD Gothic Neo|Malgun Gothic/);
    // A ja/ko list must never lead with a Simplified-Chinese face.
    expect(ja).not.toMatch(/^"PingFang SC"/);
    expect(ko).not.toMatch(/^"PingFang SC"/);
  });
});

/**
 * Share-card plugins pick one of four families by name, so the serif tier is
 * part of the plugin API: it must keep resolving through the language-scoped
 * variables rather than a hardcoded Han face (which is what painted Japanese
 * users' exported cards with Chinese glyphs).
 */
describe("share card font tiers", () => {
  it("exposes a serif tier that defers its Han faces to the script scope", () => {
    const serif = declaration("font-serif");
    expect(serif).toContain("var(--font-cjk-serif)");
    expect(serif).not.toMatch(/Songti|SimSun|Mincho/);
  });

  it("scopes the Han serif list per script", () => {
    const list = (pattern: RegExp) =>
      css.match(pattern)?.[1].replace(/\s+/g, " ").trim() ?? "";
    const zh = list(/:root\s*\{[^}]*--font-cjk-serif:\s*([\s\S]*?);/);
    const ja = list(
      /:root:lang\(ja\)\s*\{[^}]*--font-cjk-serif:\s*([\s\S]*?);/,
    );

    expect(zh).toMatch(/^"Songti SC"/);
    expect(ja).toMatch(/Mincho/);
    expect(ja).not.toMatch(/^"Songti SC"/);
  });
});

/**
 * The letter-spacing resets are the one pair of rules that must NOT live in
 * @layer base: they override `.tracking-*` utilities, and in CSS a later layer
 * beats an earlier one regardless of specificity — so a reset written inside
 * the base layer is silently dead (which is how the RTL rule shipped broken).
 * They have to sit unlayered, after the base block closes.
 */
describe("letter-spacing resets", () => {
  const baseEnd = css.indexOf("\n}", css.indexOf("@layer base"));
  const rtl = css.indexOf('[dir="rtl"] :is(h1, h2, h3, h4');
  const cjk = css.indexOf(
    ":is(:lang(zh), :lang(ja), :lang(ko)) :is(h1, h2, h3, h4",
  );

  it("declares both the RTL and the CJK reset", () => {
    expect(rtl).toBeGreaterThan(-1);
    expect(cjk).toBeGreaterThan(-1);
  });

  it("keeps them outside @layer base", () => {
    expect(rtl).toBeGreaterThan(baseEnd);
    expect(cjk).toBeGreaterThan(baseEnd);
  });

  it("zeroes spacing rather than leaving the utility in charge", () => {
    for (const idx of [rtl, cjk]) {
      const block = css.slice(idx, css.indexOf("}", idx));
      expect(block).toMatch(/letter-spacing:\s*0/);
    }
  });
});

/**
 * Chinese ideographs need ~12px to stay legible; below that the strokes of
 * dense characters merge. Pure counters and key glyphs may stay smaller since
 * they carry no Han, so this guards the text that gets translated.
 */
describe("micro text sizes", () => {
  const HAN = /[\u4e00-\u9fff]/;
  const zh = readFileSync(
    new URL("./i18n/messages/zh-CN.ts", import.meta.url),
    "utf8",
  );
  const ZH = new Map(
    [...zh.matchAll(/"([\w.]+)":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const TOO_SMALL = ["text-[10px]", "text-[11px]", "text-[0.65rem]"];

  /** Resolves `t(x.someKey)` by finding `someKey: "<i18n.key>"` assignments in
   *  the same file and looking those keys up in the catalog. This is the shape
   *  that hid `account-page.tsx`'s 11px group headings from an earlier version
   *  of this guard, which only understood literal keys. */
  const valuesOfMemberKeys = (
    memberName: string,
    fileText: string,
  ): string[] =>
    [...fileText.matchAll(new RegExp(`\\b${memberName}:\\s*"([\\w.]+)"`, "g"))]
      .map((m) => ZH.get(m[1]))
      .filter((v): v is string => Boolean(v));

  it("keeps translated text at 12px or larger", () => {
    const offenders: string[] = [];
    /** Where the opening tag that starts at line `i` ends, or null. Braces are
     *  tracked so `=>`, `{}` and nested calls inside attributes do not end it
     *  early; quotes are skipped so a `>` inside a string is ignored too. */
    const tagEnd = (
      lines: string[],
      i: number,
    ): { line: number; col: number } | null => {
      let depth = 0;
      let quote: string | null = null;
      for (let k = i; k < Math.min(lines.length, i + 8); k += 1) {
        const line = lines[k];
        for (let c = 0; c < line.length; c += 1) {
          const ch = line[c];
          if (quote) {
            if (ch === quote) quote = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === "`") quote = ch;
          else if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          else if (ch === ">" && depth === 0 && line[c - 1] !== "=") {
            return { line: k, col: c + 1 };
          }
        }
      }
      return null;
    };
    // Scan components for a micro size on an element that actually RENDERS a
    // Han string. A t() inside an attribute (title/aria-label) is not rendered
    // at that size, and an emoji+digit counter carries no Han — both allowed.
    const walk = (dir: URL): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(
          `${entry.name}${entry.isDirectory() ? "/" : ""}`,
          dir,
        );
        if (entry.isDirectory()) {
          if (entry.name === "ui" || entry.name === "node_modules") continue;
          walk(child);
          continue;
        }
        if (!entry.name.endsWith(".tsx")) continue;
        if (entry.name.includes(".test.")) continue;
        const source = readFileSync(child, "utf8");
        const lines = source.split("\n");
        lines.forEach((line, i) => {
          const size = TOO_SMALL.find((s) => line.includes(s));
          if (!size) return;
          if (/<kbd\b|font-mono/.test(line)) return;
          const end = tagEnd(lines, i);
          if (!end) return;
          // Children of this element: everything after the opening tag.
          const children =
            lines[end.line].slice(end.col) +
            "\n" +
            lines.slice(end.line + 1, end.line + 5).join("\n");
          // Two call shapes reach the catalog: a literal key, and a key
          // assembled from a variable (`t(group.titleKey)`), which is how a
          // real offender hid from an earlier version of this guard. For the
          // variable form, look up every value of the object it indexes.
          const keys = [...children.matchAll(/\bt\("([\w.]+)"/g)].map((m) =>
            ZH.get(m[1]),
          );
          const varForms = [
            ...children.matchAll(/\bt\(([A-Za-z_$][\w$]*)\.([\w.]+)\)/g),
          ];
          for (const [, , memberName] of varForms) {
            keys.push(...valuesOfMemberKeys(memberName, source));
          }
          const rendered = keys.filter((v) => v && HAN.test(v));
          if (rendered.length > 0) {
            offenders.push(
              `${child.pathname.replace(process.cwd(), "")}:${i + 1} ${size} → ${rendered[0]}`,
            );
          }
        });
      }
    };
    walk(new URL(".", import.meta.url));
    expect(offenders).toEqual([]);
  });

  it("documents the 12px floor the check enforces", () => {
    const style = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    // Guards against someone "fixing" the offenders by shrinking text-xs.
    expect(style).toMatch(/--text-xs:\s*0\.75rem|text-xs/);
  });
});
