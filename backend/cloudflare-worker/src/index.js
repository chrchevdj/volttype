/**
 * VoltType API — Cloudflare Worker
 *
 * Proxies STT and LLM requests to Groq with auth and usage tracking.
 * Endpoints:
 *   POST /v1/transcribe  — Audio transcription
 *   POST /v1/clean       — Text cleanup via LLM
 *   GET  /v1/usage       — User's current usage stats
 *   GET  /v1/health      — Health check
 */

import { corsHeaders, handleOptions } from './cors.js';
import { verifyToken } from './auth.js';
import { checkUsageLimit, logUsage } from './usage.js';
import { proxyTranscribe, proxyClean } from './groq-proxy.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Health check (no auth needed)
    if (path === '/v1/health') {
      return json({ status: 'ok', service: 'volttype-api' }, 200, request);
    }

    // All other endpoints require auth
    const user = await verifyToken(request, env);
    if (!user) {
      return json({ error: 'Unauthorized — invalid or expired token' }, 401, request);
    }

    // --- POST /v1/transcribe ---
    if (path === '/v1/transcribe' && request.method === 'POST') {
      // Check usage limit
      const usage = await checkUsageLimit(user.userId, env);
      if (!usage.allowed) {
        return json({
          error: 'Daily limit reached',
          plan: usage.plan,
          usedSeconds: usage.usedSeconds,
          limitSeconds: usage.limitSeconds,
          upgrade: 'Upgrade your plan for more minutes at volttype.com',
        }, 429, request);
      }

      // Proxy to Groq
      const result = await proxyTranscribe(request, env);
      if (result.error) {
        return json({ error: result.error }, result.status, request);
      }

      // Log usage
      await logUsage(user.userId, result.duration || 0, 'whisper-large-v3-turbo', 'transcribe', env);

      return json({
        text: result.text,
        duration: result.duration,
        usage: {
          thisRequest: result.duration,
          remaining: usage.remainingSeconds - (result.duration || 0),
        },
      }, 200, request);
    }

    // --- POST /v1/clean ---
    if (path === '/v1/clean' && request.method === 'POST') {
      const result = await proxyClean(request, env);
      if (result.error) {
        return json({ error: result.error }, result.status, request);
      }

      // Log LLM usage (minimal seconds, mainly token-based)
      await logUsage(user.userId, 0, 'llama-3.3-70b', 'clean', env);

      return json({ text: result.cleaned }, 200, request);
    }

    // --- GET /v1/usage ---
    if (path === '/v1/usage' && request.method === 'GET') {
      const usage = await checkUsageLimit(user.userId, env);
      return json({
        plan: usage.plan,
        usedSeconds: usage.usedSeconds,
        limitSeconds: usage.limitSeconds,
        remainingSeconds: usage.remainingSeconds,
      }, 200, request);
    }

    return json({ error: 'Not found' }, 404, request);
  },
};

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}
