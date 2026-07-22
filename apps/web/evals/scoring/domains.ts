/**
 * Extracts domain-like tokens from free text for Agent 2 hallucination
 * detection. Anchored to a known TLD set so ordinary words with dots
 * (filenames like `billing.ts`, abbreviations like `e.g.`) are not mistaken
 * for domains -- only real host references are pulled out.
 */
const TLDS = ["com", "org", "net", "io", "dev", "gov", "edu", "tv", "co", "app", "sbi"];
const DOMAIN_RE = new RegExp(`\\b(?:[a-z0-9-]+\\.)+(?:${TLDS.join("|")})\\b`, "gi");

export function extractDomains(text: string): string[] {
  const matches = text.toLowerCase().match(DOMAIN_RE) ?? [];
  return [...new Set(matches)];
}
