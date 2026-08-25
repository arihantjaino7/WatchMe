/**
 * Parses a raw model output string into a value for structural scoring,
 * tolerating code fences and surrounding prose the way the production
 * `complete()` extractor does. Returns `undefined` for unparseable output
 * (which then fails schema validation, exactly as the malformed-output path
 * should).
 */
export function parseModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
