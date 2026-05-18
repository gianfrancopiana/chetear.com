#!/usr/bin/env node
/*
 * One-shot migration: parse each rule's free-text `conditions` into the
 * new structured fields (`channels`, `excludedApps`, `stackable`,
 * `refundType`, optionally `cap`) and store the leftover as `notes`.
 *
 * The script is conservative: anything it can't recognise stays in
 * `notes` verbatim. Tier and day info is left alone because both are
 * already structured on the rule.
 *
 * Run with: node site/scripts/migrate-conditions.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const discountsDir = path.resolve(here, "../src/data/discounts");

const APP_PATTERNS = [
  { token: "mercado-pago", re: /mercado\s*pago/i },
  { token: "mercado-libre", re: /mercado\s*libre/i },
  { token: "handy", re: /\bhandy\b/i },
  { token: "pedidos-ya", re: /pedidos\s*ya/i },
  { token: "rappi", re: /\brappi\b/i },
];

/*
 * Card families & segments that don't fit the global tier ladder. Each
 * pattern's `re` matches the source text; on match we add the canonical
 * `name` to `cardFamilies`. Order matters — longer patterns first so
 * "Débito Premium" is matched before "Premium".
 */
const FAMILY_PATTERNS = [
  { name: "Personal Bank", re: /personal\s+bank/i },
  { name: "Débito Premium", re: /d[ée]bito\s+premium/i },
  { name: "Recompensa", re: /\brecompensa\b/i },
  { name: "Volar", re: /d[ée]bito\s+volar|\bvolar\b/i },
  { name: "Junior", re: /\bjunior\b/i },
  { name: "Select", re: /\bselect\b/i },
  { name: "Private Banking", re: /private\s+banking/i },
  { name: "Farmacard", re: /\bfarmacard\b/i },
  { name: "OCA Blue", re: /oca\s+blue/i },
  { name: "Pymes", re: /\bpymes\b/i },
  { name: "Corporativas", re: /\bcorporativas\b/i },
  { name: "Internacional", re: /\binternacional\b/i },
  { name: "Oro", re: /\boro\b/i },
];

/*
 * Tier vocabulary the renderer knows about — used to detect "Crédito X"
 * sentences that are pure tier restatements and can be dropped from
 * notes once `tiers` covers them.
 */
const TIER_WORDS = [
  "platinum",
  "infinite",
  "black",
  "gold",
  "green",
  "signature",
  "oro",
  "standard",
];

const NETWORK_PATTERNS = [
  { token: "visa", re: /\bvisa\b/i },
  { token: "mastercard", re: /\bmastercard\b/i },
  { token: "amex", re: /\b(amex|american\s+express)\b/i },
  { token: "oca", re: /\boca\b/i },
  { token: "cabal", re: /\bcabal\b/i },
  { token: "passcard", re: /\bpasscard\b/i },
];

function trimResidue(s) {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;·]+/, "")
    .replace(/[\s,.;·]+$/, "")
    .trim();
}

function extractExcludedApps(text) {
  // "No aplica Mercado Pago, Mercado Libre ni Handy" — and variants.
  // Web is a channel, not an app; ignore it here.
  const apps = new Set();
  const matches = text.match(/No aplica[^.]*/gi) || [];
  for (const m of matches) {
    for (const { token, re } of APP_PATTERNS) {
      if (re.test(m)) apps.add(token);
    }
  }
  return [...apps];
}

function stripExcludedAppsClauses(text, apps) {
  if (apps.length === 0) return text;
  // Strip "No aplica X, Y ni Z." / "No aplica X." clauses — but only when
  // every name in the clause maps to a known app (so we don't lose
  // "No aplica web", "No aplica Cuenta Pocket", etc.).
  return text.replace(/No aplica([^.]*)\.?/gi, (match, body) => {
    const trimmed = body.trim();
    // Split on commas, "ni", "y" — check whether every token is a known app.
    const tokens = trimmed
      .split(/,|\sni\s|\sy\s/i)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return match;
    const allKnown = tokens.every((t) =>
      APP_PATTERNS.some(({ re }) => re.test(t)),
    );
    return allKnown ? "" : match;
  });
}

function extractStackable(text) {
  // "No acumulable …" / "Acumulable …" — boolean signal.
  if (/no\s+acumulable/i.test(text)) return false;
  if (/\bacumulable\b/i.test(text)) return true;
  return undefined;
}

function stripStackableClause(text) {
  return text
    .replace(/no\s+acumulable[^.]*\.?/gi, "")
    .replace(/\bacumulable[^.]*\.?/gi, "");
}

