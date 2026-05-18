import type { APIRoute } from "astro";
import { allPriceItems, allChains, priceGeneratedAt } from "../../lib/data";

export const GET: APIRoute = () => {
  const chainLabels: Record<string, string> = {};
  allChains.forEach((c) => { chainLabels[c.id] = c.label; });

  const items = allPriceItems.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    bestByChain: p.bestByChain.map((b) => ({
      chainId: b.chainId,
      price: b.price,
      offer: b.offer,
    })),
  }));

  return new Response(JSON.stringify({ generatedAt: priceGeneratedAt, items, chainLabels }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
