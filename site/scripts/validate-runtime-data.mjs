#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const SITE_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(SITE_ROOT, "..");
const DATA_ROOT = path.join(SITE_ROOT, "src", "data");
const DISCOUNTS_DIR = path.join(DATA_ROOT, "discounts");
const MERCHANT_DIRECTORIES_DIR = path.join(DATA_ROOT, "merchant-directories");
const PRICES_PATH = path.join(DATA_ROOT, "prices", "chain-prices.json");
const CACHE_PATH = path.join(REPO_ROOT, ".hermes", "validate-runtime-data-cache.json");
const VALIDATOR_VERSION = crypto.createHash("sha1").update(fs.readFileSync(SCRIPT_PATH, "utf8")).digest("hex");

const args = new Set(process.argv.slice(2));
const validateDiscounts = !args.has("--prices-only");
const validatePrices = !args.has("--discounts-only");

const PROVIDER_LABELS = {
  itau: "Itau",
  santander: "Santander",
  bbva: "BBVA",
  scotiabank: "Scotiabank",
  brou: "BROU",
  oca: "OCA",
  "oca-blue": "OCA Blue",
  cabal: "Cabal",
  passcard: "Passcard",
  creditel: "Creditel",
  prex: "Prex",
  mercadopago: "MercadoPago",
  midinero: "miDinero",
  antel: "Antel",
  movistar: "Movistar",
  claro: "Claro",
  "club-el-pais": "Club El País",
  anda: "ANDA",
  "la-diaria": "la diaria",
  "tarjeta-joven": "Tarjeta Joven",
};

const Provider = z.enum(Object.keys(PROVIDER_LABELS));
const DayOfWeek = z.enum([
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
]);
const CardNetwork = z.enum(["visa", "mastercard", "amex", "oca", "cabal", "passcard"]);
const CardTier = z.enum([
  "todas",
  "green",
  "gold",
  "platinum",
  "black",
  "infinite",
  "signature",
]);
const Category = z.enum([
  "supermercado",
  "restaurante",
  "farmacia",
  "combustible",
  "indumentaria",
  "electronica",
  "hogar",
  "salud",
  "entretenimiento",
  "viajes",
  "educacion",
  "otros",
]);

const Channel = z.enum(["in-store", "online", "phone"]);
const ExcludedApp = z.enum([
  "mercado-pago",
  "mercado-libre",
  "handy",
  "pedidos-ya",
  "rappi",
]);
const RefundType = z.enum(["point-of-sale", "statement-credit", "split"]);
const BenefitType = z.enum([
  "discount",
  "iva-points",
  "2-for-1",
  "installments",
  "gift",
]);

const DiscountRule = z
  .object({
    id: z.string().min(1).optional(),
    merchant: z.string().min(1),
    category: Category,
    percent: z.number().min(0).max(100),
    benefitType: BenefitType.optional(),
    tiers: z.array(CardTier).optional(),
    networks: z.array(CardNetwork).optional(),
    cardFamilies: z.array(z.string().min(1)).optional(),
    channels: z.array(Channel).optional(),
    excludedApps: z.array(ExcludedApp).optional(),
    stackable: z.boolean().optional(),
    refundType: RefundType.optional(),
    days: z.array(DayOfWeek).optional(),
    cap: z.string().min(1).optional(),
    validUntil: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

const ProviderDiscounts = z
  .object({
    provider: Provider,
    label: z.string().min(1),
    rules: z.array(DiscountRule),
  })
  .strict();

const MerchantListMerchant = z
  .object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    location: z.string().min(1).optional(),
  })
  .strict();

const MerchantList = z
  .object({
    id: z.string().min(1),
    ruleIds: z.array(z.string().min(1)).optional(),
    sourceUrls: z.array(z.string().url()).min(1),
    merchants: z.array(MerchantListMerchant).min(1),
  })
  .strict();

