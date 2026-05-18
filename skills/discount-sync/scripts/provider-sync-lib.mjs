#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
export const SOURCES_PATH = path.join(
  REPO_ROOT,
  "skills/discount-sync/references/provider-sources.json"
);
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

export function parseSyncArgs(argv) {
  const args = {
    outputPath: undefined,
    printSummary: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") {
      args.outputPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (value.startsWith("--output=")) {
      args.outputPath = value.slice("--output=".length);
      continue;
    }
    if (value === "--quiet") {
      args.printSummary = false;
    }
  }

  return args;
}

export function loadSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
}

export function loadProviderConfig(providerId) {
  const entry = loadSources().find((provider) => provider.provider === providerId);
  if (!entry) {
    throw new Error(`Provider ${providerId} not found in provider-sources.json`);
  }
  return entry;
}

export function resolveOutputPath(providerConfig, cliOutputPath) {
  if (cliOutputPath) {
    return path.isAbsolute(cliOutputPath)
      ? cliOutputPath
      : path.join(REPO_ROOT, cliOutputPath);
  }
  return path.join(REPO_ROOT, providerConfig.outputPath);
}

export function fetchHtml(url, options = {}) {
  return execFileSync(
    "curl",
    ["-sL", "-A", options.userAgent || DEFAULT_USER_AGENT, url],
    {
      encoding: "utf8",
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    }
  );
}

export function writeProviderOutput(providerConfig, outputPath, rules) {
  const output = {
    provider: providerConfig.provider,
    label: providerConfig.label,
    rules,
  };

  const serialisedOutput = `${JSON.stringify(output, null, 2)}\n`;
  const previousOutput = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : null;
  const changed = previousOutput !== serialisedOutput;

  if (changed) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialisedOutput, "utf8");
  }

  return { output, changed };
}
