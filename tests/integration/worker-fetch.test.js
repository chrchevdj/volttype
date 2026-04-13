import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleState = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  checkUsageLimit: vi.fn(),
  logUsage: vi.fn(),
  proxyTranscribe: vi.fn(),
  proxyClean: vi.fn(),
  proxyCommand: vi.fn(),
}));

vi.mock('../../backend/cloudflare-worker/src/auth.js', () => ({
  verifyToken: moduleState.verifyToken,
}));

vi.mock('../../backend/cloudflare-worker/src/usage.js', () => ({
  checkUsageLimit: moduleState.checkUsageLimit,
  logUsage: moduleState.logUsage,
}));

vi.mock('../../backend/cloudflare-worker/src/groq-proxy.js', () => ({
  proxyTranscribe: moduleState.proxyTranscribe,
  proxyClean: moduleState.proxyClean,
  proxyCommand: moduleState.proxyCommand,
}));

describe('worker fetch integration', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(moduleState).forEach((mock) => mock.mockReset());
  });

  it('serves health and rejects unauthenticated protected routes', async () => {
    const worker = (await import('../../backend/cloudflare-worker/src/index.js')).default;
    moduleState.verifyToken.mockResolvedValueOnce(null);

    const health = await worker.fetch(new Request('https://api.example/v1/health'), {});
    expect(health.status).toBe(200);

    const unauthorized = await worker.fetch(new Request('https://api.example/v1/usage'), {});
    expect(unauthorized.status).toBe(401);
  });

  it('processes successful transcription, cleaning, command, and usage flows', async () => {
    const worker = (await import('../../backend/cloudflare-worker/src/index.js')).default;
    moduleState.verifyToken.mockResolvedValue({ userId: 'user-1', email: 'test@example.com' });
    moduleState.checkUsageLimit
      .mockResolvedValueOnce({
        allowed: true,
        remainingSeconds: 120,
        usedSeconds: 60,
        limitSeconds: 180,
        plan: 'basic',
      })
      .mockResolvedValueOnce({
        plan: 'basic',
        usedSeconds: 30,
        limitSeconds: 1800,
        remainingSeconds: 1770,
      });
    moduleState.proxyTranscribe.mockResolvedValueOnce({ text: 'Hello world', duration: 12 });
    moduleState.proxyClean.mockResolvedValueOnce({ cleaned: 'Hello.', status: 200 });
    moduleState.proxyCommand.mockResolvedValueOnce({ text: 'Bonjour', command: 'translate', status: 200 });

    const transcribe = await worker.fetch(new Request('https://api.example/v1/transcribe', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'multipart/form-data; boundary=test',
        'Content-Length': '1024',
      },
      body: 'body',
      duplex: 'half',
    }), {});
    await expect(transcribe.json()).resolves.toMatchObject({
      text: 'Hello world',
      usage: { remaining: 108 },
    });

    const clean = await worker.fetch(new Request('https://api.example/v1/clean', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'hello' }),
    }), {});
    await expect(clean.json()).resolves.toEqual({ text: 'Hello.' });

    const command = await worker.fetch(new Request('https://api.example/v1/command', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'hello', command: 'translate', extra: 'French' }),
    }), {});
    await expect(command.json()).resolves.toEqual({ text: 'Bonjour', command: 'translate' });

    const usage = await worker.fetch(new Request('https://api.example/v1/usage', {
      headers: { Authorization: 'Bearer token' },
    }), {});
    await expect(usage.json()).resolves.toEqual({
      plan: 'basic',
      usedSeconds: 30,
      limitSeconds: 1800,
      remainingSeconds: 1770,
    });
  });

  it('returns limits, checkout validation errors, and admin authorization responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const worker = (await import('../../backend/cloudflare-worker/src/index.js')).default;

    moduleState.verifyToken.mockResolvedValue({ userId: 'user-1', email: 'user@example.com' });
    moduleState.checkUsageLimit.mockResolvedValueOnce({
      allowed: false,
      plan: 'free',
      usedSeconds: 600,
      limitSeconds: 600,
      remainingSeconds: 0,
    });

    const limited = await worker.fetch(new Request('https://api.example/v1/transcribe', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'multipart/form-data; boundary=test',
      },
      body: 'body',
      duplex: 'half',
    }), {});
    expect(limited.status).toBe(429);

    const badPlan = await worker.fetch(new Request('https://api.example/v1/checkout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: 'enterprise' }),
    }), {});
    expect(badPlan.status).toBe(400);

    const forbiddenStats = await worker.fetch(new Request('https://api.example/v1/admin/stats', {
      headers: { Authorization: 'Bearer token' },
    }), { ADMIN_EMAIL: 'admin@example.com' });
    expect(forbiddenStats.status).toBe(403);

    moduleState.verifyToken.mockResolvedValueOnce({ userId: 'admin-1', email: 'admin@example.com' });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'admin-1', email: 'admin@example.com', plan: 'pro', created_at: '2026-04-01T00:00:00.000Z' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'sub_1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ user_id: 'admin-1', audio_seconds: 90 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ assets: [{ download_count: 10 }] }]), { status: 200 }));

    const stats = await worker.fetch(new Request('https://api.example/v1/admin/stats', {
      headers: { Authorization: 'Bearer token' },
    }), {
      ADMIN_EMAIL: 'admin@example.com',
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
    });

    expect(stats.status).toBe(200);
    await expect(stats.json()).resolves.toMatchObject({
      totalUsers: 1,
      activeSubscriptions: 1,
      downloads: 10,
    });
  });
});
