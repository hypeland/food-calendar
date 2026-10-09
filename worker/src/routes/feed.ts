import { Hono } from "hono";
import type { Env } from "../index";

export const feedRoute = new Hono<{ Bindings: Env }>();

const REGIONS = new Set(["global", "europe", "poland", "americas", "asia", "oceania", "africa"]);

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

feedRoute.get("/", async (c) => {
  const region = c.req.query("region");
  const year = new Date().getFullYear() + 1; // upcoming year
  let rows;
  if (region && REGIONS.has(region)) {
    rows = await c.env.DB.prepare(
      "SELECT slug, date_month, date_day, name_pl, name_en, description_pl FROM entries WHERE region = ? AND (entry_year IS NULL OR entry_year = ?) ORDER BY date_month, date_day"
    ).bind(region, year).all();
  } else {
    rows = await c.env.DB.prepare(
      "SELECT slug, date_month, date_day, name_pl, name_en, description_pl FROM entries WHERE (entry_year IS NULL OR entry_year = ?) ORDER BY date_month, date_day"
    ).bind(year).all();
  }
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hypeland//Food Calendar//PL",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of rows.results as Array<{
    slug: string; date_month: number; date_day: number;
    name_pl: string; name_en: string; description_pl: string | null;
  }>) {
    const d = `${year}${pad(e.date_month)}${pad(e.date_day)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.slug}@food-calendar`,
      `DTSTAMP:${year}0101T000000Z`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${icsEscape(e.name_pl)}`,
      `DESCRIPTION:${icsEscape(e.description_pl ?? e.name_en)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return c.body(lines.join("\r\n"), 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'attachment; filename="food-calendar.ics"',
    "Cache-Control": "public, s-maxage=86400",
  });
});
