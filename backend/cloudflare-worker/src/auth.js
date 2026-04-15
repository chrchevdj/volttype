/**
 * Token verification for Supabase Auth tokens.
 * Verifies by calling Supabase's /auth/v1/user endpoint.
 */

export async function verifyToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    // Verify token by calling Supabase auth API
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_SERVICE_KEY,
      },
    });

    if (!res.ok) return null;

    const user = await res.json();
    if (!user.id) return null;

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      appMetadata: user.app_metadata || {},
    };
  } catch {
    return null;
  }
}

/**
 * Returns true if `user` is tagged with the given product in app_metadata.products.
 */
export function hasProduct(user, product) {
  if (!user) return false;
  const products = user.appMetadata?.products;
  return Array.isArray(products) && products.includes(product);
}

/**
 * Adds a product tag to an existing user via the volttype_add_user_product RPC.
 * Requires service-role auth.
 */
export async function addUserProduct(userId, product, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/volttype_add_user_product`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_user_id: userId, p_product: product }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`addUserProduct failed (${res.status}): ${text}`);
  }
  return res.json();
}
