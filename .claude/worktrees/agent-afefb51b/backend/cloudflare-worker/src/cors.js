/**
 * CORS headers for VoltType API.
 * Allows requests from Electron app and volttype.com.
 */

const ALLOWED_ORIGINS = [
  'http://localhost',
  'file://',
  'https://volttype.com',
  'https://www.volttype.com',
];

export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin === '';

  return {
    'Access-Control-Allow-Origin': allowed ? origin || '*' : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
