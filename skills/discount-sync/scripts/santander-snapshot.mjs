#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchHtml,
  loadProviderConfig,
  parseSyncArgs,
  resolveOutputPath,
  writeProviderOutput,
} from "./provider-sync-lib.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const BASE_URL = "https://www.santander.com.uy";
const PROVIDER_ID = "santander";

const CURATED_RULES = [
  {
    merchant: "Hipermás",
    category: "supermercado",
    percent: 15,
    tiers: ["todas"],
    cap: "Tope $2.000 por periodo",
    notes: "Disco, Devoto, Geant y Fresh Market. Hasta 25% en categorias rotativas mensuales",
  },
  {
    merchant: "Heladerías adheridas",
    category: "restaurante",
    percent: 50,
    tiers: ["black", "infinite"],
    cap: "Tope $4.000/mes por comercio",
    cardFamilies: ["Select"],
  },
  {
    merchant: "Heladerías adheridas",
    category: "restaurante",
    percent: 30,
    tiers: ["todas"],
    cap: "Tope $2.000/mes por comercio",
  },
  {
    id: "santander-ruta-gourmet-premium-25",
    merchant: "Restaurantes",
    category: "restaurante",
    percent: 25,
    tiers: ["platinum"],
    excludedApps: ["mercado-pago", "handy"],
    stackable: false,
    cap: "Tope mensual por restaurante: Private Banking $6.000, Select $4.000",
    cardFamilies: ["Select", "Private Banking"],
    notes: "Stackeable con devolución de puntos de IVA",
  },
  {
    id: "santander-ruta-gourmet-general-15",
    merchant: "Restaurantes",
    category: "restaurante",
    percent: 15,
    tiers: ["todas"],
    excludedApps: ["mercado-pago", "handy"],
    stackable: false,
    cap: "Tope $2.000/mes por restaurante",
    notes:
      "Crédito y débito Santander. No aplica al débito de Cuenta Nómina Básica. Stackeable con devolución de puntos de IVA",
  },
  {
    merchant: "Farmashop",
    category: "farmacia",
    percent: 25,
    tiers: ["todas"],
    days: ["martes", "jueves", "domingo"],
    cap: "Tope $5.000/mes",
    cardFamilies: ["Farmacard"],
    notes: "Categorias seleccionadas",
  },
  {
    merchant: "Farmashop",
    category: "farmacia",
    percent: 15,
    tiers: ["todas"],
    days: ["martes", "jueves", "domingo"],
    notes: "Categorías seleccionadas",
  },
  {
    merchant: "Farmashop",
    category: "farmacia",
    percent: 10,
    tiers: ["todas"],
    cap: "Tope $5.000/mes",
    cardFamilies: ["Farmacard"],
  },
  {
    merchant: "PedidosYa",
    category: "restaurante",
    percent: 15,
    tiers: ["platinum", "black", "infinite"],
    days: ["martes", "sabado"],
    channels: ["online"],
    refundType: "point-of-sale",
    validUntil: "2027-01-31",
    cap: "Tope $3.000 mensual por usuario",
  },
  {
    merchant: "Moda",
    category: "indumentaria",
    percent: 15,
    tiers: ["todas"],
    id: "santander-moda-general-15",
  },
  {
    merchant: "Buquebus",
    category: "viajes",
    percent: 10,
    tiers: ["todas"],
    notes: "Paquetes a Argentina (min 2 noches hotel + transporte). 12 cuotas sin interes. Solo en oficinas UY",
  },
];

const MERCHANT_CATEGORY_PAGES = [
  { id: "30", label: "Autos", category: "otros", priority: 10 },
  { id: "25", label: "Deco y hogar", category: "hogar", priority: 20 },
  { id: "23", label: "Farmacia", category: "farmacia", priority: 30 },
  { id: "29", label: "Fitness", category: "salud", priority: 40 },
  { id: "26", label: "Infantil", category: "otros", priority: 50 },
  { id: "24", label: "Librería", category: "educacion", priority: 60 },
  { id: "28", label: "Tecnología", category: "electronica", priority: 70 },
  { id: "27", label: "Viajes y turismo", category: "viajes", priority: 80 },
  { id: "134", label: "Otros", category: "otros", priority: 90 },
];

