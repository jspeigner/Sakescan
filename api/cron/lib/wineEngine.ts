/**
 * TinEye WineEngine client for SakeScan collection search / sync.
 * Credentials: WINEENGINE_USERNAME, WINEENGINE_PASSWORD (never commit).
 * Optional: WINEENGINE_BASE_URL (default https://wineengine.tineye.com/sakescan)
 */

export type WineEngineMatch = {
  filepath: string;
  score: number;
  score_text: number;
  match_percent: number;
  metadata?: {
    image_id?: string;
    text_lines?: string[];
    text_tokens?: string[];
    [key: string]: unknown;
  };
};

export type WineEngineResponse<T = unknown> = {
  method: string;
  status: 'ok' | 'fail' | string;
  error: string[];
  result: T;
  stats?: Record<string, number>;
  query_image?: { filepath?: string; metadata?: Record<string, unknown> };
};

export type WineEngineConfig = {
  baseUrl: string;
  username: string;
  password: string;
};

export function getWineEngineConfig(): WineEngineConfig | null {
  const username = process.env.WINEENGINE_USERNAME;
  const password = process.env.WINEENGINE_PASSWORD;
  if (!username || !password) return null;

  const baseUrl = (process.env.WINEENGINE_BASE_URL || 'https://wineengine.tineye.com/sakescan').replace(
    /\/$/,
    ''
  );
  return { baseUrl, username, password };
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

async function wineEngineMultipart<T>(
  cfg: WineEngineConfig,
  path: string,
  fields: Record<string, string>
): Promise<WineEngineResponse<T>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value) form.append(key, value);
  }

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(cfg.username, cfg.password) },
    body: form,
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as WineEngineResponse<T>;
  } catch {
    throw new Error(`WineEngine invalid JSON (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function wineEngineGet<T>(cfg: WineEngineConfig, path: string): Promise<WineEngineResponse<T>> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: basicAuthHeader(cfg.username, cfg.password) },
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as WineEngineResponse<T>;
  } catch {
    throw new Error(`WineEngine invalid JSON (${res.status}): ${text.slice(0, 200)}`);
  }
}

export function sakeWineEngineFilepath(sakeId: string): string {
  return `sake/${sakeId}.jpg`;
}

export async function wineEnginePing(cfg: WineEngineConfig): Promise<WineEngineResponse<unknown[]>> {
  return wineEngineGet(cfg, '/rest/ping/');
}

export async function wineEngineCount(cfg: WineEngineConfig): Promise<number> {
  const json = await wineEngineGet<number[]>(cfg, '/rest/count/');
  if (json.status !== 'ok') return 0;
  const n = json.result?.[0];
  return typeof n === 'number' ? n : 0;
}

export async function wineEngineAddByUrl(
  cfg: WineEngineConfig,
  params: { sakeId: string; imageUrl: string }
): Promise<WineEngineResponse<unknown[]>> {
  return wineEngineMultipart(cfg, '/rest/add/', {
    url: params.imageUrl,
    filepath: sakeWineEngineFilepath(params.sakeId),
    image_id: params.sakeId,
  });
}

export async function wineEngineSearchByUrl(
  cfg: WineEngineConfig,
  imageUrl: string,
  options?: { limit?: number; nameFilter?: string }
): Promise<WineEngineResponse<WineEngineMatch[]>> {
  const fields: Record<string, string> = {
    url: imageUrl,
    limit: String(options?.limit ?? 1),
    offset: '0',
  };
  if (options?.nameFilter) fields.name_filter = options.nameFilter;
  return wineEngineMultipart<WineEngineMatch[]>(cfg, '/rest/search/', fields);
}

/** True when top match is the target sake with strong text/visual score. */
export function wineEngineConfirmsSake(
  response: WineEngineResponse<WineEngineMatch[]>,
  targetSakeId: string,
  options?: { minScoreText?: number; minScore?: number }
): { confirmed: boolean; top?: WineEngineMatch; reason: string } {
  const minScoreText = options?.minScoreText ?? 55;
  const minScore = options?.minScore ?? 25;

  if (response.status !== 'ok' || !response.result?.length) {
    return { confirmed: false, reason: 'no_match' };
  }

  const top = response.result[0];
  const matchedId = top.metadata?.image_id;
  const scoreText = top.score_text ?? 0;
  const score = top.score ?? 0;

  if (matchedId === targetSakeId && scoreText >= minScoreText && score >= minScore) {
    return { confirmed: true, top, reason: 'matched_target' };
  }
  if (matchedId && matchedId !== targetSakeId && scoreText >= minScoreText) {
    return { confirmed: false, top, reason: 'matched_other_sake' };
  }
  return { confirmed: false, top, reason: 'weak_or_unlinked_match' };
}

/** Reject candidate when collection clearly identifies a different sake. */
export function wineEngineRejectsCandidate(
  response: WineEngineResponse<WineEngineMatch[]>,
  targetSakeId: string
): boolean {
  const check = wineEngineConfirmsSake(response, targetSakeId, { minScoreText: 50, minScore: 20 });
  return check.reason === 'matched_other_sake';
}