const ProviderMerchantLists = z
  .object({
    provider: Provider,
    label: z.string().min(1),
    lists: z.array(MerchantList),
  })
  .strict();

const PriceChain = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const PriceByChain = z
  .object({
    chainId: z.string().min(1),
    price: z.number().nonnegative(),
    offer: z.boolean(),
    date: z.string().min(1).optional().nullable(),
    storeId: z.number().int().nonnegative(),
  })
  .strict();

const PriceItem = z
  .object({
    id: z.number().int().nonnegative(),
    name: z.string().min(1),
    unit: z.string(),
    updatedAt: z.string().min(1).optional().nullable(),
    bestByChain: z.array(PriceByChain).min(1),
  })
  .strict();

const PricePayload = z
  .object({
    generatedAt: z.string().min(1),
    source: z
      .object({
        baseUrl: z.string().url(),
        bbox: z
          .object({
            v1: z.number(),
            v2: z.number(),
            v3: z.number(),
            v4: z.number(),
          })
          .strict(),
      })
      .strict(),
    counts: z
      .object({
        articles: z.number().int().nonnegative(),
        establishments: z.number().int().nonnegative(),
      })
      .strict(),
    chains: z.array(PriceChain),
    items: z.array(PriceItem),
  })
  .strict();

function listJsonFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .sort();
}

function hashText(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function getFileSignatureFromStat(stat) {
  const size = typeof stat.size === "bigint" ? stat.size.toString() : String(stat.size);
  const mtime =
    typeof stat.mtimeNs === "bigint" ? stat.mtimeNs.toString() : String(Math.trunc(stat.mtimeMs * 1e6));
  const ctime =
    typeof stat.ctimeNs === "bigint" ? stat.ctimeNs.toString() : String(Math.trunc(stat.ctimeMs * 1e6));
  return `${size}:${mtime}:${ctime}`;
}

function getFileSignature(filePath) {
  try {
    return getFileSignatureFromStat(fs.statSync(filePath, { bigint: true }));
  } catch {
    return null;
  }
}

function loadValidationCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    if (
      parsed &&
      parsed.version === VALIDATOR_VERSION &&
      parsed.files &&
      typeof parsed.files === "object" &&
      !Array.isArray(parsed.files)
    ) {
      return {
        version: parsed.version,
        files: parsed.files,
        dirty: false,
      };
    }
  } catch {
    // Ignore cache read/parse failures.
  }

  return {
    version: VALIDATOR_VERSION,
    files: {},
    dirty: false,
  };
}

function saveValidationCache(cache) {
  if (!cache.dirty) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const tempPath = `${CACHE_PATH}.tmp`;
    fs.writeFileSync(
      tempPath,
      JSON.stringify({
        version: cache.version,
        files: cache.files,
      }),
      "utf8"
    );
    fs.renameSync(tempPath, CACHE_PATH);
  } catch {
    // Cache is a performance optimization only; ignore write failures.
  }
}

