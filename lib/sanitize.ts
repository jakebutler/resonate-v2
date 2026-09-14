/**
 * Redacts credential-shaped keys before provider responses are persisted
 * (single source of truth; used by the Convex submit paths and the domain
 * model's mock provider).
 */
export function sanitizeProviderResponse(response: Record<string, unknown>) {
  const blocked = /token|secret|key|authorization|cookie/i;
  return Object.fromEntries(
    Object.entries(response).map(([key, value]) => [
      key,
      blocked.test(key) ? "[redacted]" : value,
    ])
  );
}
