import { describe, expect, test } from "bun:test";
import {
  breweryNameFromSlug,
  brewerySakeNamePattern,
  brewerySlugFromSakeBreweryField,
  pickBreweryBySlug,
  stripBreweryCorporateSuffix,
} from "./brewery-slug.ts";

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

describe("brewerySlugFromSakeBreweryField", () => {
  test("strips Co.,Ltd so sake detail links hit the brewery page", () => {
    expect(stripBreweryCorporateSuffix("Akita Meijyo Co.,Ltd")).toBe("Akita Meijyo");
    expect(brewerySlugFromSakeBreweryField("Akita Meijyo Co.,Ltd")).toBe("akita-meijyo");
  });

  test("leaves names without corporate suffixes unchanged", () => {
    expect(brewerySlugFromSakeBreweryField("Dassai")).toBe("dassai");
  });
});

describe("brewerySakeNamePattern", () => {
  test("builds a prefix LIKE pattern for admin brewery filters", () => {
    expect(brewerySakeNamePattern("Akita Meijyo")).toBe("Akita Meijyo%");
  });

  test("strips embedded LIKE wildcards from the brewery name", () => {
    expect(brewerySakeNamePattern("Aki%ta_Meijyo")).toBe("Aki ta Meijyo%");
  });
});
