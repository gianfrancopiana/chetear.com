#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const SOURCES_PATH = path.join(
  REPO_ROOT,
  "skills/discount-sync/references/provider-sources.json"
);
const SMOKE_ASSERTIONS_PATH = path.join(
  REPO_ROOT,
  "skills/discount-sync/references/provider-smoke-assertions.json"
);
const REQUIRED_METADATA = ["Source URL:", "Provider:", "Output:", "Mode:"];
const REQUIRED_SECTIONS = [
  "## Goal",
  "## Daily traversal routine",
  "## What belongs in runtime",
  "## What to skip",
  "## Source inventory",
  "## Normalization notes",
];
function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function getMetaValue(text, label) {
  const match = text.match(new RegExp(`^${label}\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

function stripBackticks(value) {
  return value ? value.replace(/^`|`$/g, "") : value;
}

function validateScopeArrays(providers) {
  /*
   * `inScope` / `outOfScope` opt the provider into the daily reconciliation
   * step. Both fields are optional, but when present each must be an array
   * of objects with a non-empty `title`. `inScope` items may carry a `note`
   * annotation; `outOfScope` items must carry a `reason`. Anything else is
   * a typo that silently disables reconciliation — fail loudly instead.
   */
  for (const entry of providers) {
    const prefix = `[${entry.provider}]`;
    const validateArray = (field, requiredAnnotationKey) => {
      const value = entry[field];
      if (value === undefined) return;
      if (!Array.isArray(value)) {
        fail(`${prefix} ${field} must be an array when present`);
        return;
      }
      for (const [i, item] of value.entries()) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          fail(`${prefix} ${field}[${i}] must be an object`);
          continue;
        }
        if (typeof item.title !== "string" || item.title.trim() === "") {
          fail(`${prefix} ${field}[${i}] missing non-empty title`);
        }
        if (
          requiredAnnotationKey &&
          (typeof item[requiredAnnotationKey] !== "string" ||
            item[requiredAnnotationKey].trim() === "")
        ) {
          fail(`${prefix} ${field}[${i}] missing non-empty ${requiredAnnotationKey}`);
        }
      }
    };
    validateArray("inScope", null);
    validateArray("outOfScope", "reason");
  }
}

function validateRuntimeNetworkInvariants(providers) {
  const providersWithLegacyVpnMetadata = providers
    .filter(
      (entry) =>
        Object.prototype.hasOwnProperty.call(entry, "requiresVpn") ||
        Object.prototype.hasOwnProperty.call(entry, "vpnRegion") ||
        Object.prototype.hasOwnProperty.call(entry, "fetchProxy")
    )
    .map((entry) => entry.provider);

  if (providersWithLegacyVpnMetadata.length > 0) {
    fail(
      `[runtime] remove legacy geo-routing/proxy metadata from provider-sources.json: ${providersWithLegacyVpnMetadata.join(", ")}`
    );
  }

  const invalidModes = providers
    .filter((entry) => !["browser", "fetch"].includes(entry.mode))
    .map((entry) => `${entry.provider}:${entry.mode}`);

  if (invalidModes.length > 0) {
    fail(
      `[runtime] unsupported provider mode(s): ${invalidModes.join(", ")}`
    );
  }

}

function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const providers = Array.isArray(sources) ? sources : [];
  const smokeAssertions = fs.existsSync(SMOKE_ASSERTIONS_PATH)
    ? JSON.parse(fs.readFileSync(SMOKE_ASSERTIONS_PATH, "utf8"))
    : null;

  if (!smokeAssertions) {
    fail(`[runtime] provider smoke assertions file not found: ${SMOKE_ASSERTIONS_PATH}`);
  }

  validateRuntimeNetworkInvariants(providers);
  validateScopeArrays(providers);

  for (const entry of providers) {
    const prefix = `[${entry.provider}]`;

    if (!entry.blueprintPath) {
      fail(`${prefix} missing blueprintPath in provider-sources.json`);
      continue;
    }

    const blueprintPath = path.join(REPO_ROOT, entry.blueprintPath);
    if (!fs.existsSync(blueprintPath)) {
      fail(`${prefix} blueprint file does not exist: ${entry.blueprintPath}`);
      continue;
    }

    if (!fs.existsSync(path.join(REPO_ROOT, entry.outputPath))) {
      fail(`${prefix} output file does not exist: ${entry.outputPath}`);
    }

    if (entry.syncScriptPath) {
      const syncScriptPath = path.join(REPO_ROOT, entry.syncScriptPath);
      if (!fs.existsSync(syncScriptPath)) {
        fail(`${prefix} sync script does not exist: ${entry.syncScriptPath}`);
      }
    }

    if (!smokeAssertions?.[entry.provider]) {
      fail(`${prefix} missing smoke assertions entry in provider-smoke-assertions.json`);
    }

    const text = fs.readFileSync(blueprintPath, "utf8");

    for (const field of REQUIRED_METADATA) {
      if (!text.includes(field)) {
        fail(`${prefix} blueprint missing metadata field: ${field}`);
      }
    }

    for (const section of REQUIRED_SECTIONS) {
      if (!text.includes(section)) {
        fail(`${prefix} blueprint missing section: ${section}`);
      }
    }

    const sourceUrl = stripBackticks(getMetaValue(text, "Source URL:"));
    const provider = stripBackticks(getMetaValue(text, "Provider:"));
    const output = stripBackticks(getMetaValue(text, "Output:"));
    const mode = stripBackticks(getMetaValue(text, "Mode:"));
    const expectedMode = entry.mode === "fetch" ? "fetch" : "browser-first";

    if (sourceUrl !== entry.urls?.[0]) {
      fail(`${prefix} blueprint Source URL mismatch: ${sourceUrl} !== ${entry.urls?.[0]}`);
    }
    if (provider !== entry.provider) {
      fail(`${prefix} blueprint Provider mismatch: ${provider} !== ${entry.provider}`);
    }
    if (output !== entry.outputPath) {
      fail(`${prefix} blueprint Output mismatch: ${output} !== ${entry.outputPath}`);
    }
    if (mode !== expectedMode) {
      fail(`${prefix} blueprint Mode mismatch: ${mode} !== ${expectedMode}`);
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }

  console.log(
    `Validated ${providers.length} provider blueprints, smoke assertions, and runtime network invariants successfully.`
  );
}

main();
