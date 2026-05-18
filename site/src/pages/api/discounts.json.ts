import type { APIRoute } from "astro";
import { allDiscountRules } from "../../lib/data";

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(allDiscountRules), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
