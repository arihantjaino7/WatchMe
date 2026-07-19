import { z } from "zod";

export const CategorySchema = z.enum([
  "coding",
  "entertainment",
  "docs",
  "social",
  "communication",
  "other",
]);
export type Category = z.infer<typeof CategorySchema>;

/**
 * Static domain -> category map used by the deterministic Session Compiler
 * (Agent 0, see ARCHITECTURE.md). Ambiguous domains (youtube.com can be a
 * tutorial, twitter.com can be dev-community research) are deliberately NOT
 * resolved here -- that disambiguation is Agent 1's job, using page titles.
 * This map only handles the unambiguous majority case.
 */
export const DOMAIN_CATEGORY_MAP: Readonly<Record<string, Category>> = {
  "github.com": "coding",
  "gitlab.com": "coding",
  "stackoverflow.com": "coding",
  "codesandbox.io": "coding",
  "vercel.com": "coding",
  "npmjs.com": "coding",

  "developer.mozilla.org": "docs",
  "docs.python.org": "docs",
  "react.dev": "docs",
  "nextjs.org": "docs",
  "supabase.com": "docs",

  "youtube.com": "entertainment",
  "netflix.com": "entertainment",
  "twitch.tv": "entertainment",
  "reddit.com": "entertainment",

  "twitter.com": "social",
  "x.com": "social",
  "instagram.com": "social",
  "facebook.com": "social",
  "linkedin.com": "social",

  "gmail.com": "communication",
  "slack.com": "communication",
  "discord.com": "communication",
  "mail.google.com": "communication",
  "outlook.com": "communication",
};

export function categorizeDomain(domain: string): Category {
  return DOMAIN_CATEGORY_MAP[domain.toLowerCase()] ?? "other";
}
