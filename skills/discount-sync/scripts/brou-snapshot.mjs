#!/usr/bin/env node
import {
  loadProviderConfig,
  parseSyncArgs,
  resolveOutputPath,
  writeProviderOutput,
} from "./provider-sync-lib.mjs";

const PROVIDER_ID = "brou";
const VALID_UNTIL = "2027-04-30";

const RECOMPENSA_MASTERCARD = {
  tiers: ["todas"],
  excludedApps: ["mercado-pago"],
  cardFamilies: ["Recompensa"],
  networks: ["mastercard"],
};

const SUPERMARKET_TERMS = {
  ...RECOMPENSA_MASTERCARD,
  days: ["martes", "jueves"],
  channels: ["in-store", "online"],
  cap: "Tope $2.000 de devolución mensual por cuenta",
  validUntil: VALID_UNTIL,
};

const RULES = [
  {
    merchant: "Ta-Ta",
    category: "supermercado",
    percent: 10,
    ...SUPERMARKET_TERMS,
  },
  {
    merchant: "El Dorado",
    category: "supermercado",
    percent: 10,
    ...SUPERMARKET_TERMS,
  },
  {
    merchant: "Macro Mercado",
    category: "supermercado",
    percent: 10,
    ...SUPERMARKET_TERMS,
  },
  {
    merchant: "Tienda Inglesa",
    category: "supermercado",
    percent: 10,
    ...SUPERMARKET_TERMS,
  },
  {
    merchant: "Micro Macro",
    category: "supermercado",
    percent: 10,
    ...SUPERMARKET_TERMS,
  },
  {
    merchant: "Red Expres",
    category: "supermercado",
    percent: 10,
    ...SUPERMARKET_TERMS,
  },
  {
    merchant: "Farmacias",
    category: "farmacia",
    percent: 10,
    ...RECOMPENSA_MASTERCARD,
    days: ["miercoles", "sabado", "domingo"],
    cap: "Tope $1.000 de devolución mensual por cuenta",
    validUntil: VALID_UNTIL,
    notes: "Excepto farmacias de mutualistas",
  },
  {
    merchant: "ANCAP",
    category: "combustible",
    percent: 5,
    ...RECOMPENSA_MASTERCARD,
    days: ["lunes", "viernes"],
    cap: "Tope $500 de devolución mensual por cuenta",
    validUntil: VALID_UNTIL,
  },
];

function main() {
  const args = parseSyncArgs(process.argv);
  const providerConfig = loadProviderConfig(PROVIDER_ID);
  const outputPath = resolveOutputPath(providerConfig, args.outputPath);
  const result = writeProviderOutput(providerConfig, outputPath, RULES);

  if (!args.printSummary) {
    return;
  }

  console.log(
    JSON.stringify(
      {
        provider: providerConfig.provider,
        mode: "snapshot",
        outputPath,
        rules: RULES.length,
        changed: result.changed,
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
