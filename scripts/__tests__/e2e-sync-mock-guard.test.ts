import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findInlineSyncReimplementations,
  SYNC_MOCK_EXEMPTIONS,
  type E2eSourceFile,
} from "../../e2e/test-support/syncMockGuard";
import { listSyncFixtureNames } from "../../e2e/test-support/fixtures";

function specSource(content: string): E2eSourceFile {
  return { path: "e2e/example.spec.ts", content };
}

const INLINE_VIOLATION = specSource(`import { test } from "@playwright/test";
test("violation", async ({ page }) => {
  await page.routeWebSocket(/\\/api\\/.*\\/sync/, (socket) => {
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "ModifyQuerySet") {
        socket.send(JSON.stringify({ type: "MutationResponse", requestId: 1 }));
      }
    });
  });
});`);

const COMPLIANT = specSource(`import { test } from "@playwright/test";
import { mockSyncFixture } from "./test-support/fixtures";
test("compliant", async ({ page }) => {
  await mockSyncFixture(page, "example");
});`);

describe("e2e sync-mock guard", () => {
  it("flags a deliberate inline sync-protocol re-implementation", () => {
    const findings = findInlineSyncReimplementations([INLINE_VIOLATION]);
    expect(findings).toEqual([
      {
        file: "e2e/example.spec.ts",
        reason:
          "opens the sync WebSocket directly instead of using the shared harness (mockSyncFixture)",
      },
      {
        file: "e2e/example.spec.ts",
        reason:
          "handles raw socket messages instead of using the shared harness (mockSyncFixture)",
      },
      {
        file: "e2e/example.spec.ts",
        reason:
          "hard-codes sync wire-protocol message types instead of using the shared harness (mockSyncFixture)",
      },
    ]);
  });

  it("accepts a spec that uses the shared harness", () => {
    expect(findInlineSyncReimplementations([COMPLIANT])).toEqual([]);
  });

  it("ignores files that are not e2e specs", () => {
    expect(
      findInlineSyncReimplementations([
        { path: "e2e/test-support/mockConvexSync.ts", content: INLINE_VIOLATION.content },
      ]),
    ).toEqual([]);
  });

  it("skips only listed exemptions, and every exemption carries a written reason", () => {
    for (const exemption of SYNC_MOCK_EXEMPTIONS)
      expect(exemption.reason.trim()).not.toBe("");
  });

  it("no e2e spec re-implements the sync protocol", () => {
    const e2eDir = join(process.cwd(), "e2e");
    const specs = readdirSync(e2eDir)
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => ({
        path: `e2e/${f}`,
        content: readFileSync(join(e2eDir, f), "utf8"),
      }));
    expect(specs.length).toBeGreaterThan(0);
    expect(findInlineSyncReimplementations(specs)).toEqual([]);
  });

  it("registers named sync fixtures that manifests can reference", () => {
    const names = listSyncFixtureNames();
    expect(names.length).toBeGreaterThanOrEqual(10);
    for (const name of names)
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(new Set(names).size).toBe(names.length);
  });
});
