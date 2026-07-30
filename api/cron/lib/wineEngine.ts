/**
 * TinEye WineEngine client — DISABLED (subscription not renewed Jul 2026).
 * No network calls. Helpers kept as stubs so imports compile if referenced.
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

export function isWineEngineEnabled(): boolean {
  return false;
}

export function getWineEngineConfig(): WineEngineConfig | null {
  return null;
}

export function sakeWineEngineFilepath(sakeId: string): string {
  return `sake/${sakeId}.jpg`;
}

function disabledResponse<T>(method: string): WineEngineResponse<T> {
  return {
    method,
    status: 'fail',
    error: ['WineEngine disabled — subscription not active'],
    result: [] as T,
  };
}

export async function wineEnginePing(_cfg: WineEngineConfig): Promise<WineEngineResponse<unknown[]>> {
  return disabledResponse('ping');
}

export async function wineEngineCount(_cfg: WineEngineConfig): Promise<number> {
  return 0;
}

export async function wineEngineAddByUrl(
  _cfg: WineEngineConfig,
  _params: { sakeId: string; imageUrl: string }
): Promise<WineEngineResponse<unknown[]>> {
  return disabledResponse('add');
}

export async function wineEngineSearchByUrl(
  _cfg: WineEngineConfig,
  _imageUrl: string,
  _options?: { limit?: number; nameFilter?: string }
): Promise<WineEngineResponse<WineEngineMatch[]>> {
  return disabledResponse('search');
}

export function wineEngineConfirmsSake(
  _response: WineEngineResponse<WineEngineMatch[]>,
  _targetSakeId: string,
  _options?: { minScoreText?: number; minScore?: number }
): { confirmed: boolean; top?: WineEngineMatch; reason: string } {
  return { confirmed: false, reason: 'wineengine_disabled' };
}

export function wineEngineRejectsCandidate(
  _response: WineEngineResponse<WineEngineMatch[]>,
  _targetSakeId: string
): boolean {
  return false;
}
