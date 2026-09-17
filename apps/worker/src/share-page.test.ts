import {
  applyFlaremoMigrations,
  attachments,
  createDb,
  memos,
  shares,
  users,
} from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app, { createFlareMoApp } from "./index";

let mf: Miniflare;
let env: Env;

const SHELL_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>FlareMo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function seedShare(
  options: { revoked?: boolean; expired?: boolean } = {},
) {
  const db = createDb(env.DB);
  const now = "2026-09-01T00:00:00.000Z";
  const userId = "users/e2e-share-owner";
  await db.insert(users).values({
    id: userId,
    email: "owner@example.com",
    name: "Owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(memos).values({
    id: "memos/e2e-share-memo",
    userId,
    content:
      "# 今日笔记\n\n这是**分享**的正文内容，用于 SEO 验证。\n\n![图](x.png)",
    visibility: "private",
    status: "normal",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(shares).values({
    id: "shares/e2e-share",
    memoId: "memos/e2e-share-memo",
    userId,
    token: TOKEN,
    expiresAt: options.expired ? "2026-08-01T00:00:00.000Z" : null,
    createdAt: now,
    updatedAt: now,
    revokedAt: options.revoked ? now : null,
  });
}

describe("Share page SEO", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-share-test" },
      r2Buckets: { ATTACHMENTS: "flaremo-attachments-share-test" },
    });

    const db = await mf.getD1Database("DB");
    const r2 = await mf.getR2Bucket("ATTACHMENTS");
    env = {
      DB: db,
      ATTACHMENTS: r2,
      ASSETS: {
        fetch: async () =>
          new Response(SHELL_HTML, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      } as Fetcher,
      FLAREMO_PUBLIC_URL: "https://flaremo.example",
      BETTER_AUTH_SECRET: "test-better-auth-secret-that-is-never-used-in-prod",
      FLAREMO_BOOTSTRAP_SECRET: "test-bootstrap-secret-never-used",
    } as Env;

    await applyFlaremoMigrations(db);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("injects SEO meta, JSON-LD, and server-rendered content into the shell", async () => {
    await seedShare();
    const response = await app.fetch(
      new Request(`https://flaremo.example/share/${TOKEN}`),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toContain("max-age=60");

    const html = await response.text();
    expect(html).toContain(
      "<title>今日笔记 这是分享的正文内容，用于 SEO 验证。</title>",
    );
    expect(html).toContain(
      '<meta name="description" content="今日笔记 这是分享的正文内容，用于 SEO 验证。" />',
    );
    expect(html).toContain('content="index, follow"');
    expect(html).toContain(
      '<meta property="og:url" content="https://flaremo.example/share/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" />',
    );
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    // Markdown syntax noise is stripped from meta, but the SSR body keeps the
    // raw escaped content so React clears it on mount.
    expect(html).toContain("<p>这是**分享**的正文内容，用于 SEO 验证。</p>");
    expect(html).not.toContain("<title>FlareMo</title>");
  });

  it("builds og:image from the first image attachment and includes JSON-LD", async () => {
    await seedShare();
    const db = createDb(env.DB);
    await db.insert(attachments).values({
      id: "attachments/e2e-share-image",
      userId: "users/e2e-share-owner",
      memoId: "memos/e2e-share-memo",
      r2Key: "attachments/e2e-share-image",
      filename: "photo.png",
      contentType: "image/png",
      size: 100,
      state: "ready",
      etag: "e2e",
      payload: {},
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    const response = await app.fetch(
      new Request(`https://flaremo.example/share/${TOKEN}`),
      env,
    );
    const html = await response.text();
    expect(html).toContain(
      '<meta property="og:image" content="https://flaremo.example/api/public/shares/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/attachments/e2e-share-image/blob?preview=1" />',
    );
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    );
    expect(html).toContain('"@type":"SocialMediaPosting"');
    expect(html).toContain('"author":{"@type":"Person","name":"Owner"}');
    expect(html).toContain('"datePublished":"2026-09-01T00:00:00.000Z"');
  });

  it("serves the shell with noindex for revoked or expired shares", async () => {
    await seedShare({ revoked: true });
    const response = await app.fetch(
      new Request(`https://flaremo.example/share/${TOKEN}`),
      env,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toContain('content="index, follow"');
  });

  it("registers the route on any createFlareMoApp instance", async () => {
    await seedShare();
    const isolated = createFlareMoApp();
    const response = await isolated.fetch(
      new Request(`https://flaremo.example/share/${TOKEN}`),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data-flaremo-ssr-content");
  });
});