const BROAD_CATEGORY_LABELS = [
  "Heladerías",
  "Moda",
  "Ruta Gourmet",
  "Supermercados",
];

const DAY_TOKEN_MAP = [
  ["lunes", "lunes"],
  ["martes", "martes"],
  ["miércoles", "miercoles"],
  ["miercoles", "miercoles"],
  ["jueves", "jueves"],
  ["viernes", "viernes"],
  ["sábado", "sabado"],
  ["sabado", "sabado"],
  ["domingo", "domingo"],
  ["domingos", "domingo"],
];

function normaliseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&rsquo;/gi, "’")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&rdquo;/gi, "”")
    .replace(/&ldquo;/gi, "“")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&uuml;/gi, "ü");
}

function stripTags(value) {
  return normaliseWhitespace(
    decodeHtml(
      String(value ?? "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function firstMatch(text, regex) {
  const match = String(text ?? "").match(regex);
  return match ? stripTags(match[1]) : "";
}

function allMatches(text, regex) {
  return Array.from(String(text ?? "").matchAll(regex), (match) => stripTags(match[1])).filter(Boolean);
}

function sourceUrlForCategory(page) {
  return `${BASE_URL}/beneficios?categoria=${page.id}`;
}

function resolveSantanderUrl(href) {
  return new URL(decodeHtml(href), BASE_URL).href;
}

function merchantKey(value) {
  return normaliseWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseMerchantName(value) {
  return normaliseWhitespace(value).replace(/[.,;:]+$/g, "").trim();
}

function parseCards(page) {
  const cards = [];
  const regex = /<article\b(?=[^>]*\bnode--type-beneficios\b)[\s\S]*?<\/article>/gi;

  for (const match of String(page.html ?? "").matchAll(regex)) {
    const article = match[0];
    const title =
      firstMatch(
        article,
        /<span[^>]*class="[^"]*\bfield--name-title\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i
      ) || firstMatch(article, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const teaser =
      firstMatch(
        article,
        /<div[^>]*class="[^"]*\bfield--name-body\b[^"]*\bfield__item\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ) ||
      firstMatch(
        article,
        /<div[^>]*class="[^"]*\bfield--name-body\b[^"]*"[\s\S]*?<div[^>]*class="[^"]*\bfield__item\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );
    const href = firstMatch(
      article,
      /<a[^>]+href="([^"]*\/beneficios\/[^"]+)"[^>]*>\s*Ver\s+m[aá]s/i
    ) || firstMatch(article, /<a[^>]+href="([^"]*\/beneficios\/[^"]+)"/i);
    const nodeId = firstMatch(article, /data-history-node-id="([^"]+)"/i);
    const tags = allMatches(
      article,
      /<strong[^>]*class="[^"]*\btext-primary\b[^"]*"[^>]*>([\s\S]*?)<\/strong>/gi
    );

    if (!title || !href) continue;

    const parsedCard = {
      sourceCategoryId: page.sourceCategoryId,
      sourceCategoryLabel: page.sourceCategoryLabel,
      sourceUrl: page.sourceUrl,
      category: page.category,
      nodeId,
      href: resolveSantanderUrl(href),
      title,
      teaser,
      tags,
    };
    if (page.priority !== undefined) {
      parsedCard.priority = page.priority;
    }
    cards.push(parsedCard);
  }

  return cards;
}

function parseSingleDiscountPercent(teaser) {
  const text = normaliseWhitespace(teaser);
  const percents = Array.from(text.matchAll(/(\d{1,3})\s*%/g), (match) => Number(match[1]));
  const uniquePercents = [...new Set(percents)];

  if (uniquePercents.length === 0) return null;
  if (uniquePercents.length > 1) return null;
  if (!/\b(?:descuento|menos)\b/i.test(text)) return null;

  const percent = uniquePercents[0];
  return percent > 0 && percent <= 100 ? percent : null;
}

function parseDays(text) {
  const value = normaliseWhitespace(text).toLowerCase();
  if (!value || /todos los d[ií]as|todos los dias/.test(value)) {
    return undefined;
  }

  const days = [];
  for (const [needle, day] of DAY_TOKEN_MAP) {
    if (value.includes(needle) && !days.includes(day)) {
      days.push(day);
    }
  }
  return days.length > 0 ? days : undefined;
}

function sentenceSplit(text) {
  return normaliseWhitespace(text)
    .split(/(?<=[.!?])\s+|\s+•\s+/)
    .map((part) => normaliseWhitespace(part).replace(/[.;]+$/g, ""))
    .filter(Boolean);
}

function extractExcludedApps(text) {
  const value = normaliseWhitespace(text).toLowerCase();
  const apps = [];
  if (/mercado\s*pago/.test(value)) apps.push("mercado-pago");
  if (/mercado\s*libre/.test(value)) apps.push("mercado-libre");
  if (/\bhandy\b|pos\s+handy/.test(value)) apps.push("handy");
  if (/pedidos\s*ya/.test(value)) apps.push("pedidos-ya");
  if (/\brappi\b/.test(value)) apps.push("rappi");
  return apps;
}

function extractCap(text) {
  const sentence = sentenceSplit(text).find((part) => /\btope\b/i.test(part));
  return sentence ? sentence.replace(/^Tope de Devolución\s*:?\s*/i, "Tope ") : undefined;
}

function extractStructuredFields(detail) {
  const text = normaliseWhitespace(detail);
  const lower = text.toLowerCase();
  const structured = {};

  if (/punto de venta/.test(lower)) {
    structured.refundType = "point-of-sale";
  } else if (/estado de cuenta/.test(lower)) {
    structured.refundType = "statement-credit";
  }

  if (/no acumulable/.test(lower)) {
    structured.stackable = false;
  }

  const excludedApps = extractExcludedApps(text);
  if (excludedApps.length > 0) {
    structured.excludedApps = excludedApps;
  }

  const cap = extractCap(text);
  if (cap) {
    structured.cap = cap;
  }

  return structured;
}

function buildNotes(detail, structured) {
  const notes = [];
  for (const sentence of sentenceSplit(detail)) {
    if (structured.refundType && /descuento se efect[uú]a|figurar.*estado de cuenta/i.test(sentence)) {
      continue;
    }
    if (structured.stackable === false && /no acumulable/i.test(sentence)) {
      continue;
    }
    if (structured.cap && /\btope\b/i.test(sentence)) {
      continue;
    }
    if (structured.excludedApps?.length && /no aplica.*(?:mercado\s*pago|mercado\s*libre|handy|pedidos\s*ya|rappi)|transacciones hechas a trav[eé]s/i.test(sentence)) {
      continue;
    }
    notes.push(sentence);
  }

  return notes.length > 0 ? notes.join(". ") : undefined;
}

function normaliseCard(card) {
  const percent = parseSingleDiscountPercent(card.teaser);
  if (percent === null) {
    return { skip: true, reason: "no-explicit-discount" };
  }

  const structured = extractStructuredFields(card.detail || "");
  const notes = buildNotes(card.detail || "", structured);
  const days = parseDays(card.teaser);
  const rule = {
    merchant: normaliseMerchantName(card.title),
    category: card.category,
    percent,
    tiers: ["todas"],
    ...structured,
    ...(days ? { days } : {}),
    ...(notes ? { notes } : {}),
  };

  return { rule };
}

function chooseBetterCard(existing, incoming) {
  if (!existing) return incoming;
  if (incoming.priority < existing.priority) return incoming;
  if (incoming.priority > existing.priority) return existing;
  if (incoming.teaser && !existing.teaser) return incoming;
  return existing;
}

function bodyTextsFromHtml(html) {
  const direct = allMatches(
    html,
    /<div[^>]*class="[^"]*\bfield--name-body\b[^"]*\bfield__item\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  );
  const nested = allMatches(
    html,
    /<div[^>]*class="[^"]*\bfield--name-body\b[^"]*"[\s\S]*?<div[^>]*class="[^"]*\bfield__item\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  );
  const seen = new Set();
  return [...direct, ...nested].filter((text) => {
    const key = merchantKey(text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fetchDetailText(url) {
  const html = fetchHtml(url);
  const bodies = bodyTextsFromHtml(html).filter(
    (text) => !/Banco Santander S\.A\. es supervisado|Todos los derechos reservados/i.test(text)
  );
  return (
    bodies.find((text) => /\b(?:descuento|beneficio|tope|excluid|acumulable)\b/i.test(text)) ||
    bodies.sort((left, right) => right.length - left.length)[0] ||
    ""
  );
}

function loadCategoryCards() {
  return MERCHANT_CATEGORY_PAGES.flatMap((page) => {
    const sourceUrl = sourceUrlForCategory(page);
    const html = fetchHtml(sourceUrl);
    return parseCards({
      html,
      sourceCategoryId: page.id,
      sourceCategoryLabel: page.label,
      sourceUrl,
      category: page.category,
      priority: page.priority,
    });
  });
}

function buildOutput(providerConfig, outputPath) {
  const rawCards = loadCategoryCards();
  if (rawCards.length === 0) {
    throw new Error(
      "Santander snapshot found zero merchant cards across configured category pages; preserving last known output. The source layout may have changed."
    );
  }

  const curatedMerchantKeys = new Set(CURATED_RULES.map((rule) => merchantKey(rule.merchant)));
  const deduped = new Map();
  for (const card of rawCards) {
    const key = card.href || `${card.sourceCategoryId}:${merchantKey(card.title)}`;
    deduped.set(key, chooseBetterCard(deduped.get(key), card));
  }

  const scannedRules = [];
  const skipped = [];
  for (const card of deduped.values()) {
    if (curatedMerchantKeys.has(merchantKey(card.title))) {
      skipped.push({ title: card.title, href: card.href, reason: "curated-rule" });
      continue;
    }

    if (parseSingleDiscountPercent(card.teaser) === null) {
      skipped.push({ title: card.title, href: card.href, reason: "no-explicit-discount" });
      continue;
    }

    const detail = fetchDetailText(card.href);
    const result = normaliseCard({ ...card, detail });
    if (result.skip) {
      skipped.push({ title: card.title, href: card.href, reason: result.reason });
      continue;
    }
    scannedRules.push(result.rule);
  }

  scannedRules.sort((left, right) => {
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category, "es");
    }
    if (right.percent !== left.percent) {
      return right.percent - left.percent;
    }
    return left.merchant.localeCompare(right.merchant, "es");
  });

  const { changed } = writeProviderOutput(providerConfig, outputPath, [
    ...CURATED_RULES,
    ...scannedRules,
  ]);

  return {
    provider: providerConfig.provider,
    outputPath,
    changed,
    broadCategoriesPreserved: BROAD_CATEGORY_LABELS,
    categoryPagesScanned: MERCHANT_CATEGORY_PAGES.length,
    rawCards: rawCards.length,
    uniqueCards: deduped.size,
    curatedRules: CURATED_RULES.length,
    scannedRules: scannedRules.length,
    skipped,
  };
}

function main() {
  const args = parseSyncArgs(process.argv);
  const providerConfig = loadProviderConfig(PROVIDER_ID);
  const outputPath = resolveOutputPath(providerConfig, args.outputPath);
  const summary = buildOutput(providerConfig, outputPath);

  if (args.printSummary) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

export { normaliseCard, parseCards, parseSingleDiscountPercent };

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
