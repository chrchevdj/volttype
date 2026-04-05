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
import { proxyTranscribe, proxyClean, proxyCommand } from './groq-proxy.js';

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

    try {
    // All other endpoints require auth
    const user = await verifyToken(request, env);
    if (!user) {
      return json({ error: 'Unauthorized — invalid or expired token' }, 401, request);
    }

    // --- Request size limit (10MB max for audio) ---
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) {
      return json({ error: 'Request too large. Maximum 10MB.' }, 413, request);
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

    // --- POST /v1/command ---
    // AI voice command: transform text (make formal, fix grammar, translate, etc.)
    if (path === '/v1/command' && request.method === 'POST') {
      const result = await proxyCommand(request, env);
      if (result.error) {
        return json({ error: result.error }, result.status, request);
      }

      await logUsage(user.userId, 0, 'llama-3.3-70b', 'command', env);

      return json({ text: result.text, command: result.command }, 200, request);
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

    // --- POST /v1/checkout ---
    if (path === '/v1/checkout' && request.method === 'POST') {
      try {
        const { plan } = await request.json();
        const priceId = plan === 'pro' ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_BASIC;

        if (!priceId || !env.STRIPE_SECRET_KEY) {
          return json({ error: 'Payment not configured' }, 500, request);
        }

        // Create Stripe Checkout Session
        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'mode': 'subscription',
            'payment_method_types[]': 'card',
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': '1',
            'success_url': 'https://volttype.com/?payment=success',
            'cancel_url': 'https://volttype.com/?payment=cancelled',
            'client_reference_id': user.userId,
            'customer_email': user.email,
          }),
        });

        const session = await stripeRes.json();
        if (!stripeRes.ok) {
          return json({ error: session.error?.message || 'Stripe error' }, 400, request);
        }

        return json({ url: session.url }, 200, request);
      } catch (err) {
        return json({ error: err.message }, 500, request);
      }
    }

    // --- GET /v1/admin/stats ---
    // Admin-only: returns user/subscriber/usage stats
    if (path === '/v1/admin/stats' && request.method === 'GET') {
      const ADMIN_EMAIL = 'crcaway@gmail.com';
      if (user.email !== ADMIN_EMAIL) {
        return json({ error: 'Forbidden' }, 403, request);
      }

      try {
        const supabaseHeaders = {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        };
        const supabaseUrl = env.SUPABASE_URL;

        // Fetch all stats in parallel
        const [usersRes, profilesRes, subsRes, usageRes] = await Promise.all([
          // Total auth users
          fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, {
            headers: { ...supabaseHeaders, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` },
          }),
          // Profiles with plans
          fetch(`${supabaseUrl}/rest/v1/volttype_profiles?select=id,email,plan,created_at&order=created_at.desc`, {
            headers: supabaseHeaders,
          }),
          // Active subscriptions
          fetch(`${supabaseUrl}/rest/v1/volttype_subscriptions?select=*&status=eq.active`, {
            headers: supabaseHeaders,
          }),
          // Usage last 7 days
          fetch(`${supabaseUrl}/rest/v1/volttype_usage?select=user_id,audio_seconds,created_at&created_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}&order=created_at.desc`, {
            headers: supabaseHeaders,
          }),
        ]);

        const profiles = await profilesRes.json();
        const subs = subsRes.ok ? await subsRes.json() : [];
        const usage = usageRes.ok ? await usageRes.json() : [];

        // Download count from GitHub
        let downloads = 0;
        try {
          const ghRes = await fetch('https://api.github.com/repos/chrchevdj/volttype-releases/releases', {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'volttype-api' },
          });
          if (ghRes.ok) {
            const releases = await ghRes.json();
            downloads = releases.reduce((sum, r) =>
              sum + (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0), 0);
          }
        } catch { /* ignore */ }

        // Compute stats
        const totalUsers = Array.isArray(profiles) ? profiles.length : 0;
        const planCounts = { free: 0, basic: 0, pro: 0 };
        if (Array.isArray(profiles)) {
          profiles.forEach(p => {
            const plan = p.plan || 'free';
            planCounts[plan] = (planCounts[plan] || 0) + 1;
          });
        }

        const totalUsageSeconds = Array.isArray(usage)
          ? usage.reduce((s, u) => s + (u.audio_seconds || 0), 0) : 0;
        const activeUsers7d = Array.isArray(usage)
          ? new Set(usage.map(u => u.user_id)).size : 0;

        return json({
          totalUsers,
          plans: planCounts,
          activeSubscriptions: Array.isArray(subs) ? subs.length : 0,
          downloads,
          usage7d: {
            totalMinutes: Math.round(totalUsageSeconds / 60),
            activeUsers: activeUsers7d,
            sessions: Array.isArray(usage) ? usage.length : 0,
          },
          recentUsers: Array.isArray(profiles) ? profiles.slice(0, 10).map(p => ({
            email: p.email,
            plan: p.plan || 'free',
            joined: p.created_at,
          })) : [],
        }, 200, request);
      } catch (err) {
        return json({ error: 'Failed to fetch stats: ' + err.message }, 500, request);
      }
    }

    return json({ error: 'Not found' }, 404, request);
    } catch (err) {
      // Global error handler — never let the Worker crash silently
      console.error('[WORKER] Unhandled error:', err.message, err.stack);
      return json({ error: 'Internal server error' }, 500, request);
    }
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
