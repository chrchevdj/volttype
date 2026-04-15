const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/repos/chrchevdj/volttype-releases/releases/latest', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tag_name: 'v1.2.3',
        assets: [
          { name: 'VoltType-Setup.exe', browser_download_url: 'https://downloads.example/VoltType-Setup.exe' },
        ],
      }),
    });
  });
});

test('renders the landing page and updates download targets', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Speak once');
  await expect(page.locator('#download-version')).toHaveText('v1.2.3');
  await expect(page.locator('#download-btn')).toHaveAttribute('href', 'https://downloads.example/VoltType-Setup.exe');

  await page.locator('#dark-toggle').click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.locator('#lang-select').selectOption('de');
  await expect(page.getByRole('heading', { level: 2, name: /einfache preise/i })).toBeVisible();
});

test('shows validation feedback in the auth modal', async ({ page }) => {
  await page.goto('/');
  await page.locator('#hero-signup-btn').click();

  await expect(page.locator('#auth-modal')).toBeVisible();
  await page.locator('#modal-submit').click();
  await expect(page.locator('#modal-error')).toHaveText('Enter email and password');

  await page.locator('#modal-email').fill('invalid-email');
  await page.locator('#modal-password').fill('short');
  await page.locator('#modal-submit').click();
  await expect(page.locator('#modal-error')).toHaveText('Please enter a valid email address');

  await page.locator('#modal-email').fill('user@example.com');
  await page.locator('#modal-password').fill('short');
  await page.locator('#modal-submit').click();
  await expect(page.locator('#modal-error')).toContainText('Password must be at least 8 characters');
});

test('handles confirmation-required signup and resend flow', async ({ page }) => {
  await page.route('https://ceuymixybyaxpldgggin.supabase.co/auth/v1/signup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'user-1', email: 'new@example.com', identities: [{ id: 'identity-1' }] },
      }),
    });
  });

  await page.route('https://ceuymixybyaxpldgggin.supabase.co/auth/v1/resend', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/');
  await page.locator('#hero-signup-btn').click();
  await page.locator('#modal-name').fill('New User');
  await page.locator('#modal-email').fill('new@example.com');
  await page.locator('#modal-password').fill('strong-pass');
  await page.locator('#modal-submit').click();

  await expect(page.locator('#modal-verify')).toBeVisible();
  await expect(page.locator('#verify-email-text')).toContainText('new@example.com');

  await page.locator('#modal-resend-btn').click();
  await expect(page.locator('#site-message')).toContainText('Verification email resent');
});

test('opens password reset flow from sign-in and sends a reset email', async ({ page }) => {
  let recoverCalled = false;
  let recoverBody = null;

  await page.route('https://ceuymixybyaxpldgggin.supabase.co/auth/v1/recover', async (route) => {
    recoverCalled = true;
    try { recoverBody = JSON.parse(route.request().postData() || '{}'); } catch { /* ignore parse error */ }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto('/');
  await page.locator('#hero-signup-btn').click();
  // Switch to Sign In mode so "Forgot your password?" is visible
  await page.locator('#modal-toggle-btn').click();
  await expect(page.locator('#modal-forgot-wrap')).toBeVisible();

  await page.locator('#modal-forgot-btn').click();
  await expect(page.locator('#modal-reset')).toBeVisible();
  await expect(page.locator('#modal-form')).toBeHidden();

  // Invalid email -> validation error
  await page.locator('#modal-reset-email').fill('not-an-email');
  await page.locator('#modal-reset-submit').click();
  await expect(page.locator('#modal-reset-error')).toContainText('valid email');

  // Valid email -> success message
  await page.locator('#modal-reset-email').fill('user@example.com');
  await page.locator('#modal-reset-submit').click();
  await expect(page.locator('#modal-reset-success')).toContainText('reset link is on its way');
  expect(recoverCalled).toBe(true);
  expect(recoverBody).toMatchObject({ email: 'user@example.com' });
  expect(recoverBody.redirect_to).toContain('/reset-password.html');

  // Back button returns to sign-in form
  await page.locator('#modal-reset-back-btn').click();
  await expect(page.locator('#modal-form')).toBeVisible();
  await expect(page.locator('#modal-reset')).toBeHidden();
  await expect(page.locator('#modal-title')).toHaveText('Welcome Back');
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

  // Mismatch
  await page.locator('#new-password').fill('StrongPass123');
  await page.locator('#confirm-password').fill('Different123');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#error')).toContainText('do not match');

  // Match
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

test('falls back from signup to login for an existing user', async ({ page }) => {
  await page.route('https://ceuymixybyaxpldgggin.supabase.co/auth/v1/signup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'user-1', email: 'existing@example.com', identities: [] },
      }),
    });
  });

  await page.route('https://ceuymixybyaxpldgggin.supabase.co/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'header.' + Buffer.from(JSON.stringify({ email: 'existing@example.com' })).toString('base64') + '.sig',
        refresh_token: 'refresh-token',
        user: { id: 'user-1', email: 'existing@example.com' },
      }),
    });
  });

  await page.goto('/');
  await page.locator('#hero-signup-btn').click();
  await page.locator('#modal-email').fill('existing@example.com');
  await page.locator('#modal-password').fill('existing-pass');
  await page.locator('#modal-submit').click();

  await expect(page.locator('#modal-success')).toContainText('Welcome back');
  await expect(page.locator('#nav-user')).toBeVisible();
  await expect(page.locator('#nav-user-email')).toContainText('existing@example.com');
});
