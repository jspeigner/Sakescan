import { describe, expect, test } from "bun:test";
import { breweryNameFromSlug, pickBreweryBySlug } from "./brewery-slug.ts";

describe("pickBreweryBySlug", () => {
  const rows = [
    { name: "Asahi Shuzou" },
    { name: "Tamaasahi Shuzou" },
    { name: "Asahikawa Shuzou" },
    { name: "Dewazakura Shuzou" },
    { name: "Azakura Shuzou" },
  ];

  test("resolves asahi-shuzou to Asahi Shuzou, not Tamaasahi", () => {
    expect(pickBreweryBySlug(rows, "asahi-shuzou")?.name).toBe("Asahi Shuzou");
  });

  test("resolves tamaasahi-shuzou correctly", () => {
    expect(pickBreweryBySlug(rows, "tamaasahi-shuzou")?.name).toBe("Tamaasahi Shuzou");
  });

  test("resolves azakura without picking Dewazakura", () => {
    expect(pickBreweryBySlug(rows, "azakura-shuzou")?.name).toBe("Azakura Shuzou");
  });

  test("returns null when no slug matches", () => {
    expect(pickBreweryBySlug(rows, "dassai-brewery")).toBeNull();
  });
});

describe("breweryNameFromSlug", () => {
  test("turns hyphens into spaces", () => {
    expect(breweryNameFromSlug("asahi-shuzou")).toBe("asahi shuzou");
  });
});
