import type { HighlighterCore } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Shiki highlighter for the SSR article page. The JS regex engine (no WASM)
 * runs in Cloudflare Workers; languages load lazily per requested code fence
 * and unknown languages degrade to plain text. Dual themes render as CSS
 * variables (`defaultColor: false`), so the page stylesheet picks light/dark
 * at display time instead of baking one theme into the HTML.
 */

const THEME_IMPORTS = [
  import("shiki/themes/github-light.mjs"),
  import("shiki/themes/github-dark.mjs"),
] as const;

const LANG_IMPORTS: Record<string, Promise<unknown>> = {
  typescript: import("shiki/langs/typescript.mjs"),
  javascript: import("shiki/langs/javascript.mjs"),
  python: import("shiki/langs/python.mjs"),
  json: import("shiki/langs/json.mjs"),
  bash: import("shiki/langs/bash.mjs"),
  shell: import("shiki/langs/bash.mjs"),
  sh: import("shiki/langs/bash.mjs"),
  html: import("shiki/langs/html.mjs"),
  css: import("shiki/langs/css.mjs"),
  rust: import("shiki/langs/rust.mjs"),
  go: import("shiki/langs/go.mjs"),
};

const PLAIN_LANGS = new Set(["text", "plain", "txt", ""]);

function resolveLanguage(raw: string): string {
  const lang = raw.trim().toLowerCase();
  if (PLAIN_LANGS.has(lang)) return "text";
  if (lang === "ts" || lang === "tsx") return "typescript";
  if (lang === "js" || lang === "jsx" || lang === "mjs") return "javascript";
  return LANG_IMPORTS[lang] ? lang : "text";
}

let highlighter: HighlighterCore | null = null;

/**
 * Scans the article's code fences and loads every supported language before
 * parsing, so the render path below stays synchronous (marked-highlight's
 * sync contract). Also installs the module singleton.
 */
export async function initArticleHighlighter(content: string): Promise<void> {
  const instance = await createHighlighterCore({
    themes: THEME_IMPORTS as never,
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  const requested = new Set<string>();
  for (const match of content.matchAll(/^\s*```([A-Za-z0-9_-]*)/gm)) {
    const lang = resolveLanguage(match[1] ?? "");
    if (lang !== "text") requested.add(lang);
  }
  for (const lang of requested) {
    await instance.loadLanguage(LANG_IMPORTS[lang] as never);
  }
  highlighter = instance;
}

/**
 * Sync highlight for the article renderer's `code` override. Returning an
 * empty string lets the caller fall back to the escaped-plain-code block
 * (unknown language, or highlighter unavailable).
 *
 * Why not marked-highlight: its v2 renderer always wraps the highlighted
 * payload in a plain `<pre><code>`, which would double-wrap Shiki's own
 * `<pre class="shiki">` output. The one-line fallback below is integration
 * glue; all highlighting remains Shiki's.
 */
export function highlightArticleCode(code: string, lang: string): string {
  if (!highlighter) return "";
  const language = resolveLanguage(lang);
  if (language === "text") return "";
  try {
    return highlighter.codeToHtml(code, {
      lang: language,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });
  } catch {
    return "";
  }
}
