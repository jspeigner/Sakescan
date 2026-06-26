let sakeIdMap: Record<string, string> | null = null;

export function setSakeIdMap(map: Record<string, string>): void {
  sakeIdMap = map;
}

export function getSakeIdFromSlug(slug: string): string | undefined {
  return sakeIdMap?.[slug];
}

let clientMapPromise: Promise<Record<string, string>> | null = null;

export async function loadSakeIdMap(): Promise<Record<string, string>> {
  if (sakeIdMap) return sakeIdMap;

  if (typeof window === "undefined") {
    return {};
  }

  if (!clientMapPromise) {
    clientMapPromise = fetch("/data/sake-id-map.json")
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }

  sakeIdMap = await clientMapPromise;
  return sakeIdMap;
}
