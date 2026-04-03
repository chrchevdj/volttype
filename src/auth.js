/**
 * VoltType Auth — Supabase authentication for the desktop app.
 *
 * Handles login, signup, token storage, and auto-refresh.
 * Uses Supabase Auth REST API directly (no SDK dependency).
 */
const { net } = require('electron');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SUPABASE_URL = 'https://ceuymixybyaxpldgggin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNldXltaXh5YnlheHBsZGdnZ2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgwNzYsImV4cCI6MjA4NzM2NDA3Nn0.OprbSZuB-wo2Q_aWnkhC0I7e7iPePT9lD8LT2BrlEWE';

class Auth {
  constructor() {
    this._tokenPath = path.join(app.getPath('userData'), 'auth.json');
    this._session = null;
    this._refreshTimer = null;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._tokenPath)) {
        this._session = JSON.parse(fs.readFileSync(this._tokenPath, 'utf-8'));
        // Check if token is expired
        if (this._session && this._session.expires_at) {
          if (Date.now() / 1000 > this._session.expires_at) {
            // Token expired — try refresh
            this._autoRefresh();
          } else {
            this._scheduleRefresh();
          }
        }
      }
    } catch (e) {
      console.error('[AUTH] Failed to load session:', e.message);
      this._session = null;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._tokenPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._tokenPath, JSON.stringify(this._session, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AUTH] Failed to save session:', e.message);
    }
  }

  _scheduleRefresh() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    if (!this._session || !this._session.expires_at) return;

    const expiresIn = (this._session.expires_at - Date.now() / 1000 - 60) * 1000; // Refresh 60s before expiry
    if (expiresIn > 0) {
      this._refreshTimer = setTimeout(() => this._autoRefresh(), expiresIn);
      console.log(`[AUTH] Token refresh scheduled in ${Math.round(expiresIn / 1000)}s`);
    }
  }

  async _autoRefresh() {
    if (!this._session || !this._session.refresh_token) return;
    try {
      await this.refresh();
      console.log('[AUTH] Token auto-refreshed');
    } catch (e) {
      console.error('[AUTH] Auto-refresh failed:', e.message);
      this._session = null;
      this._save();
    }
  }

  /**
   * Sign up with email and password.
   */
  async signup(email, password) {
    const res = await net.fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.error?.message || 'Signup failed');
    }

    if (data.access_token) {
      this._session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at || (Date.now() / 1000 + 3600),
        user: data.user,
      };
      this._save();
      this._scheduleRefresh();

      // Upsert profile row so the user exists in profiles table
      if (data.user?.id) {
        try {
          await net.fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${data.access_token}`,
              'Prefer': 'resolution=ignore-duplicates',
            },
            body: JSON.stringify({
              id: data.user.id,
              email: data.user.email,
              plan: 'free',
              created_at: new Date().toISOString(),
            }),
          });
          console.log('[AUTH] Profile upserted for', data.user.email);
        } catch (e) {
          console.warn('[AUTH] Profile upsert failed (non-critical):', e.message);
        }
      }
    }

    return data;
  }

  /**
   * Sign in with email and password.
   */
  async login(email, password) {
    const res = await net.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.error?.message || 'Login failed');
    }

    this._session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Date.now() / 1000 + data.expires_in),
      user: data.user,
    };
    this._save();
    this._scheduleRefresh();

    console.log('[AUTH] Logged in as', data.user?.email);
    return data;
  }

  /**
   * Refresh the access token.
   */
  async refresh() {
    if (!this._session?.refresh_token) throw new Error('No refresh token');

    const res = await net.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: this._session.refresh_token }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || 'Refresh failed');
    }

    this._session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Date.now() / 1000 + data.expires_in),
      user: data.user,
    };
    this._save();
    this._scheduleRefresh();
    return data;
  }

  /**
   * Log out — clear stored session.
   */
  logout() {
    this._session = null;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    try { fs.unlinkSync(this._tokenPath); } catch {}
    console.log('[AUTH] Logged out');
  }

  /**
   * Get the current access token (for API calls).
   */
  getToken() {
    return this._session?.access_token || null;
  }

  /**
   * Get current user info.
   */
  getUser() {
    if (!this._session?.user) return null;
    return {
      id: this._session.user.id,
      email: this._session.user.email,
    };
  }

  /**
   * Check if user is logged in.
   */
  isLoggedIn() {
    return !!this._session?.access_token;
  }
}

module.exports = Auth;
