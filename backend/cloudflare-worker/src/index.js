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

    if (path === '/v1/webhooks/stripe' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
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
        if (!['basic', 'pro'].includes(plan)) {
          return json({ error: 'Invalid plan selected' }, 400, request);
        }

        const priceId = plan === 'pro' ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_BASIC;

        if (!priceId || !env.STRIPE_SECRET_KEY) {
          return json({ error: 'Payment not configured' }, 500, request);
        }

        const existingProfile = await getProfileByUserId(user.userId, env);
        const checkoutParams = new URLSearchParams({
          'mode': 'subscription',
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          'success_url': `https://volttype.com/?payment=success&plan=${plan}`,
          'cancel_url': `https://volttype.com/?payment=cancelled&plan=${plan}`,
          'client_reference_id': user.userId,
          'metadata[user_id]': user.userId,
          'metadata[plan]': plan,
          'subscription_data[metadata][user_id]': user.userId,
          'subscription_data[metadata][plan]': plan,
          'allow_promotion_codes': 'true',
          'billing_address_collection': 'auto',
          'payment_method_collection': 'if_required',
          'customer_update[address]': 'auto',
          'customer_update[name]': 'auto',
        });

        if (existingProfile?.stripe_customer_id) {
          checkoutParams.set('customer', existingProfile.stripe_customer_id);
        } else {
          checkoutParams.set('customer_email', user.email);
        }

        // Create Stripe Checkout Session
        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Stripe-Version': '2026-02-25.clover',
          },
          body: checkoutParams,
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

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'Stripe webhook secret not configured' }, 500, request);
  }

  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  const isValid = await verifyStripeWebhookSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);

  if (!isValid) {
    return json({ error: 'Invalid Stripe signature' }, 400, request);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid webhook payload' }, 400, request);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data?.object;
        const userId = session?.client_reference_id || session?.metadata?.user_id;
        const customerId = getStripeId(session?.customer);

        if (userId && customerId) {
          await updateProfile(userId, { stripe_customer_id: customerId }, env);
        }

        if (session?.subscription) {
          const subscription = await fetchStripeSubscription(session.subscription, env);
          if (subscription) {
            await syncStripeSubscription(subscription, env);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncStripeSubscription(event.data?.object, env);
        break;

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subscriptionId = getStripeId(event.data?.object?.subscription);
        if (subscriptionId) {
          const subscription = await fetchStripeSubscription(subscriptionId, env);
          if (subscription) {
            await syncStripeSubscription(subscription, env);
          }
        }
        break;
      }

      default:
        break;
    }

    return json({ received: true }, 200, request);
  } catch (error) {
    console.error('[STRIPE] Webhook handling failed:', error.message);
    return json({ error: 'Webhook processing failed' }, 500, request);
  }
}

async function syncStripeSubscription(subscription, env) {
  if (!subscription?.id) return;

  const customerId = getStripeId(subscription.customer);
  let userId = subscription.metadata?.user_id || null;

  if (!userId && customerId) {
    const profile = await getProfileByCustomerId(customerId, env);
    userId = profile?.id || null;
  }

  if (!userId) {
    console.warn('[STRIPE] Missing user mapping for subscription', subscription.id);
    return;
  }

  const plan = getPlanFromSubscription(subscription, env);
  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const effectivePlan = activeStatuses.has(subscription.status) && plan ? plan : 'free';

  await upsertSubscription(
    {
      stripe_subscription_id: subscription.id,
      user_id: userId,
      plan: plan || 'free',
      status: subscription.status || 'inactive',
      current_period_start: unixToIso(subscription.current_period_start),
      current_period_end: unixToIso(subscription.current_period_end),
    },
    env
  );

  await updateProfile(
    userId,
    {
      plan: effectivePlan,
      stripe_customer_id: customerId,
    },
    env
  );
}

async function fetchStripeSubscription(subscriptionId, env) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2026-02-25.clover',
    },
  });

  if (!res.ok) {
    console.error('[STRIPE] Failed to fetch subscription:', await res.text());
    return null;
  }

  return res.json();
}

function getPlanFromSubscription(subscription, env) {
  const metadataPlan = subscription?.metadata?.plan;
  if (metadataPlan === 'basic' || metadataPlan === 'pro') {
    return metadataPlan;
  }

  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  if (priceId === env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === env.STRIPE_PRICE_BASIC) return 'basic';
  return null;
}

function getStripeId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

function unixToIso(value) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

async function getProfileByUserId(userId, env) {
  const res = await supabaseRequest(
    `/rest/v1/volttype_profiles?select=id,email,plan,stripe_customer_id&id=eq.${encodeURIComponent(userId)}`,
    env
  );
  return Array.isArray(res) ? res[0] || null : null;
}

async function getProfileByCustomerId(customerId, env) {
  const res = await supabaseRequest(
    `/rest/v1/volttype_profiles?select=id,email,plan,stripe_customer_id&stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
    env
  );
  return Array.isArray(res) ? res[0] || null : null;
}

async function updateProfile(userId, updates, env) {
  await supabaseRequest(
    `/rest/v1/volttype_profiles?id=eq.${encodeURIComponent(userId)}`,
    env,
    {
      method: 'PATCH',
      body: updates,
      headers: {
        'Prefer': 'return=minimal',
      },
    }
  );
}

async function upsertSubscription(record, env) {
  await supabaseRequest(
    '/rest/v1/volttype_subscriptions?on_conflict=stripe_subscription_id',
    env,
    {
      method: 'POST',
      body: record,
      headers: {
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
    }
  );
}

async function supabaseRequest(path, env, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${errorText}`);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

async function verifyStripeWebhookSignature(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const pieces = signatureHeader.split(',');
  const timestamp = pieces.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = pieces
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = bufferToHex(digest);

  return signatures.some((value) => timingSafeEqual(value, expected));
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
