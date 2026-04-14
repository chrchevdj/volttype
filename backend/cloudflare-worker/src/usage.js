/**
 * Usage tracking and limit checking via Supabase RPC functions.
 *
 * Plans:
 *   free:  2,000 words/week (Wispr-style soft quota)
 *   basic: 30 minutes/day (1800s)
 *   pro:   unlimited
 */

const DAILY_LIMITS = {
  free: Infinity, // free is gated by weekly word quota, not daily seconds
  basic: 30 * 60,
  pro: Infinity,
};

const WEEKLY_WORD_LIMITS = {
  free: 2000,
  basic: Infinity,
  pro: Infinity,
};

export async function checkUsageLimit(userId, env) {
  // Get plan + daily seconds + weekly words in parallel
  const [plan, usedSeconds, usedWords] = await Promise.all([
    rpc(env, 'volttype_get_plan', { p_user_id: userId }),
    rpc(env, 'volttype_get_daily_usage', { p_user_id: userId }),
    rpc(env, 'volttype_get_weekly_words', { p_user_id: userId }).catch(() => 0),
  ]);

  const userPlan = plan || 'free';
  const used = Math.round(usedSeconds || 0);
  const words = Math.round(usedWords || 0);
  const dailyLimit = DAILY_LIMITS[userPlan] ?? DAILY_LIMITS.free;
  const weeklyWordLimit = WEEKLY_WORD_LIMITS[userPlan] ?? WEEKLY_WORD_LIMITS.free;

  const dailyAllowed = dailyLimit === Infinity || used < dailyLimit;
  const weeklyAllowed = weeklyWordLimit === Infinity || words < weeklyWordLimit;

  return {
    allowed: dailyAllowed && weeklyAllowed,
    plan: userPlan,
    usedSeconds: used,
    limitSeconds: dailyLimit === Infinity ? -1 : dailyLimit,
    remainingSeconds: dailyLimit === Infinity ? -1 : Math.max(0, dailyLimit - used),
    usedWords: words,
    limitWords: weeklyWordLimit === Infinity ? -1 : weeklyWordLimit,
    remainingWords: weeklyWordLimit === Infinity ? -1 : Math.max(0, weeklyWordLimit - words),
    reason: !weeklyAllowed ? 'weekly_words' : (!dailyAllowed ? 'daily_minutes' : null),
  };
}

export async function logUsage(userId, audioSeconds, modelUsed, requestType, env, wordCount = 0) {
  await rpc(env, 'volttype_log_usage', {
    p_user_id: userId,
    p_audio_seconds: audioSeconds,
    p_model: modelUsed,
    p_request_type: requestType,
    p_words: wordCount,
  });
}

export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
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
