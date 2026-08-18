import type { VercelRequest, VercelResponse } from '@vercel/node';
import processImagesHandler from '../process-images.js';

/** Run process-images in-process (avoids Vercel Deployment Protection on self-fetch). */
export async function invokeProcessImages(
  query: Record<string, string>,
  parentReq: VercelRequest
): Promise<{ ok: boolean; json?: Record<string, unknown>; error?: string }> {
  let statusCode = 200;
  let json: Record<string, unknown> = {};
  let headersSent = false;

  const chain = {
    status(code: number) {
      statusCode = code;
      return chain;
    },
    json(data: unknown) {
      json =
        data && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : { data };
      headersSent = true;
      return chain;
    },
  };

  const req = {
    method: 'GET',
    query: { chunk: '1', ...query },
    headers: {
      authorization: parentReq.headers.authorization,
      'x-vercel-cron': parentReq.headers['x-vercel-cron'],
    },
  } as VercelRequest;

  const res = {
    ...chain,
    get headersSent() {
      return headersSent;
    },
    set headersSent(value: boolean) {
      headersSent = value;
    },
  } as VercelResponse;

  try {
    await processImagesHandler(req, res);
    if (statusCode >= 400) {
      const errMsg =
        typeof json.error === 'string'
          ? json.error
          : typeof json.details === 'string'
            ? json.details
            : `HTTP ${statusCode}`;
      return { ok: false, json, error: errMsg };
    }
    return { ok: true, json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
