import { describe, expect, test } from "bun:test";
import { findSakuraDescription } from "./sakeMetadataEnrich";

const row = {
  id: "1",
  name: "Dassai 45",
  name_japanese: null as string | null,
  brewery: "Asahi Shuzo",
  type: "Junmai Daiginjo",
  prefecture: null as string | null,
  region: null as string | null,
  rice_variety: null as string | null,
  polishing_ratio: null as number | null,
  alcohol_percentage: null as number | null,
  description: null as string | null,
};

describe("findSakuraDescription", () => {
  test("rejects English mismatch when Japanese cannot confirm", () => {
    const desc = findSakuraDescription(
      {
        name: "Kubota Manju",
        type: "Junmai Daiginjo",
        taste: "rich",
        prefecture: "Niigata",
      },
      row
    );
    expect(desc).toBeNull();
  });

  test("accepts English name overlap", () => {
    const desc = findSakuraDescription(
      {
        name: "Dassai 45 Junmai Daiginjo",
        type: "Junmai Daiginjo",
        taste: "fruity",
      },
      row
    );
    expect(desc).toContain("Dassai 45");
    expect(desc).toContain("fruity");
  });

  test("accepts Japanese name overlap when English differs", () => {
    const desc = findSakuraDescription(
      {
        name: "Unrelated Romanization",
        nameJapanese: "獺祭",
        type: "Junmai Daiginjo",
      },
      { ...row, name_japanese: "獺祭 磨き二割三分" }
    );
    expect(desc).toContain("Dassai 45");
  });
});
