/**
 * VoltType — Supabase Auth Service
 *
 * Handles signup, login, logout, and token management with auto-refresh.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://ceuymixybyaxpldgggin.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNldXltaXh5YnlheHBsZGdnZ2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgwNzYsImV4cCI6MjA4NzM2NDA3Nn0.OprbSZuB-wo2Q_aWnkhC0I7e7iPePT9lD8LT2BrlEWE';

const TOKEN_KEY = 'volttype_token';
const REFRESH_KEY = 'volttype_refresh';
const EXPIRY_KEY = 'volttype_token_expiry';

/**
 * Save the full session (access_token, refresh_token, expiry).
 */
async function saveSession(data) {
  if (data.access_token) {
    await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
    // Supabase tokens expire in 3600s by default — refresh 5 min early
    const expiresAt = Date.now() + ((data.expires_in || 3600) - 300) * 1000;
    await AsyncStorage.setItem(EXPIRY_KEY, String(expiresAt));
  }
  if (data.refresh_token) {
    await AsyncStorage.setItem(REFRESH_KEY, data.refresh_token);
  }
}

/**
 * Sign up a new user.
 *
 * Tags the signup with `signup_product: 'volttype'` so the BEFORE INSERT
 * trigger on auth.users writes `app_metadata.products = ['volttype']`.
 * Without this tag the Cloudflare Worker rejects transcribe requests with
 * `not_a_volttype_user`.
 *
 * Returns:
 *   { session: true } if auto-logged-in,
 *   { session: false, needsConfirmation: true } if email confirmation is on,
 *   throws Error with code='USER_EXISTS' if email is already registered.
 */
export async function signup(email, password, fullName) {
  const body = {
    email,
    password,
    data: { signup_product: 'volttype' },
  };
  if (fullName && fullName.trim()) {
    body.data.full_name = fullName.trim();
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.message || 'Signup failed';
    if (/already|registered|exists/i.test(msg)) {
      const err = new Error('An account with this email already exists. Please sign in instead.');
      err.code = 'USER_EXISTS';
      throw err;
    }
    throw new Error(msg);
  }

  // Supabase returns 200 + user with empty identities array for existing
  // emails (email-enumeration guard). Treat this as USER_EXISTS.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    const err = new Error('An account with this email already exists. Please sign in instead.');
    err.code = 'USER_EXISTS';
    throw err;
  }

  // Auto-login if email confirmation is disabled
  if (data.access_token) {
    await saveSession(data);
    return { session: true };
  }
  if (data.session?.access_token) {
    await saveSession(data.session);
    return { session: true };
  }
  // Email confirmation required — user must click link in email
  return { session: false, needsConfirmation: true };
}

/**
 * Request a password reset email. Supabase always returns 200 to prevent
 * email enumeration, so we don't check result.
 */
export async function requestPasswordReset(email) {
  await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      redirect_to: 'https://volttype.com/reset-password.html',
    }),
  });
  return { ok: true };
}

/**
 * Add the 'volttype' product tag to the currently-authenticated user.
 * Used when a user signed up from another product (LifiRent, etc.) but now
 * wants to use VoltType. Called via the Cloudflare Worker which calls the
 * volttype_add_user_product Supabase RPC with service-role auth.
 */
export async function joinVoltType() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Not signed in');

  const res = await fetch('https://volttype-api.crcaway.workers.dev/v1/auth/join-product', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ product: 'volttype' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Could not add VoltType');
  }
  // The access_token we have still claims the OLD app_metadata (no volttype
  // tag). Force a token refresh so the new tag is in the JWT.
  await refreshSession();
  return data;
}

/**
 * Log in an existing user.
 */
export async function login(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.message || 'Login failed';
    if (/not confirmed|confirm/i.test(msg)) {
      throw new Error('Please confirm your email address first. Check your inbox for the confirmation link.');
    }
    if (/invalid/i.test(msg) || /credentials/i.test(msg)) {
      throw new Error('Invalid email or password. If you forgot your password, reset it at volttype.com.');
    }
    throw new Error(msg);
  }
  await saveSession(data);
  return data;
}

/**
 * Refresh the access token using the stored refresh_token.
 */
async function refreshSession() {
  const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      // Refresh token is also expired — user must re-login
      await logout();
      return null;
    }
    await saveSession(data);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Log out — clear stored tokens.
 */
export async function logout() {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, EXPIRY_KEY]);
}

/**
 * Get a valid access token, auto-refreshing if expired.
 * Returns null if no session exists (user must log in).
 */
export async function getToken() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  // Check if token is near expiry
  const expiryStr = await AsyncStorage.getItem(EXPIRY_KEY);
  const expiry = expiryStr ? Number(expiryStr) : 0;

  if (Date.now() >= expiry) {
    // Token expired or about to expire — refresh it
    const newToken = await refreshSession();
    return newToken;
  }

  return token;
}

/**
 * Check whether the user has a stored session.
 */
export async function isLoggedIn() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  // If token is expired, try to refresh
  const expiryStr = await AsyncStorage.getItem(EXPIRY_KEY);
  const expiry = expiryStr ? Number(expiryStr) : 0;

  if (Date.now() >= expiry) {
    const newToken = await refreshSession();
    return !!newToken;
  }

  return true;
}

/**
 * Decode a JWT payload (no signature verification — just reads the body).
 * Used to extract user email / id for UI display.
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Pad base64
    const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4);
    // atob is available in React Native / Hermes via global
    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Return the email of the currently signed-in user, or null if not signed in.
 * Reads the JWT payload (no network call).
 */
export async function getCurrentUserEmail() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  return payload?.email || null;
}

/**
 * Hard-validate the stored session by calling the API.
 *
 * This is the authoritative check run at app launch. It protects against:
 *  - Stale tokens restored from Android Auto Backup on another device
 *  - Tokens for users that have been deleted / banned server-side
 *  - Refresh tokens rotated on another device (all prior sessions invalidated)
 *
 * Behaviour:
 *  - No stored token         → returns false (go to Login)
 *  - Token valid             → returns true
 *  - Token expired, refresh  → retries once with the refreshed token
 *  - API 401                 → nukes local session, returns false
 *  - Network error           → returns true (don't log users out when offline;
 *                              the first real API call will redirect if needed)
 */
export async function validateSession() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  // If token is expired, refresh it first
  const expiryStr = await AsyncStorage.getItem(EXPIRY_KEY);
  const expiry = expiryStr ? Number(expiryStr) : 0;
  let currentToken = token;
  if (Date.now() >= expiry) {
    const refreshed = await refreshSession();
    if (!refreshed) return false;
    currentToken = refreshed;
  }

  // Call the API with the token to prove it's still valid server-side.
  try {
    const res = await fetch('https://volttype-api.crcaway.workers.dev/v1/usage', {
      method: 'GET',
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (res.status === 401) {
      // Server rejected the token — this is a backup-restore or revoked session.
      await logout();
      return false;
    }
    // Any other status (200, 403 not_a_volttype_user, 429 limit_reached, etc.)
    // means the token itself is valid — the user IS authenticated.
    return true;
  } catch {
    // Offline / network error — don't log the user out. The next live API call
    // will handle auth properly.
    return true;
  }
}
