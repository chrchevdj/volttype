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
    };
  } catch {
    return null;
  }
}
