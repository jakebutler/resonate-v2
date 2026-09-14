import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Length-independent constant-time comparison for ops bearer secrets
 * (hash, then compare, so secret length is not observable).
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
