/**
 * Validates data/food-days.json against the entry schema.
 * Exits non-zero on any violation. Run in CI on every PR.
 */
import { readFileSync } from "node:fs";

const REGIONS = new Set(["global", "europe", "poland", "americas", "asia", "oceania", "africa"]);
const CATEGORIES = new Set([
  "sweet", "savory", "beverage", "fruit", "vegetable",
  "dairy", "meat", "grain", "seafood", "dish", "other",
]);
const DATE_TYPES = new Set(["fixed", "movable"]);

interface Entry {
  slug: string; date_month: number; date_day: number; date_type: string;
  name_pl: string; name_en: string; description_pl: string | null;
  region: string; category: string; popularity: number;
  image_key: string | null; sources: string[]; verified: number;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const raw = readFileSync(new URL("../data/food-days.json", import.meta.url), "utf-8");
const entries: Entry[] = JSON.parse(raw);

const errors: string[] = [];
const slugs = new Set<string>();

entries.forEach((e, i) => {
  const ctx = `entry[${i}] ${e.slug ?? "(no slug)"}`;
  if (!e.slug || !/^[a-z0-9-]+$/.test(e.slug)) errors.push(`${ctx}: invalid slug`);
  if (slugs.has(e.slug)) errors.push(`${ctx}: duplicate slug`);
  slugs.add(e.slug);
  if (!Number.isInteger(e.date_month) || e.date_month < 1 || e.date_month > 12)
    errors.push(`${ctx}: date_month must be 1-12`);
  else if (!Number.isInteger(e.date_day) || e.date_day < 1 || e.date_day > DAYS_IN_MONTH[e.date_month - 1])
    errors.push(`${ctx}: date_day invalid for month ${e.date_month}`);
  if (!DATE_TYPES.has(e.date_type)) errors.push(`${ctx}: invalid date_type`);
  if (!e.name_pl?.trim()) errors.push(`${ctx}: missing name_pl`);
  if (!e.name_en?.trim()) errors.push(`${ctx}: missing name_en`);
  if (!REGIONS.has(e.region)) errors.push(`${ctx}: invalid region '${e.region}'`);
  if (!CATEGORIES.has(e.category)) errors.push(`${ctx}: invalid category '${e.category}'`);
  if (!Number.isInteger(e.popularity) || e.popularity < 0 || e.popularity > 100)
    errors.push(`${ctx}: popularity must be 0-100`);
  if (!Array.isArray(e.sources) || e.sources.length === 0 || !e.sources.every((s) => /^https?:\/\//.test(s)))
    errors.push(`${ctx}: requires >=1 valid source URL`);
  if (e.verified !== 0 && e.verified !== 1) errors.push(`${ctx}: verified must be 0 or 1`);
});

if (errors.length) {
  console.error(`Dataset validation FAILED (${errors.length} errors):`);
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

const polish = entries.filter((e) => e.region === "poland").length;
console.log(`Dataset OK: ${entries.length} entries (${polish} Polish).`);
