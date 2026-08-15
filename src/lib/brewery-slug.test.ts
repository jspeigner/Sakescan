import { describe, expect, test } from "bun:test";
import {
  breweryBrandCore,
  breweryNameFromSlug,
  brewerySakeNamePattern,
  brewerySlugFromSakeBreweryField,
  normalizeBreweryNameForMatch,
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

  test("maps Shuzo and English Sake Brewing to catalog shuzou slugs", () => {
    expect(brewerySlugFromSakeBreweryField("Asahi Shuzo")).toBe("asahi-shuzou");
    expect(brewerySlugFromSakeBreweryField("Asahi Shuzo Co.,Ltd")).toBe("asahi-shuzou");
    expect(brewerySlugFromSakeBreweryField("Hakutsuru Sake Brewing Co.,Ltd.")).toBe(
      "hakutsuru-shuzou"
    );
    expect(brewerySlugFromSakeBreweryField("Gekkeikan Sake Co.,Ltd")).toBe("gekkeikan");
  });
});

describe("normalizeBreweryNameForMatch", () => {
  test("drops parenthetical location tags", () => {
    expect(normalizeBreweryNameForMatch("Asahi Shuzo (Niigata)")).toBe("Asahi Shuzou");
  });

  test("maps English sake brewing to Shuzou", () => {
    expect(normalizeBreweryNameForMatch("Hakutsuru Sake Brewing Co.,Ltd.")).toBe(
      "Hakutsuru Shuzou"
    );
  });
});

describe("brewerySakeNamePattern", () => {
  test("prefix-matches via brand core so English variants are candidates", () => {
    expect(brewerySakeNamePattern("Akita Meijyo")).toBe("Akita Meijyo%");
    expect(brewerySakeNamePattern("Hakutsuru Shuzou")).toBe("Hakutsuru%");
    expect(breweryBrandCore("Hakutsuru Shuzou")).toBe("Hakutsuru");
    // "Chiyo%" must not match "Fukuchiyo…" as a prefix of the pattern itself —
    // candidate fetch is broader; equality filter rejects unrelated names.
    expect(brewerySakeNamePattern("Chiyo Shuzou")).toBe("Chiyo%");
    expect("Fukuchiyo shuzou yuugengaisha".toLowerCase().startsWith("chiyo")).toBe(false);
  });

  test("strips LIKE metacharacters from brewery names", () => {
    // "%" / "_" removed first; corporate "Co" + trailing "Sake" then normalize to brand core.
    expect(brewerySakeNamePattern("100% Sake_Co")).toBe("100%");
    expect(brewerySakeNamePattern("Aki%ta_Meijyo")).toBe("Aki ta Meijyo%");
  });
});

describe("sakeBreweryMatchesCatalogName", () => {
  test("allows corporate-suffix variants of the same brewery", () => {
    expect(sakeBreweryMatchesCatalogName("Akita Meijyo Co.,Ltd", "Akita Meijyo")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Kizakura Co.,Ltd", "Kizakura")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Kaetsu Co.,Ltd", "Kaetsu")).toBe(true);
  });

  test("matches Shuzo spelling and English Sake Brewing / Sake Company forms", () => {
    expect(sakeBreweryMatchesCatalogName("Asahi Shuzo", "Asahi Shuzou")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Asahi Shuzo Co.,Ltd", "Asahi Shuzou")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Asahi Shuzo (Niigata)", "Asahi Shuzou")).toBe(true);
    expect(
      sakeBreweryMatchesCatalogName("Hakutsuru Sake Brewing Co.,Ltd.", "Hakutsuru Shuzou")
    ).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Gekkeikan Sake Co.,Ltd", "Gekkeikan")).toBe(true);
    expect(sakeBreweryMatchesCatalogName("Gekkeikan Sake Company", "Gekkeikan")).toBe(true);
  });

  test("rejects longer brewery names that only share a prefix", () => {
    expect(sakeBreweryMatchesCatalogName("Ito Shuzo Co.,Ltd.", "Ito")).toBe(false);
    expect(sakeBreweryMatchesCatalogName("Itou Co., Ltd", "Ito")).toBe(false);
    expect(sakeBreweryMatchesCatalogName("Kaetsu Shuzo", "Kaetsu")).toBe(false);
    // Distinct catalog siblings must not cross-match.
    expect(sakeBreweryMatchesCatalogName("Kaetsu Co.,Ltd", "Kaetsu Shuzou")).toBe(false);
    expect(sakeBreweryMatchesCatalogName("Ito Shuzo Co.,Ltd.", "Ito Shuzou")).toBe(true);
  });
});
