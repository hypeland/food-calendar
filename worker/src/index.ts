import { Hono } from "hono";
import { cors } from "hono/cors";
import { cache } from "hono/cache";
import { entriesRoute } from "./routes/entries";
import { statsRoute } from "./routes/stats";
import { feedRoute } from "./routes/feed";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  CORS_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const origin = c.env.CORS_ORIGIN || undefined;
  return cors({ origin })(c, next);
});

app.get("/health", (c) => c.text("ok"));

app.route("/api/entries", entriesRoute);
app.route("/api/stats", statsRoute);
app.route("/feed.ics", feedRoute);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
