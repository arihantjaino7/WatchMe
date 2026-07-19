import { describe, expect, it } from "vitest";
import { categorizeDomain } from "./domain-category";

describe("categorizeDomain", () => {
  it.each([
    ["github.com", "coding"],
    ["gitlab.com", "coding"],
    ["stackoverflow.com", "coding"],
    ["codesandbox.io", "coding"],
    ["vercel.com", "coding"],
    ["npmjs.com", "coding"],
    ["developer.mozilla.org", "docs"],
    ["docs.python.org", "docs"],
    ["react.dev", "docs"],
    ["nextjs.org", "docs"],
    ["supabase.com", "docs"],
    ["youtube.com", "entertainment"],
    ["netflix.com", "entertainment"],
    ["twitch.tv", "entertainment"],
    ["reddit.com", "entertainment"],
    ["twitter.com", "social"],
    ["x.com", "social"],
    ["instagram.com", "social"],
    ["linkedin.com", "social"],
    ["gmail.com", "communication"],
    ["slack.com", "communication"],
    ["discord.com", "communication"],
  ] as const)("maps %s -> %s", (domain, expected) => {
    expect(categorizeDomain(domain)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(categorizeDomain("GitHub.com")).toBe("coding");
  });

  it("falls back to 'other' for an unknown domain without throwing", () => {
    expect(() => categorizeDomain("some-random-blog.example")).not.toThrow();
    expect(categorizeDomain("some-random-blog.example")).toBe("other");
  });
});
