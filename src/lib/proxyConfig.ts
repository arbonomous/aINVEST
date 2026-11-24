const STORAGE_KEY = 'ainvest_proxy_url_v1';

const PUBLIC_RELAYS: ReadonlyArray<(targetUrl: string) => string> = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

export function normalizeProxyBase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function getCustomProxyBase(): string | null {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = normalizeProxyBase(params.get('proxy'));
      if (fromQuery) {
        try {
          window.localStorage.setItem(STORAGE_KEY, fromQuery);
        } catch {
          // Ignore storage restrictions
        }
        return fromQuery;
      }
      const fromStorage = normalizeProxyBase(
        window.localStorage.getItem(STORAGE_KEY),
      );
      if (fromStorage) return fromStorage;
    }
  } catch {
    // Ignore
  }

  const fromEnv = normalizeProxyBase(
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PROXY_URL,
  );
  return fromEnv;
}

export function buildRelayUrls(
  targetUrl: string,
  options?: { includeDirectFirst?: boolean },
): string[] {
  const custom = getCustomProxyBase();
  const urls: string[] = [];

  if (custom) {
    const sep = custom.includes('?') ? '&' : '?';
    urls.push(`${custom}${sep}url=${encodeURIComponent(targetUrl)}`);
  }

  if (options?.includeDirectFirst && !custom) {
    urls.push(targetUrl);
  }

  for (const fn of PUBLIC_RELAYS) {
    urls.push(fn(targetUrl));
  }

  return urls;
}
