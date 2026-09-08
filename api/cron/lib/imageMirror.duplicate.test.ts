import { describe, expect, test } from "bun:test";

/**
 * Documents the duplicate-hash contract: a second sighting in-run must not be
 * labeled skippedPlaceholder (callers null image_url on that flag), and must
 * return the previously hosted URL so null-image rows can still be assigned.
 */
function classifyHash(
  hash: string,
  hostedUrl: string,
  seenHashes: Map<string, string>,
  knownPlaceholderHashes: Set<string>
): { kind: "placeholder" | "duplicate" | "new"; url: string } {
  if (knownPlaceholderHashes.has(hash)) {
    return { kind: "placeholder", url: "external" };
  }
  const prior = seenHashes.get(hash);
  if (prior) return { kind: "duplicate", url: prior };
  seenHashes.set(hash, hostedUrl);
  return { kind: "new", url: hostedUrl };
}

describe("image mirror duplicate hash handling", () => {
  test("second identical hash is duplicate, not placeholder, and reuses hosted URL", () => {
    const seen = new Map<string, string>();
    const known = new Set<string>();
    expect(classifyHash("abc", "https://cdn.example/a.jpg", seen, known)).toEqual({
      kind: "new",
      url: "https://cdn.example/a.jpg",
    });
    expect(classifyHash("abc", "https://cdn.example/b.jpg", seen, known)).toEqual({
      kind: "duplicate",
      url: "https://cdn.example/a.jpg",
    });
    expect(known.has("abc")).toBe(false);
  });

  test("known placeholders still classify as placeholder", () => {
    const seen = new Map<string, string>();
    const known = new Set<string>(["deadbeef"]);
    expect(classifyHash("deadbeef", "https://cdn.example/x.jpg", seen, known).kind).toBe(
      "placeholder"
    );
  });
});
