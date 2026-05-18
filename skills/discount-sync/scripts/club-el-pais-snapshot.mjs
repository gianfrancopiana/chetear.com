#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const SOURCES_PATH = path.join(
  REPO_ROOT,
  "skills/discount-sync/references/provider-sources.json"
);
const PROVIDER_ID = "club-el-pais";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const CURRENT_YEAR = new Date().getUTCFullYear();
const TODAY_UTC = new Date().toISOString().slice(0, 10);

const CATEGORY_PAGES = [
  {
    group: "gastronomia",
    url: "https://www.clubelpais.com.uy/rubro/gastronomia/",
    category: "restaurante",
    priority: 10,
  },
  {
    group: "entretenimiento",
    url: "https://www.clubelpais.com.uy/rubro/entretenimiento/",
    category: "entretenimiento",
    priority: 20,
  },
  {
    group: "bienestar",
    url: "https://www.clubelpais.com.uy/rubro/bienestar/",
    category: "salud",
    priority: 30,
  },
  {
    group: "educacion",
    url: "https://www.clubelpais.com.uy/rubro/educacion/",
    category: "educacion",
    priority: 40,
  },
  {
    group: "hogar",
    url: "https://www.clubelpais.com.uy/rubro/hogar/",
    category: "hogar",
    priority: 50,
  },
  {
    group: "vestimenta",
    url: "https://www.clubelpais.com.uy/rubro/vestimenta/",
    category: "indumentaria",
    priority: 60,
  },
  {
    group: "turismo",
    url: "https://www.clubelpais.com.uy/rubro/turismo/",
    category: "viajes",
    priority: 70,
  },
  {
    group: "ninos",
    url: "https://www.clubelpais.com.uy/rubro/ninos/",
    category: "otros",
    priority: 80,
  },
];

const MONTHS = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const MONTH_NAME_PATTERN = Object.keys(MONTHS).join("|");
const COMPACT_MONTH_DATE_REGEX = new RegExp(
  `(^|[^\\d])(\\d{1,2})\\s*(?:de\\s*)?(${MONTH_NAME_PATTERN})\\b`,
  "gi"
);

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
];

