import { describe, it, expect } from "vitest";
import { parseFilterState, serializeFilterState, toggleInList, DEFAULT_FILTERS } from "./filters";

describe("filter state", () => {
  it("parses a full URL state", () => {
    const url = new URL("https://example.com/?region=poland,global&category=sweet&month=10&minPopularity=70&sort=popularity&q=pizza");
    const f = parseFilterState(url);
    expect(f.region).toEqual(["poland", "global"]);
    expect(f.category).toEqual(["sweet"]);
    expect(f.month).toBe(10);
    expect(f.minPopularity).toBe(70);
    expect(f.sort).toBe("popularity");
    expect(f.q).toBe("pizza");
  });

  it("drops invalid values", () => {
    const url = new URL("https://example.com/?region=mars&month=13&minPopularity=999&sort=weird");
    const f = parseFilterState(url);
    expect(f).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips through serialize", () => {
    const f = { ...DEFAULT_FILTERS, region: ["poland" as const], month: 5, q: "pieróg" };
    const qs = serializeFilterState(f);
    const parsed = parseFilterState(new URL(`https://example.com/?${qs}`));
    expect(parsed.region).toEqual(f.region);
    expect(parsed.month).toBe(5);
    expect(parsed.q).toBe("pieróg");
  });

  it("toggles list membership", () => {
    expect(toggleInList(["a"], "a")).toEqual([]);
    expect(toggleInList(["a"], "b")).toEqual(["a", "b"]);
  });
});
