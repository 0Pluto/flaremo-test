import { createDb } from "@flaremo/db";
import { getBranding, getPublicShareByToken } from "@flaremo/domain";
import type { Context, Hono } from "hono";
import type { HonoBindings } from "../context";

/**
 * Server-side meta injection for public memo share links (`/share/:token`).
 *
 * The web app is a pure SPA: crawlers and social scrapers that do not run
 * JavaScript would otherwise see an empty "FlareMo" shell for every share.
 * This route serves the same SPA shell, but with the share's title,
 * description, Open Graph / Twitter card tags, JSON-LD structured data, and a
 * server-rendered copy of the memo content injected into the HTML. React
 * clears the injected DOM node on mount, so the browser experience is
 * unchanged; no-JS clients (and social scrapers) get real content.
 *
 * Invalid, revoked, or expired tokens still get the SPA shell — the UI shows
 * its "share unavailable" empty state — but with `noindex` so search engines
 * do not index dead share URLs.
 */

const DESCRIPTION_MAX_CHARS = 160;
const HEADLINE_MAX_CHARS = 80;
const SSR_TEXT_MAX_CHARS = 20_000;
const SHARE_HTML_CACHE_CONTROL = "public, max-age=60, must-revalidate";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Flatten a memo's markdown-ish content into plain text for description /
 * structured data. Enough to strip syntax noise from headings, emphasis,
 * links, and code; not a full renderer.
 */
function contentToPlainText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

type SharePageEnv = Context<HonoBindings>["env"];

function publicOrigin(env: SharePageEnv, request: Request): string {
  const configured = env.FLAREMO_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

type SharePageData = Awaited<ReturnType<typeof getPublicShareByToken>>;

function firstImageAbsoluteUrl(
  attachments: SharePageData["attachments"],
  origin: string,
  token: string,
): string | null {
  const image = attachments.find((attachment) =>
    attachment.contentType?.startsWith("image/"),
  );
  if (!image) return null;
  const id = image.id.replace(/^attachments\//, "");
  return `${origin}/api/public/shares/${token}/attachments/${id}/blob?preview=1`;
}

function metaTag(attr: string, attrValue: string, content: string): string {
  return `<meta ${attr}="${escapeHtml(attrValue)}" content="${escapeHtml(content)}" />`;
}

type ShareMetaInput = {
  origin: string;
  token: string;
  product: string;
  data: SharePageData;
};

function buildHeadTags(input: ShareMetaInput): string {
  const { origin, token, product, data } = input;
  const plainText = contentToPlainText(data.memo.content);
  const canonical = `${origin}/share/${token}`;
  const headline =
    truncate(plainText, HEADLINE_MAX_CHARS) || `${product} 记录分享`;
  const description = truncate(plainText, DESCRIPTION_MAX_CHARS) || product;
  const image = firstImageAbsoluteUrl(data.attachments, origin, token);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline,
    datePublished: data.memo.createdAt,
    dateModified: data.memo.updatedAt,
    author: { "@type": "Person", name: data.user.name },
    mainEntityOfPage: canonical,
    ...(image ? { image: [image] } : {}),
  };
  if (plainText) {
    jsonLd.text = truncate(plainText, SSR_TEXT_MAX_CHARS);
  }
  const jsonLdScript = JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  const tags = [
    `<title>${escapeHtml(headline)}</title>`,
    metaTag("name", "description", description),
    metaTag("name", "robots", "index, follow"),
    metaTag("property", "og:title", headline),
    metaTag("property", "og:description", description),
    metaTag("property", "og:type", "article"),
    metaTag("property", "og:url", canonical),
    metaTag("property", "og:site_name", product),
    metaTag("property", "article:published_time", data.memo.createdAt),
    metaTag("name", "twitter:card", image ? "summary_large_image" : "summary"),
    metaTag("name", "twitter:title", headline),
    metaTag("name", "twitter:description", description),
    `<script type="application/ld+json">${jsonLdScript}</script>`,
  ];
  if (image) {
    tags.push(metaTag("property", "og:image", image));
    tags.push(metaTag("name", "twitter:image", image));
  }
  return tags.join("\n    ");
}

function buildSsrContent(data: SharePageData): string {
  const html = escapeHtml(data.memo.content);
  if (!html.trim()) return "";
  const paragraphs = html
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<section data-flaremo-ssr-content>${paragraphs}</section>`;
}

async function renderShareHtml(
  env: SharePageEnv,
  request: Request,
  injectHead: string,
  injectBody: string,
): Promise<Response> {
  const shellResponse = await env.ASSETS.fetch(request);
  let html = await shellResponse.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/i, injectHead);
  html = html.replace(/(<div id="root">\s*)(<\/div>)/i, `$1${injectBody}$2`);
  return new Response(html, {
    status: shellResponse.status === 200 ? 200 : shellResponse.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": SHARE_HTML_CACHE_CONTROL,
    },
  });
}

export function registerSharePage(app: Hono<HonoBindings>): void {
  app.get("/share/:token", async (c) => {
    const db = createDb(c.env.DB);
    try {
      const data = await getPublicShareByToken(db, c.req.param("token"));
      const branding = await getBranding(db);
      const input: ShareMetaInput = {
        origin: publicOrigin(c.env, c.req.raw),
        token: c.req.param("token"),
        product: branding.product,
        data,
      };
      return await renderShareHtml(
        c.env,
        c.req.raw,
        buildHeadTags(input),
        buildSsrContent(data),
      );
    } catch {
      const shellResponse = await c.env.ASSETS.fetch(c.req.raw);
      const shell = await shellResponse.text();
      const noindex = `<meta name="robots" content="noindex, nofollow" />`;
      const withMeta = shell.replace(/<\/head>/i, `    ${noindex}\n  </head>`);
      return new Response(withMeta, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": SHARE_HTML_CACHE_CONTROL,
        },
      });
    }
  });
}
