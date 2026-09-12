import { expect, test } from "@playwright/test";
import { E2E_BASE_URL } from "./auth-fixture";

const E2E_COOKIE_MUTATION_OPTIONS = {
  headers: { origin: E2E_BASE_URL },
};

/** A 1x1 transparent PNG; inline enough that no binary fixture is needed. */
function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function uploadPng(
  request: import("@playwright/test").APIRequestContext,
  filename: string,
) {
  const uploadResponse = await request.post("/api/v1/attachments", {
    ...E2E_COOKIE_MUTATION_OPTIONS,
    multipart: {
      file: { name: filename, mimeType: "image/png", buffer: tinyPng() },
    },
  });
  expect(uploadResponse.ok()).toBe(true);
  return (await uploadResponse.json()) as { id: string; filename: string };
}

async function bindAttachments(
  request: import("@playwright/test").APIRequestContext,
  memoId: string,
  ids: string[],
) {
  const bindResponse = await request.patch(
    `/api/v1/memos/${memoId}/attachments`,
    {
      // The legacy wire takes bare resource names; the modern one wants
      // objects with a name field and a body wrapper.
      headers: { origin: E2E_BASE_URL, "x-flaremo-wire": "legacy" },
      data: { attachments: ids.map((id) => `attachments/${id}`) },
    },
  );
  expect(bindResponse.ok()).toBe(true);
}

async function createMemo(
  request: import("@playwright/test").APIRequestContext,
  content: string,
) {
  const createResponse = await request.post("/api/app/memos", {
    ...E2E_COOKIE_MUTATION_OPTIONS,
    data: { content },
  });
  expect(createResponse.ok()).toBe(true);
  const created = (await createResponse.json()) as { name: string };
  return created.name.split("/").at(-1) as string;
}

test("renders inline body images and keeps the gallery for the rest", async ({
  page,
  request,
}) => {
  const inline = await uploadPng(request, "inline-alpha.png");
  const loose = await uploadPng(request, "loose-bravo.png");
  const marker = Date.now();
  const content = [
    "# Gallery memo",
    "![inline alpha](/file/attachments/" +
      inline.id +
      "/" +
      inline.filename +
      ")",
    "Some prose between the images.",
    `Marker ${marker}`,
  ].join("\n\n");

  const memoId = await createMemo(request, content);
  // Bind both uploads to the memo: the inline one plus a loose file for the gallery.
  await bindAttachments(request, memoId, [inline.id, loose.id]);
  await page.goto(`/memo/${memoId}`);

  // The body reference renders through the /file/ bridge with session auth.
  const bodyImage = page.locator(`img[src*="/file/attachments/${inline.id}/"]`);
  await expect(bodyImage).toBeVisible();
  await expect
    .poll(async () =>
      bodyImage.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);

  // Dedup: the referenced attachment leaves the gallery, the loose one stays.
  // A gallery image row carries two same-href anchors (image wrapper + file row).
  await expect(
    page.locator(`a[href*="/api/v1/attachments/${loose.id}/blob"]`).first(),
  ).toBeVisible();
  await expect(
    page.locator(`a[href*="/api/v1/attachments/${inline.id}/blob"]`),
  ).toHaveCount(0);
});

test("degrades a dead body image to a placeholder", async ({
  page,
  request,
}) => {
  const content = [
    "# Ghost memo",
    "![ghost screenshot](/file/attachments/00000000-0000-0000-0000-000000000000/missing.png)",
  ].join("\n\n");

  const memoId = await createMemo(request, content);
  await page.goto(`/memo/${memoId}`);
  await expect(page.locator(".memo-image-broken")).toBeVisible();
  await expect(page.locator(".memo-image-broken")).toContainText(
    "ghost screenshot",
  );
});

test("serves inline body images on the public share page", async ({
  browser,
  request,
}) => {
  const inline = await uploadPng(request, "shared-charlie.png");
  const content = [
    "# Shared gallery",
    "![shared image](/file/attachments/" +
      inline.id +
      "/" +
      inline.filename +
      ")",
  ].join("\n\n");
  const memoId = await createMemo(request, content);
  // Public reads validate that the attachment belongs to the shared memo.
  await bindAttachments(request, memoId, [inline.id]);

  const shareResponse = await request.post(`/api/v1/memos/${memoId}/shares`, {
    ...E2E_COOKIE_MUTATION_OPTIONS,
    data: {},
  });
  expect(shareResponse.ok()).toBe(true);
  // The modern wire embeds the token in the share's resource name.
  const share = (await shareResponse.json()) as { name: string };
  const token = share.name.split("/shares/").at(-1) as string;

  const anonymous = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await anonymous.newPage();
  await page.goto(`/share/${token}`);

  const bodyImage = page.locator("img[src*='share_token=']");
  await expect(bodyImage).toBeVisible();
  await expect
    .poll(async () =>
      bodyImage.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await anonymous.close();
});
