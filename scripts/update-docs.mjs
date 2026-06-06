#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim();
const gitDir = resolveGitDir();
const docsDir = path.join(repoRoot, "docs");
const specPath = path.join(docsDir, "spec.md");
const changelogPath = path.join(docsDir, "changelog.md");
const projectStatusPath = path.join(docsDir, "project-status.md");
const promptPath = path.join(repoRoot, ".codex", "prompts", "documentation-subagent.md");
const managedDocPaths = new Set([specPath, changelogPath, projectStatusPath]);
const managedDocFiles = new Set(
  [...managedDocPaths].map((filePath) => path.relative(repoRoot, filePath))
);
const lockPath = path.join(gitDir, "resonate-docs-update.lock");

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const skipAgent = args.has("--skip-agent");
const skipChangelog = args.has("--skip-changelog");
const strict = args.has("--strict") || process.env.RESONATE_DOCS_HOOK_STRICT === "1";
const runContext = process.env.RESONATE_DOCS_CONTEXT ?? "manual";
const requestedMode = getStringOption(rawArgs, "--mode=") ?? process.env.RESONATE_DOCS_MODE ?? "auto";
const resolvedMode = resolveMode({
  requestedMode,
  skipAgent,
  runContext,
});
const agentTimeoutMs = getNumberOption(rawArgs, "--agent-timeout-ms=", 15000, process.env.RESONATE_DOCS_AGENT_TIMEOUT_MS);
const staleLockMs = getNumberOption(rawArgs, "--stale-lock-ms=", 10 * 60 * 1000, process.env.RESONATE_DOCS_STALE_LOCK_MS);

mkdirSync(docsDir, { recursive: true });

const now = new Date();
const timestamp = formatTimestamp(now);
const branch = safeRun(["git", "rev-parse", "--abbrev-ref", "HEAD"]).trim() || "unknown";
const recentCommits = splitLines(safeRun(["git", "log", "--oneline", "-5"]));
const stagedChanges = splitLines(safeRun(["git", "diff", "--cached", "--name-status"]));
const workingTreeChanges = splitLines(safeRun(["git", "status", "--short"]));
const stagedChangeEntries = safeRun(["git", "diff", "--cached", "--name-status", "-z"]);
const workingTreeChangeEntries = safeRun(["git", "status", "--porcelain", "-z"]);
const stagedFiles = getChangedFiles(stagedChangeEntries, "");
const changedFiles = getChangedFiles(stagedChangeEntries, workingTreeChangeEntries);
const skipReason = getSkipReason({
  runContext,
  stagedFiles,
});

if (isCliEntryPoint()) {
  const exitCode = main();
  if (typeof exitCode === "number") {
    process.exitCode = exitCode;
  }
}

function main() {
  if (skipReason) {
    console.log(skipReason);
    return 0;
  }

  if (resolvedMode === "off") {
    console.log("Documentation refresh disabled by configuration.");
    return 0;
  }

  const releaseLock = acquireLock(lockPath, staleLockMs);
  if (!releaseLock) {
    return failOrWarn(`Documentation refresh already running; skipping this pass.`, strict);
  }

  try {
    ensureDocFiles(now);

    writeFileSync(projectStatusPath, buildProjectStatus({
      timestamp,
      branch,
      recentCommits,
      workingTreeChanges,
      changedFiles,
    }), "utf8");

    const shouldRunAgent = resolvedMode === "agent" && canRunDocumentationAgent(promptPath);
    const agentSucceeded = shouldRunAgent
      ? runDocumentationAgent({
          repoRoot,
          promptPath,
          timestamp,
          branch,
          recentCommits,
          stagedChanges,
          workingTreeChanges,
          agentTimeoutMs,
        })
      : false;

    if (!skipChangelog && !agentSucceeded) {
      const existing = readFileSync(changelogPath, "utf8").trimEnd();
      const appended = `${existing}\n\n${buildChangelogEntry({
        timestamp,
        branch,
        stagedChanges,
        workingTreeChanges,
        changedFiles,
      })}\n`;
      writeFileSync(changelogPath, appended, "utf8");
    }

    return 0;
  } finally {
    releaseLock();
  }
}

