const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_KEYS = new Set(["fbclid", "gclid", "si"]);

export function normalizeIdeaSourceUrl(input?: string | null): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  url.hostname = url.hostname.toLowerCase();

  const params = new URLSearchParams(url.search);
  for (const key of Array.from(params.keys())) {
    if (
      TRACKING_PARAM_KEYS.has(key) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      params.delete(key);
    }
  }
  url.search = params.toString() ? `?${params.toString()}` : "";

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function sanitizeIdeaTags(tags: string[]): string[] {
  return Array.from(
    new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
  );
}

export function buildIdeaPreview(content: string, maxLength = 140): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}
