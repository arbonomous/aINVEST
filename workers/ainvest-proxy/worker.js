/**
 * aINVEST Free Cloudflare Worker Proxy
 * Deploy on Cloudflare Workers Free Tier (100,000 req/day, $0/month).
 * Usage: https://<your-worker>.workers.dev/?url=https%3A%2F%2Fcdn.cboe.com%2F...
 */

const ALLOWED_HOSTS = new Set([
  'cdn.cboe.com',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'feeds.finance.yahoo.com',
  'finance.yahoo.com',
  'www.cnbc.com',
  'www.investing.com',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      return Response.json(
        { ok: true, service: 'ainvest-proxy', usage: '?url=<encoded-target-url>' },
        { status: 200, headers: CORS_HEADERS },
      );
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(target);
    } catch {
      return new Response('Invalid url parameter', { status: 400, headers: CORS_HEADERS });
    }

    if (
      parsedTarget.protocol !== 'https:' ||
      !ALLOWED_HOSTS.has(parsedTarget.hostname.toLowerCase())
    ) {
      return new Response('Host not allowlisted', { status: 403, headers: CORS_HEADERS });
    }

    const upstream = await fetch(parsedTarget.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cf: {
        cacheTtl: 20,
        cacheEverything: true,
      },
    });

    const headers = new Headers(CORS_HEADERS);
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=20');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
