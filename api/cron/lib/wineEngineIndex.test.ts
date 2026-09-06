import { describe, expect, test } from 'bun:test';
import { wineEngineFilepathAlreadyExists } from './wineEngine.ts';

describe('wineEngineFilepathAlreadyExists', () => {
  test('detects sticky filepath conflicts from add errors', () => {
    expect(
      wineEngineFilepathAlreadyExists({
        method: 'add',
        status: 'fail',
        error: ['Image with filepath sake/abc.jpg already exists in the collection'],
        result: [],
      })
    ).toBe(true);

    expect(
      wineEngineFilepathAlreadyExists({
        method: 'add',
        status: 'fail',
        error: ['network timeout'],
        result: [],
      })
    ).toBe(false);

    expect(
      wineEngineFilepathAlreadyExists({
        method: 'add',
        status: 'ok',
        error: [],
        result: [],
      })
    ).toBe(false);
  });
});