function extractRefundType(text) {
  const hasPoS =
    /punto de venta|momento de la compra|al momento de la compra/i.test(text);
  const hasStatement = /estado de cuenta/i.test(text);
  if (hasPoS && hasStatement) return "split";
  if (hasStatement) return "statement-credit";
  if (hasPoS) return "point-of-sale";
  return undefined;
}

function stripRefundClauses(text) {
  return text.replace(
    /Descuento en (el momento de la compra|punto de venta|el estado de cuenta|estado de cuenta)\.?/gi,
    "",
  );
}

function extractChannels(text) {
  const channels = [];
  if (
    /locales? f[íi]sicos?|sucursales? f[íi]sicas?|Compras en local|locales? participantes|tiendas? f[íi]sicas?/i.test(
      text,
    )
  ) {
    channels.push("in-store");
  }
  if (/\bweb\b|sitio web|tienda online|e-commerce/i.test(text)) {
    channels.push("online");
  }
  if (/tel[ée]fonicas?|por tel[ée]fono/i.test(text)) channels.push("phone");
  return channels;
}

function stripChannelClauses(text) {
  // "Compras en local y web." / "Compras en local, telefónicas y web."
  return text
    .replace(/Compras en [^.]+\.?/gi, "")
    .replace(/en locales? f[íi]sicos?\.?/gi, "")
    .replace(/en sucursales? f[íi]sicas?( participantes)?\.?/gi, "")
    .replace(/en tiendas? f[íi]sicas?( [A-Z][^.]+)?\.?/gi, "");
}

/*
 * Caps end with a "por X" or "por X por Y" suffix or a sentence break.
 * Naive `Tope[^.]+\.` fails on amounts like "$2.000" — the inner dot
 * terminates the match too early. Use a sentence-break detector that
 * needs a period followed by whitespace or end-of-string.
 */
function extractCap(text, existingCap) {
  if (existingCap) return undefined;
  const m = text.match(/Tope[\s\S]+?(?=\.\s|\.$|$)/i);
  return m ? m[0].trim() : undefined;
}

function stripCapClause(text, capTextOrUndef) {
  if (!capTextOrUndef) return text;
  return text.replace(`${capTextOrUndef}.`, "").replace(capTextOrUndef, "");
}

/*
 * "Hasta 30/04/2026" — promote to `validUntil` (ISO) when not already
 * set. Day and month may be 1- or 2-digit; year 2- or 4-digit.
 */
function extractValidUntil(text, existing) {
  if (existing) return undefined;
  const m = text.match(/\bHasta\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!m) return undefined;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}

function stripTodosLosDias(text) {
  return text.replace(/Todos los d[íi]as\.?/gi, "");
}

function stripExpiryRestatement(text, validUntil) {
  if (!validUntil) return text;
  // Match "Hasta DD/MM/YYYY" or "hasta 30/04/2026"
  return text.replace(/\bHasta\s+\d{1,2}\/\d{1,2}\/\d{2,4}\.?/gi, "");
}

function extractCardFamilies(text) {
  const families = [];
  for (const { name, re } of FAMILY_PATTERNS) {
    if (re.test(text) && !families.includes(name)) families.push(name);
  }
  return families;
}

/*
 * Escape a literal string so it's safe to drop into `new RegExp(...)`.
 * Future family names may contain `+`, `(`, etc.; without this the
 * family-removal regex below would silently misbehave.
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Detect networks mentioned as eligibility (not as exclusions). The
 * conservative test: a network is mentioned AND there's no "no aplica"
 * / "excluye" clause in the same sentence pointing at it.
 */
function extractNetworks(text, existing) {
  if (existing && existing.length > 0) return undefined;
  const networks = [];
  for (const { token, re } of NETWORK_PATTERNS) {
    if (re.test(text)) {
      // Skip if exclusion clause mentions it.
      const exclusionMentions = (text.match(/no aplica[^.]*/gi) || []).join(" ");
      if (re.test(exclusionMentions)) continue;
      networks.push(token);
    }
  }
  return networks.length > 0 ? networks : undefined;
}

/*
 * After all structured extractions, the residue often still echoes the
 * tier list ("Crédito Platinum/Infinite/Black + débito y crédito Personal
 * Bank"). Once `cardFamilies` is captured and `tiers` is already in the
 * rule, this leftover is pure noise. Drop the clause when it's just
 * connective words around tier and family names.
 */
