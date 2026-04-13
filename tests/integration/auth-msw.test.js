import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import electronMock from '../mocks/electron.js';
import { createTempDir, removeDir } from '../support/helpers.js';

const SUPABASE_URL = 'https://ceuymixybyaxpldgggin.supabase.co';

const server = setupServer(
  http.post(`${SUPABASE_URL}/auth/v1/signup`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      access_token: 'signup-token',
      refresh_token: 'signup-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'user-1',
        email: body.email,
      },
    });
  }),
  http.post(`${SUPABASE_URL}/rest/v1/volttype_profiles`, () => new HttpResponse(null, { status: 201 })),
  http.post(`${SUPABASE_URL}/auth/v1/token`, async ({ request }) => {
    const url = new URL(request.url);
    const body = await request.json();

    if (url.searchParams.get('grant_type') === 'password') {
      return HttpResponse.json({
        access_token: 'login-token',
        refresh_token: 'login-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        user: {
          id: 'user-2',
          email: body.email,
        },
      });
    }

    if (url.searchParams.get('grant_type') === 'refresh_token') {
      return HttpResponse.json({
        access_token: 'refresh-token-new',
        refresh_token: 'refresh-token-next',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        user: {
          id: 'user-2',
          email: 'login@example.com',
        },
      });
    }

    return HttpResponse.json({ error: 'unexpected grant type' }, { status: 400 });
  })
);

describe('Auth integration with MSW', () => {
  let userDataDir;

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    delete global.__VOLTTEST_ELECTRON__;
    if (userDataDir) {
      removeDir(userDataDir);
      userDataDir = null;
    }
  });
  afterAll(() => server.close());

  beforeEach(() => {
    userDataDir = createTempDir('volttype-auth-');
    electronMock.__electronMockState.userData = userDataDir;
    electronMock.__electronMockState.fetchImpl = (...args) => fetch(...args);
    electronMock.__electronMockState.loginSettings = { openAtLogin: false };
    global.__VOLTTEST_ELECTRON__ = electronMock;
  });

  it('signs up and persists a session file', async () => {
    const Auth = (await import('../../src/auth.js')).default;
    const auth = new Auth();

    const response = await auth.signup('signup@example.com', 'super-secret');
    const saved = JSON.parse(fs.readFileSync(path.join(userDataDir, 'auth.json'), 'utf-8'));

    expect(response.user.email).toBe('signup@example.com');
    expect(auth.isLoggedIn()).toBe(true);
    expect(saved.access_token).toBe('signup-token');
    expect(auth.getUser()).toEqual({
      id: 'user-1',
      email: 'signup@example.com',
    });
  });

  it('logs in, refreshes, and logs out cleanly', async () => {
    const Auth = (await import('../../src/auth.js')).default;
    const auth = new Auth();

    await auth.login('login@example.com', 'password-123');
    expect(auth.getToken()).toBe('login-token');

    await auth.refresh();
    expect(auth.getToken()).toBe('refresh-token-new');

    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
    expect(fs.existsSync(path.join(userDataDir, 'auth.json'))).toBe(false);
  });
});
