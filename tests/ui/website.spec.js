const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__VT_TEST_MODE = true; });
});

test('renders the current sales page with download and pricing paths', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Type with your voice');
  await expect(page.locator('.eyebrow')).toContainText('v1.2.5');
  await expect(page.getByRole('link', { name: /Download for Windows/i })).toHaveAttribute('href', '#download');
  await expect(page.getByRole('link', { name: /Download free/i })).toHaveAttribute('href', '/download');
  await expect(page.getByRole('link', { name: /Start 14-day Pro trial/i })).toHaveAttribute('data-checkout-plan', 'pro');
  await expect(page.getByRole('link', { name: /Start Champion/i })).toHaveAttribute('data-checkout-plan', 'basic');
});

test('opens Stripe checkout from the Pro pricing CTA', async ({ page }) => {
  let checkoutBody = null;
  await page.route('https://volttype-api.crcaway.workers.dev/v1/checkout', async (route) => {
    checkoutBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_volttype' }),
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: /Start 14-day Pro trial/i }).click();

  await expect.poll(() => checkoutBody).toMatchObject({
    plan: 'pro',
    interval: 'month',
    source: 'volttype.com/pricing',
  });
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 });
});

test('shows visible checkout feedback when the payment endpoint fails', async ({ page }) => {
  await page.route('https://volttype-api.crcaway.workers.dev/v1/checkout', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'checkout temporarily unavailable' }),
    });
  });

  await page.goto('/');
  const proCta = page.locator('[data-checkout-plan="pro"]');
  await proCta.click();
  await expect(proCta).toHaveText('Checkout unavailable');
});

test('reset-password.html updates password when recovery token is present', async ({ page }) => {
  let putCalled = false;
  let putBody = null;
  let authHeader = null;

  await page.route('https://ceuymixybyaxpldgggin.supabase.co/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      putCalled = true;
      try { putBody = JSON.parse(route.request().postData() || '{}'); } catch { /* ignore parse error */ }
      authHeader = route.request().headers()['authorization'];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-1', email: 'reset@example.com' }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/reset-password.html#access_token=recovery-token&refresh_token=rt&type=recovery');
  await expect(page.locator('h1')).toHaveText('Set a new password');

  await page.locator('#new-password').fill('StrongPass123');
  await page.locator('#confirm-password').fill('Different123');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#error')).toContainText('do not match');

  await page.locator('#confirm-password').fill('StrongPass123');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#success')).toContainText('Password updated');
  expect(putCalled).toBe(true);
  expect(putBody).toEqual({ password: 'StrongPass123' });
  expect(authHeader).toBe('Bearer recovery-token');
});

test('reset-password.html rejects missing or invalid token', async ({ page }) => {
  await page.goto('/reset-password.html');
  await expect(page.locator('#error')).toContainText('invalid or has expired');
  await expect(page.locator('#reset-form')).toBeHidden();
});