function stripRedundantCardSentence(text, tiers, families) {
  if (!text) return text;
  const tierTokens = new Set(
    (tiers || []).flatMap((t) => [t.toLowerCase(), ...TIER_WORDS.filter((w) => w === t.toLowerCase())]),
  );
  const familyTokens = new Set((families || []).map((f) => f.toLowerCase()));
  // Try each sentence in isolation; drop the ones whose meaningful words
  // are all tier/family/connective tokens.
  const connective = new Set([
    "tarjetas",
    "tarjeta",
    "de",
    "del",
    "los",
    "las",
    "el",
    "la",
    "y",
    "e",
    "o",
    "u",
    "ni",
    "con",
    "para",
    "en",
    "más",
    "plus",
    "+",
    "·",
    "crédito",
    "credito",
    "débito",
    "debito",
    "todas",
    // network names — when extracted to `networks`, redundant in notes
    "visa",
    "mastercard",
    "amex",
    "american",
    "express",
    "oca",
    "cabal",
    "passcard",
    // provider names — context is implied by the rule's provider
    "brou",
    "itaú",
    "itau",
    "santander",
    "scotia",
    "scotiabank",
    "bbva",
    "antel",
    "prex",
    // card-type qualifiers that don't change eligibility
    "prepaga",
    "prepago",
    "club",
    "card",
  ]);
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const tokens = sentence
        .toLowerCase()
        .replace(/[.,;:()/]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      if (tokens.length === 0) return false;
      const meaningful = tokens.filter(
        (t) => !connective.has(t) && !tierTokens.has(t),
      );
      // If every "meaningful" token is part of a known family name, drop.
      if (meaningful.length === 0) return false;
      const familyJoined = meaningful.join(" ");
      const allFamilyTokens = [...familyTokens].some((f) =>
        familyJoined.includes(f),
      );
      const remainingAfterFamilies = meaningful
        .join(" ")
        .replace(
          new RegExp([...familyTokens].map(escapeRegex).join("|"), "gi"),
          " ",
        )
        .replace(/\s+/g, " ")
        .trim();
      // Drop the sentence if, after removing family names, nothing
      // meaningful remains.
      if (allFamilyTokens && remainingAfterFamilies.length <= 3) return false;
      return true;
    })
    .join(" ")
    .trim();
}

function migrateRule(rule) {
  const out = { ...rule };
  const original = rule.conditions || "";
  let working = original;

  // Order matters: extract before stripping, then strip what's covered.
  const excludedApps = extractExcludedApps(working);
  if (excludedApps.length > 0) out.excludedApps = excludedApps;
  working = stripExcludedAppsClauses(working, excludedApps);

  const stackable = extractStackable(working);
  if (stackable !== undefined) out.stackable = stackable;
  working = stripStackableClause(working);

  const refundType = extractRefundType(working);
  if (refundType) out.refundType = refundType;
  working = stripRefundClauses(working);

  const channels = extractChannels(working);
  if (channels.length > 0) out.channels = channels;
  working = stripChannelClauses(working);

  const extractedCap = extractCap(working, rule.cap);
  if (extractedCap) out.cap = extractedCap;
  working = stripCapClause(working, extractedCap);

  const extractedValidUntil = extractValidUntil(working, rule.validUntil);
  if (extractedValidUntil) out.validUntil = extractedValidUntil;

  working = stripTodosLosDias(working);
  working = stripExpiryRestatement(working, out.validUntil || rule.validUntil);

  const cardFamilies = extractCardFamilies(working);
  if (cardFamilies.length > 0) out.cardFamilies = cardFamilies;

  const networks = extractNetworks(working, rule.networks);
  if (networks) out.networks = networks;

  working = stripRedundantCardSentence(working, rule.tiers, cardFamilies);

  const residue = trimResidue(working);
  if (residue && residue.length > 3) {
    out.notes = residue;
  }

  // Drop the legacy free-text field once we've extracted everything we can.
  delete out.conditions;

  return out;
}

function processFile(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(raw.rules)) return { changed: 0, total: 0 };

  let changed = 0;
  raw.rules = raw.rules.map((rule) => {
    const migrated = migrateRule(rule);
    if (JSON.stringify(migrated) !== JSON.stringify(rule)) changed += 1;
    return migrated;
  });

  writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`);
  return { changed, total: raw.rules.length };
}

const files = readdirSync(discountsDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

let totalChanged = 0;
let totalRules = 0;
for (const file of files) {
  const { changed, total } = processFile(path.join(discountsDir, file));
  totalChanged += changed;
  totalRules += total;
  console.log(
    `${file.padEnd(24)} ${String(changed).padStart(4)}/${String(total).padStart(4)} rules migrated`,
  );
}

console.log("---");
console.log(`Total: ${totalChanged}/${totalRules} rules updated`);
