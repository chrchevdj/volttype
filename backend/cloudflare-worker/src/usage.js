/**
 * Usage tracking and limit checking via Supabase RPC functions.
 *
 * Plans:
 *   free:  10 minutes/day (600s)
 *   basic: 30 minutes/day (1800s) — $5/mo
 *   pro:   unlimited — $9/mo
 */

const DAILY_LIMITS = {
  free: 10 * 60,
  basic: 30 * 60,
  pro: Infinity,
};

export async function checkUsageLimit(userId, env) {
  // Get plan and daily usage via Supabase RPC
  const [plan, usedSeconds] = await Promise.all([
    rpc(env, 'volttype_get_plan', { p_user_id: userId }),
    rpc(env, 'volttype_get_daily_usage', { p_user_id: userId }),
  ]);

  const userPlan = plan || 'free';
  const used = Math.round(usedSeconds || 0);
  const limit = DAILY_LIMITS[userPlan] || DAILY_LIMITS.free;

  return {
    allowed: limit === Infinity || used < limit,
    plan: userPlan,
    usedSeconds: used,
    limitSeconds: limit === Infinity ? -1 : limit,
    remainingSeconds: limit === Infinity ? -1 : Math.max(0, limit - used),
  };
}

export async function logUsage(userId, audioSeconds, modelUsed, requestType, env) {
  await rpc(env, 'volttype_log_usage', {
    p_user_id: userId,
    p_audio_seconds: audioSeconds,
    p_model: modelUsed,
    p_request_type: requestType,
  });
}

async function rpc(env, fnName, params) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    console.error(`RPC ${fnName} failed:`, await res.text());
    return null;
  }

  return await res.json();
}
