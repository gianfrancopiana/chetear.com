#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadSources, REPO_ROOT } from "./provider-sync-lib.mjs";

const ASSERTIONS_PATH = path.join(
  REPO_ROOT,
  "skills/discount-sync/references/provider-smoke-assertions.json"
);

function parseArgs(argv) {
  const args = {
    providers: [],
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--provider") {
      args.providers.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (value.startsWith("--provider=")) {
      args.providers.push(value.slice("--provider=".length));
      continue;
    }
  }

  return args;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function getAssertions() {
  return JSON.parse(fs.readFileSync(ASSERTIONS_PATH, "utf8"));
}

function includesAll(haystack = [], needles = []) {
  const set = new Set(haystack);
  return needles.every((needle) => set.has(needle));
}

function textIncludes(value, includesSpec) {
  const needles = Array.isArray(includesSpec)
    ? includesSpec
    : includesSpec
      ? [includesSpec]
      : [];
  const text = normalizeText(value);
  return needles.every((needle) => text.includes(normalizeText(needle)));
}

function ruleMatches(rule, spec) {
  if (spec.merchant && rule.merchant !== spec.merchant) return false;
  if (spec.category && rule.category !== spec.category) return false;
  if (typeof spec.percent === "number" && rule.percent !== spec.percent) return false;
  if (spec.benefitType && rule.benefitType !== spec.benefitType) return false;
  if (spec.validUntil && rule.validUntil !== spec.validUntil) return false;
  if (spec.tiersIncludes && !includesAll(rule.tiers || [], spec.tiersIncludes)) return false;
  if (spec.daysIncludes && !includesAll(rule.days || [], spec.daysIncludes)) return false;
  if (spec.networksIncludes && !includesAll(rule.networks || [], spec.networksIncludes)) return false;
  if (spec.cardFamiliesIncludes && !includesAll(rule.cardFamilies || [], spec.cardFamiliesIncludes)) return false;
  if (spec.channelsIncludes && !includesAll(rule.channels || [], spec.channelsIncludes)) return false;
  if (spec.excludedAppsIncludes && !includesAll(rule.excludedApps || [], spec.excludedAppsIncludes)) return false;
  if (!textIncludes(rule.conditions, spec.conditionsIncludes)) return false;
  if (!textIncludes(rule.notes, spec.notesIncludes)) return false;
  if (!textIncludes(rule.cap, spec.capIncludes)) return false;

  return true;
}

function validateProvider(provider, rules, assertions) {
  const merchants = rules.map((rule) => rule.merchant);
  const uniqueMerchants = new Set(merchants);
  const errors = [];

  if (typeof assertions.minRules === "number" && rules.length < assertions.minRules) {
    errors.push(`rule count ${rules.length} < minRules ${assertions.minRules}`);
  }
  if (typeof assertions.maxRules === "number" && rules.length > assertions.maxRules) {
    errors.push(`rule count ${rules.length} > maxRules ${assertions.maxRules}`);
  }
  if (
    typeof assertions.minUniqueMerchants === "number" &&
    uniqueMerchants.size < assertions.minUniqueMerchants
  ) {
    errors.push(
      `unique merchant count ${uniqueMerchants.size} < minUniqueMerchants ${assertions.minUniqueMerchants}`
    );
  }
  if (
    typeof assertions.maxUniqueMerchants === "number" &&
    uniqueMerchants.size > assertions.maxUniqueMerchants
  ) {
    errors.push(
      `unique merchant count ${uniqueMerchants.size} > maxUniqueMerchants ${assertions.maxUniqueMerchants}`
    );
  }

  for (const merchant of assertions.mustContainMerchants || []) {
    if (!uniqueMerchants.has(merchant)) {
      errors.push(`missing required merchant: ${merchant}`);
    }
  }

  for (const merchant of assertions.mustNotContainMerchants || []) {
    if (uniqueMerchants.has(merchant)) {
      errors.push(`found forbidden merchant: ${merchant}`);
    }
  }

  for (const spec of assertions.mustMatchRules || []) {
    const matched = rules.some((rule) => ruleMatches(rule, spec));
    if (!matched) {
      errors.push(`missing required rule match: ${JSON.stringify(spec)}`);
    }
  }

  return {
    provider,
    rules: rules.length,
    uniqueMerchants: uniqueMerchants.size,
    ok: errors.length === 0,
    errors,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const sources = loadSources();
  const assertionsMap = getAssertions();
  const targetProviders = args.providers.length > 0 ? new Set(args.providers) : null;

  const results = [];

  for (const provider of sources) {
    if (targetProviders && !targetProviders.has(provider.provider)) {
      continue;
    }

    const assertions = assertionsMap[provider.provider];
    if (!assertions) {
      fail(`[${provider.provider}] missing smoke assertions entry`);
      continue;
    }

    const outputPath = path.join(REPO_ROOT, provider.outputPath);
    if (!fs.existsSync(outputPath)) {
      fail(`[${provider.provider}] output file does not exist: ${provider.outputPath}`);
      continue;
    }

    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (payload.provider !== provider.provider) {
      fail(`[${provider.provider}] output provider mismatch: ${payload.provider}`);
      continue;
    }

    const result = validateProvider(provider.provider, payload.rules || [], assertions);
    results.push(result);

    if (!result.ok) {
      for (const error of result.errors) {
        fail(`[${provider.provider}] ${error}`);
      }
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        providers: results,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
