// @vitest-environment node

import { existsSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { acquireLock, getChangedFiles, normalizeRepoRelativePath } from "../update-docs.mjs";

describe("update-docs helpers", () => {
  it("parses NUL-delimited git output without breaking spaced paths or rename targets", () => {
    const stagedChanges = [
      "M",
      "docs/spec with spaces.md",
      "R100",
      "components/old name.tsx",
      "components/new name.tsx",
      "C100",
      "lib/source.ts",
      "lib/copied file.ts",
    ].join("\0");

    const workingTreeChanges = [
      " M app/editor/page.tsx",
      "?? docs/project notes.md",
      "R  components/renamed target.tsx",
      "components/renamed source.tsx",
    ].join("\0");

    expect(getChangedFiles(stagedChanges, workingTreeChanges)).toEqual([
      "docs/spec with spaces.md",
      "components/new name.tsx",
      "lib/copied file.ts",
      "app/editor/page.tsx",
      "docs/project notes.md",
      "components/renamed target.tsx",
    ]);
  });

  it("normalizes repository-relative separators without changing the rest of the path", () => {
    expect(normalizeRepoRelativePath("docs\\nested folder\\spec.md")).toBe("docs/nested folder/spec.md");
  });

  it("only removes a lock when the release owner still matches", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "update-docs-lock-"));
    const lockPath = path.join(tempDir, "docs.lock");

    try {
      const releaseLock = acquireLock(lockPath, 1_000);
      expect(releaseLock).toBeTypeOf("function");
      expect(readFileSync(lockPath, "utf8")).not.toBe("");

      writeFileSync(lockPath, "different-owner", "utf8");
      releaseLock?.();

      expect(readFileSync(lockPath, "utf8")).toBe("different-owner");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it.each(["", "malformed-owner"])(
    "reclaims stale lock files even when their metadata is %j",
    (existingContents) => {
      const tempDir = mkdtempSync(path.join(tmpdir(), "update-docs-lock-"));
      const lockPath = path.join(tempDir, "docs.lock");

      try {
        writeFileSync(lockPath, existingContents, "utf8");
        const staleTime = new Date(Date.now() - 5_000);
        utimesSync(lockPath, staleTime, staleTime);

        const releaseLock = acquireLock(lockPath, 1_000);
        expect(releaseLock).toBeTypeOf("function");
        expect(readFileSync(lockPath, "utf8")).not.toBe(existingContents);

        releaseLock?.();
        expect(existsSync(lockPath)).toBe(false);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  );
});
