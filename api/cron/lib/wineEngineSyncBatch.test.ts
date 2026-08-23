import { describe, expect, test } from 'bun:test';
import { nextWineEngineSyncOffset } from './wineEngineSyncBatch.ts';

describe('nextWineEngineSyncOffset', () => {
  test('quota stop after some adds does not skip unattempted unindexed rows', () => {
    // Prior bug: offset + added + failed skipped D–F after A–C were indexed out of the filter.
    expect(
      nextWineEngineSyncOffset({ added: 3, failed: 0, skippedQuota: 1 })
    ).toBe(0);
  });

  test('quota stop after a failure keeps the sticky failure ahead of unattempted work', () => {
    expect(
      nextWineEngineSyncOffset({ added: 2, failed: 1, skippedQuota: 1 })
    ).toBe(1);
  });

  test('full batch of successes restarts at the front of the remaining queue', () => {
    expect(
      nextWineEngineSyncOffset({ added: 6, failed: 0, skippedQuota: 0 })
    ).toBe(0);
  });

  test('full batch with sticky failures advances past those failures only', () => {
    expect(
      nextWineEngineSyncOffset({ added: 4, failed: 2, skippedQuota: 0 })
    ).toBe(2);
  });
});
