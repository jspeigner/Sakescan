import { describe, expect, test } from "bun:test";

/**
 * Documents the duplicate-hash contract: a second sighting in-run must not be
 * labeled skippedPlaceholder (callers null image_url on that flag).
 * downloadAndStore itself needs network; we unit-test the decision shape here
 * by mirroring the fixed branch logic.
 */
function classifyHash(
  hash: string,
  seenHashes: Set<string>,
  knownPlaceholderHashes: Set<string>
): "placeholder" | "duplicate" | "new" {
  if (knownPlaceholderHashes.has(hash)) return "placeholder";
  if (seenHashes.has(hash)) return "duplicate";
  seenHashes.add(hash);
  return "new";
}

describe("image mirror duplicate hash handling", () => {
  test("second identical hash is duplicate, not placeholder", () => {
    const seen = new Set<string>();
    const known = new Set<string>();
    expect(classifyHash("abc", seen, known)).toBe("new");
    expect(classifyHash("abc", seen, known)).toBe("duplicate");
    expect(known.has("abc")).toBe(false);
  });

  test("known placeholders still classify as placeholder", () => {
    const seen = new Set<string>();
    const known = new Set<string>(["deadbeef"]);
    expect(classifyHash("deadbeef", seen, known)).toBe("placeholder");
  });
});
