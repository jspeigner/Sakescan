import { describe, expect, test } from 'bun:test';

/** Pure average helper mirroring admin-update-review rounding. */
function averageFromRatings(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10;
}

describe('sake rating aggregate math', () => {
  test('matches Soto Sake live case (5+4)/2 => 4.5', () => {
    expect(averageFromRatings([5, 4])).toBe(4.5);
  });

  test('empty ratings clear the average', () => {
    expect(averageFromRatings([])).toBeNull();
  });

  test('single rating', () => {
    expect(averageFromRatings([3])).toBe(3);
  });

  test('rounds to one decimal', () => {
    expect(averageFromRatings([5, 5, 4])).toBe(4.7);
  });
});