function parseArgs(argv) {
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

function loadProviderConfig() {
  const providers = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const entry = providers.find((provider) => provider.provider === PROVIDER_ID);
  if (!entry) {
    throw new Error(`Provider ${PROVIDER_ID} not found in provider-sources.json`);
  }
  return entry;
}

function resolveOutputPath(providerConfig, cliOutputPath) {
  if (cliOutputPath) {
    return path.isAbsolute(cliOutputPath)
      ? cliOutputPath
      : path.join(REPO_ROOT, cliOutputPath);
  }
  return path.join(REPO_ROOT, providerConfig.outputPath);
}

function fetchHtml(url) {
  return execFileSync("curl", ["-sL", "-A", USER_AGENT, url], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function normaliseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
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
      String(value)
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? stripTags(match[1]) : "";
}

function allMatches(text, regex) {
  return Array.from(text.matchAll(regex), (match) => stripTags(match[1])).filter(Boolean);
}

function parsePercent(label) {
  const text = normaliseWhitespace(label);
  if (!text) return null;
  if (/^2x1$/i.test(text)) return 50;
  const percentMatch = text.match(/(\d{1,3})\s*%/);
  return percentMatch ? Number(percentMatch[1]) : null;
}

function parseDays(daysText) {
  const text = normaliseWhitespace(daysText).toLowerCase();
  if (!text || /todos los d[ií]as/.test(text) || text === "lmmjvsd") {
    return undefined;
  }

  const days = [];
  for (const [needle, day] of DAY_TOKEN_MAP) {
    if (text.includes(needle) && !days.includes(day)) {
      days.push(day);
    }
  }

  return days.length > 0 ? days : undefined;
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normaliseEventDateText(value) {
  return normaliseWhitespace(value).replace(
    COMPACT_MONTH_DATE_REGEX,
    (_, prefix, day, month) => `${prefix}${day} de ${month}`
  );
}

function parseValidUntil(label) {
  const text = normaliseEventDateText(label).toLowerCase();
  if (!text) return undefined;

  let match = text.match(
    /del\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+al\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i
  );
  if (match) {
    return toIsoDate(Number(match[6]), Number(match[5]), Number(match[4]));
  }

  match = text.match(
    /(\d{1,2})\s+de\s*([a-záéíóú]+)\s+al\s+(\d{1,2})\s+de\s*([a-záéíóú]+)/i
  );
  if (match) {
    const endMonth = MONTHS[match[4]];
    if (endMonth) return toIsoDate(CURRENT_YEAR, endMonth, Number(match[3]));
  }

  match = text.match(/(\d{1,2})\s+al\s+(\d{1,2})\s+de\s*([a-záéíóú]+)/i);
  if (match) {
    const month = MONTHS[match[3]];
    if (month) return toIsoDate(CURRENT_YEAR, month, Number(match[2]));
  }

  match = text.match(/re agendada\s*-\s*[^\d]*(\d{1,2})\s+de\s*([a-záéíóú]+)/i);
  if (match) {
    const month = MONTHS[match[2]];
    if (month) return toIsoDate(CURRENT_YEAR, month, Number(match[1]));
  }

  const explicitMonthDates = Array.from(
    text.matchAll(/(\d{1,2})\s+de\s*([a-záéíóú]+)/gi),
    (matchItem) => ({ day: Number(matchItem[1]), month: MONTHS[matchItem[2]] })
  ).filter((matchItem) => matchItem.month);

  if (explicitMonthDates.length > 0) {
    const last = explicitMonthDates.at(-1);
    return toIsoDate(CURRENT_YEAR, last.month, last.day);
  }

  return undefined;
}

function isUnavailable(text) {
  return /agotado|suspendid|cancelad/i.test(text);
}

function normaliseConditions(parts) {
  const seen = new Set();
  const cleaned = [];
  for (const part of parts.map((value) => normaliseWhitespace(value)).filter(Boolean)) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(part);
  }
  return cleaned.length > 0 ? cleaned.join(". ") : undefined;
}

function normaliseMerchantName(value) {
  return normaliseWhitespace(value)
    .replace(/\s+l\s+/g, " | ")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function parseCards(page) {
  const cards = [];
  const regex = /<a[^>]+id="post-\d+"[^>]+href="(https:\/\/www\.clubelpais\.com\.uy\/(?:comercio|evento)\/[^"#?]+\/?)[^"]*"[^>]+title="([^"]*)"[^>]+class="[^"]*\b(comercio|evento)\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of page.html.matchAll(regex)) {
    const href = match[1];
    const fallbackTitle = stripTags(match[2]);
    const kind = match[3];
    const inner = match[4];

    const title = firstMatch(inner, /<h3[^>]*>([\s\S]*?)<\/h3>/i) || fallbackTitle;
    const venue = firstMatch(inner, /<span[^>]*title="Lugar"[^>]*>([\s\S]*?)<\/span>/i);
    const infoValues = allMatches(
      inner,
      /<span[^>]*class="[^"]*info[^"]*"[^>]*>([\s\S]*?)<\/span>/gi
    );
    const daysText = infoValues.at(-1) || "";
    const badge = firstMatch(
      inner,
      /<span[^>]*class="[^"]*(?:mensajeevento-comercio|fechaevento-comercio)[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );
    const percentLabel = firstMatch(
      inner,
      /<div[^>]*class="[^"]*porcentaje[^"]*"[^>]*>\s*(?:<div[^>]*>)?([\s\S]*?)(?:<\/div>)?\s*<\/div>/i
    );

    cards.push({
      sourceGroup: page.group,
      sourceUrl: page.url,
      sourceKind: kind,
      href,
      title,
      venue,
      daysText,
      badge,
      percentLabel,
      category: page.category,
      priority: page.priority,
    });
  }

  return cards;
}

function chooseBetterCard(existing, incoming) {
  if (!existing) return incoming;
  if (incoming.priority < existing.priority) return incoming;
  if (incoming.priority > existing.priority) return existing;

  const existingScore = Number(Boolean(existing.percentLabel)) + Number(Boolean(existing.badge));
  const incomingScore = Number(Boolean(incoming.percentLabel)) + Number(Boolean(incoming.badge));
  return incomingScore > existingScore ? incoming : existing;
}

function normaliseCard(card) {
  const rawSummary = [card.percentLabel, card.badge, card.daysText, card.venue].join(" ");
  if (isUnavailable(rawSummary)) {
    return { skip: true, reason: "unavailable" };
  }

  const numericPercent = parsePercent(card.percentLabel);
  const badgePercent = parsePercent(card.badge);
  const isTwoForOne =
    /^2x1$/i.test(normaliseWhitespace(card.percentLabel)) ||
    /^2x1$/i.test(normaliseWhitespace(card.badge)) ||
    /\b2x1\b/i.test(card.badge);

  const percent = numericPercent ?? badgePercent ?? (isTwoForOne ? 50 : 0);

  const conditionsParts = [];
  if (isTwoForOne) {
    conditionsParts.push("2x1");
  }

  const badge = normaliseEventDateText(card.badge);
  if (badge) {
    if (/exclusivo día del club/i.test(badge) && !numericPercent && !badgePercent) {
      return { skip: true, reason: "special-day-label-without-visible-benefit" };
    }
    if (!/^2x1$/i.test(badge) && !/(\d{1,3})\s*%/.test(badge)) {
      conditionsParts.push(badge);
    }
  }

  if (card.venue) {
    conditionsParts.push(`Lugar: ${card.venue}`);
  }

  const days = parseDays(card.daysText);
  const validUntil = parseValidUntil(card.badge);
  const notes = normaliseConditions(conditionsParts);

  if (validUntil && validUntil < TODAY_UTC) {
    return { skip: true, reason: "expired" };
  }

  if (!numericPercent && !badgePercent && percent === 0 && !notes) {
    return { skip: true, reason: "no-visible-benefit" };
  }

  return {
    rule: {
      merchant: normaliseMerchantName(card.title),
      category: card.category,
      percent,
      ...(isTwoForOne ? { benefitType: "2-for-1" } : {}),
      ...(days ? { days } : {}),
      ...(notes ? { notes } : {}),
      ...(validUntil ? { validUntil } : {}),
    },
  };
}

function buildOutput(providerConfig, outputPath) {
  const rawCards = CATEGORY_PAGES.flatMap((page) =>
    parseCards({ ...page, html: fetchHtml(page.url) })
  );

  if (rawCards.length === 0) {
    throw new Error(
      "Club El País snapshot found zero /comercio or /evento cards across configured rubro pages; preserving last known output. The source layout may have changed."
    );
  }

  const deduped = new Map();
  for (const card of rawCards) {
    const existing = deduped.get(card.href);
    deduped.set(card.href, chooseBetterCard(existing, card));
  }

  const rules = [];
  const skipped = [];

  for (const card of deduped.values()) {
    const result = normaliseCard(card);
    if (result.skip) {
      skipped.push({ href: card.href, title: card.title, reason: result.reason });
      continue;
    }
    rules.push(result.rule);
  }

  rules.sort((left, right) => {
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category, "es");
    }
    if (right.percent !== left.percent) {
      return right.percent - left.percent;
    }
    return left.merchant.localeCompare(right.merchant, "es");
  });

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

  return {
    provider: providerConfig.provider,
    outputPath,
    changed,
    rawCards: rawCards.length,
    uniqueCards: deduped.size,
    rules: rules.length,
    skipped,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const providerConfig = loadProviderConfig();
  const outputPath = resolveOutputPath(providerConfig, args.outputPath);
  const summary = buildOutput(providerConfig, outputPath);

  if (args.printSummary) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
