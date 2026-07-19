import { createHash, randomInt } from "node:crypto";
import {
  EXTENSION_AUTH_CODE_ALPHABET,
  EXTENSION_AUTH_CODE_LENGTH,
  normalizeExtensionAuthCode,
} from "@watchme/shared";

/** Only the hash is ever persisted; compare/claim by hash, never plaintext. */
export function hashExtensionAuthCode(code: string): string {
  return createHash("sha256").update(normalizeExtensionAuthCode(code)).digest("hex");
}

export function generateExtensionAuthCode(): string {
  let code = "";
  for (let i = 0; i < EXTENSION_AUTH_CODE_LENGTH; i++) {
    code += EXTENSION_AUTH_CODE_ALPHABET[randomInt(EXTENSION_AUTH_CODE_ALPHABET.length)];
  }
  return code;
}
