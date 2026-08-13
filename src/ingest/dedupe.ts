const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
]);

/** Strip tracking params + fragment, lowercase host. */
export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Jaccard similarity over word tokens. 1 = identical, 0 = no overlap.
 * Used to collapse "same story, different outlet" duplicates.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;

  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  return intersection / (A.size + B.size - intersection);
}
