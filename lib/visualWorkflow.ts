export type SceneConcept = {
  title: string;
  subject: string;
  metaphor: string;
  action: string;
  reveal: string;
  articleConnection: string;
  articleAnchor: string;
};

/** Full canonical inputs, rather than a short hash, make changed-input reuse unambiguous. */
export function stableInputSignature(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableInputSignature).join(",")}]`;
  return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableInputSignature(item)}`).join(",")}}`;
}

export function serializedUtf8Bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function assertSerializedBound(value: unknown, maximum: number, label: string) {
  if (serializedUtf8Bytes(value) > maximum) throw new Error(`${label} exceeds ${maximum} bytes`);
}

type Article = { title: string; content: string };
export function articleSignature(article: Article) {
  return stableInputSignature({ title: article.title, content: article.content });
}

/** Only narrowly verified spelling/spacing normalization is automatic. All unknown edits require a human. */
function copyNormalized(value: string) {
  if (/`|^ {4}|^\t|\]\(|<|:\/\//m.test(value)) return value; // Code, links, and raw HTML retain exact spelling and spacing.
  return value.replace(/\brecieved\b/g, "received").replace(/\bteh\b/g, "the").replace(/\bseperate\b/g, "separate").replace(/\r\n/g, "\n")
    .split("\n").map((line, i, lines) => line.replace(/(?<=\S)[ \t]+(?=\S)/g, " ").replace(i === lines.length - 1 ? /[ \t]+$/ : /(?<![ \t])[ \t]$/, "")).join("\n");
}

export function relevanceSignature(article: Article) {
  return articleSignature({ title: copyNormalized(article.title), content: copyNormalized(article.content) });
}

export function classifyArticleChange(before: Article, after: Article): "unchanged" | "copy-edit" | "review-required" {
  if (articleSignature(before) === articleSignature(after)) return "unchanged";
  return relevanceSignature(before) === relevanceSignature(after) ? "copy-edit" : "review-required";
}

export function composeScenePrompt(scene: SceneConcept, instructions?: string) {
  return `Editorial scene: ${scene.title}\nSubject: ${scene.subject}\nCore metaphor: ${scene.metaphor}\nVisible action: ${scene.action}\nReveal: ${scene.reveal}\nArticle connection: ${scene.articleConnection}${instructions?.trim() ? `\nAuthor production instructions: ${instructions.trim()}` : ""}`;
}

function words(text: string) {
  return new Set(text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

export function validateScenePlan(scenes: SceneConcept[], article: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (scenes.length !== 3) return { valid: false, reasons: ["Exactly three scenes are required"] };
  for (const [i, scene] of scenes.entries()) {
    if (Object.values(scene).some((value) => !value.trim())) reasons.push(`Scene ${i + 1} is incomplete`);
    const limits: Record<keyof SceneConcept, number> = { title: 200, subject: 2000, metaphor: 2000, action: 4000, reveal: 4000, articleConnection: 4000, articleAnchor: 2000 };
    if (Object.entries(scene).some(([field, value]) => value.length > limits[field as keyof SceneConcept]) || serializedUtf8Bytes(scene) > 24_000) reasons.push(`Scene ${i + 1} is oversized`);
    if (!article.includes(scene.articleAnchor)) {
      const anchor = scene.articleAnchor;
      const quoted = anchor.length >= 2 && [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"]].some(([open, close]) => anchor.startsWith(open) && anchor.endsWith(close));
      // Keep persisted anchors exact: remove only a presentation pair proven absent from the article.
      if (quoted && article.includes(anchor.slice(1, -1))) scene.articleAnchor = anchor.slice(1, -1);
    }
    if (scene.articleAnchor.trim().length < 12 || !article.includes(scene.articleAnchor)) reasons.push(`Scene ${i + 1} lacks an exact article anchor`);
    const story = words(`${scene.subject} ${scene.metaphor} ${scene.action} ${scene.reveal}`);
    if (!story.size) reasons.push(`Scene ${i + 1} lacks letter or number story detail`);
    for (let j = 0; j < i; j++) {
      const previous = words(`${scenes[j].subject} ${scenes[j].metaphor} ${scenes[j].action} ${scenes[j].reveal}`);
      const overlap = [...story].filter((word) => previous.has(word)).length;
      const union = new Set([...story, ...previous]).size;
      if (union > 0 && overlap / union >= 0.72) reasons.push(`Scenes ${j + 1} and ${i + 1} tell nearly the same story`);
    }
  }
  return { valid: reasons.length === 0, reasons };
}

export function canIssueLocalFixtureQuote(env: Record<string, string | undefined>, userId: string, quote: { provider: string; model: string; maximumMicros: number }) {
  return env.RESONATE_VISUAL_FIXTURE_MODE === "local-offline" &&
    env.RESONATE_VISUAL_FIXTURE_DEPLOYMENT === "anonymous-agent" &&
    env.RESONATE_VISUAL_FIXTURE_CONVEX_URL === "http://127.0.0.1:3210" &&
    env.CONVEX_SITE_URL === "http://127.0.0.1:3211" &&
    (!env.CONVEX_CLOUD_URL || env.CONVEX_CLOUD_URL === "http://127.0.0.1:3210") &&
    userId === "visual-rehearsal-only" && quote.provider === "offline-fixture" && quote.model === "offline-fixture" && quote.maximumMicros === 0;
}

/** Convex deployments always define their system URLs; trusted test rows never confer live qualification. */
export function isOfflineContractRuntime(env: Record<string, string | undefined>) {
  return env.NODE_ENV === "test" && !env.CONVEX_CLOUD_URL && !env.CONVEX_SITE_URL;
}
