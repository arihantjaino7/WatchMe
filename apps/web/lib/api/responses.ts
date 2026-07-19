import { NextResponse } from "next/server";
import type { ApiError } from "@watchme/shared";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error } satisfies ApiError, { status });
}

export const unauthorized = () => jsonError(401, "unauthorized");

/** request.json() throws on malformed bodies; normalize that to null -> 400 upstream. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