function buildProjectStatus(input) {
  const localNotes = input.workingTreeChanges.length
    ? input.workingTreeChanges.map((line) => `- ${line}`).join("\n")
    : "- Working tree is clean.";

  const currentFocus = input.changedFiles.length
    ? summarizeChanges(input.changedFiles).map((line) => `- ${line}`).join("\n")
    : "- Documentation refresh only.";

  const recent = input.recentCommits.length
    ? input.recentCommits.map((line) => `- ${line}`).join("\n")
    : "- No recent commits found.";
  const lastTask = input.recentCommits[0]
    ? `- ${input.recentCommits[0]}`
    : "- No committed task available.";
  const pickupNotes = buildPickupNotes(input.changedFiles, input.workingTreeChanges);

  return `# Project Status

Last updated: ${input.timestamp}

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

${currentFocus}

## Last Completed Task

${lastTask}

## Recent Commits

${recent}

## Local Working Tree

${localNotes}

## Next Agent Pickup

${pickupNotes}

## Branch

- ${input.branch}
`;
}

function buildChangelogEntry(input) {
  const summaryLines = summarizeChanges(input.changedFiles);
  const staged = input.stagedChanges.length
    ? input.stagedChanges.map((line) => `- ${line}`).join("\n")
    : "- No staged changes were present when the docs refresh ran.";
  const working = input.workingTreeChanges.length
    ? input.workingTreeChanges.map((line) => `- ${line}`).join("\n")
    : "- Working tree was clean.";

  return `## ${input.timestamp}

### Summary

${summaryLines.map((line) => `- ${line}`).join("\n")}

### Staged Changes

${staged}

### Working Tree Snapshot

${working}

### Branch

- ${input.branch}`;
}

