import { describe, expect, test } from "bun:test";
import {
  breweryNameFromSlug,
  brewerySakeNamePattern,
  pickBreweryBySlug,
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

describe("brewerySakeNamePattern", () => {
  test("prefix-matches corporate suffixes without substring false positives", () => {
    expect(brewerySakeNamePattern("Akita Meijyo")).toBe("Akita Meijyo%");
    // "Chiyo Shuzou%" must not match "Fukuchiyo shuzou…"
    expect(brewerySakeNamePattern("Chiyo Shuzou")).toBe("Chiyo Shuzou%");
    expect("Fukuchiyo shuzou yuugengaisha".toLowerCase().startsWith("chiyo shuzou")).toBe(
      false
    );
    expect("Akita Meijyo Co.,Ltd".toLowerCase().startsWith("akita meijyo")).toBe(true);
  });

  test("strips LIKE metacharacters from brewery names", () => {
    expect(brewerySakeNamePattern("100% Sake_Co")).toBe("100 Sake Co%");
  });
});
