#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import { normaliseCard } from "./club-el-pais-snapshot.mjs";

function card(overrides) {
  return {
    sourceGroup: "gastronomia",
    sourceUrl: "https://www.clubelpais.com.uy/rubro/gastronomia/",
    sourceKind: "comercio",
    href: "https://www.clubelpais.com.uy/comercio/example/",
    title: "Example",
    venue: "",
    daysText: "",
    badge: "",
    percentLabel: "",
    category: "restaurante",
    priority: 10,
    ...overrides,
  };
}

test("free-item Club cards become gift benefits instead of plain zero-percent discounts", () => {
  const result = normaliseCard(
    card({
      href: "https://www.clubelpais.com.uy/comercio/mcdonalds/",
      title: "McDonald’s",
      badge: "Sundae de obsequio",
    })
  );

  assert.equal(result.skip, undefined);
  assert.equal(result.rule.merchant, "McDonald’s");
  assert.equal(result.rule.percent, 0);
  assert.equal(result.rule.benefitType, "gift");
  assert.equal(result.rule.notes, "Sundae de obsequio");
});

test("standalone 2x1 copy is captured by benefitType and not duplicated in notes", () => {
  const result = normaliseCard(
    card({
      sourceGroup: "entretenimiento",
      title: "Movie",
      badge: "2x1",
      category: "entretenimiento",
    })
  );

  assert.equal(result.skip, undefined);
  assert.equal(result.rule.percent, 50);
  assert.equal(result.rule.benefitType, "2-for-1");
  assert.equal(result.rule.notes, undefined);
});

test("2x1 cards keep venue residue without restating the mechanic", () => {
  const result = normaliseCard(
    card({
      sourceGroup: "entretenimiento",
      sourceKind: "evento",
      title: "Concierto Ejemplo",
      badge: "2x1",
      venue: "Teatro Ejemplo",
      category: "entretenimiento",
    })
  );

  assert.equal(result.skip, undefined);
  assert.equal(result.rule.percent, 50);
  assert.equal(result.rule.benefitType, "2-for-1");
  assert.equal(result.rule.notes, "Lugar: Teatro Ejemplo");
});
