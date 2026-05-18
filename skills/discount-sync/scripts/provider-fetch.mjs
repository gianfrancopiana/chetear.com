#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const SOURCES_PATH = path.join(
  REPO_ROOT,
  "skills/discount-sync/references/provider-sources.json"
);
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  ".hermes/tmp/provider-fetch"
);
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const args = {
    provider: undefined,
    outputPath: undefined,
    timeoutSeconds: undefined,
    printSummary: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const value = argv[i];
    if (!args.provider && !value.startsWith("--")) {
      args.provider = value;
      continue;
    }
    if (value === "--output") {
      args.outputPath = argv[++i];
      continue;
    }
    if (value.startsWith("--output=")) {
      args.outputPath = value.slice("--output=".length);
      continue;
    }
    if (value === "--timeout") {
      args.timeoutSeconds = Number(argv[++i]);
      continue;
    }
    if (value.startsWith("--timeout=")) {
      args.timeoutSeconds = Number(value.slice("--timeout=".length));
      continue;
    }
    if (value === "--quiet") {
      args.printSummary = false;
      continue;
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node skills/discount-sync/scripts/provider-fetch.mjs <provider> [--output <path>] [--timeout <seconds>] [--quiet]`);
}

function loadSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
}

function getProviderConfig(provider) {
  const sources = loadSources();
  const cfg = sources.find((entry) => entry.provider === provider);
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  return cfg;
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function defaultOutputPath(provider) {
  return path.join(DEFAULT_OUTPUT_DIR, `${provider}.html`);
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function findMatches(text, markers = []) {
  return markers.filter((marker) => normalizeText(text).includes(normalizeText(marker)));
}

function validateBody(body, validation = {}) {
  const mustContainAll = validation.mustContainAll || [];
  const mustContainAny = validation.mustContainAny || [];
  const mustNotContainAny = validation.mustNotContainAny || [];

  const matchedAll = findMatches(body, mustContainAll);
  const matchedAny = findMatches(body, mustContainAny);
  const blocked = findMatches(body, mustNotContainAny);

  if (blocked.length > 0) {
    throw new Error(
      `Fetched body matched block markers: ${blocked.join(", ")}`
    );
  }

  const missingAll = mustContainAll.filter(
    (marker) => !matchedAll.includes(marker)
  );
  if (missingAll.length > 0) {
    throw new Error(
      `Fetched body missed required markers: ${missingAll.join(", ")}`
    );
  }

  if (mustContainAny.length > 0 && matchedAny.length === 0) {
    throw new Error(
      `Fetched body did not match any expected content markers: ${mustContainAny.join(", ")}`
    );
  }

  return { matchedAll, matchedAny, blocked };
}

function buildCurlArgs(cfg, timeoutSeconds) {
  const url = cfg.fetchUrl || cfg.urls?.[0];
  if (!url) throw new Error(`Provider ${cfg.provider} has no source URL configured`);

  const proxy = process.env.FETCH_PROXY || null;
  const headers = cfg.fetchHeaders || {};

  const curlArgs = [
    "--silent",
    "--show-error",
    "--location",
    "--compressed",
    "--max-time",
    String(timeoutSeconds),
    "-A",
    headers.userAgent || DEFAULT_USER_AGENT,
  ];

  if (proxy) {
    curlArgs.push("--proxy", proxy);
  }

  if (headers.accept) {
    curlArgs.push("-H", `accept: ${headers.accept}`);
  }
  if (headers.acceptLanguage) {
    curlArgs.push("-H", `accept-language: ${headers.acceptLanguage}`);
  }
  if (headers.upgradeInsecureRequests) {
    curlArgs.push(
      "-H",
      `upgrade-insecure-requests: ${headers.upgradeInsecureRequests}`
    );
  }

  curlArgs.push(url);
  return { curlArgs, url, proxy };
}

function run() {
  const args = parseArgs(process.argv);
  if (!args.provider) {
    usage();
    process.exit(1);
  }

  const cfg = getProviderConfig(args.provider);
  if (cfg.mode !== "fetch") {
    throw new Error(
      `Provider ${args.provider} is configured for mode=${cfg.mode}, not fetch`
    );
  }

  const timeoutSeconds =
    args.timeoutSeconds || cfg.fetchTimeoutSeconds || 60;
  const outputPath = args.outputPath || defaultOutputPath(args.provider);
  ensureDirFor(outputPath);

  const { curlArgs, url, proxy } = buildCurlArgs(cfg, timeoutSeconds);
  const result = spawnSync("curl", curlArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      `curl failed for ${args.provider} (${result.status}): ${result.stderr || result.stdout}`
    );
  }

  const body = result.stdout;
  fs.writeFileSync(outputPath, body);
  const validation = validateBody(body, cfg.fetchValidation || {});

  if (args.printSummary) {
    console.log(
      JSON.stringify(
        {
          provider: args.provider,
          mode: cfg.mode,
          url,
          proxy,
          outputPath,
          bytes: Buffer.byteLength(body, "utf8"),
          matchedAll: validation.matchedAll,
          matchedAny: validation.matchedAny,
        },
        null,
        2
      )
    );
  }
}

try {
  run();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
