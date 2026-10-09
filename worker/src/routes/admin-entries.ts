import { Hono } from "hono";
import type { Env } from "../index";
import { adminAuthMiddleware } from "./admin-auth";
import { validateEntryInput } from "../db/validation";

export const adminEntriesRoute = new Hono<{ Bindings: Env }>();

adminEntriesRoute.use("*", adminAuthMiddleware);

adminEntriesRoute.get("/", async (c) => {
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 100);
  const offset = (page - 1) * limit;
  const results = await c.env.DB.prepare(
    "SELECT * FROM entries WHERE source_type = 'admin' ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all();
  return c.json({ entries: results.results, total: results.results.length });
});

adminEntriesRoute.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = validateEntryInput(body);
  if (!result.valid || !result.normalized) {
    return c.json({ error: "validation_failed", errors: result.errors }, 422);
  }
  const n = result.normalized;

  try {
    const inserted = await c.env.DB.prepare(
      `INSERT INTO entries
        (slug, date_month, date_day, date_end_month, date_end_day, date_type, movable_note,
         recurrence, entry_year, name_pl, name_en, description_pl, region, category,
         popularity, source_type, created_by, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'admin', 0)
       RETURNING *`
    ).bind(
      n.slug, n.date_month, n.date_day, n.date_end_month ?? null, n.date_end_day ?? null,
      n.date_type, n.movable_note ?? null, n.recurrence, n.entry_year ?? null,
      n.name_pl, n.name_en, n.description_pl ?? null, n.region, n.category, n.popularity
    ).first();
    return c.json({ entry: inserted }, 201);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("UNIQUE")) {
      return c.json({ error: "slug_conflict", message: "An entry with this slug already exists" }, 409);
    }
    throw err;
  }
});

adminEntriesRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);

  const existing = await c.env.DB.prepare(
    "SELECT * FROM entries WHERE id = ? AND source_type = 'admin'"
  ).bind(id).first();
  if (!existing) return c.json({ error: "not_found" }, 404);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const merged = { ...existing, ...body };
  const result = validateEntryInput(merged as never);
  if (!result.valid || !result.normalized) {
    return c.json({ error: "validation_failed", errors: result.errors }, 422);
  }
  const n = result.normalized;

  const updated = await c.env.DB.prepare(
    `UPDATE entries SET
       date_month = ?, date_day = ?, date_end_month = ?, date_end_day = ?,
       date_type = ?, movable_note = ?, recurrence = ?, entry_year = ?,
       name_pl = ?, name_en = ?, description_pl = ?, region = ?, category = ?,
       popularity = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND source_type = 'admin'
     RETURNING *`
  ).bind(
    n.date_month, n.date_day, n.date_end_month ?? null, n.date_end_day ?? null,
    n.date_type, n.movable_note ?? null, n.recurrence, n.entry_year ?? null,
    n.name_pl, n.name_en, n.description_pl ?? null, n.region, n.category, n.popularity, id
  ).first();

  return c.json({ entry: updated });
});

adminEntriesRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid_id" }, 400);

  const result = await c.env.DB.prepare(
    "DELETE FROM entries WHERE id = ? AND source_type = 'admin'"
  ).bind(id).run();

  if (result.meta.changes === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
