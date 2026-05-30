#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import { normaliseCard, parseCards } from "./santander-snapshot.mjs";

function card(overrides) {
  return {
    sourceCategoryId: "134",
    sourceCategoryLabel: "Otros",
    sourceUrl: "https://www.santander.com.uy/beneficios?categoria=134",
    category: "otros",
    nodeId: "1794",
    href: "https://www.santander.com.uy/beneficios/sucan",
    title: "Sucan",
    teaser: "15% de descuento todos los días.",
    tags: ["Puntos"],
    detail: "Comida y accesorios para mascotas. El descuento se efectúa en el punto de venta. Descuento no acumulable con otras promociones. Quedan excluidas aquellas correspondientes al paquete Cuenta Nómina Básica.",
    ...overrides,
  };
}

test("Santander parser discovers Puntos-tagged cards with explicit discounts", () => {
  const html = `
    <article data-history-node-id="1794" class="node node--type-beneficios list-map-item-benefits">
      <h3><span class="field field--name-title field--type-string field--label-hidden">Sucan</span></h3>
      <strong class="text-xs text-primary fw-normal">Puntos</strong>
      <div class="field field--name-body field--type-text-with-summary field--label-hidden field__item">
        <p>15% de descuento todos los días.</p>
      </div>
      <a class="use-ajax" href="/beneficios/sucan">Ver más detalles</a>
    </article>`;

  const cards = parseCards({
    html,
    sourceCategoryId: "134",
    sourceCategoryLabel: "Otros",
    sourceUrl: "https://www.santander.com.uy/beneficios?categoria=134",
    category: "otros",
  });

  assert.deepEqual(cards, [
    {
      sourceCategoryId: "134",
      sourceCategoryLabel: "Otros",
      sourceUrl: "https://www.santander.com.uy/beneficios?categoria=134",
      category: "otros",
      nodeId: "1794",
      href: "https://www.santander.com.uy/beneficios/sucan",
      title: "Sucan",
      teaser: "15% de descuento todos los días.",
      tags: ["Puntos"],
    },
  ]);
});

test("explicit discount wins over Puntos tag when normalising Santander cards", () => {
  const result = normaliseCard(card());

  assert.equal(result.skip, undefined);
  assert.equal(result.rule.merchant, "Sucan");
  assert.equal(result.rule.category, "otros");
  assert.equal(result.rule.percent, 15);
  assert.deepEqual(result.rule.tiers, ["todas"]);
  assert.equal(result.rule.refundType, "point-of-sale");
  assert.equal(result.rule.stackable, false);
  assert.match(result.rule.notes, /Comida y accesorios para mascotas/);
  assert.match(result.rule.notes, /Cuenta Nómina Básica/);
});

test("points-only Santander cards stay out of runtime discounts", () => {
  const result = normaliseCard(
    card({
      title: "Canje ejemplo",
      teaser: "Sumá puntos con tus compras.",
      detail: "Beneficio exclusivo del programa de puntos.",
      tags: ["Puntos"],
    })
  );

  assert.equal(result.skip, true);
  assert.equal(result.reason, "no-explicit-discount");
});