function getCacheKey(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function getCachedFileAnalysis(cache, filePath, analyze) {
  const cacheKey = getCacheKey(filePath);
  let bucket = cache.files[cacheKey] || null;
  let signature = null;

  if (
    bucket?.latest?.signature &&
    bucket?.latest?.contentHash &&
    bucket?.entries &&
    typeof bucket.entries === "object" &&
    !Array.isArray(bucket.entries)
  ) {
    signature = getFileSignature(filePath);
    if (signature === bucket.latest.signature) {
      const cachedAnalysis = bucket.entries[bucket.latest.contentHash];
      if (cachedAnalysis) {
        return cachedAnalysis;
      }
    }
  }

  const raw = fs.readFileSync(filePath, "utf8");
  signature ||= getFileSignature(filePath);
  const contentHash = hashText(raw);

  if (!bucket || !bucket.entries || Array.isArray(bucket.entries)) {
    bucket = {
      entries: {},
      latest: null,
    };
  }

  if (Object.prototype.hasOwnProperty.call(bucket.entries, contentHash)) {
    if (
      bucket.latest?.signature !== signature ||
      bucket.latest?.contentHash !== contentHash
    ) {
      bucket.latest = {
        signature,
        contentHash,
      };
      cache.files[cacheKey] = bucket;
      cache.dirty = true;
    }
    return bucket.entries[contentHash];
  }

  const analysis = analyze(filePath, raw);
  bucket.entries[contentHash] = analysis;
  bucket.latest = {
    signature,
    contentHash,
  };
  cache.files[cacheKey] = bucket;
  cache.dirty = true;
  return analysis;
}

function readJsonFromText(filePath, raw) {
  try {
    return {
      ok: true,
      data: JSON.parse(raw),
    };
  } catch (error) {
    return {
      ok: false,
      errors: [`${path.relative(SITE_ROOT, filePath)}: invalid JSON: ${error.message}`],
    };
  }
}

function getZodErrors(filePath, parseResult) {
  return parseResult.error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path.relative(SITE_ROOT, filePath)}: ${field}: ${issue.message}`;
  });
}

function findDuplicates(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  if (year < 100) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }

  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= maxDay;
}

function isValidIsoDate(value) {
  const isoDateMatch = ISO_DATE_PATTERN.exec(value);
  if (!isoDateMatch) {
    return false;
  }

  const [, yearText, monthText, dayText] = isoDateMatch;
  return isValidCalendarDate(Number(yearText), Number(monthText), Number(dayText));
}

function isValidLocalCalendarDate(value) {
  const localDateMatch = LOCAL_DATE_PATTERN.exec(value);
  if (!localDateMatch) {
    return false;
  }

  const [, dayText, monthText, yearText] = localDateMatch;
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  return isValidCalendarDate(year, Number(monthText), Number(dayText));
}

function isValidDateLike(value) {
  const isoDateMatch = ISO_DATE_PATTERN.exec(value);
  if (isoDateMatch) {
    const [, yearText, monthText, dayText] = isoDateMatch;
    return isValidCalendarDate(Number(yearText), Number(monthText), Number(dayText));
  }

  const localDateMatch = LOCAL_DATE_PATTERN.exec(value);
  if (localDateMatch) {
    const [, dayText, monthText, yearText] = localDateMatch;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    return isValidCalendarDate(year, Number(monthText), Number(dayText));
  }

  return !Number.isNaN(Date.parse(value));
}

function normalizeOptionalText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("es-UY");
}

function findAmbiguousDuplicateMerchantNames(merchants) {
  const merchantsByName = new Map();
  for (const merchant of merchants) {
    const normalizedName = normalizeOptionalText(merchant.name);
    const bucket = merchantsByName.get(normalizedName) || [];
    bucket.push(merchant);
    merchantsByName.set(normalizedName, bucket);
  }

  const conflicts = [];
  for (const entries of merchantsByName.values()) {
    if (entries.length < 2) {
      continue;
    }

    const normalizedLocations = entries
      .map((merchant) => normalizeOptionalText(merchant.location))
      .filter(Boolean);
    const hasExplicitUniqueLocations =
      normalizedLocations.length === entries.length && new Set(normalizedLocations).size === entries.length;

    if (!hasExplicitUniqueLocations) {
      conflicts.push(entries[0].name);
    }
  }

  return conflicts;
}

function getProviderLabelError(filePath, provider, label) {
  const expectedLabel = PROVIDER_LABELS[provider];
  if (label !== expectedLabel) {
    return `${path.relative(SITE_ROOT, filePath)}: label mismatch for ${provider}: expected \"${expectedLabel}\", got \"${label}\"`;
  }
  return null;
}

const TWO_FOR_ONE_PATTERN = /\b2\s*[x×]\s*1\b|\b2\s+por\s+1\b|\bdos\s+por\s+uno\b/iu;

