/** Escape `<` so FAQ/copy cannot break out of a JSON-LD script tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
