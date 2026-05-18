import type { APIRoute } from "astro";
import { allPriceItems, chainLabel } from "../../lib/data";

export const GET: APIRoute = () => {
  const items = allPriceItems.slice(0, 100).map((p) => {
    const sorted = [...p.bestByChain].sort((a, b) => a.price - b.price);
    const best = sorted[0];
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      bestPrice: best?.price ?? 0,
      bestChain: best ? chainLabel(best.chainId) : "",
      isOffer: best?.offer ?? false,
    };
  });

  return new Response(JSON.stringify(items), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