function hasTwoForOneText(rule) {
  return [rule.merchant, rule.notes].some((value) => TWO_FOR_ONE_PATTERN.test(String(value ?? "")));
}

function ruleDisplayName(rule, index) {
  return rule.id || `${rule.merchant} #${index + 1}`;
}

/*
 * Closed allow-list of cardFamilies per provider. Source of truth: the
 * issuer's "todas las tarjetas" page combined with the segment/pack vocabulary
 * the source uses on its discount pages. Anything not in this list is a
 * suspected phantom (the "Crédito Oro" case for Santander). When a new family
 * shows up at the source, add it here in the same PR as the data update —
 * never let the data file silently introduce an unknown family.
 *
 * Providers that don't use cardFamilies at all (antel, prex, club-el-pais)
 * get an empty array so the validator still rejects accidental additions.
 */
const PROVIDER_CARD_FAMILIES = {
  santander: ["Farmacard", "Private Banking", "Select"],
  bbva: [
    "BBVA Club Nacional de Football",
    "Corporativas",
    "Internacional",
    "Oro",
    "Platinum",
    "Pymes",
  ],
  scotiabank: ["Club Card", "Débito Premium", "The Platinum Card"],
  itau: ["Junior", "Personal Bank", "Volar"],
  oca: ["OCA Blue"],
  brou: ["Recompensa"],
  antel: [],
  "club-el-pais": [],
  prex: [],
};

function getCardFamilyErrors(relativePath, provider, rules) {
  const allowed = PROVIDER_CARD_FAMILIES[provider];
  const allowedSet = allowed ? new Set(allowed) : null;
  const errors = [];
  rules.forEach((rule, index) => {
    if (!rule.cardFamilies?.length) return;
    const displayName = ruleDisplayName(rule, index);
    if (!allowedSet) {
      errors.push(
        `${relativePath}: rule ${displayName} declares cardFamilies but provider ${provider} has no PROVIDER_CARD_FAMILIES entry in scripts/validate-runtime-data.mjs; add one (use [] if the provider truly has no families)`
      );
      return;
    }
    for (const family of rule.cardFamilies) {
      if (!allowedSet.has(family)) {
        const list = allowed.length > 0 ? allowed.join(", ") : "(none — provider has no cardFamilies)";
        errors.push(
          `${relativePath}: rule ${displayName} uses unknown cardFamily ${JSON.stringify(family)} for provider ${provider}; known families: ${list}. If the source legitimately introduced a new family, add it to PROVIDER_CARD_FAMILIES in the same change.`
        );
      }
    }
  });
  return errors;
}

/*
 * Notes hygiene: catches the patterns we cleaned up so they don't regress.
 * Mirrors the "Hard rules" section of skills/discount-sync/references/conditions-extraction.md.
 *
 * - Garbled `; sin` tails are import artifacts from the legacy BBVA scraper.
 * - "no acumulable" copy duplicates `stackable: false` (the "Acumulable: No" row already shows it).
 * - "2x1" / "2×1" notes duplicate `benefitType: "2-for-1"` (the chip already shows it).
 * - "Hasta DD/MM/YYYY" duplicates `validUntil`.
 * - "Todos los días" duplicates the absence of `days`.
 * - "Tope …" duplicates `cap`.
 * - "No aplica Mercado Pago / Handy / etc." duplicates `excludedApps`.
 */
