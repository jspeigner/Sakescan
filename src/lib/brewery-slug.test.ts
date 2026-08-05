import { describe, expect, test } from "bun:test";
import {
  breweryNameFromSlug,
  brewerySakeNamePattern,
  brewerySlugFromSakeBreweryField,
  pickBreweryBySlug,
  sakeBreweryMatchesCatalogName,
  stripBreweryCorporateSuffix,
} from "./brewery-slug.ts";

describe("pickBreweryBySlug", () => {
  const rows = [
    { name: "Asahi Shuzou" },
    { name: "Tamaasahi Shuzou" },
    { name: "Asahikawa Shuzou" },
    { name: "Dewazakura Shuzou" },
  ];

  test("prefers exact slugify match over substring ilike hits", () => {
    expect(pickBreweryBySlug(rows, "asahi-shuzou")?.name).toBe("Asahi Shuzou");
  });

  test("returns null when no slugify match exists", () => {
    expect(pickBreweryBySlug(rows, "not-a-real-brewery")).toBeNull();
  });

  test("falls back to space-normalized exact name", () => {
    expect(pickBreweryBySlug([{ name: "Den-en" }], "den-en")?.name).toBe("Den-en");
    expect(breweryNameFromSlug("den-en")).toBe("den en");
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
  test("prefix-matches corporate suffixes without substring false positives", () => {
    expect(brewerySakeNamePattern("Akita Meijyo")).toBe("Akita Meijyo%");
    // "Chiyo Shuzou%" must not match "Fukuchiyo shuzou…"
    expect(brewerySakeNamePattern("Chiyo Shuzou")).toBe("Chiyo Shuzou%");
    expect("Fukuchiyo shuzou yuugengaisha".toLowerCase().startsWith("chiyo shuzou")).toBe(
      false
    );
  });

  test("strips LIKE metacharacters from brewery names", () => {
    expect(brewerySakeNamePattern("100% Sake_Co")).toBe("100 Sake Co%");
    expect(brewerySakeNamePattern("Aki%ta_Meijyo")).toBe("Aki ta Meijyo%");
  });
});

describe("sakeBreweryMatchesCatalogName", () => {
  test("allows corporate-suffix variants of the same brewery", () => {
    expect(sakeBreweryMatchesCatalogName("Akita Meijyo Co.,Ltd", "Akita Meijyo")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Kizakura Co.,Ltd", "Kizakura")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Kaetsu Co.,Ltd", "Kaetsu")).toBe(true);
  });

  test("rejects longer brewery names that only share a prefix", () => {
    expect(sakeBreweryMatchesCatalogName("Ito Shuzo Co.,Ltd.", "Ito")).toBe(false);
    expect(sakeBreweryMatchesCatalogName("Itou Co., Ltd", "Ito")).toBe(false);
    expect(sakeBreweryMatchesCatalogName("Kaetsu Shuzo", "Kaetsu")).toBe(false);
  });
});
