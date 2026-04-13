import { describe, expect, it, vi } from 'vitest';
import { createJsonResponse } from '../support/helpers.js';

describe('Cloudflare worker helper functions', () => {
  it('maps subscription metadata and price ids to plans', async () => {
    const { getPlanFromSubscription, getStripeId, unixToIso, timingSafeEqual, bufferToHex } =
      await import('../../backend/cloudflare-worker/src/index.js');

    expect(getPlanFromSubscription({ metadata: { plan: 'pro' } }, {})).toBe('pro');
    expect(getPlanFromSubscription({
      items: { data: [{ price: { id: 'price_basic' } }] },
    }, { STRIPE_PRICE_BASIC: 'price_basic' })).toBe('basic');
    expect(getStripeId({ id: 'cus_123' })).toBe('cus_123');
    expect(unixToIso(1710000000)).toBe('2024-03-09T16:00:00.000Z');
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(bufferToHex(Uint8Array.from([10, 11]).buffer)).toBe('0a0b');
  });

  it('handles Supabase requests and Stripe webhook signatures', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([{ id: 'user-1' }]))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn(async () => 'boom'),
      });

    const { supabaseRequest, verifyStripeWebhookSignature, bufferToHex } =
      await import('../../backend/cloudflare-worker/src/index.js');

    await expect(supabaseRequest('/rest/v1/profiles', {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
    })).resolves.toEqual([{ id: 'user-1' }]);

    await expect(supabaseRequest('/rest/v1/profiles', {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
    })).rejects.toThrow('Supabase request failed (500): boom');

    const payload = JSON.stringify({ id: 'evt_1' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('whsec_test'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const signature = bufferToHex(digest);

    await expect(verifyStripeWebhookSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      'whsec_test'
    )).resolves.toBe(true);
  });
});