const GARBLED_TAIL_PATTERN = /;\s*sin\s*("|$)/i;
const GARBLED_NO_APLICA_PATTERN = /;\s*sin No aplica/i;
const NO_ACUMULABLE_PATTERN = /\bno\s+(?:es\s+)?acumulable\s+con\s+otra/i;
const TODOS_LOS_DIAS_PATTERN = /\btodos\s+los\s+d[ií]as\b/i;
const HASTA_DATE_PATTERN = /\bhasta\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i;
const TOPE_PATTERN = /\btope\s+\$/i;
const STANDALONE_2X1_PATTERN = /^2\s*[x×]\s*1\.?$/i;
/*
 * Verbs that flag exclusion context for the excludedApps check. "sin" is
 * deliberately excluded — it appears in unrelated prose ("sin recargo",
 * "sin intereses") and would false-positive any rule that mentions an app
 * by name. The real exclusion verbs are "no aplica" and "excluye".
 */
const EXCLUSION_VERB_PATTERN = /no\s+aplica|excluye/i;
const EXCLUDED_APP_NOTE_PATTERN = {
  "mercado-pago": /mercado\s*pago/i,
  "mercado-libre": /mercado\s*libre/i,
  handy: /\bhandy\b/i,
  "pedidos-ya": /pedidos\s*ya/i,
  rappi: /\brappi\b/i,
};

function getNoteHygieneErrors(relativePath, rules) {
  const errors = [];
  rules.forEach((rule, index) => {
    const notes = rule.notes;
    if (!notes) return;
    const displayName = ruleDisplayName(rule, index);

    if (GARBLED_NO_APLICA_PATTERN.test(notes) || GARBLED_TAIL_PATTERN.test(notes)) {
      errors.push(
        `${relativePath}: rule ${displayName} notes end in a garbled "; sin" / "; sin No aplica" tail (data-import artifact); strip the tail or move the real content into the matching structured field`
      );
    }

    if (rule.stackable === false && NO_ACUMULABLE_PATTERN.test(notes)) {
      errors.push(
        `${relativePath}: rule ${displayName} notes restate "no acumulable…" while stackable=false is already set; drop from notes — the "Acumulable: No" row already conveys it`
      );
    }

    if (rule.benefitType === "2-for-1" && STANDALONE_2X1_PATTERN.test(notes.trim())) {
      errors.push(
        `${relativePath}: rule ${displayName} notes are just "2x1" while benefitType is "2-for-1"; drop the notes (the chip already shows it) or replace with venue/date residue`
      );
    }

    if (rule.validUntil && HASTA_DATE_PATTERN.test(notes)) {
      errors.push(
        `${relativePath}: rule ${displayName} notes restate the validity date while validUntil is set; drop "Hasta DD/MM/YYYY" — the "Vigencia" row already shows it`
      );
    }

    if (TODOS_LOS_DIAS_PATTERN.test(notes) && (!rule.days || rule.days.length === 7)) {
      errors.push(
        `${relativePath}: rule ${displayName} notes say "Todos los días" while days is empty/all-seven; drop — the day strip already conveys it`
      );
    }

    if (rule.cap && TOPE_PATTERN.test(notes)) {
      errors.push(
        `${relativePath}: rule ${displayName} notes restate "Tope $…" while cap is set; the "Tope" row already shows it`
      );
    }

    if (rule.excludedApps?.length && EXCLUSION_VERB_PATTERN.test(notes)) {
      for (const app of rule.excludedApps) {
        const pattern = EXCLUDED_APP_NOTE_PATTERN[app];
        if (pattern && pattern.test(notes)) {
          errors.push(
            `${relativePath}: rule ${displayName} notes mention "${app}" exclusion while excludedApps already includes it; drop from notes — the "Excluye" row already shows it`
          );
          break;
        }
      }
    }
  });
  return errors;
}

function getBenefitTypeErrors(relativePath, rules) {
  const errors = [];
  rules.forEach((rule, index) => {
    const displayName = ruleDisplayName(rule, index);
    if (hasTwoForOneText(rule) && rule.benefitType !== "2-for-1") {
      errors.push(
        `${relativePath}: rule ${displayName} mentions 2x1/2 por 1 but benefitType is ${JSON.stringify(rule.benefitType ?? "discount")}; set benefitType to \"2-for-1\" so it does not render as a 50% discount`
      );
    }
    if (rule.benefitType === "2-for-1" && rule.percent !== 50) {
      errors.push(
        `${relativePath}: rule ${displayName} has benefitType \"2-for-1\" but percent ${rule.percent}; keep percent 50 for sorting/value semantics`
      );
    }
    if (rule.percent === 0 && (rule.benefitType ?? "discount") === "discount") {
      errors.push(
        `${relativePath}: rule ${displayName} has percent 0 but benefitType is ${JSON.stringify(rule.benefitType ?? "discount")}; a 0% discount is meaningless — set benefitType to "gift", "installments", or "2-for-1" depending on the mechanic (see skills/discount-sync/references/conditions-extraction.md)`
      );
    }
  });
  return errors;
}

function analyzeDiscountFile(filePath, raw) {
  const jsonResult = readJsonFromText(filePath, raw);
  if (!jsonResult.ok) {
    return {
      kind: "discount",
      relativePath: path.relative(SITE_ROOT, filePath),
      zodErrors: jsonResult.errors,
      provider: null,
      filenameError: null,
      labelError: null,
      duplicateRuleIds: [],
      validUntilErrors: [],
      benefitTypeErrors: [],
      cardFamilyErrors: [],
      noteHygieneErrors: [],
      ruleIds: [],
    };
  }

  const parsed = ProviderDiscounts.safeParse(jsonResult.data);
  if (!parsed.success) {
    return {
      kind: "discount",
      relativePath: path.relative(SITE_ROOT, filePath),
      zodErrors: getZodErrors(filePath, parsed),
      provider: null,
      filenameError: null,
      labelError: null,
      duplicateRuleIds: [],
      validUntilErrors: [],
      benefitTypeErrors: [],
      cardFamilyErrors: [],
      noteHygieneErrors: [],
      ruleIds: [],
    };
  }

  const payload = parsed.data;
  const relativePath = path.relative(SITE_ROOT, filePath);
  const expectedFileName = `${payload.provider}.json`;
  const filenameError =
    path.basename(filePath) !== expectedFileName
      ? `${relativePath}: filename should match provider (${expectedFileName})`
      : null;
  const ruleIds = payload.rules.map((rule) => rule.id).filter(Boolean);

  return {
    kind: "discount",
    relativePath,
    zodErrors: [],
    provider: payload.provider,
    filenameError,
    labelError: getProviderLabelError(filePath, payload.provider, payload.label),
    duplicateRuleIds: findDuplicates(ruleIds),
    validUntilErrors: payload.rules
      .filter((rule) => rule.validUntil && !isValidIsoDate(rule.validUntil))
      .map(
        (rule) =>
          `${relativePath}: rule ${rule.id || rule.merchant} has invalid validUntil: ${rule.validUntil}`
      ),
    benefitTypeErrors: getBenefitTypeErrors(relativePath, payload.rules),
    cardFamilyErrors: getCardFamilyErrors(relativePath, payload.provider, payload.rules),
    noteHygieneErrors: getNoteHygieneErrors(relativePath, payload.rules),
    ruleIds,
  };
}

function analyzeMerchantDirectoryFile(filePath, raw) {
  const jsonResult = readJsonFromText(filePath, raw);
  if (!jsonResult.ok) {
    return {
      kind: "merchant-directory",
      relativePath: path.relative(SITE_ROOT, filePath),
      zodErrors: jsonResult.errors,
      provider: null,
      filenameError: null,
      labelError: null,
      duplicateListIds: [],
      lists: [],
    };
  }

  const parsed = ProviderMerchantLists.safeParse(jsonResult.data);
  if (!parsed.success) {
    return {
      kind: "merchant-directory",
      relativePath: path.relative(SITE_ROOT, filePath),
      zodErrors: getZodErrors(filePath, parsed),
      provider: null,
      filenameError: null,
      labelError: null,
      duplicateListIds: [],
      lists: [],
    };
  }

  const payload = parsed.data;
  const relativePath = path.relative(SITE_ROOT, filePath);
  const expectedFileName = `${payload.provider}.json`;
  const filenameError =
    path.basename(filePath) !== expectedFileName
      ? `${relativePath}: filename should match provider (${expectedFileName})`
      : null;

  return {
    kind: "merchant-directory",
    relativePath,
    zodErrors: [],
    provider: payload.provider,
    filenameError,
    labelError: getProviderLabelError(filePath, payload.provider, payload.label),
    duplicateListIds: findDuplicates(payload.lists.map((list) => list.id)),
    lists: payload.lists.map((list) => ({
      id: list.id,
      ruleIds: list.ruleIds || [],
      duplicateRuleIds: findDuplicates(list.ruleIds || []),
      duplicateMerchantNames: findAmbiguousDuplicateMerchantNames(list.merchants),
    })),
  };
}

function analyzePriceFile(filePath, raw) {
  const jsonResult = readJsonFromText(filePath, raw);
  if (!jsonResult.ok) {
    return {
      kind: "prices",
      errors: jsonResult.errors,
      summary: null,
    };
  }

  const parsed = PricePayload.safeParse(jsonResult.data);
  if (!parsed.success) {
    return {
      kind: "prices",
      errors: getZodErrors(filePath, parsed),
      summary: null,
    };
  }

  const payload = parsed.data;
  const errors = [];
  const knownChainIds = new Set();
  const duplicateChainIds = new Set();

  for (const chain of payload.chains) {
    if (knownChainIds.has(chain.id)) {
      duplicateChainIds.add(chain.id);
    }
    knownChainIds.add(chain.id);
  }

  if (duplicateChainIds.size > 0) {
    errors.push(
      `src/data/prices/chain-prices.json: duplicate chain ids: ${[...duplicateChainIds].join(", ")}`
    );
  }

  const seenItemIds = new Set();
  const duplicateItemIds = new Set();
  for (const item of payload.items) {
    if (seenItemIds.has(item.id)) {
      duplicateItemIds.add(item.id);
    }
    seenItemIds.add(item.id);
  }

  if (duplicateItemIds.size > 0) {
    errors.push(`src/data/prices/chain-prices.json: duplicate item ids: ${[...duplicateItemIds].join(", ")}`);
  }

  if (!isValidDateLike(payload.generatedAt)) {
    errors.push(`src/data/prices/chain-prices.json: generatedAt is not a valid date: ${payload.generatedAt}`);
  }

  for (const item of payload.items) {
    if (item.updatedAt && !isValidDateLike(item.updatedAt)) {
      errors.push(`src/data/prices/chain-prices.json: item ${item.id} has invalid updatedAt: ${item.updatedAt}`);
    }

    const seenBestByChainIds = new Set();
    const duplicateBestByChainIds = new Set();

    for (const row of item.bestByChain) {
      if (seenBestByChainIds.has(row.chainId)) {
        duplicateBestByChainIds.add(row.chainId);
      }
      seenBestByChainIds.add(row.chainId);

      if (!knownChainIds.has(row.chainId)) {
        errors.push(`src/data/prices/chain-prices.json: item ${item.id} references missing chainId ${row.chainId}`);
      }
      if (row.date && !isValidDateLike(row.date)) {
        errors.push(`src/data/prices/chain-prices.json: item ${item.id} row ${row.chainId} has invalid date: ${row.date}`);
      }
    }

    if (duplicateBestByChainIds.size > 0) {
      errors.push(
        `src/data/prices/chain-prices.json: item ${item.id} repeats chainIds in bestByChain: ${[...duplicateBestByChainIds].join(", ")}`
      );
    }
  }

  return {
    kind: "prices",
    errors,
    summary: {
      chainCount: payload.chains.length,
      itemCount: payload.items.length,
    },
  };
}

function validateDiscountData(errors, cache) {
  const discountFiles = listJsonFiles(DISCOUNTS_DIR);
  const merchantDirectoryFiles = listJsonFiles(MERCHANT_DIRECTORIES_DIR);
  const providerRuleIds = new Map();
  const seenProviders = new Set();

  const discountAnalyses = discountFiles.map((file) =>
    getCachedFileAnalysis(cache, path.join(DISCOUNTS_DIR, file), analyzeDiscountFile)
  );
  const merchantDirectoryAnalyses = merchantDirectoryFiles.map((file) =>
    getCachedFileAnalysis(cache, path.join(MERCHANT_DIRECTORIES_DIR, file), analyzeMerchantDirectoryFile)
  );

  for (const analysis of discountAnalyses) {
    errors.push(...analysis.zodErrors);
    if (analysis.zodErrors.length > 0) {
      continue;
    }

    if (analysis.filenameError) {
      errors.push(analysis.filenameError);
    }

    if (seenProviders.has(analysis.provider)) {
      errors.push(`${analysis.relativePath}: duplicate provider file for ${analysis.provider}`);
      continue;
    }
    seenProviders.add(analysis.provider);

    if (analysis.labelError) {
      errors.push(analysis.labelError);
    }

    if (analysis.duplicateRuleIds.length > 0) {
      errors.push(`${analysis.relativePath}: duplicate rule ids: ${analysis.duplicateRuleIds.join(", ")}`);
    }

    errors.push(...analysis.validUntilErrors);
    errors.push(...analysis.benefitTypeErrors);
    errors.push(...analysis.cardFamilyErrors);
    errors.push(...analysis.noteHygieneErrors);
    providerRuleIds.set(analysis.provider, new Set(analysis.ruleIds));
  }

  for (const analysis of merchantDirectoryAnalyses) {
    errors.push(...analysis.zodErrors);
    if (analysis.zodErrors.length > 0) {
      continue;
    }

    if (analysis.filenameError) {
      errors.push(analysis.filenameError);
    }

    if (analysis.labelError) {
      errors.push(analysis.labelError);
    }

    if (!providerRuleIds.has(analysis.provider)) {
      errors.push(
        `${analysis.relativePath}: merchant directory provider ${analysis.provider} has no matching discount file`
      );
      continue;
    }

    if (analysis.duplicateListIds.length > 0) {
      errors.push(`${analysis.relativePath}: duplicate merchant list ids: ${analysis.duplicateListIds.join(", ")}`);
    }

    const knownRuleIds = providerRuleIds.get(analysis.provider);
    for (const list of analysis.lists) {
      if (list.duplicateRuleIds.length > 0) {
        errors.push(`${analysis.relativePath}: list ${list.id} repeats ruleIds: ${list.duplicateRuleIds.join(", ")}`);
      }

      if (list.duplicateMerchantNames.length > 0) {
        errors.push(
          `${analysis.relativePath}: list ${list.id} repeats merchant names without distinct locations: ${list.duplicateMerchantNames.join(", ")}`
        );
      }

      for (const ruleId of list.ruleIds) {
        if (!knownRuleIds.has(ruleId)) {
          errors.push(`${analysis.relativePath}: list ${list.id} references missing ruleId ${ruleId}`);
        }
      }
    }
  }

  return {
    discountFiles: discountFiles.length,
    merchantDirectoryFiles: merchantDirectoryFiles.length,
  };
}

function validatePriceData(errors, cache) {
  const analysis = getCachedFileAnalysis(cache, PRICES_PATH, analyzePriceFile);
  errors.push(...analysis.errors);
  return analysis.summary;
}

function main() {
  const cache = loadValidationCache();
  const errors = [];
  const summary = {};

  if (validateDiscounts) {
    summary.discounts = validateDiscountData(errors, cache);
  }

  if (validatePrices) {
    summary.prices = validatePriceData(errors, cache);
  }

  saveValidationCache(cache);

  if (errors.length > 0) {
    console.error("Runtime data validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary,
      },
      null,
      2
    )
  );
}

main();
