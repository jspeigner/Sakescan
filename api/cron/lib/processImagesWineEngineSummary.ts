import type { WineEngineConfig } from './wineEngine.js';
import type { WineEngineQuotaSnapshot } from './wineEngineQuota.js';

export type ProcessImagesWineEngineSummary =
  | { disabled: true }
  | {
      /** Live WineEngine search was removed from discover; index-on-place may still run. */
      activeInDiscover: false;
      quota: {
        period: string;
        images: number;
        searches: number;
        remainingImagesToday: number;
        remainingSearchesToday: number;
      } | null;
    };

/**
 * WineEngine fragment of the process-images success payload. Kept pure so the
 * response cannot reference discover-time locals that no longer exist (that
 * previously threw a ReferenceError and turned every run into an HTTP 500).
 */
export function buildProcessImagesWineEngineSummary(
  cfg: WineEngineConfig | null,
  quota: WineEngineQuotaSnapshot | null
): ProcessImagesWineEngineSummary {
  if (!cfg) return { disabled: true };
  return {
    activeInDiscover: false,
    quota: quota
      ? {
          period: quota.state.period,
          images: quota.state.images,
          searches: quota.state.searches,
          remainingImagesToday: quota.remainingImagesToday,
          remainingSearchesToday: quota.remainingSearchesToday,
        }
      : null,
  };
}
