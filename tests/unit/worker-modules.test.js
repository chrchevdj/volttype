import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../support/helpers.js';

describe('Cloudflare worker support modules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates auth tokens through Supabase', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(createJsonResponse({
      id: 'user-1',
      email: 'test@example.com',
      role: 'authenticated',
    }));

    const { verifyToken } = await import('../../backend/cloudflare-worker/src/auth.js');
    const request = new Request('https://volttype.com/v1/usage', {
      headers: { Authorization: 'Bearer token-123' },
    });

    await expect(verifyToken(request, {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
    })).resolves.toEqual({
      userId: 'user-1',
      email: 'test@example.com',
      role: 'authenticated',
    });
  });

  it('enforces CORS rules for allowed and blocked origins', async () => {
    const { corsHeaders, handleOptions } = await import('../../backend/cloudflare-worker/src/cors.js');
    const allowedRequest = new Request('https://api.example/v1/health', {
      headers: { Origin: 'http://localhost:3000' },
    });
    const blockedRequest = new Request('https://api.example/v1/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });

    expect(corsHeaders(allowedRequest)['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    expect((await handleOptions(blockedRequest)).status).toBe(403);
  });

  it('checks usage limits and logs usage via Supabase RPC', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse('basic'))
      .mockResolvedValueOnce(createJsonResponse(1750))
      .mockResolvedValueOnce(createJsonResponse(0))            // weekly words
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));

    const { checkUsageLimit, logUsage } = await import('../../backend/cloudflare-worker/src/usage.js');
    const env = {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
    };

    const usage = await checkUsageLimit('user-1', env);
    expect(usage).toMatchObject({
      allowed: true,
      plan: 'basic',
      usedSeconds: 1750,
      remainingSeconds: 50,
    });

    await logUsage('user-1', 42, 'whisper', 'transcribe', env, 12);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('enforces weekly word quota for free tier', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse('free'))       // plan
      .mockResolvedValueOnce(createJsonResponse(0))            // daily seconds
      .mockResolvedValueOnce(createJsonResponse(2050));        // weekly words (exceeds 2000 limit)

    const { checkUsageLimit } = await import('../../backend/cloudflare-worker/src/usage.js');
    const env = { SUPABASE_URL: 'https://supabase.example', SUPABASE_SERVICE_KEY: 'service-key' };

    const usage = await checkUsageLimit('user-1', env);
    expect(usage).toMatchObject({
      allowed: false,
      plan: 'free',
      usedWords: 2050,
      limitWords: 2000,
      reason: 'weekly_words',
    });
  });

  it('proxies Groq transcription, cleaning, and command requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ text: 'Hello', duration: 4 }))
      .mockResolvedValueOnce(createJsonResponse({ choices: [{ message: { content: 'Hello.' } }] }))
      .mockResolvedValueOnce(createJsonResponse({ choices: [{ message: { content: 'Bonjour' } }] }));

    const { proxyTranscribe, proxyClean, proxyCommand, getCleanerPrompt } = await import('../../backend/cloudflare-worker/src/groq-proxy.js');
    const env = { GROQ_API_KEY: 'gsk_test' };

    const fd = new FormData();
    fd.append('file', new Blob(['fake-audio'], { type: 'audio/m4a' }), 'recording.m4a');
    fd.append('language', 'en');
    const transcribe = await proxyTranscribe(new Request('https://api.example/v1/transcribe', {
      method: 'POST',
      body: fd,
    }), env);
    const clean = await proxyClean(new Request('https://api.example/v1/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello world', outputStyle: 'punctuated' }),
    }), env);
    const command = await proxyCommand(new Request('https://api.example/v1/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', command: 'translate', extra: 'French' }),
    }), env);

    expect(transcribe).toMatchObject({ text: 'Hello', duration: 4, status: 200 });
    expect(clean).toMatchObject({ cleaned: 'Hello.', status: 200 });
    expect(command).toMatchObject({ text: 'Bonjour', command: 'translate', status: 200 });
    expect(getCleanerPrompt('punctuated', 'Preserve Acme')).toContain('Preserve Acme');
  });
});
