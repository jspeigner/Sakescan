import { describe, expect, test } from "bun:test";
import { matchesScraped } from "./sakeSpecEnrich";

describe("matchesScraped", () => {
  const row = {
    id: "1",
    name: "Dassai 45",
    name_japanese: null as string | null,
    brewery: "Asahi Shuzo",
    description: null as string | null,
    rice_variety: null as string | null,
    polishing_ratio: null as number | null,
    alcohol_percentage: null as number | null,
    smv: null as number | null,
  };

  test("rejects empty scraped name (''.includes('') trap)", () => {
    expect(
      matchesScraped(
        { name: "", brewery: "Asahi Shuzo", polishingRatio: 45 },
        row
      )
    ).toBe(false);
  });

  test("matches overlapping product names", () => {
    expect(
      matchesScraped(
        { name: "Dassai 45", brewery: "Asahi Shuzo", alcoholPercentage: 16 },
        row
      )
    ).toBe(true);
  });

  test("rejects substring SKU collisions from the same brewery", () => {
    expect(
      matchesScraped(
        { name: "Kubota Manju", brewery: "Asahi Shuzo" },
        { ...row, name: "Kubota" }
      )
    ).toBe(false);
  });
});
