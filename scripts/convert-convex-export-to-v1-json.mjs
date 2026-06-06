#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const V1_TABLES = [
  "posts",
  "capturedIdeas",
  "capturedIdeaEntries",
  "capturedIdeaPostLinks",
  "ideas",
  "workflowDrafts",
  "settings",
];

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--zip") {
      options.zip = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--unpacked") {
      options.unpacked = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.out = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.out) {
    throw new Error("--out is required");
  }
  if (!options.zip && !options.unpacked) {
    throw new Error("Provide --zip or --unpacked");
  }
  return options;
}

async function readJsonlTable(tableDir) {
  const filePath = path.join(tableDir, "documents.jsonl");
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let unpackedDir = options.unpacked;

  if (options.zip) {
    unpackedDir = path.join(path.dirname(options.zip), `${path.basename(options.zip, ".zip")}-unpacked`);
    await mkdir(unpackedDir, { recursive: true });
    await execFileAsync("unzip", ["-oq", options.zip, "-d", unpackedDir]);
  }

  const output = {};
  for (const table of V1_TABLES) {
    output[table] = await readJsonlTable(path.join(unpackedDir, table));
  }

  await writeFile(options.out, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const counts = Object.fromEntries(V1_TABLES.map((table) => [table, output[table].length]));
  console.log(JSON.stringify({ out: options.out, counts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
