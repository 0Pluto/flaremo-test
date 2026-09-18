import { createDb } from "@flaremo/db";
import { getPluginSettings } from "@flaremo/domain";
import { Hono } from "hono";
import type { HonoBindings } from "../context";
import { jsonError } from "../http";

/**
 * Public plugin configuration. The SPA reads this before rendering plugin
 * contributions (share-card templates today): which plugins the instance
 * enabled or disabled, plus the card order/hidden/default/options overrides.
 * Anonymous and read-only — the server carries shape, the frontend holds the
 * plugin registry, and the two intersect at render time.
 */
export const pluginsApi = new Hono<HonoBindings>();

pluginsApi.get("/", async (c) => {
  try {
    const db = createDb(c.env.DB);
    const settings = await getPluginSettings(db);
    return c.json(settings);
  } catch (error) {
    return jsonError(c, error);
  }
});
