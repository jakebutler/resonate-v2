/**
 * Content fingerprint over a campaign's draft set (MF gate freshness): the
 * cohesion gate records it with the passing run; materialization recomputes it
 * and refuses to proceed when the drafts have changed since. Change detection,
 * not cryptography — FNV-style 64-bit two-lane hash.
 */
export type FingerprintEntry = {
  postId: string;
  seq: number;
  title: string;
  content: string;
};

function hash64ish(text: string): string {
  let h1 = 0x84222325 >>> 0;
  let h2 = 0x1d35793b >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code + index) & 0xffff), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function draftSetFingerprint(entries: FingerprintEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => a.seq - b.seq)
    .map(
      (entry) =>
        `${entry.postId}\u0000${entry.seq}\u0000${entry.title.trim()}\u0000${entry.content.trim()}`
    )
    .join("\u0001");
  return `fnv1a:${hash64ish(canonical)}`;
}
