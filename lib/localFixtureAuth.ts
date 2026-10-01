/** No fixture identity is available in builds, cloud deployments, or normal auth. */
export function localFixtureTokenUrl(input: {
  runtime?: string; bypass: boolean; convexUrl?: string; tokenUrl?: string; vercel: boolean;
}): string | undefined {
  if (input.runtime !== "development" || !input.bypass || input.vercel ||
      input.convexUrl !== "http://127.0.0.1:3210" || input.tokenUrl !== "http://127.0.0.1:3969/token") return undefined;
  return input.tokenUrl;
}
