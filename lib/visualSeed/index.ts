import manifest from "./manifest.json";
import sourceDocument from "./source-document.json";
import lessons from "./prompting-lessons.json";
import finalDirections from "./final-direction-prompts.json";
import { hashVisualBytes } from "../visualProfile";

/** Anchors supplement, without rewriting, the byte-exact frozen source package. */
export const corvoSeedIntegrity = {
  files: {
    "manifest.json": "3054c1fce45be346dbbb2168605fc73933b4aa60481d4d762d1f3efa7c6eac86",
    "prompting-lessons.json": "578315e0ffa83f6de98aa22256da5f813e4451d6e6bffd0d657a39a96a13aa7f",
    "final-direction-prompts.json": "ab936b5f62268e1652e4f740225f39eef4a2eb5b4238f41247a690abf5c610f4",
  },
  archive: {
    manifest: "f58a620ad0c267ca09021ee84f61d633317333e73da2c1909a4737abd32997cd",
    lessons: "c912391dd28ac13421467e28941d19d978ee4374346422953553ef70c587e617",
    finalDirections: "ff14f50bfdd82070202adbbb9eb93c5472f27a878ecae0c236d6426f17461efd",
  },
};

export async function verifyCorvoSeedIntegrity(): Promise<void> {
  const hash = (text: string) => hashVisualBytes(new TextEncoder().encode(text).buffer);
  const checks = [
    [sourceDocument.text, manifest.source_sha256],
    [JSON.stringify(manifest), corvoSeedIntegrity.archive.manifest],
    [JSON.stringify(lessons), corvoSeedIntegrity.archive.lessons],
    [JSON.stringify(finalDirections), corvoSeedIntegrity.archive.finalDirections],
  ];
  for (const [content, expected] of checks) {
    if (await hash(content) !== expected) throw new Error("Frozen Corvo seed integrity check failed");
  }
}

export const CORVO_VISUAL_SEED_ID = `corvo-2026-09-30-${manifest.source_sha256}`;
export const corvoSeed = { manifest, sourceDocument: sourceDocument.text, lessons, finalDirections };
const fileName = (path: string) => path.split("/").at(-1)!;
export const corvoSeedAssets = [
  {
    key: "raven-character-sheet", fileName: fileName(manifest.mascot_reference.path),
    sha256: manifest.mascot_reference.sha256, article: null,
    approvalProvenance: manifest.mascot_reference.approval_provenance,
  },
  ...manifest.approved_heroes.map(hero => ({
    key: `article-${String(hero.article).padStart(2, "0")}`, fileName: fileName(hero.path),
    sha256: hero.sha256, article: hero.article, approvalProvenance: hero.approval_provenance,
  })),
];

export function approvedCorvoSeedAsset(key: string) {
  const asset = corvoSeedAssets.find(asset => asset.key === key);
  if (!asset) throw new Error("Unknown approved seed asset");
  return asset;
}

const styleBlock = sourceDocument.text.split("### Current style block")[1].split("```")[1].trim().split("\n\n");
if (styleBlock.length !== 5) throw new Error("The frozen Corvo style block must have five paragraphs");
const heroChartSentence = "Documents, charts, and diagrams use illustrative blocks, lines, and shapes; they carry no real statistics, quotations, or evidence.";
const chartQa = sourceDocument.text.split("5. **Text and charts:** ")[1]?.split("\n")[0];
if (!styleBlock[4].includes(heroChartSentence) || !chartQa) throw new Error("The frozen Corvo chart policy is missing");
export const corvoCurrentGuidance = {
  artDirection: `${styleBlock[0]}\n\n${styleBlock[1]}`,
  palette: [
    { name: "Warm neutral off white", color: "#ECE9E2" },
    { name: "Charcoal", color: "#22272B" },
    { name: "Slate teal", color: "#2E5B60" },
    { name: "Pale sage", color: "#B7C4B4" },
    { name: "Burnt copper", color: "#C2612C" },
  ],
  compositionGuidance: styleBlock[2],
  mascotGuidance: styleBlock[3], textPolicy: styleBlock[4],
  heroChartPolicy: `${heroChartSentence}\n\n${chartQa}`,
};
