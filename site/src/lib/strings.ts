/*
 * Small shared string utilities. Lived as multiple copies across
 * home-discounts, standalone-search, and tarjetas until we lifted them
 * here.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/*
 * "{n} {singular}" with a regular -s plural when n !== 1. The es-UY copy here
 * is all regular plurals (seleccionada(s), disponible(s), beneficio(s)); pass
 * `suffix` for anything that isn't just "+s".
 */
export function plural(n: number, singular: string, suffix = "s"): string {
  return `${n} ${singular}${n === 1 ? "" : suffix}`;
}
