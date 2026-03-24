/**
 * Vision check: image must look like Japanese sake (nihonshu) product photography,
 * not whisky/wine/beer or unrelated subjects.
 */

export type SakeVisionResult = {
  isJapaneseSakeProductPhoto: boolean;
  confidence: 'high' | 'medium' | 'low';
  briefReason: string;
};

function parseVisionJson(text: string): SakeVisionResult | null {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    const ok = o.isJapaneseSakeProductPhoto === true;
    const conf =
      o.confidence === 'high' || o.confidence === 'medium' || o.confidence === 'low'
        ? o.confidence
        : 'medium';
    const reason = typeof o.briefReason === 'string' ? o.briefReason : '';
    return { isJapaneseSakeProductPhoto: ok, confidence: conf, briefReason: reason };
  } catch {
    return null;
  }
}

/** Download image and return a data URL for OpenAI (some CDNs block OpenAI fetch). */
async function imageUrlToDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (ct.includes('text/html')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500 || buf.length > 8_000_000) return null;
    const b64 = buf.toString('base64');
    const mime = ct.split(';')[0].trim() || 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

export async function validateJapaneseSakeProductPhoto(
  openaiApiKey: string,
  imageUrl: string,
  context: { sakeName: string; brewery?: string | null }
): Promise<SakeVisionResult> {
  const system = `You verify product photos for a Japanese sake (nihonshu) database. Reply with JSON only.`;

  const userText = `Sake name: "${context.sakeName}"${context.brewery ? `. Brewery: "${context.brewery}".` : ''}

Does this image clearly show Japanese sake (nihonshu) — bottle, label, tokkuri, or typical retail product shot?

Return JSON: {"isJapaneseSakeProductPhoto": boolean, "confidence": "high"|"medium"|"low", "briefReason": "short English phrase"}

Set isJapaneseSakeProductPhoto to FALSE for: Scotch/whisky/whiskey (e.g. Johnnie Walker, Chivas, Macallan), bourbon, vodka, gin, wine, beer, cocktails, food-only, people-only, diagrams, logos with no bottle, or anything clearly not Japanese sake.`;

  let imagePart: { type: 'image_url'; image_url: { url: string; detail: 'low' } };

  const dataUrl = await imageUrlToDataUrl(imageUrl);
  if (dataUrl) {
    imagePart = { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } };
  } else {
    imagePart = { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 180,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [{ type: 'text', text: userText }, imagePart],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI vision HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  const parsed = parseVisionJson(content);
  if (!parsed) {
    return { isJapaneseSakeProductPhoto: false, confidence: 'low', briefReason: 'Unparseable model response' };
  }
  return parsed;
}
