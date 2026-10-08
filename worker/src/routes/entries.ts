import { Hono } from "hono";
import { buildEntryQuery } from "../db/queries";
import type { Env } from "../index";

export const entriesRoute = new Hono<{ Bindings: Env }>();

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

entriesRoute.get("/", async (c) => {
  const params = {
    month: c.req.query("month"),
    day: c.req.query("day"),
    region: c.req.query("region"),
    category: c.req.query("category"),
    minPopularity: c.req.query("minPopularity"),
    sort: c.req.query("sort") ?? "date",
    q: c.req.query("q"),
    page: c.req.query("page") ?? "1",
    limit: c.req.query("limit") ?? "100",
  };

  let query;
  try {
    query = buildEntryQuery(params);
  } catch (err) {
    return c.json({ error: "invalid_params", message: (err as Error).message }, 400);
  }

  const results = await c.env.DB.prepare(query.sql).bind(...query.params).all();
  return c.json({ entries: results.results, total: results.results.length }, 200, CACHE_HEADERS);
});

entriesRoute.get("/today", async (c) => {
  // Server date in Europe/Warsaw
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const today = await c.env.DB.prepare(
    "SELECT * FROM entries WHERE date_month = ? AND date_day = ? ORDER BY popularity DESC"
  ).bind(month, day).all();

  const upcoming = await c.env.DB.prepare(
    `SELECT * FROM entries
     WHERE (date_month = ? AND date_day > ?) OR (date_month > ?)
     ORDER BY date_month, date_day LIMIT 1`
  ).bind(month, day, month).first();

  return c.json({ today: today.results, next: upcoming }, 200, CACHE_HEADERS);
});

entriesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.json({ error: "invalid_slug" }, 400);
  }
  const entry = await c.env.DB.prepare("SELECT * FROM entries WHERE slug = ?").bind(slug).first();
  if (!entry) return c.json({ error: "not_found" }, 404);
  return c.json({ entry }, 200, CACHE_HEADERS);
});
