/*
 * "Open in Google Maps" deep links.
 *
 * These are plain links to the consumer Google Maps product, not Google Maps
 * Platform API calls — no key, no billing, no cached API "content", and no
 * Terms-of-Service constraints on storage or base-map choice. Tapping one
 * opens the native Google Maps app (or maps.google.com) and lands on the
 * place. This is why every merchant can have a working link even when our own
 * map has no pin for it: resolution happens on Google's side, at tap time.
 *
 * We never store the result of these — they are derived at render time from
 * data the merchant already carries (name + location).
 */

const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1";

/*
 * Link that searches Google Maps for the business by name. Lands on the
 * business listing (hours, reviews, directions) rather than a bare dropped
 * pin, so it is the better default even when we also have coordinates.
 */
export function googleMapsSearchUrl(name: string, location?: string): string {
  const query = [name, location].filter(Boolean).join(", ");
  return `${MAPS_SEARCH}&query=${encodeURIComponent(query)}`;
}
