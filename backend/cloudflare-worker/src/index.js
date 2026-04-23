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
import { verifyToken, hasProduct, addUserProduct } from './auth.js';
import { checkUsageLimit, logUsage, countWords } from './usage.js';
import { proxyTranscribe, proxyClean, proxyCommand } from './groq-proxy.js';

// Routes that require an authenticated user but do NOT require the user
// to already be tagged as a VoltType user. Everything else needs the tag.
const PRODUCT_TAG_OPT_OUT = new Set(['/v1/auth/join-product']);

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

    // Product isolation: block users who aren't tagged for VoltType,
    // except for the opt-in endpoint itself.
    if (!PRODUCT_TAG_OPT_OUT.has(path) && !hasProduct(user, 'volttype')) {
      return json({
        error: 'not_a_volttype_user',
        message: 'This account is not enrolled for VoltType. Call /v1/auth/join-product to opt in.',
      }, 403, request);
    }

    // --- POST /v1/auth/join-product ---
    // Adds 'volttype' to the user's app_metadata.products list. Used when a
    // user authenticated for another product (LifiRent, JOBALARM, etc.) wants
    // to start using VoltType without re-signing up.
    if (path === '/v1/auth/join-product' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { /* ignore */ }
      const product = body.product || 'volttype';
      if (product !== 'volttype') {
        return json({ error: 'Only volttype is supported from this API' }, 400, request);
      }
      try {
        const products = await addUserProduct(user.userId, product, env);
        return json({ ok: true, products }, 200, request);
      } catch (err) {
        return json({ error: err.message }, 500, request);
      }
    }

    // --- Request size limit (10MB max for audio) ---
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) {
      return json({ error: 'Request too large. Maximum 10MB.' }, 413, request);
    }

    // --- POST /v1/transcribe ---
    if (path === '/v1/transcribe' && request.method === 'POST') {
      // Check usage limit (daily minutes + weekly words for free tier)
      const usage = await checkUsageLimit(user.userId, env);
      if (!usage.allowed) {
        const isWeekly = usage.reason === 'weekly_words';
        return json({
          error: isWeekly
            ? 'Weekly word limit reached'
            : 'Daily limit reached',
          plan: usage.plan,
          reason: usage.reason,
          usedSeconds: usage.usedSeconds,
          limitSeconds: usage.limitSeconds,
          usedWords: usage.usedWords,
          limitWords: usage.limitWords,
          upgrade: 'Upgrade your plan for unlimited dictation at volttype.com',
        }, 429, request);
      }

      // Proxy to Groq
      const result = await proxyTranscribe(request, env);
      if (result.error) {
        return json({ error: result.error }, result.status, request);
      }

      // Log usage (seconds + words)
      const words = countWords(result.text);
      await logUsage(user.userId, result.duration || 0, 'whisper-large-v3-turbo', 'transcribe', env, words);

      return json({
        text: result.text,
        duration: result.duration,
        usage: {
          thisRequest: result.duration,
          words,
          remaining: usage.remainingSeconds === -1 ? -1 : usage.remainingSeconds - (result.duration || 0),
          remainingWords: usage.remainingWords === -1 ? -1 : Math.max(0, usage.remainingWords - words),
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
        usedWords: usage.usedWords,
        limitWords: usage.limitWords,
        remainingWords: usage.remainingWords,
      }, 200, request);
    }

    // --- POST /v1/checkout ---
    if (path === '/v1/checkout' && request.method === 'POST') {
      try {
        const { plan, interval = 'month' } = await request.json();
        if (!['basic', 'pro'].includes(plan)) {
          return json({ error: 'Invalid plan selected' }, 400, request);
        }
        if (!['month', 'year'].includes(interval)) {
          return json({ error: 'Invalid billing interval' }, 400, request);
        }

        // Select the correct price ID based on plan + interval
        let priceId;
        if (plan === 'pro') {
          priceId = interval === 'year' ? env.STRIPE_PRICE_PRO_ANNUAL : env.STRIPE_PRICE_PRO;
        } else {
          priceId = interval === 'year' ? env.STRIPE_PRICE_BASIC_ANNUAL : env.STRIPE_PRICE_BASIC;
        }

        if (!priceId || !env.STRIPE_SECRET_KEY) {
          return json({ error: 'Payment not configured for this plan/interval' }, 500, request);
        }

        const existingProfile = await getProfileByUserId(user.userId, env);
        const checkoutParams = new URLSearchParams({
          'mode': 'subscription',
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          'success_url': `https://volttype.com/?payment=success&plan=${plan}&interval=${interval}`,
          'cancel_url': `https://volttype.com/?payment=cancelled&plan=${plan}&interval=${interval}`,
          'client_reference_id': user.userId,
          'metadata[user_id]': user.userId,
          'metadata[plan]': plan,
          'metadata[interval]': interval,
          'subscription_data[metadata][user_id]': user.userId,
          'subscription_data[metadata][plan]': plan,
          'subscription_data[metadata][interval]': interval,
          'allow_promotion_codes': 'true',
          'billing_address_collection': 'auto',
          'payment_method_collection': 'if_required',
        });

        if (existingProfile?.stripe_customer_id) {
          checkoutParams.set('customer', existingProfile.stripe_customer_id);
          checkoutParams.set('customer_update[address]', 'auto');
          checkoutParams.set('customer_update[name]', 'auto');
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
      const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
      if (!adminEmail) {
        return json({ error: 'Admin email not configured' }, 500, request);
      }

      if ((user.email || '').toLowerCase() !== adminEmail) {
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
        const [_usersRes, profilesRes, subsRes, usageRes] = await Promise.all([
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

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
      ...SECURITY_HEADERS,
    },
  });
}

export async function handleStripeWebhook(request, env) {
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
    const firstProcessing = await recordWebhookEvent(event, env);
    if (!firstProcessing) {
      return json({ received: true, duplicate: true }, 200, request);
    }

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

        // Send welcome email via Resend
        const customerEmail = session?.customer_details?.email || session?.customer_email;
        const purchasedPlan = session?.metadata?.plan || 'basic';
        if (customerEmail && env.RESEND_API_KEY) {
          await sendWelcomeEmail(customerEmail, purchasedPlan, env).catch((err) => {
            console.error('[RESEND] Welcome email failed:', err.message);
          });
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

export async function syncStripeSubscription(subscription, env) {
  if (!subscription?.id) return;

  const customerId = getStripeId(subscription.customer);
  let userId = subscription.metadata?.user_id || null;
  let existingProfile = null;

  if (!userId && customerId) {
    existingProfile = await getProfileByCustomerId(customerId, env);
    userId = existingProfile?.id || null;
  }

  if (!userId) {
    console.warn('[STRIPE] Missing user mapping for subscription', subscription.id);
    return;
  }

  if (!existingProfile) {
    existingProfile = await getProfileByUserId(userId, env);
  }

  const plan = getPlanFromSubscription(subscription, env);
  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const isActiveSubscription = activeStatuses.has(subscription.status);
  const fallbackPlan = existingProfile?.plan && existingProfile.plan !== 'free'
    ? existingProfile.plan
    : null;
  const effectivePlan = isActiveSubscription
    ? plan || fallbackPlan || null
    : 'free';

  if (isActiveSubscription && !plan) {
    console.error('[STRIPE] Active subscription has unmapped plan/price', {
      subscriptionId: subscription.id,
      priceId: subscription?.items?.data?.[0]?.price?.id || null,
      userId,
    });
  }

  await upsertSubscription(
    {
      stripe_subscription_id: subscription.id,
      user_id: userId,
      plan: plan || fallbackPlan || 'free',
      status: subscription.status || 'inactive',
      current_period_start: unixToIso(subscription.current_period_start),
      current_period_end: unixToIso(subscription.current_period_end),
    },
    env
  );

  await updateProfile(
    userId,
    {
      ...(effectivePlan ? { plan: effectivePlan } : {}),
      stripe_customer_id: customerId,
    },
    env
  );
}

export async function fetchStripeSubscription(subscriptionId, env) {
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

export function getPlanFromSubscription(subscription, env) {
  const metadataPlan = subscription?.metadata?.plan;
  if (metadataPlan === 'basic' || metadataPlan === 'pro') {
    return metadataPlan;
  }

  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  if (priceId === env.STRIPE_PRICE_PRO || priceId === env.STRIPE_PRICE_PRO_ANNUAL) return 'pro';
  if (priceId === env.STRIPE_PRICE_BASIC || priceId === env.STRIPE_PRICE_BASIC_ANNUAL) return 'basic';
  return null;
}

export function getStripeId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

export function unixToIso(value) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

export async function getProfileByUserId(userId, env) {
  const res = await supabaseRequest(
    `/rest/v1/volttype_profiles?select=id,email,plan,stripe_customer_id&id=eq.${encodeURIComponent(userId)}`,
    env
  );
  return Array.isArray(res) ? res[0] || null : null;
}

export async function getProfileByCustomerId(customerId, env) {
  const res = await supabaseRequest(
    `/rest/v1/volttype_profiles?select=id,email,plan,stripe_customer_id&stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
    env
  );
  return Array.isArray(res) ? res[0] || null : null;
}

export async function recordWebhookEvent(event, env) {
  if (!event?.id) {
    throw new Error('Stripe event missing id');
  }

  const result = await supabaseRequest(
    '/rest/v1/volttype_webhook_events?on_conflict=event_id',
    env,
    {
      method: 'POST',
      body: {
        event_id: event.id,
        event_type: event.type || 'unknown',
      },
      headers: {
        'Prefer': 'resolution=ignore-duplicates,return=representation',
      },
    }
  );

  return Array.isArray(result) && result.length > 0;
}

export async function updateProfile(userId, updates, env) {
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

export async function upsertSubscription(record, env) {
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

export async function supabaseRequest(path, env, options = {}) {
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

// ─── Resend welcome email ────────────────────────────────────────────────────

const PLAN_FEATURES = {
  basic: {
    label: 'Basic',
    price: '$4.99/mo',
    features: [
      '60 minutes of voice dictation per day',
      'AI text cleanup (punctuation, formatting)',
      '15 AI voice commands (formal, translate, summarize, etc.)',
      'Works in any Windows app',
      'Cloud STT via Groq Whisper',
    ],
  },
  pro: {
    label: 'Pro',
    price: '$8.99/mo',
    features: [
      'Unlimited voice dictation',
      'AI text cleanup + advanced rewrite',
      '15 AI voice commands',
      'Local offline STT engine (no internet needed)',
      'AI Notes Workspace with 5 output modes',
      'Priority support',
    ],
  },
};

export async function sendWelcomeEmail(toEmail, plan, env) {
  const info = PLAN_FEATURES[plan] || PLAN_FEATURES.basic;
  const featureList = info.features.map((f) => `<li style="margin-bottom:6px;">${f}</li>`).join('');
  const downloadUrl = 'https://volttype.com/download';
  const supportEmail = 'support@volttype.com';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to VoltType ${info.label}</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#1a1a1a;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#fff;letter-spacing:-0.5px;">VoltType</p>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">Voice typing + AI rewrite for Windows</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#fff;">Welcome to VoltType ${info.label}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Your ${info.label} plan (${info.price}) is now active. Here is everything you need to get started.
              </p>

              <!-- Download CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#7c3aed;border-radius:8px;padding:14px 28px;">
                    <a href="${downloadUrl}" style="color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
                      Download VoltType for Windows →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Plan features -->
              <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#e4e4e7;">What is included in ${info.label}</h2>
              <ul style="margin:0 0 32px;padding-left:20px;color:#a1a1aa;font-size:14px;line-height:1.7;">
                ${featureList}
              </ul>

              <!-- Quick start -->
              <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#e4e4e7;">Quick start (3 steps)</h2>
              <ol style="margin:0 0 32px;padding-left:20px;color:#a1a1aa;font-size:14px;line-height:1.8;">
                <li>Download and install VoltType from the link above</li>
                <li>Sign in with the email you used to purchase</li>
                <li>Hold <strong style="color:#e4e4e7;">Ctrl + Space</strong> anywhere in Windows and start speaking</li>
              </ol>

              <!-- Support -->
              <p style="margin:0;font-size:14px;color:#71717a;">
                Questions? Reply to this email or contact us at
                <a href="mailto:${supportEmail}" style="color:#7c3aed;text-decoration:none;">${supportEmail}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2a2a2a;text-align:center;">
              <p style="margin:0;font-size:12px;color:#52525b;">
                VoltType · <a href="https://volttype.com" style="color:#7c3aed;text-decoration:none;">volttype.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'VoltType <noreply@volttype.com>',
      to: [toEmail],
      subject: `Welcome to VoltType ${info.label} — download + activation`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const result = await res.json();
  console.log('[RESEND] Welcome email sent to', toEmail, 'id:', result.id);
  return result;
}

export async function verifyStripeWebhookSignature(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const pieces = signatureHeader.split(',');
  const timestamp = pieces.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = pieces
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  const currentTimestampSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(currentTimestampSeconds - timestampSeconds) > 300) {
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

export function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
