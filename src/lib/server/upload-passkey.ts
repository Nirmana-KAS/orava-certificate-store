import "server-only";

import { randomInt } from "node:crypto";

import { formatUploadPasskey, normalizeUploadPasskey } from "@/lib/upload-passkey";

import { hashSecret } from "./password";

/** A new random upload passkey and the hash to store. The passkey itself is never stored. */
export async function newUploadPasskey(): Promise<{ passkey: string; hash: string }> {
  const passkey = formatUploadPasskey((max) => randomInt(max));
  return { passkey, hash: await hashSecret(normalizeUploadPasskey(passkey)) };
}
