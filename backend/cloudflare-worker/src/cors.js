/**
 * CORS headers for VoltType API.
 * Allows requests from Electron app and volttype.com.
 */

const ALLOWED_ORIGINS = [
  'http://localhost',
  'file://',
  'https://volttype.com',
  'https://www.volttype.com',
  'https://app.volttype.com',
];

// React Native / mobile apps send no Origin or a null origin
const MOBILE_USER_AGENTS = ['okhttp', 'expo', 'react-native', 'dalvik'];

export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();

  // Allow known web origins
  const webAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  // Allow mobile apps (no origin, or mobile user-agent)
  const mobileAllowed = origin === '' || MOBILE_USER_AGENTS.some(ua => userAgent.includes(ua));

  const allowed = webAllowed || mobileAllowed;

  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
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
