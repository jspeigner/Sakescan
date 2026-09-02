import { describe, expect, test } from 'bun:test';
import {
  cronBearerMatches,
  firstHeaderValue,
  isAuthorizedCronRequest,
  isVercelCronRequest,
} from './cronAuth.ts';

describe('firstHeaderValue', () => {
  test('trims a string header', () => {
    expect(firstHeaderValue(' Bearer abc ')).toBe('Bearer abc');
  });

  test('uses the first value when Node provides a string[]', () => {
    expect(firstHeaderValue(['Bearer abc', 'Bearer other'])).toBe('Bearer abc');
  });

  test('returns undefined for empty values', () => {
    expect(firstHeaderValue(undefined)).toBeUndefined();
    expect(firstHeaderValue('')).toBeUndefined();
    expect(firstHeaderValue([])).toBeUndefined();
  });
});

describe('cron auth', () => {
  test('matches a bearer token and a raw secret', () => {
    expect(cronBearerMatches({ authorization: 'Bearer secret-1' }, 'secret-1')).toBe(true);
    expect(cronBearerMatches({ authorization: 'secret-1' }, 'secret-1')).toBe(true);
    expect(cronBearerMatches({ authorization: ['Bearer secret-1'] }, ' secret-1 ')).toBe(true);
    expect(cronBearerMatches({ authorization: 'Bearer nope' }, 'secret-1')).toBe(false);
    expect(cronBearerMatches({ authorization: 'Bearer secret-1' }, '')).toBe(false);
  });

  test('recognizes Vercel cron header', () => {
    expect(isVercelCronRequest({ 'x-vercel-cron': '1' })).toBe(true);
    expect(isVercelCronRequest({ 'x-vercel-cron': ['1'] })).toBe(true);
    expect(isVercelCronRequest({ 'x-vercel-cron': 'true' })).toBe(true);
    expect(
      isVercelCronRequest({
        'user-agent': 'vercel-cron/1.0',
        'x-vercel-cron-schedule': '0 14 * * *',
      })
    ).toBe(true);
    expect(isVercelCronRequest({})).toBe(false);
  });

  test('authorizes scheduled Vercel jobs only from metadata when CRON_SECRET is absent', () => {
    expect(isAuthorizedCronRequest({ 'x-vercel-cron': '1' }, undefined)).toBe(true);
    expect(
      isAuthorizedCronRequest(
        {
          'user-agent': 'vercel-cron/1.0',
          'x-vercel-cron-schedule': ['0 14 * * *'],
        },
        undefined
      )
    ).toBe(true);
    expect(isAuthorizedCronRequest({ authorization: 'Bearer secret-1' }, 'secret-1')).toBe(true);
    expect(isAuthorizedCronRequest({ authorization: ['Bearer secret-1'] }, 'secret-1')).toBe(true);
    expect(isAuthorizedCronRequest({}, 'secret-1')).toBe(false);
    expect(isAuthorizedCronRequest({ authorization: 'Bearer other' }, 'secret-1')).toBe(false);
    expect(isAuthorizedCronRequest({ 'x-vercel-cron': '1' }, 'secret-1')).toBe(false);
    expect(
      isAuthorizedCronRequest(
        {
          'user-agent': 'vercel-cron/1.0',
          'x-vercel-cron-schedule': '0 14 * * *',
        },
        'secret-1'
      )
    ).toBe(false);
  });
});
