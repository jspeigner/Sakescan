import type { WineEngineConfig } from './wineEngine.js';
import type { WineEngineQuotaSnapshot } from './wineEngineQuota.js';

/**
 * Success-payload fragment for process-images when WineEngine credentials exist.
 * Keep this pure — #44 removed collectionCount / activeInDiscover locals but left
 * response references, which threw ReferenceError and marked every discover run failed.
 */
export function buildProcessImagesWineEngineSummary(
  cfg: WineEngineConfig | null,
  quota: WineEngineQuotaSnapshot | null
):
  | { disabled: true }
  | {
      /** Live TinEye search was removed from discover in #44; index-on-place may still run. */
      activeInDiscover: false;
      quota: {
        period: string;
        images: number;
        searches: number;
        remainingImagesToday: number;
        remainingSearchesToday: number;
      } | null;
    } {
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
