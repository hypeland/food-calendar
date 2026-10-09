import { Hono } from "hono";
import { cors } from "hono/cors";
import { entriesRoute } from "./routes/entries";
import { statsRoute } from "./routes/stats";
import { feedRoute } from "./routes/feed";
import { adminAuthRoute } from "./routes/admin-auth";
import { adminEntriesRoute } from "./routes/admin-entries";

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// Public read-only API: allow all origins for GET
app.use("/api/*", cors({ origin: "*" }));

app.get("/health", (c) => c.text("ok"));

app.route("/api/entries", entriesRoute);
app.route("/api/stats", statsRoute);
app.route("/feed.ics", feedRoute);
app.route("/api/admin", adminAuthRoute);
app.route("/api/admin/entries", adminEntriesRoute);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
