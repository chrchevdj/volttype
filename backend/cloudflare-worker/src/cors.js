/**
 * CORS headers for VoltType API.
 * Allows requests from Electron app and volttype.com.
 */

const ALLOWED_ORIGINS = new Set([
  'https://volttype.com',
  'https://www.volttype.com',
  'https://app.volttype.com',
]);

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);
const TRUSTED_NATIVE_USER_AGENTS = ['electron', 'okhttp', 'expo', 'react-native', 'dalvik'];

export function corsHeaders(request) {
  const allowedOrigin = getAllowedCorsOrigin(request);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}

export function handleOptions(request) {
  const origin = request.headers.get('Origin');
  if (origin && !getAllowedCorsOrigin(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

function getAllowedCorsOrigin(request) {
  const origin = request.headers.get('Origin');
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();

  if (!origin) {
    return null;
  }

  if (ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }

  if (origin === 'null' && TRUSTED_NATIVE_USER_AGENTS.some((ua) => userAgent.includes(ua))) {
    return 'null';
  }

  try {
    const url = new URL(origin);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOCALHOST_HOSTS.has(url.hostname)) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}
