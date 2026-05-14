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

  it('activates an existing profile by Stripe customer email when checkout has no user id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValueOnce(createJsonResponse([{
        id: 'user-by-email',
        email: 'buyer@example.com',
        plan: 'free',
        stripe_customer_id: null,
      }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { syncStripeSubscription } = await import('../../backend/cloudflare-worker/src/index.js');
    await syncStripeSubscription({
      id: 'sub_email',
      customer: 'cus_email',
      status: 'active',
      metadata: { plan: 'pro' },
      items: { data: [{ price: { id: 'price_pro' } }] },
      current_period_start: 1710000000,
      current_period_end: 1712688400,
    }, {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
      STRIPE_PRICE_PRO: 'price_pro',
    }, { customerEmail: 'Buyer@Example.com ' });

    expect(fetchMock.mock.calls[1][0]).toContain('email=eq.buyer%40example.com');
    expect(fetchMock.mock.calls[2][0]).toContain('/rest/v1/volttype_subscriptions');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      stripe_subscription_id: 'sub_email',
      user_id: 'user-by-email',
      plan: 'pro',
      status: 'active',
    });
    expect(fetchMock.mock.calls[3][0]).toContain('volttype_profiles?id=eq.user-by-email');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({
      plan: 'pro',
      stripe_customer_id: 'cus_email',
    });
    fetchMock.mockRestore();
  });

  it('parks a pending activation when a website buyer has not signed up yet', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { syncStripeSubscription } = await import('../../backend/cloudflare-worker/src/index.js');
    await syncStripeSubscription({
      id: 'sub_pending',
      customer: 'cus_pending',
      status: 'trialing',
      metadata: { plan: 'pro' },
      items: { data: [{ price: { id: 'price_pro' } }] },
      current_period_start: 1710000000,
      current_period_end: 1712688400,
    }, {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
      STRIPE_PRICE_PRO: 'price_pro',
    }, { customerEmail: 'Future@Example.com' });

    expect(fetchMock.mock.calls[2][0]).toContain('/rest/v1/volttype_pending_activations');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      email: 'future@example.com',
      plan: 'pro',
      stripe_customer_id: 'cus_pending',
      stripe_subscription_id: 'sub_pending',
      status: 'trialing',
    });
    fetchMock.mockRestore();
  });

  it('claims a pending activation after signup with the same email', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([{
        email: 'future@example.com',
        plan: 'pro',
        stripe_customer_id: 'cus_pending',
        stripe_subscription_id: 'sub_pending',
        status: 'active',
        current_period_start: '2026-05-15T00:00:00.000Z',
        current_period_end: '2026-06-15T00:00:00.000Z',
      }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { claimPendingActivation } = await import('../../backend/cloudflare-worker/src/index.js');
    await expect(claimPendingActivation({
      userId: 'new-user',
      email: 'Future@Example.com',
    }, {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
    })).resolves.toEqual({ claimed: true, plan: 'pro' });

    expect(fetchMock.mock.calls[1][0]).toContain('/rest/v1/volttype_profiles');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      id: 'new-user',
      email: 'future@example.com',
      plan: 'pro',
      stripe_customer_id: 'cus_pending',
    });
    expect(fetchMock.mock.calls[2][0]).toContain('/rest/v1/volttype_subscriptions');
    expect(fetchMock.mock.calls[3][0]).toContain('/rest/v1/volttype_pending_activations?email=eq.future%40example.com');
    fetchMock.mockRestore();
  });

  it('claims directly from Stripe by email if the pending activation table is unavailable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: vi.fn(async () => '{"code":"PGRST205","message":"volttype_pending_activations missing from schema cache"}'),
      })
      .mockResolvedValueOnce(createJsonResponse({ data: [{ id: 'cus_live_email' }] }))
      .mockResolvedValueOnce(createJsonResponse({
        data: [{
          id: 'sub_live_email',
          customer: 'cus_live_email',
          status: 'active',
          metadata: { plan: 'pro' },
          items: { data: [{ price: { id: 'price_pro' } }] },
          current_period_start: 1710000000,
          current_period_end: 1712688400,
        }],
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { claimPendingActivation } = await import('../../backend/cloudflare-worker/src/index.js');
    await expect(claimPendingActivation({
      userId: 'new-user',
      email: 'Buyer@Example.com',
    }, {
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_KEY: 'service-key',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_PRICE_PRO: 'price_pro',
    })).resolves.toEqual({ claimed: true, plan: 'pro', source: 'stripe' });

    expect(fetchMock.mock.calls[1][0]).toContain('/v1/customers?email=buyer%40example.com');
    expect(fetchMock.mock.calls[2][0]).toContain('/v1/subscriptions?customer=cus_live_email');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({
      id: 'new-user',
      email: 'buyer@example.com',
      plan: 'pro',
      stripe_customer_id: 'cus_live_email',
    });
    fetchMock.mockRestore();
  });
});
