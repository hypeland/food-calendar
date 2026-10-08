/**
 * Seeds D1 from data/food-days.json.
 * Usage: npx tsx scripts/seed-d1.ts [--local | --remote]
 * Default: --local
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = args.includes("--remote") ? "--remote" : "--local";

const raw = readFileSync(new URL("../data/food-days.json", import.meta.url), "utf-8");
const entries = JSON.parse(raw) as Array<Record<string, unknown>>;

// Build a single SQL script: wipe + insert all (idempotent re-seed)
let sql = "DELETE FROM entries;\n";
for (const e of entries) {
  const vals = [
    e.slug, e.date_month, e.date_day, e.date_type, e.name_pl, e.name_en,
    e.description_pl ?? null, e.region, e.category, e.popularity,
    e.image_key ?? null, JSON.stringify(e.sources ?? []), e.verified ?? 0,
  ];
  const literals = vals.map((v) => {
    if (v === null) return "NULL";
    if (typeof v === "number") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  });
  sql += `INSERT INTO entries (slug, date_month, date_day, date_type, name_pl, name_en, description_pl, region, category, popularity, image_key, sources, verified) VALUES (${literals.join(",")});\n`;
}

// Write temp SQL file, execute via wrangler d1
const tmp = `/tmp/food-calendar-seed-${Date.now()}.sql`;
writeFileSync(tmp, sql);

console.log(`Seeding D1 (${flag}) with ${entries.length} entries...`);
execSync(
  `cd worker && npx wrangler d1 execute food-calendar-db ${flag} --file=${tmp} -y`,
  { stdio: "inherit" }
);
console.log("Seed complete.");
