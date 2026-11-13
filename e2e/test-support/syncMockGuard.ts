/**
 * Guard for the shared sync-protocol harness (verification deliverable V3):
 * e2e specs must consume the harness through named fixtures instead of
 * re-implementing the Convex sync wire protocol inline.
 *
 * Pure function so the vitest guard test can check both the real specs and
 * synthetic violation cases.
 */
export type E2eSourceFile = { path: string; content: string };

export type SyncMockViolation = { file: string; reason: string };

/**
 * Specs listed here may keep an inline sync mock, each with a written reason
 * (spec risk row: "specs that cannot migrate cleanly keep their inline mock").
 * Keep it empty unless a spec genuinely cannot use the harness.
 */
export const SYNC_MOCK_EXEMPTIONS: readonly {
  file: string;
  reason: string;
}[] = [];

const INLINE_PROTOCOL_MARKERS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /routeWebSocket\s*\(/,
    reason: "opens the sync WebSocket directly instead of using the shared harness (mockSyncFixture)",
  },
  {
    pattern: /\bonMessage\s*\(/,
    reason: "handles raw socket messages instead of using the shared harness (mockSyncFixture)",
  },
  {
    pattern: /"(Authenticate|ModifyQuerySet|MutationResponse|ActionResponse)"/,
    reason: "hard-codes sync wire-protocol message types instead of using the shared harness (mockSyncFixture)",
  },
];

/** e2e spec sources with inline sync-protocol re-implementations. */
export function findInlineSyncReimplementations(
  files: E2eSourceFile[],
): SyncMockViolation[] {
  const violations: SyncMockViolation[] = [];
  for (const file of files) {
    if (!/\.spec\.tsx?$/.test(file.path)) continue;
    if (SYNC_MOCK_EXEMPTIONS.some((e) => file.path.endsWith(e.file))) continue;
    for (const { pattern, reason } of INLINE_PROTOCOL_MARKERS) {
      if (pattern.test(file.content))
        violations.push({ file: file.path, reason });
    }
  }
  return violations;
}
