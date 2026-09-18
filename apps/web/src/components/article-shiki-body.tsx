import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { useEffect, useState } from "react";
import type { HighlighterCore } from "shiki/core";

type LooseHighlighter = Parameters<typeof rehypeShikiFromHighlighter>[0];

import { LazyMemoContent } from "@/components/lazy-memo-content";
import {
  getWebHighlighter,
  preloadWebCodeLanguages,
} from "@/lib/web-highlighter";

/**
 * Article preview body with client-side Shiki highlighting. Mirrors the SSR
 * article page (same themes via CSS variables), but the highlighter loads
 * lazily and a failure degrades to the plain markdown view.
 */
export function ArticleShikiBody({ content }: { content: string }) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await preloadWebCodeLanguages(content);
        const loaded = await getWebHighlighter();
        if (alive) setHighlighter(loaded);
      } catch {
        // Highlighting stays off; the preview still renders.
      }
    })();
    return () => {
      alive = false;
    };
  }, [content]);

  if (!highlighter) {
    return <LazyMemoContent content={content} withHeadingIds />;
  }
  return (
    <LazyMemoContent
      content={content}
      rehypePlugins={[
        // Cast: react-markdown's bundled unified version types Pluggable
        // slightly narrower than @shikijs/rehype's Transformer return.
        rehypeShikiFromHighlighter(highlighter as LooseHighlighter, {
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
          fallbackLanguage: "plain",
        }) as import("unified").Pluggable,
      ]}
      withHeadingIds
    />
  );
}
