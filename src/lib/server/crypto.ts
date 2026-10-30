// Plain Node crypto helpers. No framework imports, so scripts and tests can use them directly.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/** URL-safe random token (default 32 bytes = 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Keyed hash for tokens and short codes. Stored instead of the value itself. */
export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Six-digit code, uniformly random, keeps leading zeros. */
export function numericCode(digits = 6): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`orava:enc:${secret}`).digest();
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(secret: string, payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
