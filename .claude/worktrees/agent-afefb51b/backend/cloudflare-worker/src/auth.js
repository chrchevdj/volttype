/**
 * JWT verification for Supabase Auth tokens.
 */

export async function verifyToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    // Decode JWT payload (base64url)
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Verify signature using HMAC-SHA256 with Supabase JWT secret
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureData = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, signature, signatureData);
    if (!valid) return null;

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
