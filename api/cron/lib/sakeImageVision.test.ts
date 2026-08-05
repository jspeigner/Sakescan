import { describe, expect, test } from 'bun:test';
import { sakeVisionPasses, shouldClearHostedImageFromAudit } from './sakeImageVision.ts';

describe('shouldClearHostedImageFromAudit', () => {
  test('does not clear on unparseable / low-confidence negatives', () => {
    expect(
      shouldClearHostedImageFromAudit({
        isJapaneseSakeProductPhoto: false,
        confidence: 'low',
        briefReason: 'Unparseable model response',
      })
    ).toBe(false);
    expect(
      shouldClearHostedImageFromAudit({
        isJapaneseSakeProductPhoto: false,
        confidence: 'medium',
        briefReason: 'unclear',
      })
    ).toBe(false);
  });

  test('clears only on high-confidence not-sake', () => {
    expect(
      shouldClearHostedImageFromAudit({
        isJapaneseSakeProductPhoto: false,
        confidence: 'high',
        briefReason: 'whisky bottle',
      })
    ).toBe(true);
  });

  test('never clears when vision says it is sake', () => {
    expect(
      shouldClearHostedImageFromAudit({
        isJapaneseSakeProductPhoto: true,
        confidence: 'low',
        briefReason: 'maybe',
      })
    ).toBe(false);
    expect(sakeVisionPasses({
      isJapaneseSakeProductPhoto: true,
      confidence: 'low',
      briefReason: 'maybe',
    })).toBe(false);
  });
});