function summarizeChanges(files) {
  const notes = [];
  const has = (pattern) => files.some((file) => pattern.test(file));

  if (has(/^docs\//)) {
    notes.push("Updated repository documentation and handoff records.");
  }
  if (has(/^\.githooks\//) || has(/^scripts\/update-docs\.mjs$/) || has(/^scripts\/install-git-hooks\.sh$/)) {
    notes.push("Adjusted commit-time automation for documentation refreshes.");
  }
  if (has(/^components\/WorkflowBoard\//) || has(/^convex\/workflow\.ts$/) || has(/^lib\/workflow/)) {
    notes.push("Touched the workflow board or editorial workflow logic.");
  }
  if (has(/^app\/ideas\//) || has(/^components\/IdeasPage\//) || has(/^convex\/ideas\.ts$/)) {
    notes.push("Touched the captured ideas experience.");
  }
  if (has(/^app\/api\/llm\//) || has(/^lib\/cortex\.ts$/) || has(/^lib\/llmClient\.ts$/)) {
    notes.push("Touched AI assistant request or prompt plumbing.");
  }
  if (has(/^app\/layout\.tsx$/) || has(/^convex\/auth\.config\.ts$/) || has(/^components\/ConvexClientProvider\.tsx$/)) {
    notes.push("Touched auth or environment wiring.");
  }
  if (has(/^app\/page\.tsx$/) || has(/^components\/Calendar\//) || has(/^components\/ContentLibrary\//)) {
    notes.push("Touched the main dashboard surfaces.");
  }
  if (notes.length === 0) {
    notes.push("Refreshed documentation for the current repository state.");
  }

  return [...new Set(notes)];
}

function buildPickupNotes(changedFiles, workingTreeChanges) {
  const notes = [
    "Start by checking the living docs against the current code before making assumptions.",
    "If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.",
  ];

  const hasChangedFile = (pattern) => changedFiles.some((file) => pattern.test(file));
  const hasWorkingTreeLine = (pattern) => workingTreeChanges.some((line) => pattern.test(line));

  if (
    hasChangedFile(/^app\/layout\.tsx$/) ||
    hasChangedFile(/^convex\/auth\.config\.ts$/) ||
    hasWorkingTreeLine(/app\/layout\.tsx/) ||
    hasWorkingTreeLine(/convex\/auth\.config\.ts/)
  ) {
    notes.push("Review the in-flight auth/env wiring changes before touching shared layout or Clerk/Convex setup.");
  }

  if (
    hasChangedFile(/^convex\/workflow\.ts$/) ||
    hasChangedFile(/^components\/WorkflowBoard\//) ||
    hasChangedFile(/^lib\/workflow/)
  ) {
    notes.push("Workflow changes should preserve the distinction between backend stages and the simplified kanban columns.");
  }

  if (
    hasChangedFile(/^convex\/ideas\.ts$/) ||
    hasChangedFile(/^components\/IdeasPage\//) ||
    hasChangedFile(/^app\/ideas\//)
  ) {
    notes.push("Do not conflate the captured ideas inbox with the separate workflow idea system.");
  }

  return [...new Set(notes)].map((line) => `- ${line}`).join("\n");
}

function getChangedFiles(stagedChanges, workingTreeChanges) {
  const files = new Set();

  collectNameStatusPaths(stagedChanges, files);
  collectStatusPaths(workingTreeChanges, files);

  return [...files];
}

function getSkipReason(input) {
  if (process.env.RESONATE_DOCS_HOOK_ACTIVE === "1") {
    return "Documentation refresh skipped: hook already active in this process tree.";
  }

  if (input.runContext !== "hook") {
    return null;
  }

  if (input.stagedFiles.length === 0 && docsExist()) {
    return "Documentation refresh skipped: no staged changes detected.";
  }

  if (input.stagedFiles.length > 0 && input.stagedFiles.every((file) => managedDocFiles.has(file)) && docsExist()) {
    return "Documentation refresh skipped: staged changes only touch managed docs.";
  }

  return null;
}

function docsExist() {
  return [...managedDocPaths].every((filePath) => existsSync(filePath));
}

function ensureDocFiles(now) {
  if (!existsSync(specPath)) {
    writeFileSync(
      specPath,
      "# Resonate Spec\n\nLast updated: " + now.toISOString().slice(0, 10) + "\n",
      "utf8"
    );
  }

  if (!existsSync(changelogPath)) {
    writeFileSync(
      changelogPath,
      "# Changelog\n\nAppend-only session log for repository-level updates.\n",
      "utf8"
    );
  }
}

function resolveMode(input) {
  const normalized = input.requestedMode.toLowerCase();
  if (normalized === "baseline" || normalized === "agent" || normalized === "off") {
    return normalized;
  }

  if (normalized !== "auto") {
    console.warn(`Unknown docs update mode "${input.requestedMode}", falling back to auto.`);
  }

  if (input.skipAgent) {
    return "baseline";
  }

  if (input.runContext === "hook") {
    return "baseline";
  }

  if (process.env.CI || process.env.CODEX_CI === "1" || process.env.CODEX_THREAD_ID) {
    return "baseline";
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "baseline";
  }

  return "agent";
}

function canRunDocumentationAgent(promptFilePath) {
  if (!existsSync(promptFilePath)) {
    console.warn("Documentation prompt not found; keeping baseline documentation update.");
    return false;
  }

  const codexPath = safeRun(["bash", "-lc", "command -v codex"]).trim();
  if (!codexPath) {
    console.warn("Codex CLI not found; keeping baseline documentation update.");
    return false;
  }

  return true;
}

function runDocumentationAgent(input) {
  const basePrompt = readFileSync(input.promptPath, "utf8").trim();
  const runtimeContext = [
    "",
    "Current context:",
    `- Timestamp: ${input.timestamp}`,
    `- Branch: ${input.branch}`,
    "",
    "Recent commits:",
    ...input.recentCommits.map((line) => `- ${line}`),
    "",
    "Staged changes:",
    ...(input.stagedChanges.length
      ? input.stagedChanges.map((line) => `- ${line}`)
      : ["- None detected."]),
    "",
    "Working tree snapshot:",
    ...(input.workingTreeChanges.length
      ? input.workingTreeChanges.map((line) => `- ${line}`)
      : ["- Clean working tree."]),
  ].join("\n");

  const prompt = `${basePrompt}\n${runtimeContext}\n`;

  try {
    run([
      "codex",
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--cd",
      input.repoRoot,
      "--skip-git-repo-check",
      "--ephemeral",
      prompt,
    ], {
      env: {
        ...process.env,
        RESONATE_DOCS_CONTEXT: "agent",
        RESONATE_DOCS_HOOK_ACTIVE: "1",
        RESONATE_DOCS_HOOK_SKIP: "1",
      },
      stdio: "inherit",
      timeout: input.agentTimeoutMs,
    });
    return true;
  } catch (error) {
    console.warn(`Codex documentation subagent failed: ${formatError(error)}`);
    return false;
  }
}

function formatTimestamp(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
    hour12: false,
    hourCycle: "h23",
  }).format(date).replace(",", "");
}

function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function splitNullDelimited(value) {
  return value.split("\0").filter(Boolean);
}

function collectNameStatusPaths(value, files) {
  const entries = splitNullDelimited(value);

  for (let index = 0; index < entries.length;) {
    const status = entries[index++];
    if (!status) continue;

    if (status.startsWith("R") || status.startsWith("C")) {
      index += 1;
      const targetPath = entries[index++];
      if (targetPath) {
        files.add(normalizeRepoRelativePath(targetPath));
      }
      continue;
    }

    const filePath = entries[index++];
    if (filePath) {
      files.add(normalizeRepoRelativePath(filePath));
    }
  }
}

function collectStatusPaths(value, files) {
  const entries = splitNullDelimited(value);

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;

    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (filePath) {
      files.add(normalizeRepoRelativePath(filePath));
    }

    if (status.includes("R") || status.includes("C")) {
      index += 1;
    }
  }
}

function normalizeRepoRelativePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function resolveGitDir() {
  const gitDirValue = safeRun(["git", "rev-parse", "--git-dir"]).trim();
  if (!gitDirValue) {
    return path.join(repoRoot, ".git");
  }

  return path.isAbsolute(gitDirValue)
    ? gitDirValue
    : path.resolve(repoRoot, gitDirValue);
}

function acquireLock(targetPath, staleMs) {
  const ownerId = `${process.pid}:${randomUUID()}`;

  try {
    writeLockFile(targetPath, ownerId);
    return createLockRelease(targetPath, ownerId);
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      console.warn(`Unable to create docs refresh lock: ${formatError(error)}`);
      return null;
    }
  }

  try {
    const ageMs = Date.now() - statSync(targetPath).mtimeMs;
    if (ageMs > staleMs) {
      const existingOwner = readLockOwner(targetPath);
      const released = releaseOwnedLock(targetPath, existingOwner);
      if (!released && existsSync(targetPath)) {
        return null;
      }

      writeLockFile(targetPath, ownerId);
      return createLockRelease(targetPath, ownerId);
    }
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return null;
    }
    console.warn(`Unable to inspect docs refresh lock: ${formatError(error)}`);
  }

  return null;
}

function writeLockFile(targetPath, ownerId) {
  const fd = openSync(targetPath, "wx");
  try {
    writeFileSync(fd, ownerId, "utf8");
  } finally {
    closeSync(fd);
  }
}

function createLockRelease(targetPath, ownerId) {
  return () => {
    releaseOwnedLock(targetPath, ownerId);
  };
}

function readLockOwner(targetPath) {
  return readFileSync(targetPath, "utf8");
}

function releaseOwnedLock(targetPath, expectedOwnerId) {
  try {
    const currentOwnerId = readLockOwner(targetPath);
    if (currentOwnerId !== expectedOwnerId) {
      return false;
    }

    unlinkSync(targetPath);
    return true;
  } catch {
    // Ignore lock cleanup failures.
    return false;
  }
}

function isCliEntryPoint() {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && import.meta.url === pathToFileURL(entryPoint).href;
}

function isAlreadyExistsError(error) {
  return Boolean(error) && typeof error === "object" && "code" in error && error.code === "EEXIST";
}

function getStringOption(argv, prefix) {
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function getNumberOption(argv, prefix, fallback, envValue) {
  const raw = getStringOption(argv, prefix) ?? envValue ?? "";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function run(command, options = {}) {
  return execFileSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function safeRun(command, options = {}) {
  try {
    return run(command, options);
  } catch {
    return "";
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

function failOrWarn(message, shouldFail) {
  if (shouldFail) {
    console.error(message);
    return 1;
  }

  console.warn(message);
  return 0;
}

export { acquireLock, getChangedFiles, normalizeRepoRelativePath };
