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
 * Returns { session: true } if auto-logged-in, or { session: false, needsConfirmation: true }
 * if Supabase email-confirmation is enabled.
 */
export async function signup(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.message || 'Signup failed';
    // Already-registered user — hint them to log in instead
    if (/already|registered|exists/i.test(msg)) {
      const err = new Error('An account with this email already exists. Please sign in instead.');
      err.code = 'USER_EXISTS';
      throw err;
    }
    throw new Error(msg);
  }
  // If email confirmation is disabled, we get a session immediately
  if (data.access_token) {
    await saveSession(data);
    return { session: true };
  }
  if (data.session?.access_token) {
    await saveSession(data.session);
    return { session: true };
  }
  // Email confirmation required — user must click link in email before login
  return { session: false, needsConfirmation: true };
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
