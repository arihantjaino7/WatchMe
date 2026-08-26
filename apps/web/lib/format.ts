import type { Category } from "@watchme/shared";

export const CATEGORY_LABEL: Record<Category, string> = {
  coding: "Coding",
  entertainment: "Entertainment",
  docs: "Docs",
  social: "Social",
  communication: "Communication",
  other: "Other",
};

/** ms -> "1h 24m" / "42m" / "38s", floored to the unit that matters. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
