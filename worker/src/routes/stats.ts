import { Hono } from "hono";
import type { Env } from "../index";

export const statsRoute = new Hono<{ Bindings: Env }>();

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

statsRoute.get("/", async (c) => {
  const [byRegion, byCategory, byMonth] = await Promise.all([
    c.env.DB.prepare("SELECT region, COUNT(*) as count FROM entries GROUP BY region").all(),
    c.env.DB.prepare("SELECT category, COUNT(*) as count FROM entries GROUP BY category").all(),
    c.env.DB.prepare("SELECT date_month as month, COUNT(*) as count FROM entries GROUP BY date_month ORDER BY date_month").all(),
  ]);
  return c.json(
    { byRegion: byRegion.results, byCategory: byCategory.results, byMonth: byMonth.results },
    200,
    CACHE_HEADERS
  );
});
