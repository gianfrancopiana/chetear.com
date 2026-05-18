#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadSources, REPO_ROOT } from "./provider-sync-lib.mjs";

function runGitStatus(paths) {
  return spawnSync("git", ["-C", REPO_ROOT, "status", "--porcelain", "--", ...paths], {
    encoding: "utf8",
  });
}

function parseStatus(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const file = line.slice(3).trim();
      return { status, file };
    });
}

function main() {
  const providers = loadSources();
  const outputPaths = providers.map((provider) => provider.outputPath);
  const result = runGitStatus(outputPaths);

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git status failed");
  }

  const dirtyEntries = parseStatus(result.stdout);
  const summary = {
    clean: dirtyEntries.length === 0,
    root: REPO_ROOT,
    filesChecked: outputPaths.length,
    dirtyFiles: dirtyEntries.map((entry) => entry.file),
    entries: dirtyEntries,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (dirtyEntries.length > 0) {
    process.exit(2);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
